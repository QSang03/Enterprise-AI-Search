import csv
import io
import zipfile
import datetime
from uuid import UUID, uuid4
from typing import Any

from fastapi import APIRouter, Depends, Query, BackgroundTasks, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import select, func, and_, case, Date, desc

from onyx.auth.permissions import require_permission

from onyx.db.engine.sql_engine import get_session, get_session_with_current_tenant
from onyx.db.models import User, ChatSession, ChatMessage, ChatMessageFeedback, UsageReport, FileRecord, SearchDoc
from onyx.db.enums import Permission
from onyx.error_handling.error_codes import OnyxErrorCode
from onyx.error_handling.exceptions import OnyxError
from onyx.file_store.file_store import get_default_file_store
from onyx.configs.constants import FileOrigin, MessageType, SessionType
from onyx.utils.logger import setup_logger

logger = setup_logger()

router = APIRouter(prefix="", tags=["analytics"])


# ==========================================
# Schemas (Pydantic Models)
# ==========================================

class QueryAnalytics(BaseModel):
    total_queries: int
    total_likes: int
    total_dislikes: int
    date: str

class UserAnalytics(BaseModel):
    total_active_users: int
    date: str

class OnyxBotAnalytics(BaseModel):
    total_queries: int
    auto_resolved: int
    date: str

class PersonaMessageAnalytics(BaseModel):
    total_messages: int
    date: str
    persona_id: int

class PersonaUniqueUserAnalytics(BaseModel):
    unique_users: int
    date: str
    persona_id: int

class UsageReportDisplay(BaseModel):
    report_name: str
    requestor: str | None
    time_created: datetime.datetime
    period_from: datetime.datetime | None
    period_to: datetime.datetime | None

class UsageReportRequest(BaseModel):
    period_from: str | None = None
    period_to: str | None = None

class AbridgedSearchDoc(BaseModel):
    document_id: str
    semantic_identifier: str
    link: str | None

class MessageSnapshot(BaseModel):
    id: int
    message: str
    message_type: str
    documents: list[AbridgedSearchDoc]
    feedback_type: str | None
    feedback_text: str | None
    time_created: datetime.datetime

class ChatSessionSnapshot(BaseModel):
    id: UUID
    user_email: str | None
    name: str | None
    messages: list[MessageSnapshot]
    assistant_id: int | None
    assistant_name: str | None
    time_created: datetime.datetime
    flow_type: str

class ChatSessionMinimal(BaseModel):
    id: UUID
    user_email: str | None
    name: str | None
    first_user_message: str
    first_ai_message: str
    assistant_id: int | None
    assistant_name: str | None
    time_created: datetime.datetime
    feedback_type: str | None
    flow_type: str
    conversation_length: int

class PaginatedChatSessionMinimal(BaseModel):
    items: list[ChatSessionMinimal]
    total_items: int

class TaskQueueState(BaseModel):
    task_id: str
    start: str
    end: str
    status: str
    start_time: str


# ==========================================
# Helpers / Task Workers
# ==========================================

def parse_date(date_str: str | None) -> datetime.datetime | None:
    if not date_str:
        return None
    try:
        # replace Z with +00:00 for ISO parsing
        normalized = date_str.replace("Z", "+00:00")
        return datetime.datetime.fromisoformat(normalized)
    except ValueError:
        raise OnyxError(OnyxErrorCode.INVALID_INPUT, f"Invalid date format: {date_str}")


