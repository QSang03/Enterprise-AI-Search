"""Add sender_email column to chat_message

Revision ID: a1b2c3d4e5fb
Revises: a1b2c3d4e5fa
Create Date: 2026-07-14 02:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5fb"
down_revision = "a1b2c3d4e5fa"
branch_labels: None | str = None
depends_on: None | str = None


def upgrade() -> None:
    op.add_column(
        "chat_message",
        sa.Column("sender_email", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("chat_message", "sender_email")
