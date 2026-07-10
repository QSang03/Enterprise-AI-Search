"""fix_relation_evidence_chunk_id

Revision ID: 88e065d99a11
Revises: b9574fa162db
Create Date: 2026-07-10 10:26:06.140626

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "88e065d99a11"
down_revision = "b9574fa162db"
branch_labels = None
depends_on = None


from sqlalchemy.dialects import postgresql

def upgrade() -> None:
    # 1. Clear existing evidence records to avoid UUID casting errors/violations
    op.execute("DELETE FROM relation_evidence;")

    # 2. Drop the old integer chunk_id column
    op.drop_column("relation_evidence", "chunk_id")

    # 3. Add chunk_id as UUID
    op.add_column(
        "relation_evidence",
        sa.Column("chunk_id", postgresql.UUID(as_uuid=True), nullable=True),
    )

    # 4. Create foreign key to document_chunks_v2
    op.create_foreign_key(
        "fk_relation_evidence_chunk_id",
        "relation_evidence",
        "document_chunks_v2",
        ["chunk_id"],
        ["chunk_id"],
        ondelete="CASCADE",
    )

    # 5. Create index on chunk_id
    op.create_index(
        "idx_relation_evidence_chunk_id",
        "relation_evidence",
        ["chunk_id"],
    )

    # 6. Create unique constraint to prevent duplicate evidence records per chunk/job
    op.create_unique_constraint(
        "uq_relation_evidence_ref",
        "relation_evidence",
        ["relation_id", "document_id", "chunk_id", "extraction_job_id"],
    )


def downgrade() -> None:
    raise NotImplementedError("Reverting this migration is not supported because RelationEvidence chunk_id was altered to UUID.")

