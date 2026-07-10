"""add_relation_evidence

Revision ID: fcb7e4bf3e77
Revises: 1282bda76fda
Create Date: 2026-07-10 09:19:47.710175

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "fcb7e4bf3e77"
down_revision = "1282bda76fda"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "relation_evidence",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "relation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("relations.relation_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("document_id", sa.String(2048), nullable=False),
        sa.Column("chunk_id", sa.Integer(), nullable=True),
        sa.Column(
            "extraction_job_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("graph_extraction_jobs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("evidence_text", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_relation_evidence_relation_id",
        "relation_evidence",
        ["relation_id"],
    )
    op.create_index(
        "idx_relation_evidence_document_id",
        "relation_evidence",
        ["document_id"],
    )
    op.create_index(
        "idx_relation_evidence_extraction_job_id",
        "relation_evidence",
        ["extraction_job_id"],
    )

    # Create the function
    op.execute(
        """
        CREATE OR REPLACE FUNCTION delete_orphan_relations()
        RETURNS TRIGGER AS $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM relation_evidence WHERE relation_id = OLD.relation_id) THEN
                DELETE FROM relations WHERE relation_id = OLD.relation_id;
            END IF;
            RETURN OLD;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    # Create the trigger
    op.execute(
        """
        CREATE TRIGGER delete_orphan_relations_trigger
        AFTER DELETE ON relation_evidence
        FOR EACH ROW
        EXECUTE FUNCTION delete_orphan_relations();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS delete_orphan_relations_trigger ON relation_evidence;")
    op.execute("DROP FUNCTION IF EXISTS delete_orphan_relations();")
    op.drop_index("idx_relation_evidence_extraction_job_id", table_name="relation_evidence")
    op.drop_index("idx_relation_evidence_document_id", table_name="relation_evidence")
    op.drop_index("idx_relation_evidence_relation_id", table_name="relation_evidence")
    op.drop_table("relation_evidence")

