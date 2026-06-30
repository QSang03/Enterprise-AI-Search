import base64
import json
from datetime import datetime, timezone
from typing import Any, Optional
from sqlalchemy.orm import Session
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes, serialization

from onyx.db.models import License, User, Document
from onyx.error_handling.error_codes import OnyxErrorCode
from onyx.error_handling.exceptions import OnyxError
from onyx.server.settings.models import Settings, ApplicationStatus, Tier
from onyx.utils.logger import setup_logger

logger = setup_logger()

# Hardcoded RSA Public Key in PEM format to verify digital signatures
PUBLIC_KEY_PEM = """-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAw2p9f7oPIq1fSlmQmLyX
87dR0N7HD+D4x6X2QiLNpgwsok0874zZoI0fZ8uzhH0g0D9bts4V7hZhbS9MZcdP
VDj4wQy+cAcSkmEWShGQlssW5oofVf0uBun2O0AxoF5TP2BOA7BmO6aOAVuPwWHa
rToaT/W1Vh/IyoA/UNK/tfELmNiq5sZe8sG2xgpHn00iKLnNgPoIn4KoSYUNn+wl
+5i4iY8E8MogMhNyJXzBFtHHTdROHAhkgpXEbHi5smJBpOz+s0CsxLviDw0WYrSG
i3xFggKujyXOcyIE9KVbLxMFjNOnAapE9Ugt2hvKlIyHobIGFFjrqCDzF5pwPqJx
wQIDAQAB
-----END PUBLIC KEY-----"""

# Thread-safe in-memory cache to avoid repeated decryption and verification
_license_cache: Optional[dict] = None


def invalidate_license_cache() -> None:
    """Invalidates the in-memory license cache."""
    global _license_cache
    _license_cache = None
    logger.info("License cache invalidated.")


def verify_license_data(license_str: str) -> dict:
    """
    Decodes the base64 signed license key, verifies its digital signature 
    using the public RSA key, checks the expiry date, and returns the payload dictionary.
    """
    try:
        # Decode outer base64 JSON payload
        decoded_bytes = base64.b64decode(license_str)
        payload = json.loads(decoded_bytes.decode('utf-8'))
        
        user_count = payload.get("user_count")
        document_count = payload.get("document_count")
        expiry_date_str = payload.get("expiry_date")
        signature_b64 = payload.get("signature")
        
        if (user_count is None or 
            document_count is None or 
            expiry_date_str is None or 
            signature_b64 is None):
            raise ValueError("License payload is missing required fields.")
            
        # Standardized message representation used during signing
        msg = f"{user_count}:{document_count}:{expiry_date_str}".encode('utf-8')
        signature = base64.b64decode(signature_b64)
        
        # Load RSA public key
        pub_key = serialization.load_pem_public_key(PUBLIC_KEY_PEM.encode('utf-8'))
        pub_key.verify(
            signature,
            msg,
            padding.PKCS1v15(),
            hashes.SHA256()
        )
        
        # Verify expiry date (timezone-naive comparison using UTC date)
        expiry_date = datetime.strptime(expiry_date_str, "%Y-%m-%d").date()
        current_date = datetime.now(timezone.utc).date()
        if expiry_date < current_date:
            raise ValueError(f"License expired on {expiry_date_str}.")
            
        return {
            "user_count": int(user_count),
            "document_count": int(document_count),
            "expiry_date": expiry_date
        }
    except Exception as e:
        logger.error(f"License verification failed: {e}")
        raise ValueError(f"Invalid license signature or structure: {e}")


def get_active_license(db_session: Session) -> Optional[dict]:
    """
    Retrieves the license from the database, validates it, and returns the metadata.
    Uses in-memory cache if available. Returns None if no valid license exists.
    """
    global _license_cache
    if _license_cache is not None:
        return _license_cache
        
    license_row = db_session.query(License).first()
    if not license_row:
        return None
        
    try:
        parsed = verify_license_data(license_row.license_data)
        _license_cache = parsed
        return parsed
    except Exception:
        return None


class SeatAvailabilityResult:
    def __init__(self, available: bool, error_message: str | None = None):
        self.available = available
        self.error_message = error_message


def check_seat_availability(
    db_session: Session,
    seats_needed: int = 1
) -> SeatAvailabilityResult | None:
    """
    Checks if active users or document count exceeds limits allowed in the enterprise license.
    """
    from onyx.utils.variable_functionality import _LICENSE_ENFORCEMENT_ENABLED
    if not _LICENSE_ENFORCEMENT_ENABLED:
        return None
        
    parsed_license = get_active_license(db_session)
    if not parsed_license:
        return SeatAvailabilityResult(
            available=False,
            error_message="No valid or active enterprise license was found."
        )
        
    # Count active users
    active_users = db_session.query(User).filter(User.is_active == True).count()
    limit = parsed_license["user_count"]
    if active_users + seats_needed > limit:
        return SeatAvailabilityResult(
            available=False,
            error_message=f"Active seat limit exceeded. License limit: {limit}, active users: {active_users}, additional requested: {seats_needed}."
        )
        
    # Count documents
    doc_count = db_session.query(Document).count()
    doc_limit = parsed_license["document_count"]
    if doc_count > doc_limit:
        return SeatAvailabilityResult(
            available=False,
            error_message=f"Document limit exceeded. License limit: {doc_limit}, documents: {doc_count}."
        )
        
    return SeatAvailabilityResult(available=True)


def acquire_seat_lock(*args: Any, **kwargs: Any) -> None:
    """Placeholder function to satisfy seat lock acquisition hooks."""
    pass


def user_counts_toward_seats(user: User) -> bool:
    """Determines whether a given user counts towards seat limit billing."""
    return user.is_active and user.email != "anonymous@onyx.app"


def apply_license_status_to_settings(settings: Settings, db_session: Optional[Session] = None) -> Settings:
    """
    Verifies the license status and updates system settings (ee_features_enabled, tier, 
    application_status, and seat information) dynamically.
    """
    from onyx.utils.variable_functionality import _LICENSE_ENFORCEMENT_ENABLED
    if not _LICENSE_ENFORCEMENT_ENABLED:
        # MIT mode defaults
        settings.ee_features_enabled = False
        settings.tier = Tier.COMMUNITY
        return settings
        
    if db_session is None:
        from onyx.db.engine.sql_engine import get_session_with_current_tenant
        with get_session_with_current_tenant() as session:
            return apply_license_status_to_settings(settings, session)
            
    parsed_license = get_active_license(db_session)
    if not parsed_license:
        settings.application_status = ApplicationStatus.GATED_ACCESS
        settings.ee_features_enabled = False
        settings.tier = Tier.COMMUNITY
        return settings
        
    active_users = db_session.query(User).filter(User.is_active == True).count()
    doc_count = db_session.query(Document).count()
    
    settings.seat_count = parsed_license["user_count"]
    settings.used_seats = active_users
    
    limit = parsed_license["user_count"]
    doc_limit = parsed_license["document_count"]
    
    if active_users > limit or doc_count > doc_limit:
        settings.application_status = ApplicationStatus.SEAT_LIMIT_EXCEEDED
        settings.ee_features_enabled = True
        settings.tier = Tier.ENTERPRISE
    else:
        settings.application_status = ApplicationStatus.ACTIVE
        settings.ee_features_enabled = True
        settings.tier = Tier.ENTERPRISE
        
    return settings
