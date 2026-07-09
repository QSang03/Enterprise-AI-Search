"""merge heads

Revision ID: 080559f6befc
Revises: 0e971bfc6d27, ea87c4f828a3
Create Date: 2026-07-09 09:46:17.871123

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "080559f6befc"
down_revision = ("0e971bfc6d27", "ea87c4f828a3")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
