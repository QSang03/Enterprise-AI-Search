import datetime
from typing import Any
from onyx.db.models import KnowledgeEvent

def prepare_knowledge_event_vespa_doc(
    event: KnowledgeEvent,
    entity_names: list[str],
    access_control_list: list[str],
    is_public: bool,
    doc_updated_at: datetime.datetime | None,
    title_embed: list[float],
    content_embed: list[float],
    tenant_id: str | None = None,
    sibling_order: int | None = None,
) -> dict[str, Any]:
    """Prepares a knowledge event dict for Vespa indexing using precomputed embeddings and ACLs."""
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
        "access_control_list": access_control_list,
        "is_public": is_public,
    }

    if tenant_id:
        doc["tenant_id"] = tenant_id

    return doc

