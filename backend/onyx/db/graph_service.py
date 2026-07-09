"""Knowledge Graph extraction and entity expansion services.

Key responsibilities:
- ``extract_and_save_graph``: LLM-based entity/relation extraction from selected
  document chunks, with smart chunk scoring (Mức 3) and entity normalization /
  alias storage (Mức 5).
- ``expand_entities_cte``: Recursive Postgres CTE that walks the entity graph to
  find related entity names for search query expansion.
- ``normalize_entity_name``: Returns the (canonical_name, normalized_key) tuple
  used for entity deduplication and alias lookup.
"""

import json
import re
import unicodedata
import uuid
from typing import List

from sqlalchemy import func
from sqlalchemy import text
from sqlalchemy.orm import Session

from onyx.db.models import Entity
from onyx.db.models import EntityAlias
from onyx.db.models import Relation
from onyx.db.rag_upgrade_models import DocumentChunkV2
from onyx.llm.factory import get_default_llm
from onyx.llm.models import ChatCompletionMessage
from onyx.llm.models import UserMessage
from onyx.tracing.flows import LLMFlow
from onyx.tracing.llm_utils import llm_generation_span

# Maximum total characters sent to the LLM for graph extraction.
# ~8000 tokens ≈ ~32 000 characters for most models; we use a conservative limit.
_MAX_CHARS_FOR_EXTRACTION = 28_000

# --- Legal document code normalization patterns (Vietnamese) ---
# Maps common abbreviations to canonical forms.
_LEGAL_CODE_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bND\s*(\d+)", re.IGNORECASE), r"Nghị định \1"),
    (re.compile(r"\bNĐ\s*(\d+)", re.IGNORECASE), r"Nghị định \1"),
    (re.compile(r"\bQĐ\b", re.IGNORECASE), "Quyết định"),
    (re.compile(r"\bTT\s*(\d+)", re.IGNORECASE), r"Thông tư \1"),
    (re.compile(r"\bNQ\s*(\d+)", re.IGNORECASE), r"Nghị quyết \1"),
    (re.compile(r"\bLT\s*(\d+)", re.IGNORECASE), r"Luật \1"),
]

# Regex for counting noun candidates (used by skip logic and chunk scoring).
_NOUN_PATTERN = re.compile(
    r"(?:[A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴỶỸ]"
    r"[a-zàáâãèéêìíòóôõùúăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]+)",
    re.UNICODE,
)


def normalize_entity_name(name: str) -> tuple[str, str]:
    """Return ``(canonical_name, normalized_key)`` for an entity name.

    *canonical_name* – human-readable canonical form after legal-code expansion.
    *normalized_key* – lowercase, stripped, NFC-normalized form used as the
        deduplication and alias lookup key.
    """
    # 1. Unicode NFC normalization + trim.
    canonical = unicodedata.normalize("NFC", name.strip())

    # 2. Apply Vietnamese legal-code expansions.
    for pattern, replacement in _LEGAL_CODE_PATTERNS:
        canonical = pattern.sub(replacement, canonical)

    # 3. Collapse internal whitespace.
    canonical = re.sub(r"\s+", " ", canonical).strip()

    # 4. Normalized key: lowercase of canonical form.
    normalized_key = canonical.lower()

    return canonical, normalized_key


def _score_chunk(
    chunk: "DocumentChunkV2",
    idx: int,
    max_len: int,
    max_nouns: int,
) -> float:
    """Compute an importance score for a chunk.

    Factors:
    - Position bonus (first chunks carry title/abstract/introduction).
    - Length relative to the longest chunk in the batch.
    - Noun candidate density relative to the nouniest chunk.
    """
    pos_bonus = 3.0 if idx == 0 else (1.5 if idx <= 2 else 0.0)
    text = chunk.text_raw or ""
    len_score = 2.0 * (len(text) / max_len) if max_len else 0.0
    nouns = len(_NOUN_PATTERN.findall(text))
    noun_score = 2.5 * (nouns / max_nouns) if max_nouns else 0.0
    return pos_bonus + len_score + noun_score


