"""Set default reranker to Qwen3-Reranker-0.6B on fresh install

Revision ID: f9e8d7c6b5a4
Revises: 60f4275c65a7
Create Date: 2026-07-03 10:30:00.000000

"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "f9e8d7c6b5a4"
down_revision = "60f4275c65a7"
branch_labels: None = None
depends_on: None = None


def upgrade() -> None:
    # Set Qwen3-Reranker-0.6B as the default local reranker for any existing
    # PRESENT search_settings rows that have no reranker configured yet.
    op.execute(
        """
        UPDATE search_settings
        SET
            rerank_model_name = 'Qwen/Qwen3-Reranker-0.6B',
            rerank_enabled    = true
        WHERE
            status            = 'PRESENT'
            AND rerank_model_name IS NULL
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE search_settings
        SET
            rerank_model_name = NULL,
            rerank_enabled    = false
        WHERE
            status            = 'PRESENT'
            AND rerank_model_name = 'Qwen/Qwen3-Reranker-0.6B'
        """
    )
