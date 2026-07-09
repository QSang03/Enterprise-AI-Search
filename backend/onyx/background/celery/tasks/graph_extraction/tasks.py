"""Background Celery task for Knowledge Graph extraction.

Runs in the heavy worker so LLM calls don't block the main indexing pipeline
and Postgres transaction locks are released immediately after Vespa/DB writes.
"""

import time
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
from onyx.db.graph_service import extract_and_save_graph
from onyx.db.models import DocumentChunkV2
from onyx.indexing.indexing_pipeline import _check_and_trigger_wiki_stale_detection

logger = get_task_logger(__name__)

# Maximum wall-time (seconds) for a single graph extraction attempt before we
# consider it timed-out and mark the job as failed. Celery thread-pool tasks
# cannot use Celery's soft_time_limit, so we enforce this manually.
_GRAPH_EXTRACTION_TIMEOUT_S = 10 * 60  # 10 minutes


@shared_task(
    name=OnyxCeleryTask.GRAPH_EXTRACTION_TASK,
    bind=True,
    max_retries=3,
    default_retry_delay=30,  # first retry after 30 s; subsequent delays double via exponential
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
            # Retrieve all chunks for this document.
            chunks = (
                db_session.query(DocumentChunkV2)
                .filter(DocumentChunkV2.doc_id == doc_id)
                .all()
            )

            if not chunks:
                task_logger.warning(
                    "graph_extraction_task: no chunks found for doc_id=%s, skipping",
                    doc_id,
                )
                mark_graph_extraction_job_succeeded(job_uuid, db_session)
                db_session.commit()
                return

            elapsed = time.monotonic() - start
            if elapsed > _GRAPH_EXTRACTION_TIMEOUT_S:
                raise TimeoutError(
                    f"Graph extraction exceeded timeout after {elapsed:.0f}s"
                )

            # Graph entity/relation extraction (LLM call; may be slow).
            extract_and_save_graph(chunks, db_session)

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
                # Wiki detection failures are non-critical — log but don't
                # fail the whole job.
                task_logger.exception(
                    "graph_extraction_task: wiki stale detection failed for doc_id=%s: %s",
                    doc_id,
                    wiki_err,
                )

            mark_graph_extraction_job_succeeded(job_uuid, db_session)
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
        # Retry with exponential backoff (30s, 5m, 30m).
        retry_delays = [30, 300, 1800]
        retry_num = getattr(self, "request", None)
        current_retries = getattr(retry_num, "retries", 0) if retry_num else 0
        delay = retry_delays[min(current_retries, len(retry_delays) - 1)]
        raise self.retry(exc=exc, countdown=delay, expires=3600)  # type: ignore[attr-defined]

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
        raise self.retry(exc=exc, countdown=delay, expires=3600)  # type: ignore[attr-defined]
