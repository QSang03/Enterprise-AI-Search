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

import datetime
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
from onyx.db.models import RelationEvidence
from onyx.db.models import KnowledgeEvent
from onyx.db.models import EventEntity
from onyx.db.rag_upgrade_models import DocumentChunkV2
from onyx.llm.factory import get_default_llm
from onyx.llm.models import ChatCompletionMessage
from onyx.llm.models import UserMessage
from onyx.tracing.flows import LLMFlow
from onyx.tracing.llm_utils import llm_generation_span
from onyx.utils.logger import setup_logger

logger = setup_logger()


class NoDefaultLLMError(Exception):
    """Exception raised when the default LLM is not configured."""
    pass


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


def _parse_datetime(dt_str: str | None) -> datetime.datetime | None:
    if not dt_str:
        return None
    import datetime
    dt_str = str(dt_str).strip()
    # If only digits and length 4, assume year
    if dt_str.isdigit() and len(dt_str) == 4:
        try:
            return datetime.datetime(int(dt_str), 1, 1, tzinfo=datetime.timezone.utc)
        except ValueError:
            pass
    # If YYYY-MM
    if re.match(r"^\d{4}-\d{2}$", dt_str):
        try:
            parts = dt_str.split("-")
            return datetime.datetime(int(parts[0]), int(parts[1]), 1, tzinfo=datetime.timezone.utc)
        except ValueError:
            pass
    # Try general ISO parsing
    for fmt in (
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
    ):
        try:
            dt = datetime.datetime.strptime(dt_str, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=datetime.timezone.utc)
            return dt
        except ValueError:
            continue
    try:
        # standard ISO format fallback
        dt = datetime.datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return dt
    except Exception:
        return None