def generate_usage_report_csvs(
    db_session: Session,
    start_time: datetime.datetime | None,
    end_time: datetime.datetime | None,
) -> bytes:
    # 1. Query user messages (queries)
    query = (
        select(ChatMessage)
        .join(ChatSession, ChatMessage.chat_session_id == ChatSession.id)
        .where(
            ChatMessage.message_type == MessageType.USER,
            ChatSession.deleted == False
        )
    )
    if start_time:
        query = query.where(ChatMessage.time_sent >= start_time)
    if end_time:
        query = query.where(ChatMessage.time_sent <= end_time)

    user_messages = db_session.scalars(query).all()

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        # Generate chat_messages.csv
        csv_io = io.StringIO()
        csv_writer = csv.writer(csv_io)
        csv_writer.writerow([
            "session_id",
            "user_id",
            "flow_type",
            "time_sent",
            "assistant_name",
            "user_email",
            "number_of_tokens",
            "llm_model"
        ])

        for msg in user_messages:
            session = msg.chat_session
            # Find the assistant reply corresponding to this user message
            assistant_reply = None
            for child in session.messages:
                if child.parent_message_id == msg.id and child.message_type == MessageType.ASSISTANT:
                    assistant_reply = child
                    break

            if not assistant_reply:
                assistant_msgs = [
                    m for m in session.messages
                    if m.message_type == MessageType.ASSISTANT and m.time_sent >= msg.time_sent
                ]
                if assistant_msgs:
                    assistant_reply = min(assistant_msgs, key=lambda x: x.time_sent)

            llm_model = (assistant_reply.model_display_name if assistant_reply else None) or "unknown"
            assistant_tokens = assistant_reply.token_count if assistant_reply else 0
            number_of_tokens = msg.token_count + assistant_tokens

            assistant_name = (session.persona.name if session.persona else None) or "Assistant"
            user_email = (session.user.email if session.user else None) or "anonymous@onyx.ai"
            flow_type = "Slack" if (session.onyxbot_flow or session.slack_thread_id) else "Chat"

            csv_writer.writerow([
                str(session.id),
                str(session.user_id) if session.user_id else "",
                flow_type,
                msg.time_sent.isoformat(),
                assistant_name,
                user_email,
                str(number_of_tokens),
                llm_model
            ])

        zip_file.writestr("chat_messages.csv", csv_io.getvalue())

        # Generate users.csv
        users_io = io.StringIO()
        users_writer = csv.writer(users_io)
        users_writer.writerow(["user_id", "email", "role", "time_created"])

        users = db_session.scalars(select(User)).all()
        for u in users:
            users_writer.writerow([
                str(u.id),
                u.email,
                str(u.role),
                u.time_created.isoformat() if u.time_created else ""
            ])

        zip_file.writestr("users.csv", users_io.getvalue())

    return zip_buffer.getvalue()


def generate_usage_report_task(
    report_name: str,
    start_time: datetime.datetime | None,
    end_time: datetime.datetime | None,
    user_id: UUID | None,
) -> None:
    with get_session_with_current_tenant() as db_session:
        try:
            zip_bytes = generate_usage_report_csvs(db_session, start_time, end_time)

            file_store = get_default_file_store()
            file_store.save_file(
                content=io.BytesIO(zip_bytes),
                display_name=report_name,
                file_origin=FileOrigin.GENERATED_REPORT,
                file_type="application/zip",
                file_id=report_name
            )

            db_report = UsageReport(
                report_name=report_name,
                requestor_user_id=user_id,
                period_from=start_time,
                period_to=end_time
            )
            db_session.add(db_report)
            db_session.commit()
            logger.info("Usage report %s generated successfully.", report_name)
        except Exception:
            logger.exception("Error generating usage report %s", report_name)


# ==========================================
# Analytics API Endpoints
# ==========================================

@router.get("/analytics/admin/query")
def get_query_analytics(
    start: str,
    end: str,
    _: User = Depends(require_permission(Permission.FULL_ADMIN_PANEL_ACCESS)),
    db_session: Session = Depends(get_session),
) -> list[QueryAnalytics]:
    start_dt = parse_date(start)
    end_dt = parse_date(end)
    if not start_dt or not end_dt:
        raise OnyxError(OnyxErrorCode.INVALID_INPUT, "Start and end dates are required")

    # User queries (messages) by date
    queries_q = (
        select(
            func.cast(ChatMessage.time_sent, Date).label("date"),
            func.count(ChatMessage.id).label("queries")
        )
        .where(
            ChatMessage.message_type == MessageType.USER,
            ChatMessage.time_sent >= start_dt,
            ChatMessage.time_sent <= end_dt
        )
        .group_by(func.cast(ChatMessage.time_sent, Date))
    )
    queries_res = {row.date: row.queries for row in db_session.execute(queries_q).all()}

    # Feedbacks (likes / dislikes) by date
    fb_q = (
        select(
            func.cast(ChatMessage.time_sent, Date).label("date"),
            func.sum(case((ChatMessageFeedback.is_positive == True, 1), else_=0)).label("likes"),
            func.sum(case((ChatMessageFeedback.is_positive == False, 1), else_=0)).label("dislikes")
        )
        .join(ChatMessageFeedback, ChatMessage.id == ChatMessageFeedback.chat_message_id)
        .where(
            ChatMessage.time_sent >= start_dt,
            ChatMessage.time_sent <= end_dt
        )
        .group_by(func.cast(ChatMessage.time_sent, Date))
    )
    fb_res = {
        row.date: (row.likes or 0, row.dislikes or 0)
        for row in db_session.execute(fb_q).all()
    }

    # Construct complete date list
    stats = []
    curr = start_dt.date()
    while curr <= end_dt.date():
        likes, dislikes = fb_res.get(curr, (0, 0))
        stats.append(
            QueryAnalytics(
                total_queries=queries_res.get(curr, 0),
                total_likes=likes,
                total_dislikes=dislikes,
                date=curr.isoformat()
            )
        )
        curr += datetime.timedelta(days=1)

    return stats


