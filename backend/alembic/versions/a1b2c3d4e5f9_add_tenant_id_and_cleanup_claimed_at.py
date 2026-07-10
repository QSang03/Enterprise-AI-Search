"""add_tenant_id_and_cleanup_claimed_at

Revision ID: a1b2c3d4e5f9
Revises: a1b2c3d4e5f8
Create Date: 2026-07-10 16:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f9"
down_revision = "a1b2c3d4e5f8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # tenant_id is nullable so each tenant's backfill can set the correct value.
    op.add_column(
        "graph_extraction_jobs",
        sa.Column(
            "tenant_id",
            sa.String(),
            nullable=True,
        ),
    )
    op.add_column(
        "graph_extraction_jobs",
        sa.Column(
            "cleanup_claimed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("graph_extraction_jobs", "cleanup_claimed_at")
    op.drop_column("graph_extraction_jobs", "tenant_id")
