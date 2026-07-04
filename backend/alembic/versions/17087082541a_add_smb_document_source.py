"""add_smb_document_source

Add 'smb' as a valid DocumentSource value for the SMB Network Drive connector.

documentsource columns are stored as VARCHAR(50) (not a native PostgreSQL
enum type), so no DDL change is required.  The new value becomes valid as
soon as the application code that writes it is deployed.

Revision ID: 17087082541a
Revises: f9e8d7c6b5a4
Create Date: 2026-07-04 09:03:36.837021

"""
from alembic import op  # noqa: F401


# revision identifiers, used by Alembic.
revision = "17087082541a"
down_revision = "f9e8d7c6b5a4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No DDL needed — documentsource is VARCHAR(50), not a native PG enum.
    pass


def downgrade() -> None:
    # Documents already indexed with source='smb' would need to be removed
    # before rolling back to a version that does not know about this source.
    pass