def select_chunks_for_extraction(
    chunks: list["DocumentChunkV2"],
    max_chars: int = _MAX_CHARS_FOR_EXTRACTION,
) -> list["DocumentChunkV2"]:
    """Select the most informative chunks up to ``max_chars`` total characters.

    Chunks are scored by position, length, and noun-candidate density. The
    selected subset is returned in their original order so the concatenated
    text retains document flow.
    """
    if not chunks:
        return []

    max_len = max((len(c.text_raw or "") for c in chunks), default=1)
    max_nouns = max(
        (len(_NOUN_PATTERN.findall(c.text_raw or "")) for c in chunks), default=1
    )

    scored: list[tuple[float, int, "DocumentChunkV2"]] = [
        (_score_chunk(c, i, max_len, max_nouns), i, c) for i, c in enumerate(chunks)
    ]
    # Sort by score descending.
    scored.sort(key=lambda t: t[0], reverse=True)

    selected_indices: set[int] = set()
    total_chars = 0
    for _score, idx, chunk in scored:
        chunk_chars = len(chunk.text_raw or "")
        if total_chars + chunk_chars > max_chars:
            if not selected_indices:
                # Always include at least one chunk even if it exceeds the limit.
                selected_indices.add(idx)
            break
        selected_indices.add(idx)
        total_chars += chunk_chars

    # Return in original document order.
    return [c for i, c in enumerate(chunks) if i in selected_indices]


def _upsert_entity_with_alias(
    name: str,
    entity_type: str,
    description: str,
    db_session: Session,
) -> uuid.UUID | None:
    """Upsert an entity using normalized name for deduplication.

    If the raw ``name`` differs from the canonical form, the raw name is stored
    as an alias so alias-based search still finds it.

    Returns the entity_id or None if name is empty.
    """
    name = name.strip()
    if not name:
        return None

    canonical, normalized_key = normalize_entity_name(name)

    # Look up by normalized_name first (canonical match).
    existing = (
        db_session.query(Entity)
        .filter(func.lower(Entity.normalized_name) == normalized_key)
        .first()
    )

    if existing is None:
        # Try exact name match as fallback.
        existing = db_session.query(Entity).filter(Entity.name == canonical).first()

    if existing:
        # Update description if new one is longer.
        if description and (
            not existing.description or len(description) > len(existing.description)
        ):
            existing.description = description
        entity_id: uuid.UUID = existing.entity_id
    else:
        new_ent = Entity(
            entity_id=uuid.uuid4(),
            name=canonical,
            normalized_name=normalized_key,
            entity_type=entity_type,
            description=description,
        )
        db_session.add(new_ent)
        db_session.flush()
        entity_id = new_ent.entity_id

    # Store alias if the raw name differs from the canonical name.
    if name != canonical:
        _alias_normalized = name.lower()
        alias_exists = (
            db_session.query(EntityAlias)
            .filter(
                EntityAlias.entity_id == entity_id,
                EntityAlias.normalized_alias == _alias_normalized,
            )
            .first()
        )
        if not alias_exists:
            db_session.add(
                EntityAlias(
                    entity_id=entity_id,
                    alias=name,
                    normalized_alias=_alias_normalized,
                )
            )

    return entity_id


