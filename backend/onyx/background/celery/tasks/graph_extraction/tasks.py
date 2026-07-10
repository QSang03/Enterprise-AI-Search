"""Background Celery task for Knowledge Graph extraction.

Architecture
============

Concurrency control via a **Redis distributed lock** (not
``pg_advisory_xact_lock``) so that PostgreSQL transactions can be kept short
— LLM calls, embedding, and Vespa indexing run *outside* any DB transaction.

The lock TTL is periodically renewed (``reacquire``) so long-running
extractions do not lose the mutex.  A time-based guard calls ``reacquire``
if the last renewal is more than TTL/4 seconds ago.

Retry-idempotency
-----------------

If the task crashes and is retried:

*   Events already persisted with the same ``extraction_job_id`` are detected.
*   If **all** are ``vespa_indexed`` the extraction is skipped and only cleanup
    + ``mark_succeeded`` run.
*   If **partial** results exist the already-indexed Vespa events are deleted
    first (with internal retries), then the PostgreSQL rows are removed and
    the extraction restarts from scratch.

Supersession protection (P1)
----------------------------

After acquiring the Redis lock, the task checks for a **newer** extraction job
for the same document (by ``created_at``).  If a newer job already exists:

*   **SUCCEEDED** — the current job is superseded.  It deletes only its *own*
    Vespa events (not the newer generation's) and marks SKIPPED.  If
    self-cleanup fails, it re-enqueues a cleanup-only retry.
*   **PENDING / RUNNING / CLEANUP_PENDING** — re-enqueues with a short
    countdown, giving the newer job time to run.  Never marks SKIPPED for
    non-terminal states (fixes orphan-generation scenario).

A **compare-and-swap** on ``Document.active_graph_job_id`` guards the
generation-swap phase.  The CAS runs **before** any destructive cleanup of
old events.  If it fails (another job claimed the pointer), the task removes
only its own newly-indexed events and marks SKIPPED, leaving the new
generation intact.

Cleanup protocol
----------------

1.  Snapshot old event IDs from PostgreSQL (source of truth).
2.  Extract → index → collect new event UUIDs.
3.  **CAS** ``Document.active_graph_job_id`` (before deleting anything).
    *   CAS fails → delete our own (newly-indexed) events, mark SKIPPED.
    *   CAS succeeds → continue.
4.  Delete old events from Vespa (best-effort, with ``_delete_with_retry``).
5.  If cleanup permanently failed: persist ``cleanup_retry_count``,
    ``cleanup_next_retry_at``, ``cleanup_last_error`` in PostgreSQL and
    re-enqueue the **same job** (``apply_async``).  The durable DB state
    survives broker message loss (P2).
6.  After ``_MAX_CLEANUP_REENQUEUE`` attempts the task gives up and marks the
    job ``FAILED``.
7.  Delete old PostgreSQL rows **only for successfully-deleted** Vespa events.
    Failed IDs remain in PostgreSQL until cleanup succeeds.

A periodic sweeper (``graph_extraction_cleanup_sweeper``) runs every 5 minutes
and re-enqueues any job stuck in ``CLEANUP_PENDING`` state whose
``cleanup_next_retry_at <= now()``, providing a durable recovery path (P2).
"""

from __future__ import annotations

import datetime
import time
from collections.abc import Callable
from typing import Any
from uuid import UUID

from celery import shared_task
from celery.utils.log import get_task_logger
from redis.exceptions import RedisError
from redis.lock import Lock as RedisLock
from sqlalchemy import or_

from onyx.background.celery.apps.app_base import task_logger
from onyx.configs.constants import OnyxCeleryQueues
from onyx.configs.constants import OnyxCeleryTask
from onyx.db.engine.sql_engine import get_session_with_current_tenant
from onyx.db.graph_extraction_jobs import GraphExtractionJob
from onyx.db.graph_extraction_jobs import GraphExtractionStatus
from onyx.db.graph_extraction_jobs import mark_graph_extraction_job_cleanup_pending
from onyx.db.graph_extraction_jobs import mark_graph_extraction_job_failed
from onyx.db.graph_extraction_jobs import mark_graph_extraction_job_running
from onyx.db.graph_extraction_jobs import mark_graph_extraction_job_skipped
from onyx.db.graph_extraction_jobs import mark_graph_extraction_job_succeeded
from onyx.db.graph_extraction_jobs import reset_cleanup_state
from onyx.db.graph_service import extract_and_save_graph
from onyx.db.graph_service import NoDefaultLLMError
from onyx.db.models import Document
from onyx.db.models import DocumentChunkV2
from onyx.db.models import KnowledgeEvent
from onyx.db.models import RelationEvidence
from onyx.indexing.indexing_pipeline import _check_and_trigger_wiki_stale_detection
from onyx.redis.redis_pool import get_shared_redis_client

