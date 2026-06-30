import json
import uuid
from typing import List

from sqlalchemy import text
from sqlalchemy.orm import Session

from onyx.db.models import Entity
from onyx.db.models import Relation
from onyx.llm.factory import get_default_llm
from onyx.llm.models import ChatCompletionMessage
from onyx.llm.models import UserMessage
from onyx.tracing.flows import LLMFlow
from onyx.tracing.llm_utils import llm_generation_span


def extract_and_save_graph(text_content: str, db_session: Session) -> None:
    """
    Uses LLM to extract entities and relations from a text block,
    and commits/upserts them to the Postgres db.
    """
    try:
        llm = get_default_llm()
    except Exception as e:
        print(
            f"Skipping knowledge graph extraction: default LLM not configured. Detail: {e}"
        )
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
{text_content}
\"\"\"
"""

    messages: list[ChatCompletionMessage] = [UserMessage(content=prompt)]

    try:
        with llm_generation_span(
            llm=llm, flow=LLMFlow.KG_DEEP_EXTRACTION, input_messages=messages
        ):
            response = llm.invoke(messages)

        response_text = response.content.strip() if response.content else ""

        # Clean markdown wrappers if any
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()

        data = json.loads(response_text)
        entities_data = data.get("entities", [])
        relations_data = data.get("relations", [])

        with db_session.begin_nested():
            name_to_id = {}
            for ent in entities_data:
                name = ent.get("name", "").strip()
                if not name:
                    continue
                entity_type = ent.get("type", "concept").strip()
                description = ent.get("description", "").strip()

                existing = db_session.query(Entity).filter(Entity.name == name).first()
                if existing:
                    if description and (
                        not existing.description
                        or len(description) > len(existing.description)
                    ):
                        existing.description = description
                    name_to_id[name] = existing.entity_id
                else:
                    new_ent = Entity(
                        entity_id=uuid.uuid4(),
                        name=name,
                        entity_type=entity_type,
                        description=description,
                    )
                    db_session.add(new_ent)
                    name_to_id[name] = new_ent.entity_id

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
                        new_rel = Relation(
                            relation_id=uuid.uuid4(),
                            source_entity_id=src_id,
                            target_entity_id=tgt_id,
                            relation_type=rel_type,
                            description=description,
                        )
                        db_session.add(new_rel)
    except Exception as e:
        print(f"Error parsing/saving Knowledge Graph from LLM: {e}")


def expand_entities_cte(
    entity_names: List[str], depth: int = 2, db_session: Session | None = None
) -> List[dict]:
    """
    Performs recursive CTE entity expansion up to depth level.
    """
    if not entity_names or not db_session:
        return []

    query = text("""
        WITH RECURSIVE entity_expansion AS (
            -- Anchor member
            SELECT entity_id, name, entity_type, description, 0 as current_depth
            FROM entities
            WHERE name = ANY(:entity_names)

            UNION

            -- Recursive member
            SELECT e.entity_id, e.name, e.entity_type, e.description, ee.current_depth + 1
            FROM entities e
            JOIN relations r ON (r.target_entity_id = e.entity_id OR r.source_entity_id = e.entity_id)
            JOIN entity_expansion ee ON (ee.entity_id = r.source_entity_id OR ee.entity_id = r.target_entity_id)
            WHERE ee.current_depth < :depth
        )
        SELECT DISTINCT entity_id, name, entity_type, description FROM entity_expansion;
    """)

    result = db_session.execute(query, {"entity_names": entity_names, "depth": depth})

    expanded = []
    for row in result:
        expanded.append(
            {
                "entity_id": str(row.entity_id),
                "name": row.name,
                "entity_type": row.entity_type,
                "description": row.description,
            }
        )
    return expanded
