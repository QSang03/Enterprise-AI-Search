"""Background Celery task for automatic Wiki generation.

After Knowledge Graph extraction completes for a connector's documents,
this task groups documents by logical folder (first-level path prefix),
and for each group of >= 10 documents with completed graph extraction,
generates an Auto-Wiki page via the default LLM.

Architecture
============

A beat-triggered sweeper (``generate_wiki_for_cc_pairs_sweeper``)
dispatches one per-tenant sub-task.  The per-tenant task:

1.  Enumerates all ``ConnectorCredentialPair`` in the tenant.
2.  For each CC pair:
    a.  Retrieves all document IDs.
    b.  Groups them by first-level path prefix (folder).
    c.  For groups with >= 10 distinct documents:
        -  Checks that every document's ``GraphExtractionJob`` has reached a
           terminal state (``SUCCEEDED`` / ``FAILED`` / ``SKIPPED``).
        -  Skips if an existing published ``WikiPage`` with the same title
           already exists.
        -  Otherwise, fetches all ``DocumentChunkV2`` rows, calls the
           default LLM with the standard Auto-Wiki prompt, validates
           citations, and persists the result as a ``WikiPage``.
3.  Uses a Redis cluster-wide lock (``da_lock:wiki_auto_generation``) to
    prevent concurrent sweeper runs.
"""

from __future__ import annotations

import re
import time
import uuid as uuid_lib
from collections.abc import Callable
from typing import Any

from celery import shared_task
from celery.utils.log import get_task_logger
from redis.exceptions import RedisError
from sqlalchemy import select

from onyx.background.celery.apps.app_base import task_logger
from onyx.configs.constants import OnyxCeleryQueues
from onyx.configs.constants import OnyxCeleryTask
from onyx.db.engine.sql_engine import get_session_with_current_tenant
from onyx.db.engine.tenant_utils import get_all_tenant_ids
from onyx.db.graph_extraction_jobs import GraphExtractionJob
from onyx.db.graph_extraction_jobs import GraphExtractionStatus
from onyx.db.models import ConnectorCredentialPair
from onyx.db.models import DocumentByConnectorCredentialPair
from onyx.db.models import DocumentChunkV2
from onyx.db.models import WikiCitation
from onyx.db.models import WikiPage
from onyx.llm.factory import get_default_llm
from onyx.llm.models import UserMessage
from onyx.redis.redis_pool import get_shared_redis_client
from onyx.tracing.flows import LLMFlow
from onyx.tracing.llm_utils import llm_generation_span
from shared_configs.contextvars import CURRENT_TENANT_ID_CONTEXTVAR

logger = get_task_logger(__name__)

_LOCK_NAME = "da_lock:wiki_auto_generation"
_LOCK_TIMEOUT_S = 10 * 60  # 10 minutes — generous; wiki generation is slow.
_LOCK_REACQUIRE_INTERVAL_S = _LOCK_TIMEOUT_S // 4

# When no documents belong to a structured hierarchy (folder/space), we fall
# back to parsing the first component of the document ID path.
# e.g. ``.../P.HanhChanhNhanSu/5 ISO HANH CHANH NHAN SU/2. BM/...``
#                    └────── category ──────┘
_PATH_PREFIX_PATTERN = re.compile(
    r"(?:FILE_CONNECTOR__[^/]+__[^/]+__[^/]+__[^/]+/"
    r"|CONFLUENCE__[^/]+__)"
    r"([^/]+)"
)


def _extract_path_prefix(document_id: str) -> str | None:
    """Return the first-level subfolder / category from a document ID.

    For SMB documents like::

        FILE_CONNECTOR__SMB__host__share__prefix/category/subdir/file

    returns ``"category"``.  For Confluence::

        CONFLUENCE__space__Page Title

    returns ``"space"``.  Returns ``None`` when no pattern matches (e.g.
    API-based connectors without a path hierarchy).
    """
    m = _PATH_PREFIX_PATTERN.search(document_id)
    if m:
        return m.group(1)
    return None


