from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from onyx.auth.users import current_curator_or_admin_user, current_user
from onyx.db.engine.sql_engine import get_session
from onyx.db.models import User, UserGroup
from onyx.db.user_group import (
    get_user_group_by_id,
    get_user_group_by_name,
    fetch_all_user_groups,
    insert_user_group,
    update_user_group,
    rename_user_group,
    delete_user_group,
    update_agent_group_sharing,
)
from onyx.server.models import MinimalUserSnapshot
from onyx.server.documents.models import CCPairSummary
from onyx.server.features.document_set.models import DocumentSetSummary
from onyx.server.features.persona.models import MinimalPersonaSnapshot
from onyx.configs.constants import PUBLIC_API_TAGS

router = APIRouter(prefix="/manage/admin/user-group", tags=PUBLIC_API_TAGS)


class UserGroupCreateRequest(BaseModel):
    name: str
    user_ids: list[UUID] = Field(default_factory=list)
    cc_pair_ids: list[int] = Field(default_factory=list)


class UserGroupUpdateRequest(BaseModel):
    user_ids: list[UUID]
    cc_pair_ids: list[int]


class UserGroupRenameRequest(BaseModel):
    id: int
    name: str


class UserGroupAgentSharingRequest(BaseModel):
    added_agent_ids: list[int]
    removed_agent_ids: list[int]


class UserGroupResponse(BaseModel):
    id: int
    name: str
    users: list[MinimalUserSnapshot]
    curator_ids: list[UUID]
    cc_pairs: list[CCPairSummary]
    document_sets: list[DocumentSetSummary]
    personas: list[MinimalPersonaSnapshot]
    is_up_to_date: bool
    is_up_for_deletion: bool
    is_default: bool


def _user_group_to_response(group: UserGroup, db_session: Session) -> UserGroupResponse:
    from sqlalchemy import select
    from onyx.db.models import User__UserGroup

    # Fetch curator user IDs
    curators = db_session.scalars(
        select(User__UserGroup.user_id).where(
            (User__UserGroup.user_group_id == group.id)
            & (User__UserGroup.is_curator == True)
        )
    ).all()
    curator_ids = [c for c in curators if c is not None]

    return UserGroupResponse(
        id=group.id,
        name=group.name,
        users=[
            MinimalUserSnapshot(id=u.id, email=u.email, is_active=u.is_active)
            for u in group.users
        ],
        curator_ids=curator_ids,
        cc_pairs=[
            CCPairSummary(
                id=cc.id,
                name=cc.name or "",
                source=cc.connector.source,
                access_type=cc.access_type,
            )
            for cc in group.cc_pairs
        ],
        document_sets=[
            DocumentSetSummary.from_model(ds) for ds in group.document_sets
        ],
        personas=[
            MinimalPersonaSnapshot.from_model(p)
            for p in group.personas
        ],
        is_up_to_date=group.is_up_to_date,
        is_up_for_deletion=group.is_up_for_deletion,
        is_default=group.is_default,
    )


@router.get("/mine")
def list_my_user_groups(
    user: User = Depends(current_user),
    db_session: Session = Depends(get_session),
) -> list[UserGroupResponse]:
    from sqlalchemy import select
    from onyx.db.models import User__UserGroup

    group_ids = db_session.scalars(
        select(User__UserGroup.user_group_id).where(User__UserGroup.user_id == user.id)
    ).all()

    groups = db_session.scalars(
        select(UserGroup).where(UserGroup.id.in_(group_ids))
    ).all() if group_ids else []

    return [_user_group_to_response(g, db_session) for g in groups]


@router.get("")
def list_user_groups(
    user: User = Depends(current_curator_or_admin_user),
    db_session: Session = Depends(get_session),
) -> list[UserGroupResponse]:
    groups = fetch_all_user_groups(db_session)
    return [_user_group_to_response(g, db_session) for g in groups]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_user_group(
    request: UserGroupCreateRequest,
    user: User = Depends(current_curator_or_admin_user),
    db_session: Session = Depends(get_session),
) -> UserGroupResponse:
    try:
        group = insert_user_group(
            db_session=db_session,
            name=request.name,
            user_ids=request.user_ids,
            cc_pair_ids=request.cc_pair_ids,
        )
        return _user_group_to_response(group, db_session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/rename")
def rename_group(
    request: UserGroupRenameRequest,
    user: User = Depends(current_curator_or_admin_user),
    db_session: Session = Depends(get_session),
) -> None:
    try:
        rename_user_group(
            db_session=db_session,
            user_group_id=request.id,
            name=request.name,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{user_group_id}")
def update_group(
    user_group_id: int,
    request: UserGroupUpdateRequest,
    user: User = Depends(current_curator_or_admin_user),
    db_session: Session = Depends(get_session),
) -> None:
    try:
        update_user_group(
            db_session=db_session,
            user_group_id=user_group_id,
            user_ids=request.user_ids,
            cc_pair_ids=request.cc_pair_ids,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{user_group_id}")
def delete_group(
    user_group_id: int,
    user: User = Depends(current_curator_or_admin_user),
    db_session: Session = Depends(get_session),
) -> None:
    try:
        delete_user_group(db_session=db_session, user_group_id=user_group_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{user_group_id}/agents")
def update_agent_sharing(
    user_group_id: int,
    request: UserGroupAgentSharingRequest,
    user: User = Depends(current_curator_or_admin_user),
    db_session: Session = Depends(get_session),
) -> None:
    try:
        update_agent_group_sharing(
            db_session=db_session,
            user_group_id=user_group_id,
            added_agent_ids=request.added_agent_ids,
            removed_agent_ids=request.removed_agent_ids,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
