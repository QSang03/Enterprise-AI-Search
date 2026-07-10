import uuid
from sqlalchemy.orm import Session
from sqlalchemy import func, literal
from onyx.db.models import Entity, Relation, EntityAlias
from onyx.db.graph_service import expand_entities_cte

def test_graph_entity_matching_and_expansion(db_session: Session) -> None:
    # 1. Insert dummy entities
    e1 = Entity(
        entity_id=uuid.uuid4(),
        name="Đại học Quốc gia",
        entity_type="organization",
        description="Đại học lớn"
    )
    e2 = Entity(
        entity_id=uuid.uuid4(),
        name="Khoa CNTT",
        entity_type="organization",
        description="Khoa công nghệ thông tin"
    )
    db_session.add_all([e1, e2])
    db_session.flush()
    
    r1 = Relation(
        relation_id=uuid.uuid4(),
        source_entity_id=e1.entity_id,
        target_entity_id=e2.entity_id,
        relation_type="has_child"
    )
    db_session.add(r1)
    db_session.flush()
    
    # Test matching logic:
    candidate_text = "Tôi muốn tìm thông tin về Đại học Quốc gia Hà Nội"
    
    # Same SQL match logic as in search_tool.py:
    matched_entities = (
        db_session.query(Entity.name)
        .filter(literal(candidate_text).ilike(func.concat("%", Entity.name, "%")))
        .all()
    )
    matched_names = [row[0] for row in matched_entities if row[0]]
    
    assert "Đại học Quốc gia" in matched_names
    
    # Expand
    expanded_nodes = expand_entities_cte(
        entity_names=matched_names,
        depth=1,
        db_session=db_session
    )
    expanded_names = {node["name"] for node in expanded_nodes if node.get("name")}
    
    # The child entity "Khoa CNTT" is connected to "Đại học Quốc gia"
    assert "Khoa CNTT" in expanded_names
    
    db_session.rollback()


def test_graph_entity_matching_with_alias(db_session: Session) -> None:
    # 1. Insert dummy entities and aliases
    e1 = Entity(
        entity_id=uuid.uuid4(),
        name="Nghị định 15",
        normalized_name="nghị định 15",
        entity_type="law",
        description="Nghị định 15"
    )
    db_session.add(e1)
    db_session.flush()
    
    ea = EntityAlias(
        entity_id=e1.entity_id,
        alias="ND 15",
        normalized_alias="nd 15"
    )
    db_session.add(ea)
    db_session.flush()
    
    # Same SQL match logic as in updated search_tool.py:
    candidate_text = "Thông tin về ND 15"
    candidate_lower = candidate_text.lower()
    
    q1 = (
        db_session.query(Entity.name)
        .filter(
            func.lower(Entity.normalized_name).ilike(
                func.concat("%", candidate_lower, "%")
            )
            | literal(candidate_lower).ilike(
                func.concat(
                    "%", func.lower(Entity.normalized_name), "%"
                )
            )
        )
    )
    q2 = (
        db_session.query(Entity.name)
        .join(EntityAlias, EntityAlias.entity_id == Entity.entity_id)
        .filter(
            EntityAlias.normalized_alias.ilike(
                func.concat("%", candidate_lower, "%")
            )
            | literal(candidate_lower).ilike(
                func.concat(
                    "%", EntityAlias.normalized_alias, "%"
                )
            )
        )
    )
    matched_entities = q1.union(q2).all()
    matched_names = [row[0] for row in matched_entities if row[0]]
    
    assert "Nghị định 15" in matched_names
    
    db_session.rollback()


def test_search_tool_classify_query_mode(db_session: Session) -> None:
    from unittest.mock import MagicMock
    from onyx.tools.tool_implementations.search.search_tool import SearchTool
    from onyx.llm.interfaces import LLM
    from onyx.document_index.disabled import DisabledDocumentIndex

    
    mock_llm = MagicMock(spec=LLM)
    mock_response = MagicMock()
    mock_response.content = "standard"
    mock_llm.invoke.return_value = mock_response
    
    tool = SearchTool(
        tool_id=1,
        emitter=MagicMock(),
        user=None,
        persona_search_info=MagicMock(),
        llm=mock_llm,
        document_index=DisabledDocumentIndex(),
        user_selected_filters=None,
        project_id_filter=None,
        bypass_acl=True,
    )

    
    mode = tool._classify_query_mode("So sánh quy trình A và quy trình B", mock_llm)
    assert mode == "standard"
    
    mock_response.content = "fast"
    mode = tool._classify_query_mode("Thông tin về quy trình A", mock_llm)
    assert mode == "fast"


