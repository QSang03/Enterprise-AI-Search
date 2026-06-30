import uuid
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from onyx.configs.app_configs import POSTGRES_API_SERVER_POOL_OVERFLOW
from onyx.configs.app_configs import POSTGRES_API_SERVER_POOL_SIZE
from onyx.configs.constants import POSTGRES_WEB_APP_NAME
from onyx.db.engine.sql_engine import SqlEngine, get_session_with_current_tenant
from onyx.db.rag_upgrade_models import (
    DocumentProcessingJob,
    DocumentBlock,
    OcrPage,
    DocumentProcessingError,
)
from shared_configs.contextvars import CURRENT_TENANT_ID_CONTEXTVAR

def seed_data() -> None:
    CURRENT_TENANT_ID_CONTEXTVAR.set("public")
    
    SqlEngine.set_app_name(POSTGRES_WEB_APP_NAME)
    SqlEngine.init_engine(
        pool_size=POSTGRES_API_SERVER_POOL_SIZE,
        max_overflow=POSTGRES_API_SERVER_POOL_OVERFLOW,
    )
    
    print("Connecting to DB and seeding...")
    with get_session_with_current_tenant() as session:
        # Clear existing seeded mock data if any
        session.query(DocumentBlock).delete()
        session.query(OcrPage).delete()
        session.query(DocumentProcessingError).delete()
        session.query(DocumentProcessingJob).delete()
        session.commit()
        
        from datetime import timezone
        
        # 1. Seed successful accurate parsing job
        job_id_1 = uuid.uuid4()
        job_1 = DocumentProcessingJob(
            job_id=job_id_1,
            doc_id="qd_mvp_rag_spec_doc_001",
            file_name="quyce_chitieunoibo_2026.pdf",
            parser_mode="accurate",
            status="completed",
            chunk_count=3,
            created_at=datetime.now(timezone.utc) - timedelta(minutes=10),
            updated_at=datetime.now(timezone.utc) - timedelta(minutes=8),
        )
        session.add(job_1)
        
        # 2. Seed failed fast parsing job
        job_id_2 = uuid.uuid4()
        job_2 = DocumentProcessingJob(
            job_id=job_id_2,
            doc_id="scanned_legal_invoice_error_002",
            file_name="hoa_don_quet_loi_002.pdf",
            parser_mode="fast",
            status="failed",
            chunk_count=0,
            created_at=datetime.now(timezone.utc) - timedelta(minutes=5),
            updated_at=datetime.now(timezone.utc) - timedelta(minutes=4),
        )
        session.add(job_2)
        
        # Flush to DB to populate jobs so foreign keys are satisfied
        session.flush()
        
        # Add blocks for job 1
        blocks_1 = [
            DocumentBlock(
                block_id=uuid.uuid4(),
                doc_id="qd_mvp_rag_spec_doc_001",
                page_number=1,
                block_type="heading",
                text_raw="CHƯƠNG I: QUY ĐỊNH CHUNG",
                text_normalized="chuong i quy dinh chung",
                bbox_x1=0.1, bbox_y1=0.1, bbox_x2=0.5, bbox_y2=0.15,
                char_start=0, char_end=24,
            ),
            DocumentBlock(
                block_id=uuid.uuid4(),
                doc_id="qd_mvp_rag_spec_doc_001",
                page_number=1,
                block_type="text",
                text_raw="Điều 1. Phạm vi điều chỉnh của văn bản quy chế chi tiêu nội bộ.",
                text_normalized="dieu 1 pham vi dieu chinh...",
                bbox_x1=0.1, bbox_y1=0.18, bbox_x2=0.9, bbox_y2=0.25,
                char_start=25, char_end=85,
            ),
            DocumentBlock(
                block_id=uuid.uuid4(),
                doc_id="qd_mvp_rag_spec_doc_001",
                page_number=2,
                block_type="table",
                text_raw="Cột A | Cột B\nGiá trị 1 | Giá trị 2",
                text_normalized="cot a cot b gia tri 1...",
                bbox_x1=0.1, bbox_y1=0.1, bbox_x2=0.9, bbox_y2=0.4,
                char_start=0, char_end=35,
            ),
        ]
        for b in blocks_1:
            session.add(b)
            
        # Add OCR page for job 1
        page_1 = OcrPage(
            doc_id="qd_mvp_rag_spec_doc_001",
            page_number=1,
            ocr_text="CHƯƠNG I: QUY ĐỊNH CHUNG\nĐiều 1. Phạm vi điều chỉnh...",
            ocr_confidence=0.96,
            layout_data={},
        )
        page_2 = OcrPage(
            doc_id="qd_mvp_rag_spec_doc_001",
            page_number=2,
            ocr_text="Cột A | Cột B\nGiá trị 1 | Giá trị 2",
            ocr_confidence=0.92,
            layout_data={},
        )
        session.add(page_1)
        session.add(page_2)
        
        # Add error detail for job 2
        err_2 = DocumentProcessingError(
            job_id=job_id_2,
            stage="parsing",
            error_message="Failed to parse layout using fast parser mode: Invalid file signature",
            stack_trace="Traceback (most recent call last):\n  File 'parser.py', line 89\nValueError: Invalid file signature",
            created_at=datetime.now(timezone.utc) - timedelta(minutes=4),
        )
        session.add(err_2)
        
        session.commit()
        print("Successfully seeded 2 mock jobs!")

if __name__ == "__main__":
    seed_data()
