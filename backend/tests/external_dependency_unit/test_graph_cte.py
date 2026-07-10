import uuid
from sqlalchemy.orm import Session
from onyx.db.models import Entity, Relation, RelationEvidence
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


def test_expand_entities_cte_directional(db_session: Session) -> None:
    e1 = Entity(
        entity_id=uuid.uuid4(),
        name="Node A",
        entity_type="concept",
        description="A"
    )
    e2 = Entity(
        entity_id=uuid.uuid4(),
        name="Node B",
        entity_type="concept",
        description="B"
    )
    
    db_session.add_all([e1, e2])
    db_session.flush()
    
    # Directional relation from A (source) to B (target)
    r1 = Relation(
        relation_id=uuid.uuid4(),
        source_entity_id=e1.entity_id,
        target_entity_id=e2.entity_id,
        relation_type="supersedes"
    )
    db_session.add(r1)
    db_session.flush()
    
    # Expanding from source Node A should find Node B
    expanded_from_a = expand_entities_cte(
        entity_names=["Node A"],
        depth=1,
        db_session=db_session
    )
    names_from_a = {e["name"] for e in expanded_from_a}
    assert "Node B" in names_from_a
    
    # Expanding from target Node B should NOT find Node A
    expanded_from_b = expand_entities_cte(
        entity_names=["Node B"],
        depth=1,
        db_session=db_session
    )
    names_from_b = {e["name"] for e in expanded_from_b}
    assert "Node A" not in names_from_b
    
    db_session.rollback()


def test_expand_entities_cte_scope_filtering(db_session: Session) -> None:
    e1 = Entity(entity_id=uuid.uuid4(), name="Alpha", entity_type="concept")
    e2 = Entity(entity_id=uuid.uuid4(), name="Beta", entity_type="concept")
    e3 = Entity(entity_id=uuid.uuid4(), name="Gamma", entity_type="concept")
    db_session.add_all([e1, e2, e3])
    db_session.flush()
    
    r1 = Relation(
        relation_id=uuid.uuid4(),
        source_entity_id=e1.entity_id,
        target_entity_id=e2.entity_id,
        relation_type="linked_to"
    )
    r2 = Relation(
        relation_id=uuid.uuid4(),
        source_entity_id=e2.entity_id,
        target_entity_id=e3.entity_id,
        relation_type="linked_to"
    )
    db_session.add_all([r1, r2])
    db_session.flush()
    
    # Add relation evidence
    rev1 = RelationEvidence(
        relation_id=r1.relation_id,
        document_id="allowed_doc"
    )
    rev2 = RelationEvidence(
        relation_id=r2.relation_id,
        document_id="forbidden_doc"
    )
    db_session.add_all([rev1, rev2])
    db_session.flush()
    
    # Case 1: No filters -> should expand normally to Alpha, Beta, Gamma
    expanded_no_filter = expand_entities_cte(
        entity_names=["Alpha"],
        depth=2,
        db_session=db_session
    )
    names_no_filter = {e["name"] for e in expanded_no_filter}
    assert "Beta" in names_no_filter
    assert "Gamma" in names_no_filter
    
    # Case 2: allowed_document_ids=["allowed_doc"] -> should expand to Beta, but NOT Gamma
    expanded_filtered = expand_entities_cte(
        entity_names=["Alpha"],
        depth=2,
        db_session=db_session,
        allowed_document_ids=["allowed_doc"]
    )
    names_filtered = {e["name"] for e in expanded_filtered}
    assert "Beta" in names_filtered
    assert "Gamma" not in names_filtered
    
    db_session.rollback()