@router.get("/analytics/admin/user")
def get_user_analytics(
    start: str,
    end: str,
    _: User = Depends(require_permission(Permission.FULL_ADMIN_PANEL_ACCESS)),
    db_session: Session = Depends(get_session),
) -> list[UserAnalytics]:
    start_dt = parse_date(start)
    end_dt = parse_date(end)
    if not start_dt or not end_dt:
        raise OnyxError(OnyxErrorCode.INVALID_INPUT, "Start and end dates are required")

    users_q = (
        select(
            func.cast(ChatMessage.time_sent, Date).label("date"),
            func.count(func.distinct(ChatSession.user_id)).label("active_users")
        )
        .join(ChatSession, ChatMessage.chat_session_id == ChatSession.id)
        .where(
            ChatMessage.message_type == MessageType.USER,
            ChatMessage.time_sent >= start_dt,
            ChatMessage.time_sent <= end_dt
        )
        .group_by(func.cast(ChatMessage.time_sent, Date))
    )
    users_res = {row.date: row.active_users for row in db_session.execute(users_q).all()}

    stats = []
    curr = start_dt.date()
    while curr <= end_dt.date():
        stats.append(
            UserAnalytics(
                total_active_users=users_res.get(curr, 0),
                date=curr.isoformat()
            )
        )
        curr += datetime.timedelta(days=1)

    return stats


@router.get("/analytics/admin/onyxbot")
def get_onyxbot_analytics(
    start: str,
    end: str,
    _: User = Depends(require_permission(Permission.FULL_ADMIN_PANEL_ACCESS)),
    db_session: Session = Depends(get_session),
) -> list[OnyxBotAnalytics]:
    start_dt = parse_date(start)
    end_dt = parse_date(end)
    if not start_dt or not end_dt:
        raise OnyxError(OnyxErrorCode.INVALID_INPUT, "Start and end dates are required")

    bot_q = (
        select(
            func.cast(ChatMessage.time_sent, Date).label("date"),
            func.count(ChatMessage.id).label("queries")
        )
        .join(ChatSession, ChatMessage.chat_session_id == ChatSession.id)
        .where(
            ChatMessage.message_type == MessageType.USER,
            ChatSession.deleted == False,
            ChatSession.onyxbot_flow == True,
            ChatMessage.time_sent >= start_dt,
            ChatMessage.time_sent <= end_dt
        )
        .group_by(func.cast(ChatMessage.time_sent, Date))
    )
    bot_res = {row.date: row.queries for row in db_session.execute(bot_q).all()}

    resolved_q = (
        select(
            func.cast(ChatMessage.time_sent, Date).label("date"),
            func.count(ChatMessage.id).label("resolved")
        )
        .join(ChatSession, ChatMessage.chat_session_id == ChatSession.id)
        .join(ChatMessageFeedback, ChatMessage.id == ChatMessageFeedback.chat_message_id)
        .where(
            ChatSession.deleted == False,
            ChatSession.onyxbot_flow == True,
            ChatMessageFeedback.is_positive == True,
            ChatMessage.time_sent >= start_dt,
            ChatMessage.time_sent <= end_dt
        )
        .group_by(func.cast(ChatMessage.time_sent, Date))
    )
    resolved_res = {row.date: row.resolved for row in db_session.execute(resolved_q).all()}

    stats = []
    curr = start_dt.date()
    while curr <= end_dt.date():
        stats.append(
            OnyxBotAnalytics(
                total_queries=bot_res.get(curr, 0),
                auto_resolved=resolved_res.get(curr, 0),
                date=curr.isoformat()
            )
        )
        curr += datetime.timedelta(days=1)

    return stats


