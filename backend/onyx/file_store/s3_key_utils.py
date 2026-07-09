"""
S3 key sanitization utilities for ensuring AWS S3 compatibility.

This module provides utilities for sanitizing file names to be compatible with
AWS S3 object key naming guidelines while ensuring uniqueness when significant
sanitization occurs.

Reference: https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html
"""

import hashlib
import re
import urllib.parse
from re import Match

# Constants for S3 key generation
HASH_LENGTH = 64  # SHA256 hex digest length
HASH_SEPARATOR_LENGTH = 1  # Length of underscore separator
HASH_WITH_SEPARATOR_LENGTH = HASH_LENGTH + HASH_SEPARATOR_LENGTH


def _encode_special_char(match: Match[str]) -> str:
    """Helper function to URL encode special characters."""
    return urllib.parse.quote(match.group(0), safe="")


def sanitize_s3_key_name(file_name: str) -> str:
    """
    Sanitize file name to be S3-compatible according to AWS guidelines.

    Replaces special, space, and non-ASCII characters with safe alternatives.
    """
    if not file_name:
        return "unnamed_file"

    import unicodedata

    # Convert accented characters (like Vietnamese) to ASCII equivalents
    normalized = unicodedata.normalize("NFKD", file_name)
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")

    # Replace any character that is not alphanumeric, dot, hyphen, or underscore with underscore
    sanitized = re.sub(r"[^A-Za-z0-9._-]", "_", ascii_name)

    # Ensure we don't have consecutive periods at the start (relative path issue)
    sanitized = re.sub(r"^\.+", "", sanitized)

    # Remove any trailing periods
    sanitized = sanitized.rstrip(".")

    # Deduplicate consecutive underscores or hyphens
    sanitized = re.sub(r"[-_]{2,}", "_", sanitized)

    if not sanitized:
        sanitized = "sanitized_file"

    # Always append a short hash of the original name to guarantee uniqueness if name changed
    if sanitized != file_name:
        name_hash = hashlib.sha256(file_name.encode("utf-8")).hexdigest()[:8]
        if "." in sanitized and len(sanitized.split(".")[-1]) <= 10:
            name_parts = sanitized.rsplit(".", 1)
            sanitized = f"{name_parts[0]}_{name_hash}.{name_parts[1]}"
        else:
            sanitized = f"{sanitized}_{name_hash}"

    return sanitized


def generate_s3_key(
    file_name: str, prefix: str, tenant_id: str, max_key_length: int = 1024
) -> str:
    """
    Generate a complete S3 key from file name with prefix and tenant ID.

    Args:
        file_name: The original file name
        prefix: S3 key prefix (e.g., 'onyx-files')
        tenant_id: Tenant identifier
        max_key_length: Maximum allowed S3 key length (default: 1024)

    Returns:
        A complete S3 key that fits within the length limit
    """
    # Strip slashes from prefix and tenant_id to avoid double slashes
    prefix_clean = prefix.strip("/")
    tenant_clean = tenant_id.strip("/")

    # Sanitize the file name first
    sanitized_file_name = sanitize_s3_key_name(file_name)

    # Handle long file names that could exceed S3's key limit
    # S3 key format: {prefix}/{tenant_id}/{file_name}
    prefix_and_tenant_parts = [prefix_clean, tenant_clean]
    prefix_and_tenant = "/".join(prefix_and_tenant_parts) + "/"
    max_file_name_length = max_key_length - len(prefix_and_tenant)

    if len(sanitized_file_name) < max_file_name_length:
        return "/".join(prefix_and_tenant_parts + [sanitized_file_name])

    # For very long file names, use hash-based approach to ensure uniqueness
    # Use the original file name for the hash to maintain consistency
    file_hash = hashlib.sha256(file_name.encode("utf-8")).hexdigest()

    # Calculate how much space we have for the readable part
    # Reserve space for hash (64 chars) + underscore separator (1 char)
    readable_part_max_length = max(0, max_file_name_length - HASH_WITH_SEPARATOR_LENGTH)

    if readable_part_max_length > 0:
        # Use first part of sanitized name + hash to maintain some readability
        readable_part = sanitized_file_name[:readable_part_max_length]
        truncated_name = f"{readable_part}_{file_hash}"
    else:
        # If no space for readable part, just use hash
        truncated_name = file_hash

    return "/".join(prefix_and_tenant_parts + [truncated_name])