def extract_and_save_graph(
    chunks: list["DocumentChunkV2"],
    db_session: Session,
) -> None:
    """Extract entities and relations from ``chunks`` using the default LLM and
    persist them to Postgres.

    Uses smart chunk selection (Mức 3) to cap the LLM context window and
    entity normalization / alias storage (Mức 5) to keep the graph clean.
    """
    try:
        llm = get_default_llm()
    except Exception as e:
        print(
            f"Skipping knowledge graph extraction: default LLM not configured. Detail: {e}"
        )
        return

    selected = select_chunks_for_extraction(chunks)
    if not selected:
        return

    doc_text = "\n\n".join([c.text_raw for c in selected if c.text_raw])
    if not doc_text.strip():
        return

    prompt = f"""Bạn là chuyên gia trích xuất đồ thị tri thức (Knowledge Graph) từ văn bản tiếng Việt.
Hãy phân tích văn bản sau và trích xuất tất cả các thực thể (Entities) quan trọng và mối quan hệ (Relations) giữa chúng.

Định dạng đầu ra BẮT BUỘC là JSON duy nhất có cấu trúc như sau (không kèm markdown block hay văn bản giải thích):
{{
  "entities": [
    {{"name": "Tên thực thể", "type": "Loại thực thể ví dụ: law, organization, person, document", "description": "Mô tả chi tiết thực thể trong văn bản"}}
  ],
  "relations": [
    {{"source_entity": "Tên thực thể nguồn", "target_entity": "Tên thực thể đích", "relation_type": "Loại quan hệ ví dụ: amends, applies_to, supersedes, member_of", "description": "Mô tả chi tiết mối quan hệ này"}}
  ]
}}

Lưu ý:
- Phải đảm bảo tính chính xác cực kỳ cao.
- Tên thực thể trong relations phải khớp hoàn toàn với tên thực thể trong danh sách entities.

Văn bản cần phân tích:
\"\"\"
{doc_text}
\"\"\"
"""

    messages: list[ChatCompletionMessage] = [UserMessage(content=prompt)]

    try:
        with llm_generation_span(
            llm=llm, flow=LLMFlow.KG_DEEP_EXTRACTION, input_messages=messages
        ):
            response = llm.invoke(messages)

        response_text = response.content.strip() if response.content else ""

        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()

        data = json.loads(response_text)
        entities_data = data.get("entities", [])
        relations_data = data.get("relations", [])

        with db_session.begin_nested():
            name_to_id: dict[str, uuid.UUID] = {}
            for ent in entities_data:
                raw_name = ent.get("name", "").strip()
                if not raw_name:
                    continue
                entity_type = ent.get("type", "concept").strip()
                description = ent.get("description", "").strip()
                eid = _upsert_entity_with_alias(
                    raw_name, entity_type, description, db_session
                )
                if eid is not None:
                    name_to_id[raw_name] = eid

            db_session.flush()

            for rel in relations_data:
                src_name = rel.get("source_entity", "").strip()
                tgt_name = rel.get("target_entity", "").strip()
                rel_type = rel.get("relation_type", "associated_with").strip()
                description = rel.get("description", "").strip()

                src_id = name_to_id.get(src_name)
                tgt_id = name_to_id.get(tgt_name)

                if src_id and tgt_id:
                    existing_rel = (
                        db_session.query(Relation)
                        .filter(
                            Relation.source_entity_id == src_id,
                            Relation.target_entity_id == tgt_id,
                            Relation.relation_type == rel_type,
                        )
                        .first()
                    )
                    if not existing_rel:
                        db_session.add(
                            Relation(
                                relation_id=uuid.uuid4(),
                                source_entity_id=src_id,
                                target_entity_id=tgt_id,
                                relation_type=rel_type,
                                description=description,
                            )
                        )
    except Exception as e:
        print(f"Error parsing/saving Knowledge Graph from LLM: {e}")


def expand_entities_cte(
    entity_names: List[str], depth: int = 2, db_session: Session | None = None
) -> List[dict]:
    """Recursive CTE entity expansion up to ``depth`` hops in the relation graph.

    Matches entity names against both ``entities.name`` (canonical) and
    ``entity_aliases.alias`` so alias-based queries also trigger expansion.
    """
    if not entity_names or not db_session:
        return []

    # Normalize input names for lookup.
    normalized_inputs = [n.lower() for n in entity_names]

    # Resolve entity IDs via canonical name OR alias, then expand.
    query = text("""
        WITH RECURSIVE entity_expansion AS (
            -- Anchor: entities matched by canonical normalized_name or alias
            SELECT DISTINCT e.entity_id, e.name, e.entity_type, e.description, 0 as current_depth
            FROM entities e
            WHERE lower(e.normalized_name) = ANY(:normalized_names)
               OR lower(e.name) = ANY(:normalized_names)

            UNION

            SELECT DISTINCT e.entity_id, e.name, e.entity_type, e.description, 0 as current_depth
            FROM entities e
            JOIN entity_aliases ea ON ea.entity_id = e.entity_id
            WHERE ea.normalized_alias = ANY(:normalized_names)

            UNION

            -- Recursive: walk relations
            SELECT e.entity_id, e.name, e.entity_type, e.description, ee.current_depth + 1
            FROM entities e
            JOIN relations r ON (r.target_entity_id = e.entity_id OR r.source_entity_id = e.entity_id)
            JOIN entity_expansion ee ON (ee.entity_id = r.source_entity_id OR ee.entity_id = r.target_entity_id)
            WHERE ee.current_depth < :depth
        )
        SELECT DISTINCT entity_id, name, entity_type, description FROM entity_expansion;
    """)

    result = db_session.execute(
        query,
        {
            "normalized_names": normalized_inputs,
            "depth": depth,
        },
    )

    return [
        {
            "entity_id": str(row.entity_id),
            "name": row.name,
            "entity_type": row.entity_type,
            "description": row.description,
        }
        for row in result
    ]
