import uuid
import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func, literal
from onyx.db.models import WikiPage

def test_wiki_page_matching_and_search_retrieval(db_session: Session) -> None:
    # 1. Insert dummy WikiPage
    wiki_id = uuid.uuid4()
    wiki = WikiPage(
        wiki_id=wiki_id,
        version=1,
        title="Quy trình nghỉ phép",
        content="Nội dung hướng dẫn chi tiết quy trình xin nghỉ phép của công ty.",
        is_stale=False,
        is_published=True,
        created_at=datetime.datetime.utcnow(),
        updated_at=datetime.datetime.utcnow(),
    )
    db_session.add(wiki)
    db_session.flush()

    # Query matching logic:
    candidate_text = "Tôi muốn xem Quy trình nghỉ phép năm nay"

    matched_wikis = (
        db_session.query(WikiPage)
        .filter(
            WikiPage.is_stale == False,
            WikiPage.is_published == True,
            (
                literal(candidate_text).ilike(func.concat("%", WikiPage.title, "%"))
                | WikiPage.title.ilike(func.concat("%", candidate_text, "%"))
            )
        )
        .all()
    )

    assert len(matched_wikis) == 1
    assert matched_wikis[0].title == "Quy trình nghỉ phép"
    assert matched_wikis[0].content == wiki.content

    # Clean up
    db_session.rollback()
