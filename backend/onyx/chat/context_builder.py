import uuid
from typing import List, Any
from sqlalchemy.orm import Session

from onyx.db.rag_upgrade_models import DocumentChunkV2
from onyx.utils.logger import setup_logger

logger = setup_logger()

def check_overlap(text1: str, text2: str) -> float:
    """Calculates Jaccard similarity at the word level."""
    words1 = set(text1.lower().split())
    words2 = set(text2.lower().split())
    if not words1 or not words2:
        return 0.0
    intersection = words1.intersection(words2)
    return len(intersection) / min(len(words1), len(words2))

def deduplicate_chunks(chunks: List[Any], overlap_threshold: float = 0.85) -> List[Any]:
    """Filters out duplicate chunks that have overlap >= threshold.
    
    Prefers chunks with higher scores (assumed sorted descending by score).
    """
    deduplicated: List[Any] = []
    for chunk in chunks:
        is_duplicate = False
        for existing in deduplicated:
            # Check overlap between contents
            sim = check_overlap(chunk.content, existing.content)
            if sim >= overlap_threshold:
                is_duplicate = True
                logger.info(
                    "Filtering out duplicate chunk %s (overlap %s >= %s with %s)",
                    chunk.unique_id if hasattr(chunk, "unique_id") else chunk.chunk_id,
                    format(sim, ".2f"),
                    overlap_threshold,
                    existing.unique_id if hasattr(existing, "unique_id") else existing.chunk_id,
                )
                break
        if not is_duplicate:
            deduplicated.append(chunk)
    return deduplicated

def expand_parent_context(chunks: List[Any], db_session: Session) -> List[Any]:
    """For each chunk, attempts to retrieve its parent section context from Postgres
    and prepends it if available.
    """
    expanded_chunks = []
    for chunk in chunks:
        doc_id = getattr(chunk, "document_id", None)
        chunk_idx = getattr(chunk, "chunk_id", None)
        
        if not doc_id or chunk_idx is None:
            expanded_chunks.append(chunk)
            continue
            
        try:
            # Fetch the DocumentChunkV2 record for the current chunk
            current_db_chunk = db_session.query(DocumentChunkV2).filter_by(
                doc_id=doc_id,
                sibling_order=chunk_idx
            ).first()
            
            if current_db_chunk and current_db_chunk.parent_chunk_id:
                # Fetch parent chunk raw text
                parent_db_chunk = db_session.query(DocumentChunkV2).filter_by(
                    chunk_id=current_db_chunk.parent_chunk_id
                ).first()
                
                if parent_db_chunk and parent_db_chunk.text_raw:
                    # Prepend parent text to the current chunk content
                    # Using a separator to keep context clear
                    logger.info(
                        "Expanding chunk %s__%s with parent chunk context (%s chars)",
                        doc_id, chunk_idx, len(parent_db_chunk.text_raw)
                    )
                    # We can clone the chunk model or modify the model_copy
                    new_chunk = chunk.model_copy()
                    new_chunk.content = f"{parent_db_chunk.text_raw}\n\n{chunk.content}"
                    expanded_chunks.append(new_chunk)
                    continue
                    
        except Exception:
            logger.exception("Failed to expand parent context for chunk %s__%s", doc_id, chunk_idx)
            
        expanded_chunks.append(chunk)
        
    return expanded_chunks

def build_search_context(chunks: List[Any], db_session: Session) -> List[Any]:
    """Orchestrates deduplication and parent section expansion."""
    # Step 1: Deduplicate chunks based on similarity
    deduped = deduplicate_chunks(chunks)
    # Step 2: Expand parent section context from Postgres
    expanded = expand_parent_context(deduped, db_session)
    return expanded
