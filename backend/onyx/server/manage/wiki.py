import uuid
import re
from typing import Any, List, Optional, Set
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from pydantic import BaseModel

from onyx.db.engine.sql_engine import get_session
from onyx.db.models import WikiPage, WikiCitation, WikiStaleEvent, DocumentChunkV2, User
from onyx.auth.users import current_user
from onyx.error_handling.error_codes import OnyxErrorCode
from onyx.error_handling.exceptions import OnyxError
from onyx.llm.factory import get_default_llm
from onyx.tracing.flows import LLMFlow
from onyx.tracing.llm_utils import llm_generation_span
from onyx.llm.models import UserMessage

router = APIRouter(prefix="/wiki", tags=["wiki"])


class GenerateWikiRequest(BaseModel):
    document_ids: List[str]


class WikiPageResponse(BaseModel):
    wiki_id: str
    version: int
    title: str
    content: str
    is_stale: bool
    is_published: bool
    created_at: str


class StaleEventResponse(BaseModel):
    event_id: str
    wiki_id: str
    wiki_version: int
    trigger_doc_id: str
    conflict_type: str
    conflict_description: str
    resolved: bool
    created_at: str


def parse_and_enforce_citations(
    markdown_content: str, valid_chunk_ids: Set[uuid.UUID]
) -> tuple[str, List[tuple[str, uuid.UUID]]]:
    """
    Parses sections in generated markdown, strips sections without valid citations,
    and returns the clean markdown and a list of citation mappings.
    """
    lines = markdown_content.splitlines()
    sections: list[tuple[str, list[str]]] = []
    current_title = "Introduction"
    current_lines: list[str] = []

    for line in lines:
        match = re.match(r"^#{1,6}\s+(.+)$", line)
        if match:
            if current_lines:
                sections.append((current_title, current_lines))
            current_title = match.group(1).strip()
            current_lines = [line]
        else:
            current_lines.append(line)
    if current_lines:
        sections.append((current_title, current_lines))

    published_sections: list[str] = []
    citations_to_save: list[tuple[str, uuid.UUID]] = []

    citation_regex = re.compile(r"\[Citation:\s*([0-9a-fA-F\-]{36})\]")

    for title, sec_lines in sections:
        sec_text = "\n".join(sec_lines)
        found_citations = citation_regex.findall(sec_text)

        valid_found: list[uuid.UUID] = []
        for cid_str in found_citations:
            try:
                cid = uuid.UUID(cid_str)
                if cid in valid_chunk_ids:
                    valid_found.append(cid)
            except ValueError:
                continue

        if valid_found:
            published_sections.append(sec_text)
            for cid in valid_found:
                citations_to_save.append((title, cid))

    final_markdown = "\n\n".join(published_sections)
    return final_markdown, citations_to_save


@router.post("/generate")
def generate_wiki(
    request: GenerateWikiRequest,
    db_session: Session = Depends(get_session),
    _: User = Depends(current_user),
) -> WikiPageResponse:
    if len(request.document_ids) < 10:
        raise OnyxError(
            OnyxErrorCode.BAD_REQUEST,
            "Auto-Wiki generation requires at least 10 source documents.",
        )

    chunks = (
        db_session.query(DocumentChunkV2)
        .filter(DocumentChunkV2.doc_id.in_(request.document_ids))
        .all()
    )

    if not chunks:
        raise OnyxError(
            OnyxErrorCode.BAD_REQUEST,
            "No chunk text was found for the provided source documents.",
        )

    valid_chunk_ids = {c.chunk_id for c in chunks}

    chunks_context = ""
    for c in chunks:
        chunks_context += f"[Chunk UUID: {c.chunk_id}]\nContent: {c.text_raw}\n\n"

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

    generated_text = response.content.strip()

    # Parse title
    title = "Generated Auto-Wiki"
    lines = generated_text.splitlines()
    for line in lines:
        match = re.match(r"^#\s+(.+)$", line)
        if match:
            title = match.group(1).strip()
            break

    # Enforce citations
    final_content, citations = parse_and_enforce_citations(
        generated_text, valid_chunk_ids
    )

    if not final_content.strip():
        raise OnyxError(
            OnyxErrorCode.BAD_REQUEST,
            "Failed to publish Wiki because no section contained valid citations "
            "to the source documents.",
        )

    # Check if page with same title exists
    existing = (
        db_session.query(WikiPage)
        .filter(WikiPage.title == title)
        .order_by(desc(WikiPage.version))
        .first()
    )

    if existing:
        wiki_id = existing.wiki_id
        version = existing.version + 1
    else:
        wiki_id = uuid.uuid4()
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
        new_cit = WikiCitation(
            citation_id=uuid.uuid4(),
            wiki_id=wiki_id,
            wiki_version=version,
            section_title=section_title,
            chunk_id=chunk_id,
        )
        db_session.add(new_cit)

    db_session.commit()

    return WikiPageResponse(
        wiki_id=str(new_page.wiki_id),
        version=new_page.version,
        title=new_page.title,
        content=new_page.content,
        is_stale=new_page.is_stale,
        is_published=new_page.is_published,
        created_at=str(new_page.created_at),
    )


