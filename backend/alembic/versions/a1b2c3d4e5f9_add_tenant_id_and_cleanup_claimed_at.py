"""add_tenant_id_and_cleanup_claimed_at

Revision ID: a1b2c3d4e5f9
Revises: a1b2c3d4e5f8
Create Date: 2026-07-10 16:00:00.000000

"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f9"
down_revision = "a1b2c3d4e5f8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent column additions.  An earlier version of this migration
    # (commit 5f95edc) may already have created them on some environments.
    op.execute(
        "ALTER TABLE graph_extraction_jobs "
        "ADD COLUMN IF NOT EXISTS tenant_id varchar"
    )
    op.execute(
        "ALTER TABLE graph_extraction_jobs "
        "ADD COLUMN IF NOT EXISTS cleanup_claimed_at timestamptz"
    )


def downgrade() -> None:
    op.drop_column("graph_extraction_jobs", "cleanup_claimed_at")
    op.drop_column("graph_extraction_jobs", "tenant_id")