@router.get("/analytics/admin/persona/messages")
def get_persona_message_analytics(
    persona_id: int,
    start: str,
    end: str,
    _: User = Depends(require_permission(Permission.FULL_ADMIN_PANEL_ACCESS)),
    db_session: Session = Depends(get_session),
) -> list[PersonaMessageAnalytics]:
    start_dt = parse_date(start)
    end_dt = parse_date(end)
    if not start_dt or not end_dt:
        raise OnyxError(OnyxErrorCode.INVALID_INPUT, "Start and end dates are required")

    msg_q = (
        select(
            func.cast(ChatMessage.time_sent, Date).label("date"),
            func.count(ChatMessage.id).label("messages")
        )
        .join(ChatSession, ChatMessage.chat_session_id == ChatSession.id)
        .where(
            ChatMessage.message_type == MessageType.USER,
            ChatSession.persona_id == persona_id,
            ChatSession.deleted == False,
            ChatMessage.time_sent >= start_dt,
            ChatMessage.time_sent <= end_dt
        )
        .group_by(func.cast(ChatMessage.time_sent, Date))
    )
    msg_res = {row.date: row.messages for row in db_session.execute(msg_q).all()}

    stats = []
    curr = start_dt.date()
    while curr <= end_dt.date():
        stats.append(
            PersonaMessageAnalytics(
                total_messages=msg_res.get(curr, 0),
                date=curr.isoformat(),
                persona_id=persona_id
            )
        )
        curr += datetime.timedelta(days=1)

    return stats


@router.get("/analytics/admin/persona/unique-users")
def get_persona_unique_user_analytics(
    persona_id: int,
    start: str,
    end: str,
    _: User = Depends(require_permission(Permission.FULL_ADMIN_PANEL_ACCESS)),
    db_session: Session = Depends(get_session),
) -> list[PersonaUniqueUserAnalytics]:
    start_dt = parse_date(start)
    end_dt = parse_date(end)
    if not start_dt or not end_dt:
        raise OnyxError(OnyxErrorCode.INVALID_INPUT, "Start and end dates are required")

    users_q = (
        select(
            func.cast(ChatMessage.time_sent, Date).label("date"),
            func.count(func.distinct(ChatSession.user_id)).label("unique_users")
        )
        .join(ChatSession, ChatMessage.chat_session_id == ChatSession.id)
        .where(
            ChatMessage.message_type == MessageType.USER,
            ChatSession.persona_id == persona_id,
            ChatSession.deleted == False,
            ChatMessage.time_sent >= start_dt,
            ChatMessage.time_sent <= end_dt
        )
        .group_by(func.cast(ChatMessage.time_sent, Date))
    )
    users_res = {row.date: row.unique_users for row in db_session.execute(users_q).all()}

    stats = []
    curr = start_dt.date()
    while curr <= end_dt.date():
        stats.append(
            PersonaUniqueUserAnalytics(
                unique_users=users_res.get(curr, 0),
                date=curr.isoformat(),
                persona_id=persona_id
            )
        )
        curr += datetime.timedelta(days=1)

    return stats


# ==========================================
# Usage Report Endpoints
# ==========================================

@router.get("/admin/usage-report")
def get_usage_reports(
    _: User = Depends(require_permission(Permission.FULL_ADMIN_PANEL_ACCESS)),
    db_session: Session = Depends(get_session),
) -> list[UsageReportDisplay]:
    reports = db_session.scalars(select(UsageReport).order_by(UsageReport.time_created.desc())).all()
    return [
        UsageReportDisplay(
            report_name=r.report_name,
            requestor=r.requestor.email if r.requestor else None,
            time_created=r.time_created,
            period_from=r.period_from,
            period_to=r.period_to
        )
        for r in reports
    ]


