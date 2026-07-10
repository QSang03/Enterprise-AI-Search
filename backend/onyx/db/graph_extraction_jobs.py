"""CRUD operations for the graph_extraction_jobs table.

Provides skip logic (content-hash caching + document type/length filters)
and status lifecycle management for background Knowledge Graph extraction.
"""

import datetime
import re
from enum import Enum
from uuid import UUID

from sqlalchemy.orm import Session

from onyx.db.models import GraphExtractionJob

# Bump this when the extraction prompt changes substantially enough that
# previously extracted graphs should be regenerated.
GRAPH_EXTRACTION_PROMPT_VERSION = "v2-event"

# Document types that are not worth extracting a Knowledge Graph from.
_SKIP_DOC_TYPES = frozenset(["log", "csv_simple", "notification"])

# Minimum token count (rough word count) before we consider extraction worthwhile.
_MIN_TOKEN_COUNT = 300

# Minimum number of noun candidates found by a cheap regex before we bother
# sending the text to the LLM.
_MIN_NOUN_CANDIDATES = 5

# Regex to find Vietnamese and Latin proper-noun / capitalized word candidates.
_NOUN_PATTERN = re.compile(
    r"(?:[A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴỶỸ]"
    r"[a-zàáâãèéêìíòóôõùúăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]+)",
    re.UNICODE,
)


class GraphExtractionStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    SKIPPED = "skipped"
    CLEANUP_PENDING = "cleanup_pending"


def _count_noun_candidates(text: str) -> int:
    return len(_NOUN_PATTERN.findall(text))


def _rough_token_count(text: str) -> int:
    """Estimate token count as whitespace-delimited word count."""
    return len(text.split())


def should_skip_graph_extraction(
    doc_text: str,
    document_type: str | None = None,
) -> tuple[bool, str]:
    """Return (should_skip, reason) based on document content heuristics.

    Called before enqueueing the Celery task so we never queue unnecessary work.
    """
    if document_type and document_type.lower() in _SKIP_DOC_TYPES:
        return True, f"document_type={document_type!r} is in skip list"

    token_count = _rough_token_count(doc_text)
    if token_count < _MIN_TOKEN_COUNT:
        return True, f"token_count={token_count} < {_MIN_TOKEN_COUNT}"

    noun_count = _count_noun_candidates(doc_text)
    if noun_count < _MIN_NOUN_CANDIDATES:
        return True, f"noun_candidate_count={noun_count} < {_MIN_NOUN_CANDIDATES}"

    return False, ""


def create_or_skip_graph_extraction_job(
    doc_id: str,
    content_hash: str,
    model_name: str,
    doc_text: str,
    db_session: Session,
    document_type: str | None = None,
    prompt_version: str = GRAPH_EXTRACTION_PROMPT_VERSION,
) -> GraphExtractionJob | None:
    """Create a new extraction job or return None if the document should be skipped.

    Skips when:
    - Document content is too short / lacks noun candidates / is a low-value type.
    - A job with the same document_id, content_hash, prompt_version, and model_name
      already succeeded (content-hash cache hit).

    Returns the newly created job (status=pending) or None.
    """
    # Heuristic skip check.
    skip, reason = should_skip_graph_extraction(doc_text, document_type)
    if skip:
        return None

    # Content-hash cache check: avoid re-extracting unchanged documents.
    existing = (
        db_session.query(GraphExtractionJob)
        .filter(
            GraphExtractionJob.document_id == doc_id,
            GraphExtractionJob.content_hash == content_hash,
            GraphExtractionJob.prompt_version == prompt_version,
            GraphExtractionJob.model_name == model_name,
            GraphExtractionJob.status == GraphExtractionStatus.SUCCEEDED,
        )
        .first()
    )
    if existing is not None:
        return None

    job = GraphExtractionJob(
        document_id=doc_id,
        content_hash=content_hash,
        status=GraphExtractionStatus.PENDING,
        prompt_version=prompt_version,
        model_name=model_name,
    )
    db_session.add(job)
    db_session.flush()
    return job


def mark_graph_extraction_job_running(job_id: UUID, db_session: Session) -> None:
    job = (
        db_session.query(GraphExtractionJob)
        .filter(GraphExtractionJob.id == job_id)
        .first()
    )
    if job:
        job.status = GraphExtractionStatus.RUNNING
        db_session.flush()


def mark_graph_extraction_job_succeeded(job_id: UUID, db_session: Session) -> None:
    job = (
        db_session.query(GraphExtractionJob)
        .filter(GraphExtractionJob.id == job_id)
        .first()
    )
    if job:
        job.status = GraphExtractionStatus.SUCCEEDED
        job.error_message = None
        db_session.flush()


def mark_graph_extraction_job_failed(
    job_id: UUID, error_message: str, db_session: Session
) -> None:
    job = (
        db_session.query(GraphExtractionJob)
        .filter(GraphExtractionJob.id == job_id)
        .first()
    )
    if job:
        job.status = GraphExtractionStatus.FAILED
        job.error_message = error_message
        job.retry_count = (job.retry_count or 0) + 1
        db_session.flush()


def mark_graph_extraction_job_skipped(
    job_id: UUID, error_message: str, db_session: Session
) -> None:
    job = (
        db_session.query(GraphExtractionJob)
        .filter(GraphExtractionJob.id == job_id)
        .first()
    )
    if job:
        job.status = GraphExtractionStatus.SKIPPED
        job.error_message = error_message
        db_session.flush()


def mark_graph_extraction_job_cleanup_pending(
    job_id: UUID,
    cleanup_retry_count: int,
    cleanup_next_retry_at: datetime.datetime,
    cleanup_last_error: str,
    db_session: Session,
) -> None:
    """Set the job to CLEANUP_PENDING with durable retry metadata.

    The sweeper (or the task's own re-enqueue) will later pick it up.
    This avoids relying solely on the in-flight Celery message for retry
    tracking (P2 — durable cleanup state).
    """
    job = (
        db_session.query(GraphExtractionJob)
        .filter(GraphExtractionJob.id == job_id)
        .first()
    )
    if job:
        job.status = GraphExtractionStatus.CLEANUP_PENDING
        job.cleanup_retry_count = cleanup_retry_count
        job.cleanup_next_retry_at = cleanup_next_retry_at
        job.cleanup_last_error = cleanup_last_error
        db_session.flush()


def reset_cleanup_state(job_id: UUID, db_session: Session) -> None:
    """Clear cleanup-pending state when a job transitions back to RUNNING."""
    job = (
        db_session.query(GraphExtractionJob)
        .filter(GraphExtractionJob.id == job_id)
        .first()
    )
    if job:
        job.cleanup_retry_count = 0
        job.cleanup_next_retry_at = None
        job.cleanup_last_error = None
        db_session.flush()

