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

from onyx.background.celery.apps.app_base import task_logger
from onyx.configs.constants import OnyxCeleryQueues
from onyx.configs.constants import OnyxCeleryTask
from onyx.db.engine.sql_engine import get_session_with_current_tenant
from onyx.db.graph_extraction_jobs import mark_graph_extraction_job_failed
from onyx.db.graph_extraction_jobs import mark_graph_extraction_job_running
from onyx.db.graph_extraction_jobs import mark_graph_extraction_job_succeeded
from onyx.db.graph_extraction_jobs import mark_graph_extraction_job_skipped
from onyx.db.graph_service import extract_and_save_graph
from onyx.db.graph_service import NoDefaultLLMError
from onyx.db.models import DocumentChunkV2
from onyx.indexing.indexing_pipeline import _check_and_trigger_wiki_stale_detection

logger = get_task_logger(__name__)

# Maximum wall-time (seconds) for a single graph extraction attempt before we
# consider it timed-out and mark the job as failed. Celery thread-pool tasks
# cannot use Celery's soft_time_limit, so we enforce this manually.
_GRAPH_EXTRACTION_TIMEOUT_S = 10 * 60  # 10 minutes


def _fetch_vespa_event_ids(
    document_index: Any,
    doc_id: str,
    tenant_id: str | None,
) -> set[str]:
    """Fetch all knowledge event IDs for a document from Vespa.

    These IDs are captured **before** extraction starts so we can
    selectively delete only the old generation later.
    """
    from onyx.document_index.vespa.shared_utils.utils import get_vespa_http_client
    from onyx.document_index.vespa_constants import SEARCH_ENDPOINT, VESPA_TIMEOUT

    where_clauses = [f'document_id contains "{doc_id}"']
    if tenant_id:
        where_clauses.append(f'tenant_id contains "{tenant_id}"')
    where_clause_str = " AND ".join(where_clauses)

    event_ids: set[str] = set()
    limit = 100
    try:
        with get_vespa_http_client() as http_client:
            while True:
                yql = (
                    f"select event_id from knowledge_event "
                    f"where {where_clause_str} limit {limit}"
                )
                params = {
                    "yql": yql,
                    "ranking.profile": "unranked",
                    "timeout": VESPA_TIMEOUT,
                }
                response = http_client.post(SEARCH_ENDPOINT, json=params)
                response.raise_for_status()
                hits = response.json().get("root", {}).get("children", [])
                if not hits:
                    break
                for hit in hits:
                    fields = hit.get("fields", {})
                    if "event_id" in fields:
                        event_ids.add(fields["event_id"])
                if len(hits) < limit:
                    break
    except Exception:
        task_logger.exception(
            "Failed to fetch Vespa event IDs for doc_id=%s", doc_id,
        )
    return event_ids


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


def _generate_stable_lock_key(tenant_id: str, doc_id: str) -> int:
    """Generate a deterministic advisory-lock key (signed 64-bit) for a document.

    Uses blake2b so different Python processes always produce the same key
    for the same tenant_id + doc_id pair (unstable process-local hash() is
    not used).
    """
    raw = f"{tenant_id}:{doc_id}".encode("utf-8")
    digest = hashlib.blake2b(raw, digest_size=8).digest()
    return int.from_bytes(digest, byteorder="big", signed=True)


_PG_UNLOCK = "SELECT pg_advisory_unlock(:key)"