@router.post("/admin/usage-report", status_code=204)
def create_usage_report(
    req: UsageReportRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_permission(Permission.FULL_ADMIN_PANEL_ACCESS)),
) -> Response:
    period_from_dt = parse_date(req.period_from)
    period_to_dt = parse_date(req.period_to)

    report_name = f"usage_report_{uuid4()}.zip"

    background_tasks.add_task(
        generate_usage_report_task,
        report_name,
        period_from_dt,
        period_to_dt,
        user.id
    )

    return Response(status_code=204)


@router.get("/admin/usage-report/{report_name}")
def download_usage_report(
    report_name: str,
    _: User = Depends(require_permission(Permission.FULL_ADMIN_PANEL_ACCESS)),
    db_session: Session = Depends(get_session),
) -> Response:
    # Verify the report name exists in the UsageReport table
    report = db_session.scalar(select(UsageReport).where(UsageReport.report_name == report_name))
    if not report:
        raise OnyxError(OnyxErrorCode.NOT_FOUND, f"Report {report_name} not found")

    file_store = get_default_file_store()
    file_data = file_store.get_file_with_mime_type(report_name)
    if not file_data:
        raise OnyxError(OnyxErrorCode.NOT_FOUND, f"Report file {report_name} not found in store")

    return Response(
        content=file_data.data,
        media_type=file_data.mime_type,
        headers={
            "Content-Type": "application/zip",
            "Content-Disposition": f"attachment; filename={report_name}"
        }
    )


# ==========================================
# Chat Session History Endpoints
# ==========================================

@router.get("/admin/chat-session-history")
def get_chat_session_history(
    page_num: int = 0,
    page_size: int = 20,
    user_email: str | None = None,
    feedback_type: str | None = None,
    start_time: str | None = None,
    end_time: str | None = None,
    _: User = Depends(require_permission(Permission.FULL_ADMIN_PANEL_ACCESS)),
    db_session: Session = Depends(get_session),
) -> PaginatedChatSessionMinimal:
    # Filter sessions
    query = select(ChatSession).where(ChatSession.deleted == False)

    if user_email:
        query = query.join(User, ChatSession.user_id == User.id).where(User.email.ilike(f"%{user_email}%"))

    start_dt = parse_date(start_time)
    if start_dt:
        query = query.where(ChatSession.time_created >= start_dt)

    end_dt = parse_date(end_time)
    if end_dt:
        query = query.where(ChatSession.time_created <= end_dt)

    # Subquery for feedback statistics per session
    feedback_sub = (
        select(
            ChatMessage.chat_session_id,
            func.sum(case((ChatMessageFeedback.is_positive == True, 1), else_=0)).label("pos_count"),
            func.sum(case((ChatMessageFeedback.is_positive == False, 1), else_=0)).label("neg_count")
        )
        .join(ChatMessageFeedback, ChatMessage.id == ChatMessageFeedback.chat_message_id)
        .group_by(ChatMessage.chat_session_id)
        .subquery()
    )

    query = query.outerjoin(feedback_sub, ChatSession.id == feedback_sub.c.chat_session_id)

    if feedback_type and feedback_type != "all":
        if feedback_type == "like":
            query = query.where(feedback_sub.c.pos_count > 0, func.coalesce(feedback_sub.c.neg_count, 0) == 0)
        elif feedback_type == "dislike":
            query = query.where(feedback_sub.c.neg_count > 0, func.coalesce(feedback_sub.c.pos_count, 0) == 0)
        elif feedback_type == "mixed":
            query = query.where(feedback_sub.c.pos_count > 0, feedback_sub.c.neg_count > 0)

    # Count total
    total_items = db_session.scalar(select(func.count()).select_from(query.subquery())) or 0

    # Paginate and fetch
    sessions = db_session.scalars(
        query.order_by(ChatSession.time_created.desc())
        .offset(page_num * page_size)
        .limit(page_size)
    ).all()

    items = []
    for s in sessions:
        msgs = sorted(s.messages, key=lambda m: m.time_sent)
        user_msgs = [m for m in msgs if m.message_type == MessageType.USER]
        ai_msgs = [m for m in msgs if m.message_type == MessageType.ASSISTANT]

        first_user = user_msgs[0].message if user_msgs else ""
        first_ai = ai_msgs[0].message if ai_msgs else ""

        # Determine feedback type
        pos = 0
        neg = 0
        for m in msgs:
            for fb in m.chat_message_feedbacks:
                if fb.is_positive:
                    pos += 1
                else:
                    neg += 1

        fb_type = None
        if pos > 0 and neg > 0:
            fb_type = "mixed"
        elif pos > 0:
            fb_type = "like"
        elif neg > 0:
            fb_type = "dislike"

        items.append(
            ChatSessionMinimal(
                id=s.id,
                user_email=s.user.email if s.user else None,
                name=s.description,
                first_user_message=first_user,
                first_ai_message=first_ai,
                assistant_id=s.persona_id,
                assistant_name=s.persona.name if s.persona else None,
                time_created=s.time_created,
                feedback_type=fb_type,
                flow_type="Slack" if (s.onyxbot_flow or s.slack_thread_id) else "Chat",
                conversation_length=len(msgs)
            )
        )

    return PaginatedChatSessionMinimal(items=items, total_items=total_items)


