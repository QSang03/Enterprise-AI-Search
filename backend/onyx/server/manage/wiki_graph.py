from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from onyx.db.engine.sql_engine import get_session
from onyx.db.models import Entity, Relation, User
from onyx.auth.users import current_user
from onyx.db.graph_service import expand_entities_cte

router = APIRouter(prefix="/wiki/graph", tags=["wiki-graph"])

class ExpandRequest(BaseModel):
    entity_names: List[str]
    depth: Optional[int] = 2

class EntityResponse(BaseModel):
    entity_id: str
    name: str
    entity_type: str
    description: Optional[str]

class RelationResponse(BaseModel):
    relation_id: str
    source_entity_id: str
    target_entity_id: str
    relation_type: str
    description: Optional[str]

@router.get("/entities")
def list_entities(db_session: Session = Depends(get_session), _: User = Depends(current_user)) -> List[EntityResponse]:
    entities = db_session.query(Entity).all()
    return [
        EntityResponse(
            entity_id=str(e.entity_id),
            name=e.name,
            entity_type=e.entity_type,
            description=e.description
        ) for e in entities
    ]

@router.get("/relations")
def list_relations(db_session: Session = Depends(get_session), _: User = Depends(current_user)) -> List[RelationResponse]:
    relations = db_session.query(Relation).all()
    return [
        RelationResponse(
            relation_id=str(r.relation_id),
            source_entity_id=str(r.source_entity_id),
            target_entity_id=str(r.target_entity_id),
            relation_type=r.relation_type,
            description=r.description
        ) for r in relations
    ]

@router.post("/expand")
def expand_entities(request: ExpandRequest, db_session: Session = Depends(get_session), _: User = Depends(current_user)) -> List[EntityResponse]:
    expanded = expand_entities_cte(
        entity_names=request.entity_names,
        depth=request.depth or 2,
        db_session=db_session
    )
    return [
        EntityResponse(
            entity_id=e["entity_id"],
            name=e["name"],
            entity_type=e["entity_type"],
            description=e["description"]
        ) for e in expanded
    ]
