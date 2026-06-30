import uuid
from sqlalchemy.orm import Session
from onyx.db.models import Document as DbDocument
from onyx.db.models import DocumentChunkV2, WikiPage, WikiCitation, WikiStaleEvent
from onyx.db.document import delete_documents_complete__no_commit

def test_wiki_stale_on_document_deletion(db_session: Session) -> None:
    doc_id = "test-doc-deletion-123"
    chunk_uuid = uuid.uuid4()
    
    # 1. Create a dummy document
    doc = DbDocument(
        id=doc_id,
        semantic_id="Test Doc",
    )
    db_session.add(doc)
    db_session.flush()
    
    # 2. Create a chunk for the document
    chunk = DocumentChunkV2(
        chunk_id=chunk_uuid,
        doc_id=doc_id,
        sibling_order=0,
        text_raw="Nội dung kiểm thử tự động wiki.",
        text_normalized="Noi dung kiem thu tu dong wiki.",
        text_for_embedding="Noi dung kiem thu tu dong wiki.",
        text_for_citation="Nội dung kiểm thử tự động wiki.",
        block_type="text",
        heading_path=[],
        page_start=0,
        page_end=0,
        allowed_users=[],
        allowed_groups=[],
        is_public=True,
        acl_hash="dummy-acl-hash",
        parser_version="v1",
        chunker_version="v1",
    )
    db_session.add(chunk)
    db_session.flush()
    
    # 3. Create a Wiki Page
    wiki_uuid = uuid.uuid4()
    wiki_page = WikiPage(
        wiki_id=wiki_uuid,
        version=1,
        title="Trang Wiki Kiểm Thử",
        content="Nội dung trang Wiki chứa trích dẫn [Citation: " + str(chunk_uuid) + "].",
        is_stale=False,
        is_published=True,
    )
    db_session.add(wiki_page)
    db_session.flush()
    
    # 4. Create a Wiki Citation linking to the chunk
    citation = WikiCitation(
        citation_id=uuid.uuid4(),
        wiki_id=wiki_uuid,
        wiki_version=1,
        section_title="Introduction",
        chunk_id=chunk_uuid,
    )
    db_session.add(citation)
    db_session.flush()
    
    # 5. Run the document deletion
    delete_documents_complete__no_commit(db_session, [doc_id])
    db_session.flush()
    
    # 6. Verify that the Wiki page was marked as stale
    refetched_wiki = db_session.query(WikiPage).filter(WikiPage.wiki_id == wiki_uuid).first()
    assert refetched_wiki is not None
    assert refetched_wiki.is_stale is True
    
    # 7. Verify that a WikiStaleEvent was created
    event = db_session.query(WikiStaleEvent).filter(
        WikiStaleEvent.wiki_id == wiki_uuid,
        WikiStaleEvent.conflict_type == "deleted"
    ).first()
    assert event is not None
    assert event.trigger_doc_id == doc_id
    assert event.resolved is False
    
    db_session.rollback()