logger = get_task_logger(__name__)

_GRAPH_EXTRACTION_TIMEOUT_S = 10 * 60

_REDIS_LOCK_TIMEOUT_S = 15 * 60
_REDIS_LOCK_WAIT_S = 30

# Internal Vespa-deletion retries (within a single task execution).
# 1 initial attempt + 3 retries = 4 total per task run.
_MAX_CLEANUP_RETRY_ATTEMPTS = 3
_CLEANUP_RETRY_DELAYS_S = [10, 30, 60]

# How many times the task will re-enqueue itself (with the same job_id) when
# cleanup keeps failing.  After this limit the job is marked FAILED.
_MAX_CLEANUP_REENQUEUE = 15

# Maximum number of Vespa event documents to index in a single call.
_VESPA_INDEX_BATCH_SIZE = 50


class EventDTO:
    """Plain-data transfer object for knowledge events (no DB session)."""

    def __init__(
        self,
        event_id: str,
        document_id: str,
        title: str,
        content: str,
        category: str | None,
        confidence: float | None,
        entity_names: list[str],
        sibling_order: int | None,
    ) -> None:
        self.event_id = event_id
        self.document_id = document_id
        self.title = title
        self.content = content
        self.category = category
        self.confidence = confidence
        self.entity_names = entity_names
        self.sibling_order = sibling_order


def _batch_list(items: list, size: int):
    """Yield successive *size*-sized chunks from *items*."""
    for i in range(0, len(items), size):
        yield items[i : i + size]


def _delete_vespa_event_ids(event_ids: set[str]) -> set[str]:
    """Delete specific events from Vespa by event_id (best-effort).

    Returns the subset of IDs that **failed** to delete.
    """
    if not event_ids:
        return set()

    from onyx.document_index.vespa.shared_utils.utils import get_vespa_http_client
    from onyx.document_index.vespa_constants import VESPA_APPLICATION_ENDPOINT

    failed: set[str] = set()
    try:
        with get_vespa_http_client() as http_client:
            for event_id in event_ids:
                url = (
                    f"{VESPA_APPLICATION_ENDPOINT}"
                    f"/document/v1/knowledge_event/knowledge_event/docid/{event_id}"
                )
                try:
                    resp = http_client.delete(url)
                    if resp.status_code == 404:
                        continue
                    resp.raise_for_status()
                except Exception:
                    task_logger.exception(
                        "Failed to delete Vespa event %s", event_id,
                    )
                    failed.add(event_id)
    except Exception:
        task_logger.exception("Failed to open Vespa HTTP client for cleanup")
        failed.update(event_ids)

    return failed


def _delete_with_retry(
    event_ids: set[str],
    ensure_lock_ttl: Callable[[], None],
    label: str = "",
) -> set[str]:
    """Delete events from Vespa with an internal retry loop.

    Returns the IDs that still failed after all retries (empty = success).
    """
    if not event_ids:
        return set()

    failed = _delete_vespa_event_ids(event_ids)
    for attempt in range(_MAX_CLEANUP_RETRY_ATTEMPTS):
        if not failed:
            break
        delay = _CLEANUP_RETRY_DELAYS_S[
            min(attempt, len(_CLEANUP_RETRY_DELAYS_S) - 1)
        ]
        task_logger.warning(
            "%s: cleanup attempt %d/%d failed for %d events, "
            "retrying in %ds",
            label, attempt + 1, _MAX_CLEANUP_RETRY_ATTEMPTS,
            len(failed), delay,
        )
        time.sleep(delay)
        ensure_lock_ttl()
        failed = _delete_vespa_event_ids(failed)

    return failed


def _fetch_knowledge_event_ids(
    db_session: Any, doc_id: str
) -> set[str]:
    """Fetch all knowledge event IDs for a document from PostgreSQL.

    This is the source of truth — any event in Vespa should have a
    corresponding row in ``knowledge_events``. Using PostgreSQL avoids
    pagination bugs (unbounded Vespa loops), tenant-flag inconsistency, and
    the need for a dedicated DocumentIndex interface method.
    """
    return {
        str(row.event_id)
        for row in db_session.query(KnowledgeEvent.event_id)
        .filter(KnowledgeEvent.document_id == doc_id)
        .all()
    }