@router.get("/admin/chat-session-history/{session_id}")
def get_chat_session_details(
    session_id: UUID,
    _: User = Depends(require_permission(Permission.FULL_ADMIN_PANEL_ACCESS)),
    db_session: Session = Depends(get_session),
) -> ChatSessionSnapshot:
    session = db_session.get(ChatSession, session_id)
    if not session or session.deleted:
        raise OnyxError(OnyxErrorCode.NOT_FOUND, "Chat session not found")

    messages_snapshots = []
    for msg in sorted(session.messages, key=lambda m: m.time_sent):
        docs = []
        for doc in msg.search_docs:
            docs.append(
                AbridgedSearchDoc(
                    document_id=doc.document_id,
                    semantic_identifier=doc.semantic_identifier,
                    link=doc.link
                )
            )

        fb_type = None
        fb_text = None
        if msg.chat_message_feedbacks:
            fb = msg.chat_message_feedbacks[0]
            fb_type = "like" if fb.is_positive else "dislike"
            fb_text = fb.feedback_text

        messages_snapshots.append(
            MessageSnapshot(
                id=msg.id,
                message=msg.message,
                message_type="user" if msg.message_type == MessageType.USER else "assistant",
                documents=docs,
                feedback_type=fb_type,
                feedback_text=fb_text,
                time_created=msg.time_sent
            )
        )

    return ChatSessionSnapshot(
        id=session.id,
        user_email=session.user.email if session.user else None,
        name=session.description,
        messages=messages_snapshots,
        assistant_id=session.persona_id,
        assistant_name=session.persona.name if session.persona else None,
        time_created=session.time_created,
        flow_type="Slack" if (session.onyxbot_flow or session.slack_thread_id) else "Chat"
    )


# ==========================================
# Query History CSV Export Endpoints
# ==========================================

def generate_query_history_csv(
    db_session: Session,
    start_time: datetime.datetime | None,
    end_time: datetime.datetime | None,
) -> str:
    query = (
        select(ChatMessage)
        .join(ChatSession, ChatMessage.chat_session_id == ChatSession.id)
        .where(
            ChatMessage.message_type == MessageType.USER,
            ChatSession.deleted == False
        )
    )
    if start_time:
        query = query.where(ChatMessage.time_sent >= start_time)
    if end_time:
        query = query.where(ChatMessage.time_sent <= end_time)

    user_messages = db_session.scalars(query).all()

    csv_io = io.StringIO()
    csv_writer = csv.writer(csv_io)
    csv_writer.writerow([
        "chat_session_id",
        "user_email",
        "time_sent",
        "user_message",
        "ai_response",
        "feedback",
        "feedback_text",
        "assistant_name"
    ])

    for msg in user_messages:
        session = msg.chat_session
        assistant_reply = None
        for child in session.messages:
            if child.parent_message_id == msg.id and child.message_type == MessageType.ASSISTANT:
                assistant_reply = child
                break

        if not assistant_reply:
            assistant_msgs = [
                m for m in session.messages
                if m.message_type == MessageType.ASSISTANT and m.time_sent >= msg.time_sent
            ]
            if assistant_msgs:
                assistant_reply = min(assistant_msgs, key=lambda x: x.time_sent)

        # Feedback
        feedback_type = None
        feedback_text = None
        if assistant_reply and assistant_reply.chat_message_feedbacks:
            fb = assistant_reply.chat_message_feedbacks[0]
            feedback_type = "like" if fb.is_positive else "dislike"
            feedback_text = fb.feedback_text

        assistant_name = (session.persona.name if session.persona else None) or "Assistant"
        user_email = (session.user.email if session.user else None) or "anonymous@onyx.ai"

        csv_writer.writerow([
            str(session.id),
            user_email,
            msg.time_sent.isoformat(),
            msg.message,
            assistant_reply.message if assistant_reply else "",
            feedback_type or "",
            feedback_text or "",
            assistant_name
        ])

    return csv_io.getvalue()


