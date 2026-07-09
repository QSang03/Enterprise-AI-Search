"""add_entity_aliases

Revision ID: ea87c4f828a3
Revises: ea87c4f828a2
Create Date: 2026-07-09

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "ea87c4f828a3"
down_revision = "ea87c4f828a2"
branch_labels: None = None
depends_on: None = None


def upgrade() -> None:
    op.add_column(
        "entities",
        sa.Column("normalized_name", sa.String(255), nullable=True),
    )
    op.create_index(
        "idx_entities_normalized_name",
        "entities",
        ["normalized_name"],
    )

    op.create_table(
        "entity_aliases",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "entity_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("entities.entity_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("alias", sa.String(255), nullable=False),
        sa.Column("normalized_alias", sa.String(255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("entity_id", "normalized_alias", name="uq_entity_alias"),
    )
    op.create_index(
        "idx_entity_aliases_normalized",
        "entity_aliases",
        ["normalized_alias"],
    )
    op.create_index(
        "idx_entity_aliases_entity_id",
        "entity_aliases",
        ["entity_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_entity_aliases_entity_id", table_name="entity_aliases")
    op.drop_index("idx_entity_aliases_normalized", table_name="entity_aliases")
    op.drop_table("entity_aliases")
    op.drop_index("idx_entities_normalized_name", table_name="entities")
    op.drop_column("entities", "normalized_name")