@shared_task(
    name=OnyxCeleryTask.GRAPH_EXTRACTION_TASK,
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    acks_late=True,
    queue=OnyxCeleryQueues.GRAPH_EXTRACTION,
)
def graph_extraction_task(
    self: object,
    job_id: str,
    doc_id: str,
    tenant_id: str,
) -> None:
    """Extract Knowledge Graph entities/relations for a single document.

    Also triggers Wiki stale detection for any wiki pages that cite this
    document.  Both operations are moved out of the main indexing DB
    transaction so Postgres locks are never held while waiting for LLM calls.
    """
    start = time.monotonic()
    job_uuid = UUID(job_id)

    try:
        with get_session_with_current_tenant() as db_session:
            mark_graph_extraction_job_running(job_uuid, db_session)
            db_session.commit()

        with get_session_with_current_tenant() as db_session:
            # 1. Feature Gate – only Vespa supports Knowledge Graph events
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

            # 2. Capture old Vespa event IDs **before** extraction so we can
            #    safely delete only the old generation later (generation swap).
            old_vespa_ids = _fetch_vespa_event_ids(
                document_index, doc_id, tenant_id
            )

            # 3. Session-level advisory lock to prevent concurrent jobs for
            #    the same document.  Unlike pg_advisory_xact_lock, this lock
            #    survives intermediate commits and is only released on
            #    explicit unlock or session close – exactly what we need
            #    since extraction requires multiple commits.
            from sqlalchemy import text as sql_text

            lock_key = _generate_stable_lock_key(tenant_id, doc_id)
            db_session.execute(
                sql_text("SELECT pg_advisory_lock(:key)"),
                {"key": lock_key},
            )
            try:
                # 4. Re-check content hash under lock to avoid redundant
                #    extraction when a concurrent job already completed it.
                from onyx.db.graph_extraction_jobs import (
                    GraphExtractionJob,
                    GraphExtractionStatus,
                )

                current_job = (
                    db_session.query(GraphExtractionJob)
                    .filter(GraphExtractionJob.id == job_uuid)
                    .first()
                )
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
                            "Document content already processed by job "
                            f"{latest.id}",
                            db_session,
                        )
                        db_session.commit()
                        return

                from onyx.db.models import (
                    KnowledgeEvent,
                    RelationEvidence,
                    EventEntity,
                    Entity,
                    Document,
                )
                from onyx.natural_language_processing.search_nlp_models import (
                    EmbeddingModel,
                )
                from onyx.configs.model_configs import (
                    MODEL_SERVER_HOST,
                    MODEL_SERVER_PORT,
                )
                from onyx.document_index.vespa.event_indexing_utils import (
                    prepare_knowledge_event_vespa_doc,
                )

                # 5. Retrieve all chunks for this document.
                chunks = (
                    db_session.query(DocumentChunkV2)
                    .filter(DocumentChunkV2.doc_id == doc_id)
                    .all()
                )

                if not chunks:
                    task_logger.warning(
                        "graph_extraction_task: no chunks found for "
                        "doc_id=%s, skipping",
                        doc_id,
                    )
                    mark_graph_extraction_job_succeeded(job_uuid, db_session)
                    db_session.commit()
                    return

                elapsed = time.monotonic() - start
                if elapsed > _GRAPH_EXTRACTION_TIMEOUT_S:
                    raise TimeoutError(
                        f"Graph extraction exceeded timeout after "
                        f"{elapsed:.0f}s"
                    )

                # 6. Limit extraction to selected chunks
                from onyx.db.graph_service import select_chunks_for_extraction

                selected_chunks = select_chunks_for_extraction(chunks)

                # Get the cc_pair_id for the document
                from onyx.db.models import (
                    ConnectorCredentialPair,
                    DocumentByConnectorCredentialPair,
                )

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

                # 7. Graph entity/relation extraction per selected chunk.
                for chunk in selected_chunks:
                    if not chunk.text_raw or len(chunk.text_raw.strip()) < 100:
                        continue

                    elapsed = time.monotonic() - start
                    if elapsed > _GRAPH_EXTRACTION_TIMEOUT_S:
                        raise TimeoutError(
                            f"Graph extraction exceeded timeout after "
                            f"{elapsed:.0f}s"
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

                # 8. Index any created events into Vespa.
                embedding_model = EmbeddingModel.from_db_model(
                    search_settings=search_settings,
                    server_host=MODEL_SERVER_HOST,
                    server_port=MODEL_SERVER_PORT,
                )

                doc = (
                    db_session.query(Document)
                    .filter(Document.id == doc_id)
                    .first()
                )
                vespa_event_docs: list[dict[str, Any]] = []
                if doc:
                    from onyx.access.access import get_access_for_document

                    access_control = get_access_for_document(doc_id, db_session)
                    event_acl = list(access_control.to_acl())
                    is_public = access_control.is_public
                    doc_updated_at = doc.doc_updated_at

                    events = (
                        db_session.query(KnowledgeEvent)
                        .filter(
                            KnowledgeEvent.extraction_job_id == job_uuid
                        )
                        .all()
                    )

                    titles_to_embed = [event.title for event in events]
                    contents_to_embed = [event.content for event in events]

                    title_embeds = (
                        embedding_model.encode(titles_to_embed)
                        if titles_to_embed
                        else []
                    )
                    content_embeds = (
                        embedding_model.encode(contents_to_embed)
                        if contents_to_embed
                        else []
                    )

                    for idx, event in enumerate(events):
                        entities = (
                            db_session.query(Entity.name)
                            .join(
                                EventEntity,
                                EventEntity.entity_id == Entity.entity_id,
                            )
                            .filter(EventEntity.event_id == event.event_id)
                            .all()
                        )
                        entity_names = [e[0] for e in entities]

                        sibling_order = None
                        if event.chunk_id:
                            sibling_order = (
                                db_session.query(DocumentChunkV2.sibling_order)
                                .filter(
                                    DocumentChunkV2.chunk_id == event.chunk_id
                                )
                                .scalar()
                            )

                        vespa_doc = prepare_knowledge_event_vespa_doc(
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
                        vespa_event_docs.append(vespa_doc)

                    if vespa_event_docs:
                        document_index.index_knowledge_events(vespa_event_docs)
                        for event in events:
                            event.vespa_indexed = True
                        db_session.commit()

                # 9. Generation swap: new data is live.  Delete only the old
                #    generation from Vespa and Postgres.
                new_event_ids = {
                    d["event_id"] for d in vespa_event_docs
                }
                old_vespa_ids_to_delete = old_vespa_ids - new_event_ids
                _delete_vespa_event_ids(old_vespa_ids_to_delete)

                # Delete old RelationEvidence (any extraction_job_id that is
                # not the current one, including NULL legacy rows).
                from sqlalchemy import or_

                db_session.query(RelationEvidence).filter(
                    RelationEvidence.document_id == doc_id,
                    or_(
                        RelationEvidence.extraction_job_id.is_(None),
                        RelationEvidence.extraction_job_id != job_uuid,
                    ),
                ).delete(synchronize_session=False)

                # Delete old KnowledgeEvent (same logic).
                db_session.query(KnowledgeEvent).filter(
                    KnowledgeEvent.document_id == doc_id,
                    or_(
                        KnowledgeEvent.extraction_job_id.is_(None),
                        KnowledgeEvent.extraction_job_id != job_uuid,
                    ),
                ).delete(synchronize_session=False)

                db_session.commit()

            finally:
                # Always release the session-level lock.
                db_session.execute(sql_text(_PG_UNLOCK), {"key": lock_key})

            elapsed = time.monotonic() - start
            if elapsed > _GRAPH_EXTRACTION_TIMEOUT_S:
                raise TimeoutError(
                    f"Graph extraction exceeded timeout after {elapsed:.0f}s"
                )

            # Wiki stale detection (second LLM call; only runs when relevant
            # wiki pages cite this document).
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
        return

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
