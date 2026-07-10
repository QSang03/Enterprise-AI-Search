"""Background Celery task for Knowledge Graph extraction.

Runs in the heavy worker so LLM calls don't block the main indexing pipeline
and Postgres transaction locks are released immediately after Vespa/DB writes.
"""

import hashlib
import time
from typing import Any
from uuid import UUID

from celery import shared_task
from celery.utils.log import get_task_logger
from sqlalchemy import or_
from sqlalchemy import text as sql_text

from onyx.background.celery.apps.app_base import task_logger
from onyx.configs.constants import OnyxCeleryQueues
from onyx.configs.constants import OnyxCeleryTask
from onyx.db.engine.sql_engine import get_session_with_current_tenant
from onyx.db.graph_extraction_jobs import mark_graph_extraction_job_failed
from onyx.db.graph_extraction_jobs import mark_graph_extraction_job_running
from onyx.db.graph_extraction_jobs import mark_graph_extraction_job_skipped
from onyx.db.graph_extraction_jobs import mark_graph_extraction_job_succeeded
from onyx.db.graph_service import extract_and_save_graph
from onyx.db.graph_service import NoDefaultLLMError
from onyx.db.models import DocumentChunkV2
from onyx.db.models import KnowledgeEvent
from onyx.db.models import RelationEvidence
from onyx.indexing.indexing_pipeline import _check_and_trigger_wiki_stale_detection

logger = get_task_logger(__name__)

_GRAPH_EXTRACTION_TIMEOUT_S = 10 * 60


def _generate_stable_lock_key(tenant_id: str, doc_id: str) -> int:
    """Deterministic 64-bit signed advisory lock key (stable across processes)."""
    raw = f"{tenant_id}:{doc_id}".encode("utf-8")
    digest = hashlib.blake2b(raw, digest_size=8).digest()
    return int.from_bytes(digest, byteorder="big", signed=True)


def _delete_vespa_event_ids(event_ids: set[str]) -> None:
    """Delete specific events from Vespa by event_id (best-effort)."""
    if not event_ids:
        return
    from onyx.document_index.vespa.shared_utils.utils import get_vespa_http_client
    from onyx.document_index.vespa_constants import VESPA_APPLICATION_ENDPOINT

    try:
        with get_vespa_http_client() as http_client:
            for event_id in event_ids:
                url = (
                    f"{VESPA_APPLICATION_ENDPOINT}"
                    f"/document/v1/knowledge_event/knowledge_event/docid/{event_id}"
                )
                try:
                    resp = http_client.delete(url)
                    resp.raise_for_status()
                except Exception:
                    task_logger.exception(
                        "Failed to delete Vespa event %s", event_id,
                    )
    except Exception:
        task_logger.exception("Failed to open Vespa HTTP client for cleanup")


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


