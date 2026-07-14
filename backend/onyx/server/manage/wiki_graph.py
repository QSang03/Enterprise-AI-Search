from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func
from typing import Any, List, Optional
from pydantic import BaseModel
from onyx.db.engine.sql_engine import get_session
from onyx.db.models import Entity, Relation, WikiPage, User
from onyx.auth.users import current_user
from onyx.db.graph_service import expand_entities_cte

router = APIRouter(prefix="/wiki/graph", tags=["wiki-graph"])


# ── Paginated response models ────────────────────────────────────────

class CountsResponse(BaseModel):
    wikis: int
    entities: int
    relations: int


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


class ExpandRequest(BaseModel):
    entity_names: List[str]
    depth: Optional[int] = 2


# ── Count endpoint ────────────────────────────────────────────────────

@router.get("/counts")
def get_counts(
    db_session: Session = Depends(get_session),
    _: User = Depends(current_user),
) -> CountsResponse:
    """Lightweight count for tab badges — avoids fetching all rows."""
    wiki_count = db_session.query(func.count(WikiPage.wiki_id)).scalar() or 0
    entity_count = db_session.query(func.count(Entity.entity_id)).scalar() or 0
    relation_count = (
        db_session.query(func.count(Relation.relation_id)).scalar() or 0
    )
    return CountsResponse(
        wikis=wiki_count,
        entities=entity_count,
        relations=relation_count,
    )


# ── Paginated list endpoints ──────────────────────────────────────────

@router.get("/entities")
def list_entities(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    search: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    db_session: Session = Depends(get_session),
    _: User = Depends(current_user),
) -> dict[str, Any]:
    """Paginated entity list with optional search & type filter."""
    query = db_session.query(Entity)

    if search:
        term = f"%{search}%"
        query = query.filter(
            Entity.name.ilike(term)
            | Entity.description.ilike(term)
        )
    if entity_type:
        query = query.filter(Entity.entity_type == entity_type)

    total = query.count()
    rows = (
        query.order_by(Entity.name)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "items": [
            {
                "entity_id": str(e.entity_id),
                "name": e.name,
                "entity_type": e.entity_type,
                "description": e.description,
            }
            for e in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/relations")
def list_relations(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    search: Optional[str] = Query(None),
    db_session: Session = Depends(get_session),
    _: User = Depends(current_user),
) -> dict[str, Any]:
    """Paginated relation list with optional search."""
    SourceEntity = aliased(Entity)
    TargetEntity = aliased(Entity)

    query = (
        db_session.query(
            Relation,
            SourceEntity.name.label("source_name"),
            TargetEntity.name.label("target_name"),
        )
        .join(SourceEntity, Relation.source_entity_id == SourceEntity.entity_id)
        .join(TargetEntity, Relation.target_entity_id == TargetEntity.entity_id)
    )

    if search:
        term = f"%{search}%"
        query = query.filter(
            SourceEntity.name.ilike(term)
            | TargetEntity.name.ilike(term)
            | Relation.relation_type.ilike(term)
            | Relation.description.ilike(term)
        )

    total = query.count()
    rows = (
        query.order_by(Relation.relation_type)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "items": [
            {
                "relation_id": str(r.Relation.relation_id),
                "source_entity_id": str(r.Relation.source_entity_id),
                "target_entity_id": str(r.Relation.target_entity_id),
                "relation_type": r.Relation.relation_type,
                "description": r.Relation.description,
            }
            for r in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/expand")
def expand_entities(
    request: ExpandRequest,
    db_session: Session = Depends(get_session),
    _: User = Depends(current_user),
) -> List[EntityResponse]:
    expanded = expand_entities_cte(
        entity_names=request.entity_names,
        depth=request.depth or 2,
        db_session=db_session,
    )
    return [
        EntityResponse(
            entity_id=e["entity_id"],
            name=e["name"],
            entity_type=e["entity_type"],
            description=e["description"],
        )
        for e in expanded
    ]