def _delete_pg_events_for_job(
    db_session: Any,
    job_uuid: UUID,
    doc_id: str,
) -> None:
    """Delete all KnowledgeEvent and RelationEvidence rows for *job_uuid*."""
    db_session.query(KnowledgeEvent).filter(
        KnowledgeEvent.extraction_job_id == job_uuid,
        KnowledgeEvent.document_id == doc_id,
    ).delete(synchronize_session=False)
    db_session.query(RelationEvidence).filter(
        RelationEvidence.extraction_job_id == job_uuid,
        RelationEvidence.document_id == doc_id,
    ).delete(synchronize_session=False)


def _cleanup_old_pg_events(
    db_session: Any,
    doc_id: str,
    job_uuid: UUID,
    protected_event_ids: set[str] | None = None,
) -> None:
    """Delete old RelationEvidence & KnowledgeEvent rows for *doc_id*.

    ``protected_event_ids`` — if provided — will NOT be removed from
    PostgreSQL even if they belong to a previous generation.  This is used
    when Vespa deletion failed for those IDs so they can be retried later.
    """
    old_rel_cond = or_(
        RelationEvidence.extraction_job_id.is_(None),
        RelationEvidence.extraction_job_id != job_uuid,
    )
    db_session.query(RelationEvidence).filter(
        RelationEvidence.document_id == doc_id,
        old_rel_cond,
    ).delete(synchronize_session=False)

    old_ke_cond = or_(
        KnowledgeEvent.extraction_job_id.is_(None),
        KnowledgeEvent.extraction_job_id != job_uuid,
    )
    query = db_session.query(KnowledgeEvent).filter(
        KnowledgeEvent.document_id == doc_id,
        old_ke_cond,
    )
    if protected_event_ids is not None:
        query = query.filter(
            KnowledgeEvent.event_id.notin_(protected_event_ids)
        )
    query.delete(synchronize_session=False)


