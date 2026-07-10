import datetime
from typing import Any
from onyx.db.models import KnowledgeEvent
from onyx.natural_language_processing.search_nlp_models import EmbeddingModel

def prepare_knowledge_event_vespa_doc(
    event: KnowledgeEvent,
    entity_names: list[str],
    allowed_users: list[str],
    allowed_groups: list[str],
    is_public: bool,
    doc_updated_at: datetime.datetime | None,
    embedding_model: EmbeddingModel,
    tenant_id: str | None = None,
    sibling_order: int | None = None,
) -> dict[str, Any]:
    """Generates embeddings and prepares a knowledge event dict for Vespa indexing."""
    # Generate embeddings for title and content
    title_embed = embedding_model.encode([event.title])[0]
    content_embed = embedding_model.encode([event.content])[0]

    updated_at_timestamp = int(doc_updated_at.timestamp()) if doc_updated_at else 0

    doc = {
        "event_id": str(event.event_id),
        "document_id": event.document_id,
        "chunk_id": str(sibling_order) if sibling_order is not None else "",

        "entity_names": entity_names,
        "event_title": event.title,
        "event_content": event.content,
        "event_category": event.category or "",
        "title_embedding": {
            "values": title_embed
        },
        "content_embedding": {
            "values": content_embed
        },
        "confidence": float(event.confidence) if event.confidence is not None else 1.0,
        "doc_updated_at": updated_at_timestamp,
        "access_control_list": allowed_users + allowed_groups,
        "is_public": is_public,
    }

    if tenant_id:
        doc["tenant_id"] = tenant_id

    return doc
