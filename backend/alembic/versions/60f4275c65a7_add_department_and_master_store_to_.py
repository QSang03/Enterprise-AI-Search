"""add_department_and_master_store_to_document_set

Revision ID: 60f4275c65a7
Revises: 4664a64f0f2d
Create Date: 2026-07-01 16:01:03.907879

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '60f4275c65a7'
down_revision = '4664a64f0f2d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('document_set', sa.Column('is_department', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('document_set', sa.Column('is_master_store', sa.Boolean(), nullable=False, server_default=sa.text('false')))


def downgrade() -> None:
    op.drop_column('document_set', 'is_master_store')
    op.drop_column('document_set', 'is_department')