def _generate_wiki_inner(
    document_ids: list[str],
    tenant_id: str,
    lock_ttl_renew: Callable[[], None] | None = None,
) -> str | None:
    """Core wiki-generation logic (callable from the API or from a task).

    Returns the wiki title on success, or ``None`` if generation was skipped.
    """
    with get_session_with_current_tenant() as db_session:
        chunks = (
            db_session.query(DocumentChunkV2)
            .filter(DocumentChunkV2.doc_id.in_(document_ids))
            .all()
        )
        if not chunks:
            task_logger.info(
                "generate_wiki: no chunks found for %d document(s), skipping",
                len(document_ids),
            )
            return None

        valid_chunk_ids = {c.chunk_id for c in chunks}
        chunks_context = ""
        for c in chunks:
            chunks_context += (
                f"[Chunk UUID: {c.chunk_id}]\nContent: {c.text_raw}\n\n"
            )

    if lock_ttl_renew:
        lock_ttl_renew()

    llm = get_default_llm()
    prompt = (
        "Bạn là biên tập viên kỹ thuật cao cấp chuyên nghiệp.\n"
        "Nhiệm vụ của bạn là tổng hợp một tài liệu Wiki markdown có cấu trúc "
        "phân cấp (sử dụng #, ##, ###) từ các phân mảnh tài liệu nguồn sau.\n\n"
        "Yêu cầu BẮT BUỘC:\n"
        "1. Viết bằng tiếng Việt sáng rõ, logic, mạch lạc.\n"
        "2. Mỗi đề mục (section), ý chính hoặc thông tin trích dẫn phải kết "
        "thúc bằng thẻ trích dẫn chính xác định dạng [Citation: <chunk_uuid>].\n"
        "3. Chỉ trích dẫn đúng UUID của phân mảnh cung cấp thông tin đó "
        "(UUID có trong danh sách phân mảnh nguồn bên dưới).\n"
        "4. Không tự bịa thông tin nằm ngoài nội dung tài liệu nguồn.\n"
        "5. Đặt tiêu đề Wiki chính ở dòng đầu tiên dạng `# Tiêu đề`.\n\n"
        "Phân mảnh tài liệu nguồn:\n"
        f"\"\"\"\n{chunks_context}\n\"\"\"\n"
    )

    messages = [UserMessage(content=prompt)]
    with llm_generation_span(
        llm=llm, flow=LLMFlow.CHAT_RESPONSE, input_messages=messages
    ):
        response = llm.invoke(messages)

    if lock_ttl_renew:
        lock_ttl_renew()

    generated_text = response.content.strip()

    # ── Parse title ────────────────────────────────────────────────────
    title = "Generated Auto-Wiki"
    lines = generated_text.splitlines()
    for line in lines:
        m = re.match(r"^#\s+(.+)$", line)
        if m:
            title = m.group(1).strip()
            break

    # ── Enforce citations ──────────────────────────────────────────────
    final_content, citations = _parse_and_enforce_citations(
        generated_text, valid_chunk_ids
    )
    if not final_content.strip():
        task_logger.warning(
            "generate_wiki: no section contained valid citations; skipping"
        )
        return None

    if lock_ttl_renew:
        lock_ttl_renew()

    # ── Persist ────────────────────────────────────────────────────────
    with get_session_with_current_tenant() as db_session:
        existing = (
            db_session.query(WikiPage)
            .filter(WikiPage.title == title)
            .order_by(WikiPage.version.desc())
            .first()
        )
        if existing:
            wiki_id = existing.wiki_id
            version = existing.version + 1
        else:
            wiki_id = uuid_lib.uuid4()
            version = 1

        new_page = WikiPage(
            wiki_id=wiki_id,
            version=version,
            title=title,
            content=final_content,
            is_stale=False,
            is_published=True,
        )
        db_session.add(new_page)
        db_session.flush()

        for section_title, chunk_id in citations:
            cit = WikiCitation(
                citation_id=uuid_lib.uuid4(),
                wiki_id=wiki_id,
                wiki_version=version,
                section_title=section_title,
                chunk_id=chunk_id,
            )
            db_session.add(cit)

        db_session.commit()

    task_logger.info(
        "generate_wiki: created/updated wiki '%s' (v%d) from %d docs",
        title,
        version,
        len(document_ids),
    )
    return title


