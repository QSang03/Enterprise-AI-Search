from collections.abc import Sequence
from datetime import datetime
from datetime import timedelta
from datetime import timezone
from functools import lru_cache

from dateutil import tz
from fastapi import Depends
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy import select
from sqlalchemy.orm import Session

from uuid import UUID
from onyx.auth.users import current_chat_accessible_user
from onyx.db.engine.sql_engine import get_session_with_current_tenant
from onyx.db.models import ChatMessage
from onyx.db.models import ChatSession
from onyx.db.models import TokenRateLimit, UserGroup, User__UserGroup, TokenRateLimit__UserGroup
from onyx.db.models import User
from onyx.db.token_limit import fetch_all_global_token_rate_limits
from onyx.db.token_limit import fetch_all_user_token_rate_limits
from onyx.utils.logger import setup_logger
from onyx.utils.variable_functionality import fetch_versioned_implementation

logger = setup_logger()


TOKEN_BUDGET_UNIT = 1_000


def check_token_rate_limits(
    user: User = Depends(current_chat_accessible_user),
) -> None:
    # short circuit if no rate limits are set up
    # NOTE: result of `any_rate_limit_exists` is cached, so this call is fast 99% of the time
    if not any_rate_limit_exists():
        return

    versioned_rate_limit_strategy = fetch_versioned_implementation(
        "onyx.server.query_and_chat.token_limit", _check_token_rate_limits.__name__
    )
    return versioned_rate_limit_strategy(user)


def _check_token_rate_limits(user: User) -> None:
    _user_is_rate_limited_by_global()
    _user_is_rate_limited_by_user(user)
    _user_is_rate_limited_by_groups(user)


def _user_is_rate_limited_by_user(user: User) -> None:
    with get_session_with_current_tenant() as db_session:
        user_rate_limits = fetch_all_user_token_rate_limits(
            db_session=db_session, enabled_only=True, ordered=False
        )
        if user_rate_limits:
            cutoff_time = _get_cutoff_time(user_rate_limits)
            # Fetch token usage for this user
            user_usage = _fetch_user_usage(user.id, cutoff_time, db_session)
            if _is_rate_limited(user_rate_limits, user_usage):
                raise HTTPException(
                    status_code=429,
                    detail="Token budget exceeded for your user account. Try again later.",
                )


def _user_is_rate_limited_by_groups(user: User) -> None:
    with get_session_with_current_tenant() as db_session:
        # Get all groups the user belongs to
        group_ids_query = select(UserGroup.id).join(
            User__UserGroup, User__UserGroup.user_group_id == UserGroup.id
        ).where(
            User__UserGroup.user_id == user.id
        )
        group_ids = list(db_session.scalars(group_ids_query).all())

        if not group_ids:
            return

        all_groups_rate_limited = True
        has_at_least_one_group_with_limits = False

        for g_id in group_ids:
            # Fetch enabled rate limits for this group
            limits_query = (
                select(TokenRateLimit)
                .join(
                    TokenRateLimit__UserGroup,
                    TokenRateLimit__UserGroup.rate_limit_id == TokenRateLimit.id,
                )
                .where(
                    TokenRateLimit__UserGroup.user_group_id == g_id,
                    TokenRateLimit.enabled == True,
                )
            )
            g_limits = list(db_session.scalars(limits_query).all())

            if not g_limits:
                # Group has no limits, meaning it has infinite budget.
                # So this group is NOT rate limited.
                all_groups_rate_limited = False
                break

            has_at_least_one_group_with_limits = True

            # Fetch token usage for all users in this group within the max period
            g_cutoff = _get_cutoff_time(g_limits)
            g_usage = _fetch_group_usage(g_id, g_cutoff, db_session)

            if not _is_rate_limited(g_limits, g_usage):
                # At least one group is NOT rate limited, so the user is free to chat
                all_groups_rate_limited = False
                break

        if has_at_least_one_group_with_limits and all_groups_rate_limited:
            raise HTTPException(
                status_code=429,
                detail="Token budget exceeded for your user group. Try again later.",
            )


