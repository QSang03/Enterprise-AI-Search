from pydantic import BaseModel
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from onyx.auth.users import current_curator_or_admin_user, current_chat_accessible_user
from onyx.db.engine.sql_engine import get_session
from onyx.db.models import User, License
from onyx.db.license import verify_license_data, invalidate_license_cache
from onyx.error_handling.error_codes import OnyxErrorCode
from onyx.error_handling.exceptions import OnyxError

router = APIRouter(prefix="/manage/admin/license", tags=["admin-license"])


class LicenseSubmitRequest(BaseModel):
    license_key: str


class LicenseResponse(BaseModel):
    user_count: int
    document_count: int
    expiry_date: str


@router.post("")
def save_license(
    request: LicenseSubmitRequest,
    db_session: Session = Depends(get_session),
    _: User = Depends(current_curator_or_admin_user)
) -> dict:
    """
    Submits, validates, and stores the enterprise license key in the database (singleton row).
    Invalidates the cache so that limits are applied immediately.
    """
    try:
        # Validate signature and structure
        verify_license_data(request.license_key)
    except ValueError as e:
        raise OnyxError(
            OnyxErrorCode.VALIDATION_ERROR,
            f"Invalid license key format or signature: {e}"
        )

    # Store or update the license key in the database
    license_row = db_session.query(License).first()
    if license_row:
        license_row.license_data = request.license_key
    else:
        license_row = License(license_data=request.license_key)
        db_session.add(license_row)

    db_session.commit()
    invalidate_license_cache()
    
    return {"message": "License saved and activated successfully."}


@router.get("", response_model=LicenseResponse)
def get_license_info(
    db_session: Session = Depends(get_session),
    _: User = Depends(current_curator_or_admin_user)
) -> LicenseResponse:
    """
    Retrieves the currently loaded license metadata.
    """
    license_row = db_session.query(License).first()
    if not license_row:
        raise OnyxError(OnyxErrorCode.NOT_FOUND, "No license has been configured.")

    try:
        parsed = verify_license_data(license_row.license_data)
        return LicenseResponse(
            user_count=parsed["user_count"],
            document_count=parsed["document_count"],
            expiry_date=parsed["expiry_date"].strftime("%Y-%m-%d")
        )
    except ValueError as e:
        raise OnyxError(
            OnyxErrorCode.VALIDATION_ERROR,
            f"Configured license in database is invalid: {e}"
        )


settings_router = APIRouter(prefix="/enterprise-settings", tags=["enterprise-settings"])


class EnterpriseSettingsResponse(BaseModel):
    application_name: str | None = None
    use_custom_logo: bool = False
    use_custom_logotype: bool = False
    logo_display_style: str | None = "logo_and_name"
    custom_nav_items: list = []
    custom_lower_disclaimer_content: str | None = None
    custom_header_content: str | None = None
    two_lines_for_chat_header: bool | None = False
    custom_popup_header: str | None = None
    custom_popup_content: str | None = None
    enable_consent_screen: bool | None = False
    consent_screen_prompt: str | None = None
    show_first_visit_notice: bool | None = False
    custom_greeting_message: str | None = None
    custom_help_link_url: str | None = None
    custom_help_link_label: str | None = None
    hide_onyx_branding: bool | None = False


@settings_router.get("")
def get_enterprise_settings(
    _: User | None = Depends(current_chat_accessible_user)
) -> EnterpriseSettingsResponse:
    """
    Returns empty/default enterprise settings to prevent 404 logs.
    """
    return EnterpriseSettingsResponse()


@settings_router.get("/custom-analytics-script")
def get_custom_analytics_script(
    _: User | None = Depends(current_chat_accessible_user)
) -> str:
    """
    Returns empty string for custom analytics script.
    """
    return ""
