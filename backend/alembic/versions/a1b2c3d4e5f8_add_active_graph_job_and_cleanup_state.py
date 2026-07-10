"""add_active_graph_job_and_cleanup_state

Revision ID: a1b2c3d4e5f8
Revises: 88e065d99a11
Create Date: 2026-07-10 14:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f8"
down_revision = "88e065d99a11"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add active_graph_job_id to document table (P1 — supersession CAS).
    op.add_column(
        "document",
        sa.Column(
            "active_graph_job_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_document_active_graph_job_id",
        "document",
        ["active_graph_job_id"],
    )

    # Add durable cleanup state columns to graph_extraction_jobs (P2).
    op.add_column(
        "graph_extraction_jobs",
        sa.Column(
            "cleanup_retry_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "graph_extraction_jobs",
        sa.Column(
            "cleanup_next_retry_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "graph_extraction_jobs",
        sa.Column(
            "cleanup_last_error",
            sa.Text(),
            nullable=True,
        ),
    )

    # Partial index for the periodic sweeper query (P2).
    op.create_index(
        "ix_graph_jobs_cleanup_due",
        "graph_extraction_jobs",
        ["status", "cleanup_next_retry_at"],
        postgresql_where=sa.text("status = 'cleanup_pending'"),
    )


def downgrade() -> None:
    op.drop_index("ix_graph_jobs_cleanup_due", table_name="graph_extraction_jobs")
    op.drop_column("graph_extraction_jobs", "cleanup_last_error")
    op.drop_column("graph_extraction_jobs", "cleanup_next_retry_at")
    op.drop_column("graph_extraction_jobs", "cleanup_retry_count")

    op.drop_index("ix_document_active_graph_job_id", table_name="document")
    op.drop_column("document", "active_graph_job_id")