def _parse_and_enforce_citations(
    markdown_content: str, valid_chunk_ids: set[uuid_lib.UUID]
) -> tuple[str, list[tuple[str, uuid_lib.UUID]]]:
    """Parse sections, strip those without valid citations, return clean content."""
    lines = markdown_content.splitlines()
    sections: list[tuple[str, list[str]]] = []
    current_title = "Introduction"
    current_lines: list[str] = []

    for line in lines:
        m = re.match(r"^#{1,6}\s+(.+)$", line)
        if m:
            if current_lines:
                sections.append((current_title, current_lines))
            current_title = m.group(1).strip()
            current_lines = [line]
        else:
            current_lines.append(line)
    if current_lines:
        sections.append((current_title, current_lines))

    published_sections: list[str] = []
    citations: list[tuple[str, uuid_lib.UUID]] = []
    citation_regex = re.compile(r"\[Citation:\s*([0-9a-fA-F\-]{36})\]")

    for title, sec_lines in sections:
        sec_text = "\n".join(sec_lines)
        found = citation_regex.findall(sec_text)
        valid_found: list[uuid_lib.UUID] = []
        for cid_str in found:
            try:
                cid = uuid_lib.UUID(cid_str)
                if cid in valid_chunk_ids:
                    valid_found.append(cid)
            except ValueError:
                continue
        if valid_found:
            published_sections.append(sec_text)
            for cid in valid_found:
                citations.append((title, cid))

    final_markdown = "\n\n".join(published_sections)
    return final_markdown, citations


# ═══════════════════════════════════════════════════════════════════════
# Beat-triggered sweeper (dispatches per-tenant)
# ═══════════════════════════════════════════════════════════════════════

@shared_task(
    name=OnyxCeleryTask.GENERATE_WIKI_FOR_CC_PAIRS,
    ignore_result=True,
    soft_time_limit=120,
    trail=False,
    bind=True,
)
def generate_wiki_for_cc_pairs_sweeper(
    self: Any,  # noqa: ANN401
) -> None:
    """Periodic dispatcher — enqueues one per-tenant sub-task.

    Runs every 15 minutes (see ``beat_schedule.py``).
    """
    try:
        tenant_ids = get_all_tenant_ids()
    except Exception:
        task_logger.exception(
            "generate_wiki sweeper: failed to list tenant IDs, skipping"
        )
        return

    for tid in tenant_ids:
        generate_wiki_for_cc_pairs_tenant.apply_async(
            kwargs={"tenant_id": tid},
            countdown=5,
            queue=OnyxCeleryQueues.GRAPH_EXTRACTION,
        )


# ═══════════════════════════════════════════════════════════════════════
# Per-tenant task
# ═══════════════════════════════════════════════════════════════════════

@shared_task(
    name=OnyxCeleryTask.GENERATE_WIKI_FOR_CC_PAIRS + "_tenant",
    queue=OnyxCeleryQueues.GRAPH_EXTRACTION,
    ignore_result=True,
    soft_time_limit=600,  # 10 minutes — wiki generation can be slow.
    trail=False,
    bind=True,
)
def generate_wiki_for_cc_pairs_tenant(
    self: Any,  # noqa: ANN401
    tenant_id: str,
) -> None:
    """Per-tenant wiki auto-generation.

    For each ``ConnectorCredentialPair`` whose documents have all completed
    graph extraction, groups documents by path prefix and generates an
    Auto-Wiki for every group with at least 10 documents.
    """
    # ── Acquire cluster-wide lock ──────────────────────────────────────
    redis_client = get_shared_redis_client()
    lock = redis_client.lock(
        _LOCK_NAME,
        timeout=_LOCK_TIMEOUT_S,
        blocking_timeout=5,  # Don't queue; skip if another sweep is active.
    )
    if not lock.acquire(blocking=False):
        task_logger.info(
            "generate_wiki tenant[%s]: lock held by another sweep, skipping",
            tenant_id,
        )
        return

    # Update tenant contextvar so downstream DB calls use the right tenant.
    CURRENT_TENANT_ID_CONTEXTVAR.set(tenant_id)

    last_renew = time.monotonic()

    def _reacquire() -> None:
        nonlocal last_renew
        if time.monotonic() - last_renew >= _LOCK_REACQUIRE_INTERVAL_S:
            try:
                lock.reacquire()
                last_renew = time.monotonic()
            except RedisError:
                pass

    try:
        _run_generation_for_tenant(tenant_id, _reacquire)
    except Exception:
        task_logger.exception(
            "generate_wiki tenant[%s]: unhandled error", tenant_id
        )
    finally:
        try:
            if lock.owned():
                lock.release()
        except RedisError:
            pass


