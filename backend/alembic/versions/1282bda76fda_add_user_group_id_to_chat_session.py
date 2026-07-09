"""add user_group_id to chat_session

Revision ID: 1282bda76fda
Revises: ea87c4f828a3
Create Date: 2026-07-09 13:49:06.498420

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "1282bda76fda"
down_revision = "ea87c4f828a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chat_session",
        sa.Column("user_group_id", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("chat_session", "user_group_id")