@shared_task(
    name=OnyxCeleryTask.GRAPH_EXTRACTION_TASK,
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    acks_late=True,
    queue=OnyxCeleryQueues.GRAPH_EXTRACTION,
)
def graph_extraction_task(
    self: "Any",  # noqa: ANN401 — Celery task self is not typed
    job_id: str,
    doc_id: str,
    tenant_id: str,
) -> None:
    """Extract Knowledge Graph entities/relations for a single document.

    Generation-swap protocol:

    1. Acquire ``pg_advisory_xact_lock`` — transaction-level lock released
       atomically on the final ``commit()``.  No intermediate commits within
       the locked transaction, so the lock is never dropped early.  This
       avoids the connection-pooling hazard of session-level locks with
       ``Session(bind=engine)`` (single-tenant deployments), where the
       underlying connection can change across commits.

    2. Fetch old event IDs from PostgreSQL **under the lock** — eliminates
       the race where two concurrent jobs both snapshot empty before either
       acquires the lock, then each deletes the wrong generation.

    3. Retry-Idempotency: check if this ``extraction_job_id`` already has
       events in PostgreSQL.  If all are vespa_indexed → resume cleanup and
       succeed.  If partial → delete partial results and re-extract.

    4. Extract via LLM and save new events/evidence into PostgreSQL.

    5. Index new events into Vespa.

    6. Delete old generation from Vespa (IDs captured in step 2 minus new
       IDs) and from PostgreSQL (``extraction_job_id != current``).

    7. Single ``commit()`` releases the advisory lock and makes all DB
       changes visible atomically.

    8. Mark job SUCCEEDED in a fresh session (post-lock).
    """
    start = time.monotonic()
    job_uuid = UUID(job_id)

    try:
        with get_session_with_current_tenant() as db_session:
            # ── Feature gate ──────────────────────────────────────────
            from onyx.db.search_settings import get_current_search_settings
            from onyx.document_index.factory import get_default_document_index

            search_settings = get_current_search_settings(db_session)
            document_index = get_default_document_index(
                search_settings, None, db_session
            )

            if not document_index.supports_knowledge_events:
                mark_graph_extraction_job_skipped(
                    job_uuid,
                    "Knowledge Graph events are only supported when Vespa "
                    "is the search backend.",
                    db_session,
                )
                db_session.commit()
                return

            # ── Advisory lock (transaction-level) ────────────────────
            lock_key = _generate_stable_lock_key(tenant_id, doc_id)
            db_session.execute(
                sql_text("SELECT pg_advisory_xact_lock(:key)"),
                {"key": lock_key},
            )

            # ── Mark running (inside the same transaction) ────────────
            mark_graph_extraction_job_running(job_uuid, db_session)

            # ── Retry-idempotency check ───────────────────────────────
            from onyx.db.graph_extraction_jobs import GraphExtractionJob
            from onyx.db.graph_extraction_jobs import GraphExtractionStatus

            current_job = (
                db_session.query(GraphExtractionJob)
                .filter(GraphExtractionJob.id == job_uuid)
                .first()
            )

            # Re-check content hash (skip if another job already processed)
            if current_job:
                latest = (
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
                if latest is not None:
                    mark_graph_extraction_job_skipped(
                        job_uuid,
                        f"Document content already processed by job {latest.id}",
                        db_session,
                    )
                    db_session.commit()
                    return

            # Check if a previous attempt of THIS job left partial results
            existing_events = (
                db_session.query(KnowledgeEvent)
                .filter(KnowledgeEvent.extraction_job_id == job_uuid)
                .all()
            )
            if existing_events:
                if all(e.vespa_indexed for e in existing_events):
                    # Previous attempt already succeeded at Vespa indexing
                    # but crashed before mark_succeeded.  Resume cleanup.
                    old_ids = _fetch_knowledge_event_ids(db_session, doc_id)
                    new_ids = {str(e.event_id) for e in existing_events}
                    _delete_vespa_event_ids(old_ids - new_ids)

                    # Clean old PG data for this document
                    db_session.query(RelationEvidence).filter(
                        RelationEvidence.document_id == doc_id,
                        or_(
                            RelationEvidence.extraction_job_id.is_(None),
                            RelationEvidence.extraction_job_id != job_uuid,
                        ),
                    ).delete(synchronize_session=False)
                    db_session.query(KnowledgeEvent).filter(
                        KnowledgeEvent.document_id == doc_id,
                        or_(
                            KnowledgeEvent.extraction_job_id.is_(None),
                            KnowledgeEvent.extraction_job_id != job_uuid,
                        ),
                    ).delete(synchronize_session=False)

                    db_session.commit()
                    # Mark succeeded in a fresh session (lock released on commit)
                    with get_session_with_current_tenant() as s2:
                        mark_graph_extraction_job_succeeded(job_uuid, s2)
                        s2.commit()
                    return

                # Partial results exist — delete & restart fresh
                db_session.query(KnowledgeEvent).filter(
                    KnowledgeEvent.extraction_job_id == job_uuid
                ).delete(synchronize_session=False)
                db_session.query(RelationEvidence).filter(
                    RelationEvidence.extraction_job_id == job_uuid
                ).delete(synchronize_session=False)

            # ── Snapshot old generation IDs (under lock) ──────────────
            old_event_ids = _fetch_knowledge_event_ids(db_session, doc_id)

            # ── Retrieve chunks ───────────────────────────────────────
            chunks = (
                db_session.query(DocumentChunkV2)
                .filter(DocumentChunkV2.doc_id == doc_id)
                .all()
            )
            if not chunks:
                task_logger.warning(
                    "graph_extraction_task: no chunks for doc_id=%s, skipping",
                    doc_id,
                )
                db_session.commit()
                with get_session_with_current_tenant() as s2:
                    mark_graph_extraction_job_succeeded(job_uuid, s2)
                    s2.commit()
                return

            elapsed = time.monotonic() - start
            if elapsed > _GRAPH_EXTRACTION_TIMEOUT_S:
                raise TimeoutError(
                    f"Graph extraction exceeded timeout after {elapsed:.0f}s"
                )

            # ── Select chunks for extraction ──────────────────────────
            from onyx.db.graph_service import select_chunks_for_extraction

            selected_chunks = select_chunks_for_extraction(chunks)

            from onyx.db.models import ConnectorCredentialPair
            from onyx.db.models import DocumentByConnectorCredentialPair

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

            # ── LLM extraction per chunk ──────────────────────────────
            for chunk in selected_chunks:
                if not chunk.text_raw or len(chunk.text_raw.strip()) < 100:
                    continue

                elapsed = time.monotonic() - start
                if elapsed > _GRAPH_EXTRACTION_TIMEOUT_S:
                    raise TimeoutError(
                        f"Graph extraction exceeded timeout after {elapsed:.0f}s"
                    )

                remaining_budget = max(
                    10, _GRAPH_EXTRACTION_TIMEOUT_S - elapsed
                )
                llm_timeout = min(120, int(remaining_budget))

                extract_and_save_graph(
                    chunk,
                    db_session,
                    knowledge_scope_id=cc_pair_id,
                    extraction_job_id=job_uuid,
                    tenant_id=tenant_id,
                    timeout=llm_timeout,
                )

            # ── Build Vespa documents ─────────────────────────────────
            from onyx.configs.model_configs import MODEL_SERVER_HOST
            from onyx.configs.model_configs import MODEL_SERVER_PORT
            from onyx.db.models import Document
            from onyx.db.models import Entity
            from onyx.db.models import EventEntity
            from onyx.document_index.vespa.event_indexing_utils import (
                prepare_knowledge_event_vespa_doc,
            )
            from onyx.natural_language_processing.search_nlp_models import (
                EmbeddingModel,
            )

            embedding_model = EmbeddingModel.from_db_model(
                search_settings=search_settings,
                server_host=MODEL_SERVER_HOST,
                server_port=MODEL_SERVER_PORT,
            )

            from onyx.access.access import get_access_for_document

            doc = (
                db_session.query(Document)
                .filter(Document.id == doc_id)
                .first()
            )
            vespa_event_docs: list[dict[str, Any]] = []
            if doc:
                access_control = get_access_for_document(doc_id, db_session)
                event_acl = list(access_control.to_acl())
                is_public = access_control.is_public
                doc_updated_at = doc.doc_updated_at

                events = (
                    db_session.query(KnowledgeEvent)
                    .filter(KnowledgeEvent.extraction_job_id == job_uuid)
                    .all()
                )

                titles = [e.title for e in events]
                contents = [e.content for e in events]
                title_embeds = (
                    embedding_model.encode(titles) if titles else []
                )
                content_embeds = (
                    embedding_model.encode(contents) if contents else []
                )

                for idx, event in enumerate(events):
                    entity_rows = (
                        db_session.query(Entity.name)
                        .join(
                            EventEntity,
                            EventEntity.entity_id == Entity.entity_id,
                        )
                        .filter(EventEntity.event_id == event.event_id)
                        .all()
                    )
                    entity_names = [r[0] for r in entity_rows]

                    sibling_order = None
                    if event.chunk_id:
                        sibling_order = (
                            db_session.query(DocumentChunkV2.sibling_order)
                            .filter(
                                DocumentChunkV2.chunk_id == event.chunk_id
                            )
                            .scalar()
                        )

                    vespa_event_docs.append(
                        prepare_knowledge_event_vespa_doc(
                            event=event,
                            entity_names=entity_names,
                            access_control_list=event_acl,
                            is_public=is_public,
                            doc_updated_at=doc_updated_at,
                            title_embed=title_embeds[idx],
                            content_embed=content_embeds[idx],
                            tenant_id=tenant_id,
                            sibling_order=sibling_order,
                        )
                    )

                if vespa_event_docs:
                    document_index.index_knowledge_events(vespa_event_docs)
                    for event in events:
                        event.vespa_indexed = True

            # ── Generation swap: delete old generation ────────────────
            new_event_ids = {d["event_id"] for d in vespa_event_docs}
            old_ids_to_rm = old_event_ids - new_event_ids
            _delete_vespa_event_ids(old_ids_to_rm)

            # Delete old RelationEvidence (NULL-safe via IS_(None)).
            db_session.query(RelationEvidence).filter(
                RelationEvidence.document_id == doc_id,
                or_(
                    RelationEvidence.extraction_job_id.is_(None),
                    RelationEvidence.extraction_job_id != job_uuid,
                ),
            ).delete(synchronize_session=False)

            # Delete old KnowledgeEvent (NULL-safe).
            db_session.query(KnowledgeEvent).filter(
                KnowledgeEvent.document_id == doc_id,
                or_(
                    KnowledgeEvent.extraction_job_id.is_(None),
                    KnowledgeEvent.extraction_job_id != job_uuid,
                ),
            ).delete(synchronize_session=False)

            # ── Single commit — releases pg_advisory_xact_lock ────────
            db_session.commit()

        # ── Wiki stale detection (post-lock, fresh session) ──────────
        with get_session_with_current_tenant() as db_session:
            try:
                _check_and_trigger_wiki_stale_detection(db_session, [doc_id])
            except Exception as wiki_err:
                task_logger.exception(
                    "graph_extraction_task: wiki stale detection failed "
                    "for doc_id=%s: %s",
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
        with get_session_with_current_tenant() as db_session:
            mark_graph_extraction_job_skipped(job_uuid, str(exc), db_session)
            db_session.commit()

    except TimeoutError as exc:
        task_logger.error(
            "graph_extraction_task: timeout for doc_id=%s job_id=%s: %s",
            doc_id,
            job_id,
            exc,
        )
        with get_session_with_current_tenant() as db_session:
            mark_graph_extraction_job_failed(job_uuid, str(exc), db_session)
            db_session.commit()
        retry_delays = [30, 300, 1800]
        retry_num = getattr(self, "request", None)
        current_retries = getattr(retry_num, "retries", 0) if retry_num else 0
        delay = retry_delays[min(current_retries, len(retry_delays) - 1)]
        raise self.retry(exc=exc, countdown=delay, expires=3600)

    except Exception as exc:
        task_logger.exception(
            "graph_extraction_task: failed for doc_id=%s job_id=%s: %s",
            doc_id,
            job_id,
            exc,
        )
        with get_session_with_current_tenant() as db_session:
            mark_graph_extraction_job_failed(job_uuid, str(exc), db_session)
            db_session.commit()
        retry_delays = [30, 300, 1800]
        retry_num = getattr(self, "request", None)
        current_retries = getattr(retry_num, "retries", 0) if retry_num else 0
        delay = retry_delays[min(current_retries, len(retry_delays) - 1)]
        raise self.retry(exc=exc, countdown=delay, expires=3600)