@router.get("/admin/query-history/list")
def list_query_history_exports(
    _: User = Depends(require_permission(Permission.FULL_ADMIN_PANEL_ACCESS)),
    db_session: Session = Depends(get_session),
) -> list[TaskQueueState]:
    from onyx.db.file_record import get_query_history_export_files
    files = get_query_history_export_files(db_session)
    return [
        TaskQueueState(
            task_id=f.file_id,
            start=f.file_metadata.get("start") or "",
            end=f.file_metadata.get("end") or "",
            status=f.file_metadata.get("status") or "SUCCESS",
            start_time=f.file_metadata.get("start_time") or f.time_created.isoformat()
        )
        for f in files
    ]


@router.post("/admin/query-history/start-export")
def start_query_history_export(
    start: str | None = None,
    end: str | None = None,
    _: User = Depends(require_permission(Permission.FULL_ADMIN_PANEL_ACCESS)),
    db_session: Session = Depends(get_session),
) -> dict[str, str]:
    start_dt = parse_date(start)
    end_dt = parse_date(end)

    task_id = f"query-history-{uuid4()}"
    start_time_str = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # Generate CSV content synchronously for simplicity and robustness
    csv_content = generate_query_history_csv(db_session, start_dt, end_dt)

    # Save to file store
    file_store = get_default_file_store()
    file_store.save_file(
        content=io.BytesIO(csv_content.encode("utf-8")),
        display_name="query_history.csv",
        file_origin=FileOrigin.QUERY_HISTORY_CSV,
        file_type="text/csv",
        file_metadata={
            "start": start or "",
            "end": end or "",
            "status": "SUCCESS",
            "start_time": start_time_str
        },
        file_id=task_id
    )

    return {"request_id": task_id}


@router.get("/admin/query-history/export-status")
def get_query_history_export_status(
    request_id: str,
    _: User = Depends(require_permission(Permission.FULL_ADMIN_PANEL_ACCESS)),
    db_session: Session = Depends(get_session),
) -> dict[str, str]:
    from onyx.db.file_record import get_filerecord_by_file_id_optional
    file = get_filerecord_by_file_id_optional(request_id, db_session)
    if not file:
        raise OnyxError(OnyxErrorCode.NOT_FOUND, f"Export request {request_id} not found")

    status = file.file_metadata.get("status") if file.file_metadata else "SUCCESS"
    return {"status": status}


@router.get("/admin/query-history/download")
def download_query_history_export(
    request_id: str,
    _: User = Depends(require_permission(Permission.FULL_ADMIN_PANEL_ACCESS)),
    db_session: Session = Depends(get_session),
) -> Response:
    from onyx.db.file_record import get_filerecord_by_file_id_optional
    file = get_filerecord_by_file_id_optional(request_id, db_session)
    if not file:
        raise OnyxError(OnyxErrorCode.NOT_FOUND, f"Export request {request_id} not found")

    file_store = get_default_file_store()
    file_data = file_store.get_file_with_mime_type(request_id)
    if not file_data:
        raise OnyxError(OnyxErrorCode.NOT_FOUND, f"Export file {request_id} not found in store")

    # CSV headers format: text/csv; charset=utf-8
    return Response(
        content=file_data.data,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename=query_history_{request_id}.csv"
        }
    )
