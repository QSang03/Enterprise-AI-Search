import uuid
from sqlalchemy.orm import Session
from sqlalchemy import func, literal
from onyx.db.models import Entity, Relation
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