@shared_task(
    name=OnyxCeleryTask.GRAPH_EXTRACTION_TASK,
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    acks_late=True,
    queue=OnyxCeleryQueues.GRAPH_EXTRACTION,
)
def graph_extraction_task(
    self: Any,  # noqa: ANN401 — Celery task self is not typed
    job_id: str,
    doc_id: str,
    tenant_id: str,
    _cleanup_retry: int = 0,
) -> None:
    """Extract Knowledge Graph entities/relations for a single document.

    See module docstring for the full architecture description.

    ``_cleanup_retry`` is deprecated and ignored: the authoritative counter
    lives in ``graph_extraction_jobs.cleanup_retry_count`` (P2).  It is kept
    only for backward compatibility with in-flight Celery messages.
    """
    start = time.monotonic()
    job_uuid = UUID(job_id)
    lock_name = f"da_lock:graph_extraction:{tenant_id}:{doc_id}"

    # ── Shortcuts for error handlers that need to mark + commit ──────
    def _fail(exc: Exception) -> None:
        with get_session_with_current_tenant() as s:
            mark_graph_extraction_job_failed(job_uuid, str(exc), s)
            s.commit()

    def _skip(reason: str) -> None:
        with get_session_with_current_tenant() as s:
            mark_graph_extraction_job_skipped(job_uuid, reason, s)
            s.commit()

    def _save_cleanup_state(
        retry_count: int,
        next_retry_at: datetime.datetime,
        last_error: str,
    ) -> None:
        """Persist cleanup-retry metadata to PostgreSQL (P2).

        Called *before* re-enqueue so the state survives broker message loss.
        """
        with get_session_with_current_tenant() as s:
            mark_graph_extraction_job_cleanup_pending(
                job_uuid,
                cleanup_retry_count=retry_count,
                cleanup_next_retry_at=next_retry_at,
                cleanup_last_error=last_error,
                db_session=s,
            )
            s.commit()

    def _read_cleanup_retry_count() -> int:
        """Read the authoritative cleanup retry count from the DB (P2)."""
        with get_session_with_current_tenant() as s:
            job_row = (
                s.query(GraphExtractionJob)
                .filter(GraphExtractionJob.id == job_uuid)
                .first()
            )
            return job_row.cleanup_retry_count if job_row is not None else 0

    def _reenqueue_cleanup(
        failed_count: int,
        reason: str,
        *,
        countdown_override: int | None = None,
    ) -> None:
        """Re-enqueue this same job (same job_id) for a cleanup-only retry.

        Persists retry state to PostgreSQL first so the task can recover
        even if the Celery message is lost (P2).
        """
        cleanup_retry = _read_cleanup_retry_count()

        if cleanup_retry >= _MAX_CLEANUP_REENQUEUE:
            task_logger.error(
                "graph_extraction_task: cleanup re-enqueue limit reached "
                "(%d attempts) for doc_id=%s job_id=%s — marking FAILED",
                _MAX_CLEANUP_REENQUEUE, doc_id, job_id,
            )
            _fail(PermanentCleanupError(
                f"{reason}: failed to delete {failed_count} old Vespa "
                f"events after {_MAX_CLEANUP_REENQUEUE} re-enqueues",
            ))
            return

        countdown = (
            countdown_override
            if countdown_override is not None
            else min(300 * (cleanup_retry + 1), 3600)
        )
        next_retry_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(
            seconds=countdown,
        )

        task_logger.warning(
            "graph_extraction_task: %s — re-enqueueing same job "
            "(attempt %d/%d) for doc_id=%s, next run in %ds",
            reason, cleanup_retry + 1, _MAX_CLEANUP_REENQUEUE,
            doc_id, countdown,
        )

        # Persist cleanup state BEFORE publishing the new message.
        _save_cleanup_state(cleanup_retry + 1, next_retry_at, reason)

        graph_extraction_task.apply_async(
            kwargs={
                "job_id": job_id,
                "doc_id": doc_id,
                "tenant_id": tenant_id,
            },
            countdown=countdown,
        )

    def _reenqueue_superseded_wait(
        newer_job_id: UUID,
        newer_status: str,
    ) -> None:
        """Re-enqueue after a short delay to let a newer job make progress.

        Uses a distinct countdown (60s) that does **not** consume the cleanup
        retry budget, so a stuck newer job (PENDING forever) does not exhaust
        retries.
        """
        countdown = 120  # 2 minutes — enough for a typical extraction cycle
        task_logger.warning(
            "graph_extraction_task: superseded by newer job %s "
            "(status=%s) for doc_id=%s — re-enqueueing in %ds",
            newer_job_id, newer_status, doc_id, countdown,
        )
        graph_extraction_task.apply_async(
            kwargs={
                "job_id": job_id,
                "doc_id": doc_id,
                "tenant_id": tenant_id,
            },
            countdown=countdown,
        )

    # ── Acquire Redis distributed lock (inside try for safe retry) ──
    lock: RedisLock | None = None
    try:
        redis_client = get_shared_redis_client()
        lock = redis_client.lock(
            lock_name,
            timeout=_REDIS_LOCK_TIMEOUT_S,
        )
        if not lock.acquire(blocking=True, blocking_timeout=_REDIS_LOCK_WAIT_S):
            task_logger.warning(
                "graph_extraction_task: could not acquire Redis lock for "
                "doc_id=%s job_id=%s, will retry",
                doc_id,
                job_id,
            )
            raise self.retry(countdown=30, expires=3600)
    except RedisError as exc:
        task_logger.warning(
            "graph_extraction_task: Redis error while acquiring lock for "
            "doc_id=%s job_id=%s: %s",
            doc_id,
            job_id,
            exc,
        )
        raise self.retry(exc=exc, countdown=30, expires=3600)

    # ── Lock-ttl renewal helper ──────────────────────────────────────
    _lock_last_reacquire = time.monotonic()

    def _ensure_lock_ttl() -> None:
        nonlocal _lock_last_reacquire
        assert lock is not None
        if time.monotonic() - _lock_last_reacquire >= _REDIS_LOCK_TIMEOUT_S / 4:
            lock.reacquire()
            _lock_last_reacquire = time.monotonic()

    try:
        # ── Phase 0: Initialise shared objects ────────────────────────
        from onyx.db.search_settings import get_current_search_settings
        from onyx.document_index.factory import get_default_document_index

        with get_session_with_current_tenant() as db_session:
            search_settings = get_current_search_settings(db_session)
            document_index = get_default_document_index(
                search_settings, None, db_session,
            )

            if not document_index.supports_knowledge_events:
                db_session.close()
                _skip(
                    "Knowledge Graph events are only supported when "
                    "Vespa is the search backend.",
                )
                return

        # ── Phase 1: Supersession check + retry-idempotency ───────────
        with get_session_with_current_tenant() as db_session:
            current_job = (
                db_session.query(GraphExtractionJob)
                .filter(GraphExtractionJob.id == job_uuid)
                .first()
            )

            if not current_job:
                db_session.close()
                return

            # 1a. Content-hash cache check.
            latest_hash_match = (
                db_session.query(GraphExtractionJob)
                .filter(
                    GraphExtractionJob.document_id == doc_id,
                    GraphExtractionJob.content_hash
                    == current_job.content_hash,
                    GraphExtractionJob.prompt_version
                    == current_job.prompt_version,
                    GraphExtractionJob.model_name
                    == current_job.model_name,
                    GraphExtractionJob.status
                    == GraphExtractionStatus.SUCCEEDED,
                    GraphExtractionJob.id != job_uuid,
                )
                .first()
            )
            if latest_hash_match is not None:
                db_session.close()
                _skip(
                    f"Document content already processed "
                    f"by job {latest_hash_match.id}",
                )
                return

            # 1b. Supersession check (P1).
            newer_job = (
                db_session.query(GraphExtractionJob)
                .filter(
                    GraphExtractionJob.document_id == doc_id,
                    GraphExtractionJob.created_at > current_job.created_at,
                )
                .order_by(GraphExtractionJob.created_at.desc())
                .first()
            )
            if newer_job is not None:
                newer_status = newer_job.status
                if newer_status == GraphExtractionStatus.SUCCEEDED:
                    # Fully superseded → self-cleanup and skip.
                    our_events = (
                        db_session.query(KnowledgeEvent.event_id)
                        .filter(
                            KnowledgeEvent.extraction_job_id == job_uuid,
                            KnowledgeEvent.vespa_indexed.is_(True),
                        )
                        .all()
                    )
                    our_vespa_ids = {str(r[0]) for r in our_events}
                    if our_vespa_ids:
                        failed_ids = _delete_with_retry(
                            our_vespa_ids,
                            _ensure_lock_ttl,
                            "supersession cleanup",
                        )
                        if failed_ids:
                            db_session.close()
                            _reenqueue_cleanup(
                                len(failed_ids),
                                "supersession cleanup failed",
                            )
                            return
                        # All our Vespa events deleted → remove PG rows too.
                        _delete_pg_events_for_job(
                            db_session, job_uuid, doc_id,
                        )
                        db_session.commit()
                    db_session.close()
                    _skip(
                        f"Superseded by newer job {newer_job.id} "
                        f"(status=SUCCEEDED)",
                    )
                    return

                if newer_status in (
                    GraphExtractionStatus.PENDING,
                    GraphExtractionStatus.RUNNING,
                    GraphExtractionStatus.CLEANUP_PENDING,
                ):
                    # Wait for the newer job instead of skipping (P1).
                    db_session.close()
                    _reenqueue_superseded_wait(
                        newer_job.id,
                        newer_status,
                    )
                    return

                # newer_status is FAILED or SKIPPED — proceed normally.

            # 1c. Read active generation pointer for CAS later.
            doc = (
                db_session.query(Document)
                .filter(Document.id == doc_id)
                .first()
            )
            expected_active_id: UUID | None = (
                doc.active_graph_job_id if doc else None
            )

            # 1d. Retry-idempotency check.
            existing_events = (
                db_session.query(KnowledgeEvent)
                .filter(
                    KnowledgeEvent.extraction_job_id == job_uuid,
                )
                .all()
            )
            skip_extraction = False
            if existing_events:
                if all(e.vespa_indexed for e in existing_events):
                    # All vespa_indexed → cleanup-only retry.
                    skip_extraction = True
                    new_ids = {str(e.event_id) for e in existing_events}
                    old_ids = _fetch_knowledge_event_ids(
                        db_session, doc_id,
                    )

                    # CAS first (before any Vespa deletion).
                    if doc is not None and expected_active_id != job_uuid:
                        updated = (
                            db_session.query(Document)
                            .filter(
                                Document.id == doc_id,
                                Document.active_graph_job_id
                                == expected_active_id,
                            )
                            .update(
                                {"active_graph_job_id": job_uuid},
                                synchronize_session=False,
                            )
                        )
                        if updated == 0:
                            db_session.close()
                            _skip(
                                "CAS failed: generation pointer claimed "
                                "by another job",
                            )
                            return

                    failed_vespa = _delete_with_retry(
                        old_ids - new_ids,
                        _ensure_lock_ttl,
                        "cleanup-only retry",
                    )
                    _cleanup_old_pg_events(
                        db_session, doc_id, job_uuid,
                        protected_event_ids=(
                            failed_vespa if failed_vespa else None
                        ),
                    )
                    if failed_vespa:
                        db_session.commit()
                        _reenqueue_cleanup(
                            len(failed_vespa),
                            "cleanup-only retry failed",
                        )
                        return

                    mark_graph_extraction_job_succeeded(
                        job_uuid, db_session,
                    )
                    db_session.commit()
                    return

                # Partial results: delete Vespa events BEFORE PG rows.
                partial_ids = {str(e.event_id) for e in existing_events}
                failed_partial = _delete_with_retry(
                    partial_ids,
                    _ensure_lock_ttl,
                    "partial cleanup",
                )
                if failed_partial:
                    db_session.commit()
                    _reenqueue_cleanup(
                        len(failed_partial),
                        "partial cleanup failed",
                    )
                    return

                # Now safe to delete PG rows.
                db_session.query(KnowledgeEvent).filter(
                    KnowledgeEvent.extraction_job_id == job_uuid,
                ).delete(synchronize_session=False)
                db_session.query(RelationEvidence).filter(
                    RelationEvidence.extraction_job_id == job_uuid,
                ).delete(synchronize_session=False)

            # 1e. Snapshot old event IDs for generation swap later.
            old_event_ids = _fetch_knowledge_event_ids(
                db_session, doc_id,
            )

            mark_graph_extraction_job_running(job_uuid, db_session)
            db_session.commit()

        if skip_extraction:
            return

        # ── Phase 2: Retrieve chunks & build cc_pair_id ──────────────
        with get_session_with_current_tenant() as db_session:
            chunks = (
                db_session.query(DocumentChunkV2)
                .filter(DocumentChunkV2.doc_id == doc_id)
                .all()
            )

            from onyx.db.models import ConnectorCredentialPair
            from onyx.db.models import DocumentByConnectorCredentialPair

            if not chunks:
                task_logger.warning(
                    "graph_extraction_task: no chunks for doc_id=%s, skipping",
                    doc_id,
                )
                mark_graph_extraction_job_succeeded(
                    job_uuid, db_session,
                )
                db_session.commit()
                return

            cc_pair = (
                db_session.query(ConnectorCredentialPair)
                .join(
                    DocumentByConnectorCredentialPair,
                    (
                        DocumentByConnectorCredentialPair.connector_id
                        == ConnectorCredentialPair.connector_id
                    )
                    & (
                        DocumentByConnectorCredentialPair.credential_id
                        == ConnectorCredentialPair.credential_id
                    ),
                )
                .filter(DocumentByConnectorCredentialPair.id == doc_id)
                .first()
            )
            cc_pair_id = cc_pair.id if cc_pair else None

        # ── Phase 3: LLM extraction (one short txn per chunk) ────────
        from onyx.db.graph_service import select_chunks_for_extraction

        selected_chunks = select_chunks_for_extraction(chunks)
        for chunk in selected_chunks:
            if not chunk.text_raw or len(chunk.text_raw.strip()) < 100:
                continue

            elapsed = time.monotonic() - start
            if elapsed > _GRAPH_EXTRACTION_TIMEOUT_S:
                raise TimeoutError(
                    f"Graph extraction exceeded timeout after {elapsed:.0f}s",
                )

            remaining_budget = max(
                10, _GRAPH_EXTRACTION_TIMEOUT_S - elapsed,
            )
            llm_timeout = min(120, int(remaining_budget))

            with get_session_with_current_tenant() as chunk_session:
                extract_and_save_graph(
                    chunk,
                    chunk_session,
                    knowledge_scope_id=cc_pair_id,
                    extraction_job_id=job_uuid,
                    tenant_id=tenant_id,
                    timeout=llm_timeout,
                )
                chunk_session.commit()

            _ensure_lock_ttl()

        # ── Phase 4: Build & index Vespa docs ────────────────────────
        from onyx.access.access import get_access_for_document
        from onyx.db.models import Entity
        from onyx.db.models import EventEntity
        from onyx.document_index.vespa.event_indexing_utils import (
            prepare_knowledge_event_vespa_doc,
        )
        from onyx.natural_language_processing.search_nlp_models import EmbeddingModel
        from shared_configs.configs import MODEL_SERVER_HOST
        from shared_configs.configs import MODEL_SERVER_PORT

        embedding_model = EmbeddingModel.from_db_model(
            search_settings=search_settings,
            server_host=MODEL_SERVER_HOST,
            server_port=MODEL_SERVER_PORT,
        )

        with get_session_with_current_tenant() as db_session:
            doc_row = (
                db_session.query(Document)
                .filter(Document.id == doc_id)
                .first()
            )
            if not doc_row:
                event_dtos: list[EventDTO] = []
                doc_acl: list[str] = []
                doc_is_public = False
                doc_updated_dt = None
            else:
                access_control = get_access_for_document(doc_id, db_session)
                doc_acl = list(access_control.to_acl())
                doc_is_public = access_control.is_public
                doc_updated_dt = doc_row.doc_updated_at

                events = (
                    db_session.query(KnowledgeEvent)
                    .filter(
                        KnowledgeEvent.extraction_job_id == job_uuid,
                    )
                    .all()
                )

                event_dtos = []
                for event in events:
                    entity_rows = (
                        db_session.query(Entity.name)
                        .join(
                            EventEntity,
                            EventEntity.entity_id == Entity.entity_id,
                        )
                        .filter(
                            EventEntity.event_id == event.event_id,
                        )
                        .all()
                    )
                    entity_names = [r[0] for r in entity_rows]

                    sibling_order = None
                    if event.chunk_id:
                        sibling_order = (
                            db_session.query(
                                DocumentChunkV2.sibling_order,
                            )
                            .filter(
                                DocumentChunkV2.chunk_id == event.chunk_id,
                            )
                            .scalar()
                        )

                    event_dtos.append(EventDTO(
                        event_id=str(event.event_id),
                        document_id=doc_id,
                        title=event.title,
                        content=event.content,
                        category=event.category,
                        confidence=event.confidence,
                        entity_names=entity_names,
                        sibling_order=sibling_order,
                    ))

        if event_dtos:
            titles = [d.title for d in event_dtos]
            contents = [d.content for d in event_dtos]
            title_embeds = embedding_model.encode(titles) if titles else []
            content_embeds = (
                embedding_model.encode(contents) if contents else []
            )

            vespa_event_docs: list[dict[str, Any]] = []
            for idx, dto in enumerate(event_dtos):
                vespa_event_docs.append(
                    prepare_knowledge_event_vespa_doc(
                        event=KnowledgeEvent(
                            event_id=UUID(dto.event_id),
                            document_id=dto.document_id,
                            title=dto.title,
                            content=dto.content,
                            category=dto.category,
                            confidence=dto.confidence,
                        ),
                        entity_names=dto.entity_names,
                        access_control_list=doc_acl,
                        is_public=doc_is_public,
                        doc_updated_at=doc_updated_dt,
                        title_embed=title_embeds[idx],
                        content_embed=content_embeds[idx],
                        tenant_id=tenant_id,
                        sibling_order=dto.sibling_order,
                    ),
                )

            # Batch-index into Vespa, renewing the lock between batches.
            for batch in _batch_list(vespa_event_docs, _VESPA_INDEX_BATCH_SIZE):
                _ensure_lock_ttl()
                document_index.index_knowledge_events(batch)
                _ensure_lock_ttl()
        else:
            vespa_event_docs = []

        with get_session_with_current_tenant() as db_session:
            events = (
                db_session.query(KnowledgeEvent)
                .filter(
                    KnowledgeEvent.extraction_job_id == job_uuid,
                )
                .all()
            )
            for event in events:
                event.vespa_indexed = True
            db_session.commit()

        # ── Phase 4c: CAS active generation pointer (before Vespa cleanup) ──
        # If CAS fails, another job claimed the pointer → remove our events.
        cas_failed = False
        if expected_active_id != job_uuid:
            with get_session_with_current_tenant() as db_session:
                updated = (
                    db_session.query(Document)
                    .filter(
                        Document.id == doc_id,
                        Document.active_graph_job_id == expected_active_id,
                    )
                    .update(
                        {"active_graph_job_id": job_uuid},
                        synchronize_session=False,
                    )
                )
                db_session.commit()
                if updated == 0:
                    cas_failed = True

        if cas_failed:
            # Remove our newly-indexed events — another generation won.
            new_event_ids = {d["event_id"] for d in vespa_event_docs}
            _delete_with_retry(
                new_event_ids, _ensure_lock_ttl, "CAS failure cleanup",
            )
            with get_session_with_current_tenant() as db_session:
                _delete_pg_events_for_job(db_session, job_uuid, doc_id)
                db_session.commit()
            _skip(
                "CAS failed: generation pointer claimed "
                "by another job during extraction",
            )
            return

        # ── Phase 5: Generation swap — Vespa cleanup ─────────────────
        new_event_ids = {d["event_id"] for d in vespa_event_docs}
        old_ids_to_rm = old_event_ids - new_event_ids
        failed_ids = _delete_with_retry(
            old_ids_to_rm, _ensure_lock_ttl, "generation cleanup",
        )

        # ── Phase 6: Generation swap — PG cleanup ────────────────────
        with get_session_with_current_tenant() as db_session:
            _cleanup_old_pg_events(
                db_session, doc_id, job_uuid,
                protected_event_ids=(
                    failed_ids if failed_ids else None
                ),
            )
            db_session.commit()

        if failed_ids:
            _reenqueue_cleanup(
                len(failed_ids), "generation cleanup failed",
            )
            return

        _ensure_lock_ttl()

        # ── Phase 7: Wiki stale detection + mark Succeeded ───────────
        with get_session_with_current_tenant() as db_session:
            reset_cleanup_state(job_uuid, db_session)

            try:
                _check_and_trigger_wiki_stale_detection(
                    db_session, [doc_id],
                )
            except Exception as wiki_err:
                task_logger.exception(
                    "graph_extraction_task: wiki stale detection "
                    "failed for doc_id=%s: %s",
                    doc_id,
                    wiki_err,
                )

            mark_graph_extraction_job_succeeded(job_uuid, db_session)
            db_session.commit()

    except NoDefaultLLMError as exc:
        task_logger.warning(
            "graph_extraction_task: skipped (no default LLM) for "
            "doc_id=%s job_id=%s: %s",
            doc_id,
            job_id,
            exc,
        )
        _skip(str(exc))

    except TimeoutError as exc:
        task_logger.error(
            "graph_extraction_task: timeout for "
            "doc_id=%s job_id=%s: %s",
            doc_id,
            job_id,
            exc,
        )
        _fail(exc)
        retry_delays = [30, 300, 1800]
        retry_num = getattr(self, "request", None)
        current_retries = getattr(retry_num, "retries", 0) if retry_num else 0
        delay = retry_delays[min(current_retries, len(retry_delays) - 1)]
        raise self.retry(exc=exc, countdown=delay, expires=3600)

    except Exception as exc:
        task_logger.exception(
            "graph_extraction_task: failed for "
            "doc_id=%s job_id=%s: %s",
            doc_id,
            job_id,
            exc,
        )
        _fail(exc)
        retry_delays = [30, 300, 1800]
        retry_num = getattr(self, "request", None)
        current_retries = getattr(retry_num, "retries", 0) if retry_num else 0
        delay = retry_delays[min(current_retries, len(retry_delays) - 1)]
        raise self.retry(exc=exc, countdown=delay, expires=3600)

    finally:
        if lock is not None:
            try:
                if lock.owned():
                    lock.release()
            except RedisError:
                task_logger.exception(
                    "Failed to inspect/release Redis lock %s", lock_name,
                )