def _fetch_user_usage(
    user_id: UUID, cutoff_time: datetime, db_session: Session
) -> Sequence[tuple[datetime, int]]:
    result = db_session.execute(
        select(
            func.date_trunc("minute", ChatMessage.time_sent),
            func.sum(ChatMessage.token_count),
        )
        .join(ChatSession, ChatMessage.chat_session_id == ChatSession.id)
        .filter(
            ChatSession.user_id == user_id,
            ChatMessage.time_sent >= cutoff_time,
        )
        .group_by(func.date_trunc("minute", ChatMessage.time_sent))
    ).all()
    return [(row[0], row[1]) for row in result]


def _fetch_group_usage(
    group_id: int, cutoff_time: datetime, db_session: Session
) -> Sequence[tuple[datetime, int]]:
    result = db_session.execute(
        select(
            func.date_trunc("minute", ChatMessage.time_sent),
            func.sum(ChatMessage.token_count),
        )
        .join(ChatSession, ChatMessage.chat_session_id == ChatSession.id)
        .join(User__UserGroup, User__UserGroup.user_id == ChatSession.user_id)
        .filter(
            User__UserGroup.user_group_id == group_id,
            ChatMessage.time_sent >= cutoff_time,
        )
        .group_by(func.date_trunc("minute", ChatMessage.time_sent))
    ).all()
    return [(row[0], row[1]) for row in result]


"""
Global rate limits
"""


def _user_is_rate_limited_by_global() -> None:
    with get_session_with_current_tenant() as db_session:
        global_rate_limits = fetch_all_global_token_rate_limits(
            db_session=db_session, enabled_only=True, ordered=False
        )

        if global_rate_limits:
            global_cutoff_time = _get_cutoff_time(global_rate_limits)
            global_usage = _fetch_global_usage(global_cutoff_time, db_session)

            if _is_rate_limited(global_rate_limits, global_usage):
                raise HTTPException(
                    status_code=429,
                    detail="Token budget exceeded for organization. Try again later.",
                )


def _fetch_global_usage(
    cutoff_time: datetime, db_session: Session
) -> Sequence[tuple[datetime, int]]:
    """
    Fetch global token usage within the cutoff time, grouped by minute
    """
    result = db_session.execute(
        select(
            func.date_trunc("minute", ChatMessage.time_sent),
            func.sum(ChatMessage.token_count),
        )
        .join(ChatSession, ChatMessage.chat_session_id == ChatSession.id)
        .filter(
            ChatMessage.time_sent >= cutoff_time,
        )
        .group_by(func.date_trunc("minute", ChatMessage.time_sent))
    ).all()

    return [(row[0], row[1]) for row in result]


"""
Common functions
"""


def _get_cutoff_time(rate_limits: Sequence[TokenRateLimit]) -> datetime:
    max_period_hours = max(rate_limit.period_hours for rate_limit in rate_limits)
    return datetime.now(tz=timezone.utc) - timedelta(hours=max_period_hours)


def _is_rate_limited(
    rate_limits: Sequence[TokenRateLimit], usage: Sequence[tuple[datetime, int]]
) -> bool:
    """
    If at least one rate limit is exceeded, return True
    """
    for rate_limit in rate_limits:
        tokens_used = sum(
            u_token_count
            for u_date, u_token_count in usage
            if u_date
            >= datetime.now(tz=tz.UTC) - timedelta(hours=rate_limit.period_hours)
        )

        if tokens_used >= rate_limit.token_budget * TOKEN_BUDGET_UNIT:
            return True

    return False


@lru_cache()
def any_rate_limit_exists() -> bool:
    """Checks if any rate limit exists in the database. Is cached, so that if no rate limits
    are setup, we don't have any effect on average query latency."""
    logger.debug("Checking for any rate limits...")
    with get_session_with_current_tenant() as db_session:
        return (
            db_session.scalar(
                select(TokenRateLimit.id).where(
                    TokenRateLimit.enabled == True  # noqa: E712
                )
            )
            is not None
        )
