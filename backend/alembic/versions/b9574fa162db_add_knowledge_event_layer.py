"""add_knowledge_event_layer

Revision ID: b9574fa162db
Revises: fcb7e4bf3e77
Create Date: 2026-07-10 09:50:32.911671

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "b9574fa162db"
down_revision = "fcb7e4bf3e77"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Modify entities table unique constraint to support scoping
    op.drop_constraint("entities_name_key", "entities", type_="unique")
    op.add_column("entities", sa.Column("knowledge_scope_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_entities_knowledge_scope",
        "entities",
        "connector_credential_pair",
        ["knowledge_scope_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_entities_knowledge_scope_id",
        "entities",
        ["knowledge_scope_id"],
    )
    op.create_unique_constraint(
        "uq_entity_scope_type_name",
        "entities",
        ["knowledge_scope_id", "entity_type", "normalized_name"],
    )

    # 2. Create knowledge_events table
    op.create_table(
        "knowledge_events",
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("document_id", sa.String(length=2048), nullable=False),
        sa.Column("chunk_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=100), nullable=True),
        sa.Column("event_time_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("event_time_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column(
            "extraction_job_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        sa.Column(
            "vespa_indexed",
            sa.Boolean(),
            server_default="false",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["chunk_id"],
            ["document_chunks_v2.chunk_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["extraction_job_id"],
            ["graph_extraction_jobs.id"],
            ondelete="SET NULL",
        ),
    )
    op.create_index(
        "ix_knowledge_events_document_id",
        "knowledge_events",
        ["document_id"],
    )
    op.create_index(
        "ix_knowledge_events_chunk_id",
        "knowledge_events",
        ["chunk_id"],
    )
    op.create_index(
        "ix_knowledge_events_extraction_job_id",
        "knowledge_events",
        ["extraction_job_id"],
    )

    # 3. Create event_entities table
    op.create_table(
        "event_entities",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(length=100), nullable=True),
        sa.Column("evidence_text", sa.Text(), nullable=True),
        sa.Column("evidence_start", sa.Integer(), nullable=True),
        sa.Column("evidence_end", sa.Integer(), nullable=True),
        sa.Column("weight", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["knowledge_events.event_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entities.entity_id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "event_id",
            "entity_id",
            "role",
            name="uq_event_entity_role",
        ),
    )
    op.create_index(
        "ix_event_entities_event_id",
        "event_entities",
        ["event_id"],
    )
    op.create_index(
        "ix_event_entities_entity_id",
        "event_entities",
        ["entity_id"],
    )

    # 4. Trigger for document delete cleanup
    op.execute(
        """
        CREATE OR REPLACE FUNCTION delete_document_kg_references()
        RETURNS TRIGGER AS $$
        BEGIN
            DELETE FROM relation_evidence WHERE document_id = OLD.id;
            DELETE FROM knowledge_events WHERE document_id = OLD.id;
            RETURN OLD;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER delete_document_kg_references_trigger
        AFTER DELETE ON document
        FOR EACH ROW
        EXECUTE FUNCTION delete_document_kg_references();
        """
    )


def downgrade() -> None:
    # 4. Drop trigger and function
    op.execute("DROP TRIGGER IF EXISTS delete_document_kg_references_trigger ON document;")
    op.execute("DROP FUNCTION IF EXISTS delete_document_kg_references();")

    # 3. Drop event_entities table
    op.drop_index("ix_event_entities_entity_id", table_name="event_entities")
    op.drop_index("ix_event_entities_event_id", table_name="event_entities")
    op.drop_table("event_entities")

    # 2. Drop knowledge_events table
    op.drop_index("ix_knowledge_events_extraction_job_id", table_name="knowledge_events")
    op.drop_index("ix_knowledge_events_chunk_id", table_name="knowledge_events")
    op.drop_index("ix_knowledge_events_document_id", table_name="knowledge_events")
    op.drop_table("knowledge_events")

    # 1. Revert entities table changes
    op.drop_constraint("uq_entity_scope_type_name", "entities", type_="unique")
    op.drop_index("ix_entities_knowledge_scope_id", table_name="entities")
    op.drop_constraint("fk_entities_knowledge_scope", "entities", type_="foreignkey")
    op.drop_column("entities", "knowledge_scope_id")
    op.create_unique_constraint("entities_name_key", "entities", ["name"])

