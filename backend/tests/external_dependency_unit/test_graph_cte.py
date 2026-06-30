import uuid
from sqlalchemy.orm import Session
from onyx.db.models import Entity, Relation
from onyx.db.graph_service import expand_entities_cte

def test_expand_entities_cte(db_session: Session) -> None:
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
    e3 = Entity(
        entity_id=uuid.uuid4(),
        name="Bộ môn KHMT",
        entity_type="organization",
        description="Bộ môn Khoa học máy tính"
    )
    e4 = Entity(
        entity_id=uuid.uuid4(),
        name="Sinh viên A",
        entity_type="person",
        description="Sinh viên xuất sắc"
    )
    
    db_session.add_all([e1, e2, e3, e4])
    db_session.flush()
    
    r1 = Relation(
        relation_id=uuid.uuid4(),
        source_entity_id=e1.entity_id,
        target_entity_id=e2.entity_id,
        relation_type="has_child"
    )
    r2 = Relation(
        relation_id=uuid.uuid4(),
        source_entity_id=e2.entity_id,
        target_entity_id=e3.entity_id,
        relation_type="has_child"
    )
    r3 = Relation(
        relation_id=uuid.uuid4(),
        source_entity_id=e3.entity_id,
        target_entity_id=e4.entity_id,
        relation_type="has_member"
    )
    
    db_session.add_all([r1, r2, r3])
    db_session.flush()
    
    expanded_depth_1 = expand_entities_cte(
        entity_names=["Đại học Quốc gia"],
        depth=1,
        db_session=db_session
    )
    names_depth_1 = {e["name"] for e in expanded_depth_1}
    assert "Đại học Quốc gia" in names_depth_1
    assert "Khoa CNTT" in names_depth_1
    assert "Bộ môn KHMT" not in names_depth_1
    
    expanded_depth_2 = expand_entities_cte(
        entity_names=["Đại học Quốc gia"],
        depth=2,
        db_session=db_session
    )
    names_depth_2 = {e["name"] for e in expanded_depth_2}
    assert "Đại học Quốc gia" in names_depth_2
    assert "Khoa CNTT" in names_depth_2
    assert "Bộ môn KHMT" in names_depth_2
    assert "Sinh viên A" not in names_depth_2
    
    db_session.rollback()