def _upsert_entity_with_alias(
    name: str,
    entity_type: str,
    description: str,
    db_session: Session,
    knowledge_scope_id: int | None = None,
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
        .filter(
            func.lower(Entity.normalized_name) == normalized_key,
            Entity.entity_type == entity_type,
            Entity.knowledge_scope_id == knowledge_scope_id,
        )
        .first()
    )

    if existing is None:
        # Try exact name match as fallback.
        existing = (
            db_session.query(Entity)
            .filter(
                Entity.name == canonical,
                Entity.entity_type == entity_type,
                Entity.knowledge_scope_id == knowledge_scope_id,
            )
            .first()
        )

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
            knowledge_scope_id=knowledge_scope_id,
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
    chunk: "DocumentChunkV2",
    db_session: Session,
    knowledge_scope_id: int | None = None,
    extraction_job_id: uuid.UUID | None = None,
    timeout: int = 600,
) -> None:
    """Extract KnowledgeEvents, entities, and relations from a single ``chunk`` using the default LLM.

    Saves structured events (KnowledgeEvent) and join relationships to Postgres.
    """
    if not chunk or not chunk.text_raw or not chunk.text_raw.strip():
        return

    doc_id = chunk.doc_id

    try:
        llm = get_default_llm()
    except Exception as e:
        raise NoDefaultLLMError(
            f"Skipping knowledge graph extraction: default LLM not configured. Detail: {e}"
        ) from e

    prompt = f"""Bạn là chuyên gia trích xuất đồ thị tri thức (Knowledge Graph) và sự kiện (Knowledge Events) từ văn bản tiếng Việt.
Hãy phân tích đoạn văn bản sau và trích xuất tất cả các sự kiện (Events) quan trọng và thực thể (Entities) liên quan, cũng như các mối quan hệ (Relations) trực tiếp giữa các thực thể đó.

Định dạng đầu ra BẮT BUỘC là JSON duy nhất có cấu trúc như sau (không kèm markdown block hay văn bản giải thích):
{{
  "events": [
    {{
      "title": "Tiêu đề ngắn gọn của sự kiện",
      "summary": "Tóm tắt sự kiện",
      "content": "Câu văn/Đoạn văn chính xác chứa bằng chứng (evidence) về sự kiện này trong văn bản",
      "category": "Loại sự kiện (ví dụ: Quy định pháp luật, Giao dịch, Hành động tổ chức, Sự kiện lịch sử)",
      "event_time_start": "Thời gian bắt đầu sự kiện (định dạng YYYY-MM-DD hoặc ISO-8601 nếu có, nếu không thì để trống)",
      "event_time_end": "Thời gian kết thúc sự kiện (định dạng tương tự)",
      "confidence": 0.9,
      "entities": [
        {{
          "name": "Tên thực thể tham gia vào sự kiện",
          "type": "Loại thực thể (ví dụ: law, organization, person, document, concept)",
          "role": "Vai trò của thực thể trong sự kiện (ví dụ: chủ thể hành động, đối tượng chịu tác động, địa điểm)",
          "evidence_text": "Câu văn chứa bằng chứng về vai trò của thực thể này",
          "weight": 0.8
        }}
      ]
    }}
  ],
  "relations": [
    {{
      "source_entity": "Tên thực thể nguồn",
      "target_entity": "Tên thực thể đích",
      "relation_type": "Loại quan hệ (ví dụ: amends, applies_to, member_of, reports_to)",
      "description": "Mô tả mối quan hệ"
    }}
  ]
}}

Lưu ý:
- Phải đảm bảo tính chính xác cực kỳ cao.
- Trích xuất "content" và "evidence_text" phải là các câu thực tế xuất hiện trong văn bản gốc.
- Định dạng JSON phải chuẩn xác và không bị lỗi cú pháp.

Văn bản cần phân tích:
\"\"\"
{chunk.text_raw}
\"\"\"
"""

    messages: list[ChatCompletionMessage] = [UserMessage(content=prompt)]

    try:
        with llm_generation_span(
            llm=llm, flow=LLMFlow.KG_EVENT_EXTRACTION, input_messages=messages
        ):
            # Configure LLM timeout override clamped to remaining budget.
            response = llm.invoke(messages, timeout_override=timeout)

        response_text = response.content.strip() if response.content else ""

        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()

        data = json.loads(response_text)
        events_data = data.get("events", [])
        relations_data = data.get("relations", [])

        with db_session.begin_nested():
            name_to_id: dict[str, uuid.UUID] = {}

            # Process Events first, and collect all entities
            for idx, ev_data in enumerate(events_data):
                title = ev_data.get("title", "").strip()
                if not title:
                    continue
                content = ev_data.get("content", "").strip() or chunk.text_raw[:500]
                summary = ev_data.get("summary", "").strip() or None
                category = ev_data.get("category", "").strip() or None
                time_start = _parse_datetime(ev_data.get("event_time_start"))
                time_end = _parse_datetime(ev_data.get("event_time_end"))
                confidence = ev_data.get("confidence")
                if confidence is not None:
                    try:
                        confidence = float(confidence)
                    except ValueError:
                        confidence = 1.0

                import hashlib
                # Generate deterministic event_id UUID based on doc, sibling_order, index, title
                hash_input = f"{doc_id}_{chunk.sibling_order}_{idx}_{title}"
                hash_bytes = hashlib.md5(hash_input.encode("utf-8")).digest()
                event_uuid = uuid.UUID(bytes=hash_bytes)

                # Create the KnowledgeEvent
                event_obj = KnowledgeEvent(
                    event_id=event_uuid,
                    document_id=doc_id,
                    chunk_id=chunk.chunk_id,
                    title=title,
                    summary=summary,
                    content=content,
                    category=category,
                    event_time_start=time_start,
                    event_time_end=time_end,
                    confidence=confidence,
                    extraction_job_id=extraction_job_id,
                )
                db_session.add(event_obj)
                db_session.flush()

                # Process entities in the event
                for ent in ev_data.get("entities", []):
                    raw_name = ent.get("name", "").strip()
                    if not raw_name:
                        continue
                    entity_type = ent.get("type", "concept").strip()
                    description = ent.get("evidence_text", "").strip()

                    eid = _upsert_entity_with_alias(
                        raw_name,
                        entity_type,
                        description,
                        db_session,
                        knowledge_scope_id=knowledge_scope_id,
                    )
                    if eid is not None:
                        name_to_id[raw_name] = eid

                        # Create EventEntity link
                        role = ent.get("role", "").strip() or None
                        evidence = ent.get("evidence_text", "").strip() or None
                        ent_weight = ent.get("weight")
                        if ent_weight is not None:
                            try:
                                ent_weight = float(ent_weight)
                            except ValueError:
                                ent_weight = 1.0

                        event_ent_obj = EventEntity(
                            id=uuid.uuid4(),
                            event_id=event_obj.event_id,
                            entity_id=eid,
                            role=role,
                            evidence_text=evidence,
                            weight=ent_weight,
                        )
                        db_session.add(event_ent_obj)

            db_session.flush()

            # Process legacy relations if both source and target entities resolved
            for rel in relations_data:
                src_name = rel.get("source_entity", "").strip()
                tgt_name = rel.get("target_entity", "").strip()
                rel_type = rel.get("relation_type", "associated_with").strip()
                description = rel.get("description", "").strip()

                src_id = name_to_id.get(src_name)
                tgt_id = name_to_id.get(tgt_name)

                # Fallback: if we haven't seen these entities in events, upsert them globally within scope
                if not src_id and src_name:
                    src_id = _upsert_entity_with_alias(
                        src_name, "concept", "", db_session, knowledge_scope_id=knowledge_scope_id
                    )
                    if src_id:
                        name_to_id[src_name] = src_id

                if not tgt_id and tgt_name:
                    tgt_id = _upsert_entity_with_alias(
                        tgt_name, "concept", "", db_session, knowledge_scope_id=knowledge_scope_id
                    )
                    if tgt_id:
                        name_to_id[tgt_name] = tgt_id

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
                        rel_id = uuid.uuid4()
                        db_session.add(
                            Relation(
                                relation_id=rel_id,
                                source_entity_id=src_id,
                                target_entity_id=tgt_id,
                                relation_type=rel_type,
                                description=description,
                            )
                        )
                    else:
                        rel_id = existing_rel.relation_id

                    # Upsert RelationEvidence linking the relation to the document chunk
                    evidence_exists = (
                        db_session.query(RelationEvidence)
                        .filter(
                            RelationEvidence.relation_id == rel_id,
                            RelationEvidence.document_id == doc_id,
                            RelationEvidence.chunk_id == chunk.chunk_id,
                            RelationEvidence.extraction_job_id == extraction_job_id,
                        )
                        .first()
                    )
                    if not evidence_exists:
                        db_session.add(
                            RelationEvidence(
                                relation_id=rel_id,
                                document_id=doc_id,
                                chunk_id=chunk.chunk_id,
                                extraction_job_id=extraction_job_id,
                                evidence_text=description,
                            )
                        )
    except Exception as e:
        logger.exception("Error parsing/saving Knowledge Graph from LLM")
        raise


