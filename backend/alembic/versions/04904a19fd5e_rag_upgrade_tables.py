"""rag_upgrade_tables

Revision ID: 04904a19fd5e
Revises: f3a9c1d4b7e2
Create Date: 2026-06-29 09:43:35.724240

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '04904a19fd5e'
down_revision = 'f3a9c1d4b7e2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. index_runs
    op.create_table(
        "index_runs",
        sa.Column("run_id", sa.UUID(), nullable=False),
        sa.Column("parser_version", sa.String(length=50), nullable=False),
        sa.Column("chunker_version", sa.String(length=50), nullable=False),
        sa.Column("embedding_model", sa.String(length=100), nullable=False),
        sa.Column("embedding_model_version", sa.String(length=50), nullable=False),
        sa.Column("reranker_model", sa.String(length=100), nullable=False),
        sa.Column("reranker_model_version", sa.String(length=50), nullable=False),
        sa.Column("metadata_extractor_version", sa.String(length=50), nullable=False),
        sa.Column("index_schema_version", sa.String(length=50), nullable=False),
        sa.Column("prompt_version", sa.String(length=50), nullable=False),
        sa.Column("acl_version", sa.String(length=50), nullable=False),
        sa.Column("wiki_generator_version", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.PrimaryKeyConstraint("run_id")
    )
    
    # 2. document_processing_jobs
    op.create_table(
        "document_processing_jobs",
        sa.Column("job_id", sa.UUID(), nullable=False),
        sa.Column("doc_id", sa.String(length=255), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("parser_mode", sa.String(length=20), nullable=False),
        sa.Column("ocr_confidence", sa.Float(), nullable=True),
        sa.Column("table_extraction_status", sa.String(length=20), nullable=True),
        sa.Column("chunk_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("parser_version", sa.String(length=50), nullable=True),
        sa.Column("chunker_version", sa.String(length=50), nullable=True),
        sa.Column("embedding_model", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("job_id")
    )
    
    # 3. document_processing_errors
    op.create_table(
        "document_processing_errors",
        sa.Column("error_id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("job_id", sa.UUID(), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=True),
        sa.Column("stage", sa.String(length=50), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=False),
        sa.Column("stack_trace", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["job_id"], ["document_processing_jobs.job_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("error_id")
    )
    
    # 4. ocr_pages
    op.create_table(
        "ocr_pages",
        sa.Column("page_id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("doc_id", sa.String(length=255), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("ocr_text", sa.Text(), nullable=False),
        sa.Column("ocr_confidence", sa.Float(), nullable=True),
        sa.Column("layout_data", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("page_id"),
        sa.UniqueConstraint("doc_id", "page_number", name="uq_ocr_pages_doc_page")
    )
    
    # 5. document_blocks
    op.create_table(
        "document_blocks",
        sa.Column("block_id", sa.UUID(), nullable=False),
        sa.Column("doc_id", sa.String(length=255), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("block_type", sa.String(length=20), nullable=False),
        sa.Column("text_raw", sa.Text(), nullable=False),
        sa.Column("text_normalized", sa.Text(), nullable=False),
        sa.Column("bbox_x1", sa.Float(), nullable=False),
        sa.Column("bbox_y1", sa.Float(), nullable=False),
        sa.Column("bbox_x2", sa.Float(), nullable=False),
        sa.Column("bbox_y2", sa.Float(), nullable=False),
        sa.Column("char_start", sa.Integer(), nullable=False),
        sa.Column("char_end", sa.Integer(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("block_metadata", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("block_id")
    )
    
    # 6. document_chunks_v2
    op.create_table(
        "document_chunks_v2",
        sa.Column("chunk_id", sa.UUID(), nullable=False),
        sa.Column("doc_id", sa.String(length=255), nullable=False),
        sa.Column("parent_chunk_id", sa.UUID(), nullable=True),
        sa.Column("sibling_order", sa.Integer(), nullable=False),
        sa.Column("text_raw", sa.Text(), nullable=False),
        sa.Column("text_normalized", sa.Text(), nullable=False),
        sa.Column("text_for_embedding", sa.Text(), nullable=False),
        sa.Column("text_for_citation", sa.Text(), nullable=False),
        sa.Column("block_type", sa.String(length=20), nullable=False),
        sa.Column("heading_path", sa.dialects.postgresql.ARRAY(sa.String()), nullable=False),
        sa.Column("page_start", sa.Integer(), nullable=False),
        sa.Column("page_end", sa.Integer(), nullable=False),
        sa.Column("bbox_x1", sa.Float(), nullable=True),
        sa.Column("bbox_y1", sa.Float(), nullable=True),
        sa.Column("bbox_x2", sa.Float(), nullable=True),
        sa.Column("bbox_y2", sa.Float(), nullable=True),
        sa.Column("char_start", sa.Integer(), nullable=True),
        sa.Column("char_end", sa.Integer(), nullable=True),
        sa.Column("allowed_users", sa.dialects.postgresql.ARRAY(sa.String()), nullable=False),
        sa.Column("allowed_groups", sa.dialects.postgresql.ARRAY(sa.String()), nullable=False),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("acl_hash", sa.String(length=64), nullable=False),
        sa.Column("parser_version", sa.String(length=50), nullable=False),
        sa.Column("chunker_version", sa.String(length=50), nullable=False),
        sa.Column("run_id", sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(["parent_chunk_id"], ["document_chunks_v2.chunk_id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["run_id"], ["index_runs.run_id"]),
        sa.PrimaryKeyConstraint("chunk_id")
    )
    
    # 7. eval_questions
    op.create_table(
        "eval_questions",
        sa.Column("question_id", sa.UUID(), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("gold_answer", sa.Text(), nullable=False),
        sa.Column("gold_doc_id", sa.String(length=255), nullable=False),
        sa.Column("gold_page", sa.Integer(), nullable=True),
        sa.Column("gold_chunk_id", sa.UUID(), nullable=True),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("is_answerable", sa.Boolean(), nullable=False, server_default="true"),
        sa.PrimaryKeyConstraint("question_id")
    )
    
    # 8. eval_runs
    op.create_table(
        "eval_runs",
        sa.Column("eval_run_id", sa.UUID(), nullable=False),
        sa.Column("run_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["index_runs.run_id"]),
        sa.PrimaryKeyConstraint("eval_run_id")
    )
    
    # 9. eval_results
    op.create_table(
        "eval_results",
        sa.Column("result_id", sa.UUID(), nullable=False),
        sa.Column("eval_run_id", sa.UUID(), nullable=False),
        sa.Column("question_id", sa.UUID(), nullable=False),
        sa.Column("generated_answer", sa.Text(), nullable=True),
        sa.Column("retrieved_chunk_ids", sa.dialects.postgresql.ARRAY(sa.UUID()), nullable=True),
        sa.Column("hit_10", sa.Boolean(), nullable=True),
        sa.Column("citation_exact", sa.Boolean(), nullable=True),
        sa.Column("no_answer_correct", sa.Boolean(), nullable=True),
        sa.Column("faithfulness_score", sa.Float(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["eval_run_id"], ["eval_runs.eval_run_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["question_id"], ["eval_questions.question_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("result_id")
    )


def downgrade() -> None:
    op.drop_table("eval_results")
    op.drop_table("eval_runs")
    op.drop_table("eval_questions")
    op.drop_table("document_chunks_v2")
    op.drop_table("document_blocks")
    op.drop_table("ocr_pages")
    op.drop_table("document_processing_errors")
    op.drop_table("document_processing_jobs")
    op.drop_table("index_runs")

