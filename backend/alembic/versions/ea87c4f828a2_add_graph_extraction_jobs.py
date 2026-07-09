"""add_graph_extraction_jobs

Revision ID: ea87c4f828a2
Revises: c7bf5721733e
Create Date: 2026-07-09

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "ea87c4f828a2"
down_revision = "0e971bfc6d27"
branch_labels: None = None
depends_on: None = None


def upgrade() -> None:
    op.create_table(
        "graph_extraction_jobs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("document_id", sa.String(), nullable=False),
        sa.Column("content_hash", sa.String(), nullable=False),
        sa.Column(
            "status",
            sa.String(50),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("prompt_version", sa.String(50), nullable=False),
        sa.Column("model_name", sa.String(255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_graph_extraction_jobs_document_id",
        "graph_extraction_jobs",
        ["document_id"],
    )
    op.create_index(
        "idx_graph_extraction_jobs_status",
        "graph_extraction_jobs",
        ["status"],
    )
    op.create_index(
        "idx_graph_extraction_jobs_doc_hash",
        "graph_extraction_jobs",
        ["document_id", "content_hash"],
    )


def downgrade() -> None:
    op.drop_index(
        "idx_graph_extraction_jobs_doc_hash", table_name="graph_extraction_jobs"
    )
    op.drop_index(
        "idx_graph_extraction_jobs_status", table_name="graph_extraction_jobs"
    )
    op.drop_index(
        "idx_graph_extraction_jobs_document_id", table_name="graph_extraction_jobs"
    )
    op.drop_table("graph_extraction_jobs")