@shared_task(
    name=OnyxCeleryTask.GRAPH_EXTRACTION_CLEANUP_SWEEPER,
    ignore_result=True,
    soft_time_limit=120,
    trail=False,
    bind=True,
)
def graph_extraction_cleanup_sweeper(
    self: Any,  # noqa: ANN401, ARG001
) -> None:
    """Periodic sweeper that re-enqueues stuck CLEANUP_PENDING jobs.

    Queries ``graph_extraction_jobs`` where:
        status = 'cleanup_pending' AND cleanup_next_retry_at <= now()

    Uses ``FOR UPDATE SKIP LOCKED`` to claim jobs without blocking other
    workers, then enqueues the same ``graph_extraction_task`` with the
    original ``job_id``, ``doc_id``, and ``tenant_id``.

    Runs every 5 minutes (see ``beat_schedule.py``).  Provides a durable
    recovery path for cleanup jobs whose Celery message was lost (P2).
    """
    try:
        with get_session_with_current_tenant() as db_session:
            now = datetime.datetime.now(datetime.timezone.utc)

            overdue = (
                db_session.query(GraphExtractionJob)
                .filter(
                    GraphExtractionJob.status
                    == GraphExtractionStatus.CLEANUP_PENDING,
                    GraphExtractionJob.cleanup_next_retry_at <= now,
                )
                .order_by(GraphExtractionJob.cleanup_next_retry_at.asc())
                .limit(50)
                .with_for_update(skip_locked=True)
                .all()
            )

            for job in overdue:
                task_logger.info(
                    "graph_extraction_cleanup_sweeper: re-enqueuing "
                    "job %s for doc_id=%s (retry %d)",
                    job.id, job.document_id, job.cleanup_retry_count,
                )
                graph_extraction_task.apply_async(
                    kwargs={
                        "job_id": str(job.id),
                        "doc_id": job.document_id,
                    },
                    countdown=10,
                )

    except Exception:
        task_logger.exception(
            "graph_extraction_cleanup_sweeper: error",
        )


class PermanentCleanupError(Exception):
    """Raised when Vespa cleanup permanently fails and we give up."""
