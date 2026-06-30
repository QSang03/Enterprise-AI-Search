import time
import uuid
from typing import Any

from onyx.configs.app_configs import POSTGRES_API_SERVER_POOL_OVERFLOW
from onyx.configs.app_configs import POSTGRES_API_SERVER_POOL_SIZE
from onyx.configs.constants import POSTGRES_WEB_APP_NAME, DocumentSource
from onyx.db.engine.sql_engine import SqlEngine, get_session_with_current_tenant
from onyx.db.rag_upgrade_models import DocumentProcessingJob, DocumentBlock, DocumentChunkV2
from onyx.db.search_settings import get_active_search_settings
from onyx.db.users import get_all_users
from onyx.document_index.factory import get_default_document_index
from onyx.indexing.indexing_pipeline import index_doc_batch
from onyx.indexing.chunker import Chunker
from onyx.indexing.embedder import IndexingEmbedder
from onyx.indexing.models import IndexingBatchAdapter
from onyx.connectors.models import Document, TextSection, IndexingDocument
from shared_configs.contextvars import CURRENT_TENANT_ID_CONTEXTVAR

class DummyAdapter(IndexingBatchAdapter):
    connector_id = None
    credential_id = None
    
    def __init__(self) -> None:
        pass
    def prepare(self, documents: list[Document], ignore_time_skip: bool) -> Any:
        from types import SimpleNamespace
        return SimpleNamespace(updatable_docs=documents, indexable_docs=documents)
    def prepare_enrichment(self, context: Any, tenant_id: str, chunks: list[Any], db_session: Any) -> Any:
        from types import SimpleNamespace
        from onyx.indexing.models import DocMetadataAwareIndexChunk
        from onyx.access.models import DocumentAccess
        
        access = DocumentAccess.build(
            user_emails=[],
            user_groups=[],
            external_user_emails=[],
            external_user_group_ids=[],
            is_public=True
        )
        
        from onyx.indexing.models import ChunkEmbedding
        
        embeddings = ChunkEmbedding(
            full_embedding=[0.0] * 768,
            mini_chunk_embeddings=[]
        )
        
        def enrich_chunk(chunk: Any, boost: float) -> Any:
            return DocMetadataAwareIndexChunk(
                **chunk.model_dump(),
                tenant_id=tenant_id,
                access=access,
                document_sets=set(),
                user_project=[],
                personas=[],
                boost=0,
                aggregated_chunk_boost_factor=1.0,
                embeddings=embeddings,
                title_embedding=[0.0] * 768,
                ancestor_hierarchy_node_ids=[],
            )
            
        return SimpleNamespace(
            doc_id_to_previous_chunk_cnt={},
            doc_id_to_new_chunk_cnt={},
            enrich_chunk=enrich_chunk
        )
    
    from contextlib import contextmanager
    @contextmanager
    def lock_context(self, documents: list[Document]) -> Any:
        with get_session_with_current_tenant() as session:
            yield session
            session.commit()