_DIRECTIONAL_RELATION_TYPES = [
    "supersedes",
    "reports_to",
    "applies_to",
    "contains",
    "before",
    "after",
]


def expand_entities_cte(
    entity_names: List[str],
    depth: int = 2,
    db_session: Session | None = None,
    user_email: str | None = None,
    user_groups: List[str] | None = None,
    bypass_acl: bool = False,
) -> List[dict]:
    """Recursive CTE entity expansion up to ``depth`` hops in the relation graph.

    Matches entity names against both ``entities.name`` (canonical) and
    ``entity_aliases.alias`` so alias-based queries also trigger expansion.
    """
    if not entity_names or not db_session:
        return []

    # Normalize input names for lookup.
    normalized_inputs = [n.lower() for n in entity_names]
    user_groups_param = user_groups if user_groups is not None else []

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
            SELECT DISTINCT e.entity_id, e.name, e.entity_type, e.description, ee.current_depth + 1
            FROM entity_expansion ee
            JOIN relations r ON (
                -- Non-directional: bidirectional walk
                (
                    NOT (r.relation_type = ANY(:directional_types))
                    AND (ee.entity_id = r.source_entity_id OR ee.entity_id = r.target_entity_id)
                )
                -- Directional: only walk from source to target
                OR (
                    r.relation_type = ANY(:directional_types)
                    AND r.source_entity_id = ee.entity_id
                )
            )
            JOIN entities e ON (
                (
                    NOT (r.relation_type = ANY(:directional_types))
                    AND (e.entity_id = r.source_entity_id OR e.entity_id = r.target_entity_id)
                    AND e.entity_id != ee.entity_id
                )
                OR (
                    r.relation_type = ANY(:directional_types)
                    AND r.target_entity_id = e.entity_id
                )
            )
            LEFT JOIN relation_evidence re ON re.relation_id = r.relation_id
            LEFT JOIN document_by_connector_credential_pair dbcc ON dbcc.id = re.document_id
            LEFT JOIN connector_credential_pair ccp ON (
                ccp.connector_id = dbcc.connector_id
                AND ccp.credential_id = dbcc.credential_id
            )
            LEFT JOIN document d ON d.id = re.document_id
            WHERE ee.current_depth < :depth
              AND (:bypass_acl = TRUE OR re.relation_id IS NULL OR (
                  ccp.status != 'deleting'
                  AND (
                      ccp.access_type = 'public'
                      OR d.is_public = TRUE
                      OR (:user_email IS NOT NULL AND :user_email = ANY(d.external_user_emails))
                      OR (d.external_user_group_ids && CAST(:user_groups AS VARCHAR[]))
                  )
              ))
        )
        SELECT DISTINCT entity_id, name, entity_type, description FROM entity_expansion;
    """)

    result = db_session.execute(
        query,
        {
            "normalized_names": normalized_inputs,
            "depth": depth,
            "directional_types": _DIRECTIONAL_RELATION_TYPES,
            "bypass_acl": bypass_acl,
            "user_email": user_email,
            "user_groups": user_groups_param,
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

