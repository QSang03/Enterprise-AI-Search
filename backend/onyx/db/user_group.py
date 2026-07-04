from collections.abc import Sequence
from uuid import UUID
from sqlalchemy import select, delete
from sqlalchemy.orm import Session
from onyx.db.models import User, UserGroup, User__UserGroup, ConnectorCredentialPair, UserGroup__ConnectorCredentialPair
from onyx.auth.schemas import UserRole

def get_user_group_by_id(db_session: Session, user_group_id: int) -> UserGroup | None:
    return db_session.scalar(
        select(UserGroup).where(UserGroup.id == user_group_id)
    )

def get_user_group_by_name(db_session: Session, name: str) -> UserGroup | None:
    return db_session.scalar(
        select(UserGroup).where(UserGroup.name == name)
    )

def fetch_all_user_groups(db_session: Session) -> Sequence[UserGroup]:
    return db_session.scalars(select(UserGroup).order_by(UserGroup.name)).all()

def insert_user_group(
    db_session: Session,
    name: str,
    user_ids: list[UUID] | None = None,
    cc_pair_ids: list[int] | None = None,
) -> UserGroup:
    # Check if group already exists
    existing = get_user_group_by_name(db_session, name)
    if existing:
        raise ValueError(f"UserGroup with name {name} already exists.")

    new_group = UserGroup(
        name=name,
        is_up_to_date=True,
        is_up_for_deletion=False,
        is_default=False,
    )
    db_session.add(new_group)
    db_session.flush()  # Populates id

    # Add members
    if user_ids:
        for u_id in user_ids:
            user = db_session.get(User, u_id)
            if user:
                db_session.add(User__UserGroup(user_group_id=new_group.id, user_id=u_id, is_curator=False))

    # Add cc_pairs
    if cc_pair_ids:
        for cc_id in cc_pair_ids:
            cc_pair = db_session.scalar(
                select(ConnectorCredentialPair).where(ConnectorCredentialPair.id == cc_id)
            )
            if cc_pair:
                db_session.add(UserGroup__ConnectorCredentialPair(
                    user_group_id=new_group.id,
                    cc_pair_id=cc_id,
                    is_current=True
                ))

    db_session.commit()
    return new_group

def update_user_group(
    db_session: Session,
    user_group_id: int,
    user_ids: list[UUID] | None = None,
    cc_pair_ids: list[int] | None = None,
) -> None:
    group = get_user_group_by_id(db_session, user_group_id)
    if not group:
        raise ValueError(f"UserGroup with id {user_group_id} not found.")

    # Update members
    if user_ids is not None:
        # Delete old members
        db_session.execute(
            delete(User__UserGroup).where(User__UserGroup.user_group_id == user_group_id)
        )
        # Add new members
        for u_id in user_ids:
            user = db_session.get(User, u_id)
            if user:
                db_session.add(User__UserGroup(user_group_id=user_group_id, user_id=u_id, is_curator=False))

    # Update cc_pairs
    if cc_pair_ids is not None:
        # Delete old current cc_pairs
        db_session.execute(
            delete(UserGroup__ConnectorCredentialPair).where(
                UserGroup__ConnectorCredentialPair.user_group_id == user_group_id
            )
        )
        # Add new cc_pairs
        for cc_id in cc_pair_ids:
            cc_pair = db_session.scalar(
                select(ConnectorCredentialPair).where(ConnectorCredentialPair.id == cc_id)
            )
            if cc_pair:
                db_session.add(UserGroup__ConnectorCredentialPair(
                    user_group_id=user_group_id,
                    cc_pair_id=cc_id,
                    is_current=True
                ))

    db_session.commit()

def rename_user_group(db_session: Session, user_group_id: int, name: str) -> None:
    group = get_user_group_by_id(db_session, user_group_id)
    if not group:
        raise ValueError(f"UserGroup with id {user_group_id} not found.")

    existing = get_user_group_by_name(db_session, name)
    if existing and existing.id != user_group_id:
        raise ValueError(f"UserGroup with name {name} already exists.")

    group.name = name
    db_session.commit()

def delete_user_group(db_session: Session, user_group_id: int) -> None:
    group = get_user_group_by_id(db_session, user_group_id)
    if not group:
        raise ValueError(f"UserGroup with id {user_group_id} not found.")

    # Delete related tables
    db_session.execute(delete(User__UserGroup).where(User__UserGroup.user_group_id == user_group_id))
    db_session.execute(delete(UserGroup__ConnectorCredentialPair).where(UserGroup__ConnectorCredentialPair.user_group_id == user_group_id))
    db_session.delete(group)
    db_session.commit()

def add_users_to_group(
    db_session: Session,
    user_group_id: int,
    user_ids: list[UUID],
) -> None:
    """Add users to a group without removing existing members."""
    group = get_user_group_by_id(db_session, user_group_id)
    if not group:
        raise ValueError(f"UserGroup with id {user_group_id} not found.")

    existing_user_ids = {
        row.user_id
        for row in db_session.scalars(
            select(User__UserGroup).where(User__UserGroup.user_group_id == user_group_id)
        ).all()
    }

    for u_id in user_ids:
        if u_id in existing_user_ids:
            continue
        user = db_session.get(User, u_id)
        if user:
            db_session.add(
                User__UserGroup(
                    user_group_id=user_group_id,
                    user_id=u_id,
                    is_curator=False,
                )
            )

    db_session.commit()


def validate_object_creation_for_user(
    db_session: Session,
    user: User,
    target_group_ids: list[int] | None = None,
    object_is_public: bool = True,
    object_is_new: bool = False,
    object_is_owned_by_user: bool = False,
) -> None:
    """Mock validation for FOSS edition. Admins and curators are always validated."""
    if user.role == UserRole.ADMIN:
        return
    # Curators can manage public/group assets they are part of
    if user.role == UserRole.CURATOR:
        return
    # Basic users can only create public or private assets
    return


def update_agent_group_sharing(
    db_session: Session,
    user_group_id: int,
    added_agent_ids: list[int],
    removed_agent_ids: list[int],
) -> None:
    from onyx.db.models import Persona__UserGroup
    # Delete removed agents
    if removed_agent_ids:
        db_session.execute(
            delete(Persona__UserGroup).where(
                (Persona__UserGroup.user_group_id == user_group_id)
                & (Persona__UserGroup.persona_id.in_(removed_agent_ids))
            )
        )
    # Add new agents
    if added_agent_ids:
        for p_id in added_agent_ids:
            # Check if already exists to prevent duplicate key error
            exists_check = db_session.scalar(
                select(Persona__UserGroup).where(
                    (Persona__UserGroup.user_group_id == user_group_id)
                    & (Persona__UserGroup.persona_id == p_id)
                )
            )
            if not exists_check:
                db_session.add(
                    Persona__UserGroup(
                        user_group_id=user_group_id,
                        persona_id=p_id,
                    )
                )
    db_session.commit()

