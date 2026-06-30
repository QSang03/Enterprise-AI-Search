"""wiki_and_graph_tables

Revision ID: 82aa138353f8
Revises: 04904a19fd5e
Create Date: 2026-06-29 10:36:19.396733

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '82aa138353f8'
down_revision = '04904a19fd5e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. wiki_pages
    op.create_table(
        "wiki_pages",
        sa.Column("wiki_id", sa.UUID(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_stale", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("wiki_id", "version")
    )
    
    # 2. wiki_citations
    op.create_table(
        "wiki_citations",
        sa.Column("citation_id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("wiki_id", sa.UUID(), nullable=False),
        sa.Column("wiki_version", sa.Integer(), nullable=False),
        sa.Column("section_title", sa.String(length=255), nullable=False),
        sa.Column("chunk_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["wiki_id", "wiki_version"], ["wiki_pages.wiki_id", "wiki_pages.version"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["chunk_id"], ["document_chunks_v2.chunk_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("citation_id")
    )
    
    # 3. wiki_stale_events
    op.create_table(
        "wiki_stale_events",
        sa.Column("event_id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("wiki_id", sa.UUID(), nullable=False),
        sa.Column("wiki_version", sa.Integer(), nullable=False),
        sa.Column("trigger_doc_id", sa.String(length=255), nullable=False),
        sa.Column("conflict_type", sa.String(length=50), nullable=False),
        sa.Column("conflict_description", sa.Text(), nullable=False),
        sa.Column("resolved", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["wiki_id", "wiki_version"], ["wiki_pages.wiki_id", "wiki_pages.version"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("event_id")
    )
    
    # 4. entities
    op.create_table(
        "entities",
        sa.Column("entity_id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("entity_id"),
        sa.UniqueConstraint("name")
    )
    
    # 5. relations
    op.create_table(
        "relations",
        sa.Column("relation_id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("source_entity_id", sa.UUID(), nullable=False),
        sa.Column("target_entity_id", sa.UUID(), nullable=False),
        sa.Column("relation_type", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["source_entity_id"], ["entities.entity_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_entity_id"], ["entities.entity_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("relation_id")
    )


def downgrade() -> None:
    op.drop_table("relations")
    op.drop_table("entities")
    op.drop_table("wiki_stale_events")
    op.drop_table("wiki_citations")
    op.drop_table("wiki_pages")