@router.get("")
def list_wikis(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db_session: Session = Depends(get_session),
    _: User = Depends(current_user),
) -> dict[str, Any]:
    """Paginated wiki list — returns latest version of each wiki."""
    subquery = (
        db_session.query(
            WikiPage.wiki_id,
            func.max(WikiPage.version).label("max_version"),
        )
        .group_by(WikiPage.wiki_id)
        .subquery()
    )

    total = db_session.query(func.count(WikiPage.wiki_id.distinct())).scalar() or 0

    latest_pages = (
        db_session.query(WikiPage)
        .join(
            subquery,
            (WikiPage.wiki_id == subquery.c.wiki_id)
            & (WikiPage.version == subquery.c.max_version),
        )
        .order_by(desc(WikiPage.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "items": [
            WikiPageResponse(
                wiki_id=str(p.wiki_id),
                version=p.version,
                title=p.title,
                content=p.content,
                is_stale=p.is_stale,
                is_published=p.is_published,
                created_at=str(p.created_at),
            )
            for p in latest_pages
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{wiki_id}")
def get_wiki(
    wiki_id: str,
    version: Optional[int] = None,
    db_session: Session = Depends(get_session),
    _: User = Depends(current_user),
) -> WikiPageResponse:
    try:
        w_uuid = uuid.UUID(wiki_id)
    except ValueError:
        raise OnyxError(OnyxErrorCode.BAD_REQUEST, "Invalid wiki_id UUID format.")

    query = db_session.query(WikiPage).filter(WikiPage.wiki_id == w_uuid)
    if version is not None:
        page = query.filter(WikiPage.version == version).first()
    else:
        page = query.order_by(desc(WikiPage.version)).first()

    if not page:
        raise OnyxError(OnyxErrorCode.NOT_FOUND, "Wiki page not found.")

    return WikiPageResponse(
        wiki_id=str(page.wiki_id),
        version=page.version,
        title=page.title,
        content=page.content,
        is_stale=page.is_stale,
        is_published=page.is_published,
        created_at=str(page.created_at),
    )


@router.get("/stale-events/list")
def list_stale_events(
    db_session: Session = Depends(get_session),
    _: User = Depends(current_user),
) -> List[StaleEventResponse]:
    events = (
        db_session.query(WikiStaleEvent)
        .filter(WikiStaleEvent.resolved == False)  # noqa: E712
        .all()
    )
    return [
        StaleEventResponse(
            event_id=str(e.event_id),
            wiki_id=str(e.wiki_id),
            wiki_version=e.wiki_version,
            trigger_doc_id=e.trigger_doc_id,
            conflict_type=e.conflict_type,
            conflict_description=e.conflict_description,
            resolved=e.resolved,
            created_at=str(e.created_at),
        )
        for e in events
    ]


@router.post("/stale-events/{event_id}/resolve")
def resolve_stale_event(
    event_id: str,
    db_session: Session = Depends(get_session),
    _: User = Depends(current_user),
) -> dict:
    try:
        e_uuid = uuid.UUID(event_id)
    except ValueError:
        raise OnyxError(OnyxErrorCode.BAD_REQUEST, "Invalid event_id UUID format.")

    event = (
        db_session.query(WikiStaleEvent)
        .filter(WikiStaleEvent.event_id == e_uuid)
        .first()
    )

    if not event:
        raise OnyxError(OnyxErrorCode.NOT_FOUND, "Stale event not found.")

    event.resolved = True
    db_session.commit()
    return {"message": "Stale event resolved successfully."}
