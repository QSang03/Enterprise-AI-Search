"""add reranker settings columns

Revision ID: 4664a64f0f2d
Revises: 82aa138353f8
Create Date: 2026-06-30 16:40:29.394430

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '4664a64f0f2d'
down_revision = '82aa138353f8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("search_settings", sa.Column("rerank_enabled", sa.Boolean(), nullable=False, server_default="true"))
    op.add_column("search_settings", sa.Column("rerank_model_name", sa.String(), nullable=True))
    op.add_column("search_settings", sa.Column("rerank_provider_type", sa.String(), nullable=True))
    op.add_column("search_settings", sa.Column("rerank_api_key", sa.String(), nullable=True))
    op.add_column("search_settings", sa.Column("rerank_api_url", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("search_settings", "rerank_api_url")
    op.drop_column("search_settings", "rerank_api_key")
    op.drop_column("search_settings", "rerank_provider_type")
    op.drop_column("search_settings", "rerank_model_name")
    op.drop_column("search_settings", "rerank_enabled")