def run_test() -> None:
    CURRENT_TENANT_ID_CONTEXTVAR.set("public")
    
    SqlEngine.set_app_name(POSTGRES_WEB_APP_NAME)
    SqlEngine.init_engine(
        pool_size=POSTGRES_API_SERVER_POOL_SIZE,
        max_overflow=POSTGRES_API_SERVER_POOL_OVERFLOW,
    )
    
    print("Connecting to DB...")
    with get_session_with_current_tenant() as db_session:
        users = get_all_users(db_session)
        user = users[0] if users else None
        if not user:
            print("No user found. Exiting.")
            return
            
        active_search_settings = get_active_search_settings(db_session)
        primary_settings = active_search_settings.primary
        document_index = get_default_document_index(primary_settings, None, db_session)
        
        # Initialize Chunker & Embedder
        from unittest.mock import MagicMock
        embedder = MagicMock(spec=IndexingEmbedder)
        
        from collections import namedtuple
        EmbedResult = namedtuple('EmbedResult', ['successful_chunk_ids', 'connector_failures'])
        
        # Define document info
        doc_id = "test_legal_doc_001"
        layout_blocks = [
            {
                "page_number": 1,
                "type": "heading",
                "text_raw": "Điều 1. Phạm vi điều chỉnh",
                "text_normalized": "Điều 1. Phạm vi điều chỉnh",
                "bbox": [10.0, 20.0, 100.0, 50.0],
                "char_start": 0,
                "char_end": 26,
            },
            {
                "page_number": 1,
                "type": "text",
                "text_raw": "Quy chế này quy định về phạm vi điều chỉnh chi tiêu tiếp khách của công ty.",
                "text_normalized": "Quy chế này quy định về phạm vi điều chỉnh chi tiêu tiếp khách của công ty.",
                "bbox": [10.0, 60.0, 300.0, 100.0],
                "char_start": 27,
                "char_end": 102,
            }
        ]
        
        doc = Document(
            id=doc_id,
            sections=[
                TextSection(
                    text="Điều 1. Phạm vi điều chỉnh\nQuy chế này quy định về phạm vi điều chỉnh chi tiêu tiếp khách của công ty."
                )
            ],
            source=DocumentSource.FILE,
            semantic_identifier="Quy chế chi tiêu",
            metadata={},
            additional_info={"layout_blocks": layout_blocks}
        )
        
        from onyx.natural_language_processing.utils import get_tokenizer
        tokenizer = get_tokenizer(
            model_name=primary_settings.model_name,
            provider_type=primary_settings.provider_type
        )
        
        # We run Chunker to see how chunks are generated
        chunker = Chunker(
            tokenizer=tokenizer,
            blurb_size=100,
            chunk_token_limit=512,
            chunk_overlap=0,
            enable_multipass=False,
        )
        
        # Manually wrap doc in IndexingDocument for standard chunker testing
        indexing_doc = IndexingDocument(
            **doc.model_dump(),
            processed_sections=[s.model_copy() for s in doc.sections]
        )
        chunks = chunker.chunk([indexing_doc])
        print(f"Generated {len(chunks)} chunks.")
        
        # Mock embedder successful chunk ids: (chunk_id, document_id)
        embed_result = EmbedResult(
            successful_chunk_ids=[(c.chunk_id, doc_id) for c in chunks],
            connector_failures=[]
        )
        
        # Mock embed_and_stream context manager
        from contextlib import contextmanager
        @contextmanager
        def mock_embed_and_stream(*args: Any, **kwargs: Any) -> Any:
            from collections import namedtuple
            Store = namedtuple('Store', ['stream'])
            yield embed_result, Store(stream=lambda: chunks)
            
        import onyx.indexing.indexing_pipeline as pipeline_mod
        pipeline_mod.embed_and_stream = mock_embed_and_stream
        
        # Run index_doc_batch
        adapter = DummyAdapter()
        print("Executing index_doc_batch...")
        index_doc_batch(
            document_batch=[doc],
            chunker=chunker,
            embedder=embedder,
            document_indices=[document_index],
            request_id="test-req-001",
            tenant_id="public",
            adapter=adapter
        )
        
        print("Checking DB records...")
        jobs = db_session.query(DocumentProcessingJob).filter_by(doc_id=doc_id).all()
        blocks = db_session.query(DocumentBlock).filter_by(doc_id=doc_id).all()
        chunks_v2 = db_session.query(DocumentChunkV2).filter_by(doc_id=doc_id).all()
        
        print(f"Jobs: {len(jobs)}")
        if jobs:
            print(f"  - Mode: {jobs[0].parser_mode}, Status: {jobs[0].status}, Chunks: {jobs[0].chunk_count}")
        print(f"Blocks: {len(blocks)}")
        for b in blocks:
            print(f"  - Block: {b.block_type}, Text: {b.text_raw}")
        print(f"Chunks V2: {len(chunks_v2)}")
        for c in chunks_v2:
            print(f"  - Chunk order: {c.sibling_order}, Text: {c.text_raw[:50]}...")
            
if __name__ == "__main__":
    run_test()
