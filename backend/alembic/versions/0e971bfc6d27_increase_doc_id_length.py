"""increase_doc_id_length

Revision ID: 0e971bfc6d27
Revises: 17087082541a
Create Date: 2026-07-06 16:36:27.057162

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0e971bfc6d27'
down_revision = '17087082541a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("document_processing_jobs", "doc_id", type_=sa.String(length=2048), existing_type=sa.String(length=255))
    op.alter_column("document_processing_jobs", "file_name", type_=sa.String(length=1024), existing_type=sa.String(length=255))
    op.alter_column("ocr_pages", "doc_id", type_=sa.String(length=2048), existing_type=sa.String(length=255))
    op.alter_column("document_blocks", "doc_id", type_=sa.String(length=2048), existing_type=sa.String(length=255))
    op.alter_column("document_chunks_v2", "doc_id", type_=sa.String(length=2048), existing_type=sa.String(length=255))
    op.alter_column("eval_questions", "gold_doc_id", type_=sa.String(length=2048), existing_type=sa.String(length=255))
    op.alter_column("wiki_stale_events", "trigger_doc_id", type_=sa.String(length=2048), existing_type=sa.String(length=255))


def downgrade() -> None:
    op.alter_column("document_processing_jobs", "doc_id", type_=sa.String(length=255), existing_type=sa.String(length=2048))
    op.alter_column("document_processing_jobs", "file_name", type_=sa.String(length=255), existing_type=sa.String(length=1024))
    op.alter_column("ocr_pages", "doc_id", type_=sa.String(length=255), existing_type=sa.String(length=2048))
    op.alter_column("document_blocks", "doc_id", type_=sa.String(length=255), existing_type=sa.String(length=2048))
    op.alter_column("document_chunks_v2", "doc_id", type_=sa.String(length=255), existing_type=sa.String(length=2048))
    op.alter_column("eval_questions", "gold_doc_id", type_=sa.String(length=255), existing_type=sa.String(length=2048))
    op.alter_column("wiki_stale_events", "trigger_doc_id", type_=sa.String(length=255), existing_type=sa.String(length=2048))
