"""backfill_tenant_id_and_drop_default

Revision ID: a1b2c3d4e5fa
Revises: a1b2c3d4e5f9
Create Date: 2026-07-10 17:00:00.000000

Corrective migration:

* Backfills tenant_id for rows where it is still NULL *or* where it holds
  the old ``'public'`` default but the current schema is a named tenant
  (multi-tenant environments that ran the initial f8 migration with
  ``server_default='public'``).
* Drops the old ``DEFAULT 'public'`` from the column so new rows without
  an explicit tenant_id will fail fast rather than silently insert the
  wrong value.
* Sets ``NOT NULL`` so the column matches the model.

"""

from alembic import op

revision = "a1b2c3d4e5fa"
down_revision = "a1b2c3d4e5f9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE graph_extraction_jobs
        SET tenant_id = current_schema()
        WHERE tenant_id IS NULL
           OR (
               current_schema() <> 'public'
               AND tenant_id = 'public'
           )
        """
    )

    op.execute(
        "ALTER TABLE graph_extraction_jobs "
        "ALTER COLUMN tenant_id DROP DEFAULT"
    )

    op.execute(
        "ALTER TABLE graph_extraction_jobs "
        "ALTER COLUMN tenant_id SET NOT NULL"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE graph_extraction_jobs "
        "ALTER COLUMN tenant_id DROP NOT NULL"
    )
    op.execute(
        "ALTER TABLE graph_extraction_jobs "
        "ALTER COLUMN tenant_id SET DEFAULT 'public'"
    )
    # Note: the UPDATE is intentionally NOT reversed — rolling back to f9
    # does not need to re-introduce incorrect tenant_id values.
