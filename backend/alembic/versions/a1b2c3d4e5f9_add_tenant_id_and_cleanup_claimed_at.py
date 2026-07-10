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
    # Use IF NOT EXISTS in case a previous migration (e.g. f8 from an earlier
    # commit) already added the column on this environment.
    op.execute(
        "ALTER TABLE graph_extraction_jobs "
        "ADD COLUMN IF NOT EXISTS tenant_id varchar"
    )
    op.execute(
        "ALTER TABLE graph_extraction_jobs "
        "ADD COLUMN IF NOT EXISTS cleanup_claimed_at timestamptz"
    )

    # Backfill tenant_id for existing rows where it is still NULL.
    # current_schema() returns the tenant schema name because Alembic runs
    # with schema_translate_map for multi-tenant migrations.
    op.execute(
        "UPDATE graph_extraction_jobs "
        "SET tenant_id = current_schema() "
        "WHERE tenant_id IS NULL"
    )

    # Now that all rows have a value, make the column NOT NULL.
    op.execute(
        "ALTER TABLE graph_extraction_jobs "
        "ALTER COLUMN tenant_id SET NOT NULL"
    )


def downgrade() -> None:
    op.drop_column("graph_extraction_jobs", "cleanup_claimed_at")
    op.drop_column("graph_extraction_jobs", "tenant_id")