def _run_generation_for_tenant(
    tenant_id: str,
    lock_ttl_renew: Callable[[], None],
) -> None:
    """Core loop: iterate CC pairs, group docs, generate wikis."""
    with get_session_with_current_tenant() as db_session:
        cc_pairs = db_session.scalars(
            select(ConnectorCredentialPair).distinct()
        ).all()
        task_logger.info(
            "generate_wiki tenant[%s]: evaluating %d CC pair(s)",
            tenant_id,
            len(cc_pairs),
        )

    for cc_pair in cc_pairs:
        lock_ttl_renew()

        with get_session_with_current_tenant() as db_session:
            # Get all document IDs for this CC pair.
            doc_link_rows = (
                db_session.execute(
                    select(DocumentByConnectorCredentialPair.id).where(
                        DocumentByConnectorCredentialPair.connector_id
                        == cc_pair.connector_id,
                        DocumentByConnectorCredentialPair.credential_id
                        == cc_pair.credential_id,
                    )
                )
                .scalars()
                .all()
            )
            doc_ids = list(doc_link_rows)

        if not doc_ids:
            continue

        # ── Group by path prefix ───────────────────────────────────────
        groups: dict[str, list[str]] = {}
        for doc_id in doc_ids:
            prefix = _extract_path_prefix(doc_id) or "_ungrouped"
            groups.setdefault(prefix, []).append(doc_id)

        task_logger.info(
            "generate_wiki tenant[%s] CC pair %d: %d docs -> %d group(s)",
            tenant_id,
            cc_pair.id,
            len(doc_ids),
            len(groups),
        )

        for group_name, group_doc_ids in groups.items():
            lock_ttl_renew()

            if len(group_doc_ids) < 10:
                task_logger.debug(
                    "generate_wiki: group '%s' has %d docs (< 10), skipping",
                    group_name,
                    len(group_doc_ids),
                )
                continue

            # ── Check graph extraction completion ──────────────────────
            with get_session_with_current_tenant() as db_session:
                pending = (
                    db_session.query(GraphExtractionJob)
                    .filter(
                        GraphExtractionJob.document_id.in_(group_doc_ids),
                        GraphExtractionJob.status.in_(
                            [
                                GraphExtractionStatus.PENDING,
                                GraphExtractionStatus.RUNNING,
                                GraphExtractionStatus.CLEANUP_PENDING,
                            ]
                        ),
                    )
                    .count()
                )
            if pending > 0:
                task_logger.info(
                    "generate_wiki: group '%s' has %d pending graph "
                    "extraction job(s), deferring",
                    group_name,
                    pending,
                )
                continue

            # ── Check for existing wiki ────────────────────────────────
            wiki_title = category_to_wiki_title(group_name)
            with get_session_with_current_tenant() as db_session:
                existing = (
                    db_session.query(WikiPage)
                    .filter(
                        WikiPage.title == wiki_title,
                        WikiPage.is_stale == False,  # noqa: E712
                    )
                    .order_by(WikiPage.version.desc())
                    .first()
                )
            if existing is not None:
                task_logger.info(
                    "generate_wiki: wiki '%s' already exists (v%d), skipping",
                    wiki_title,
                    existing.version,
                )
                continue

            # ── Generate the wiki ──────────────────────────────────────
            try:
                _generate_wiki_inner(
                    group_doc_ids, tenant_id, lock_ttl_renew
                )
            except Exception:
                task_logger.exception(
                    "generate_wiki: failed to generate wiki for group '%s'",
                    group_name,
                )
                # Continue with next group.


def category_to_wiki_title(category: str) -> str:
    """Convert a path-prefix / category to a human-readable wiki title.

    Replaces underscores with spaces and strips/replaces common noise.
    """
    title = category.replace("_", " ").strip()
    # Title-case for readability.
    return title.upper() if len(title) <= 4 else title
