import pytest
from unittest.mock import MagicMock

from onyx.db.models import License, User, Document
from onyx.error_handling.error_codes import OnyxErrorCode
from onyx.error_handling.exceptions import OnyxError
from onyx.db.license import check_seat_availability, invalidate_license_cache
from onyx.server.settings.models import Settings
from onyx.db.license import apply_license_status_to_settings


def test_license_enforcement_flow():
    # Setup mock db_session
    db_session = MagicMock()
    
    # 1. No license configured
    db_session.query().first.return_value = None
    
    # Ensure cache is clean
    invalidate_license_cache()
    
    # check_seat_availability should fail since no license exists
    result = check_seat_availability(db_session)
    assert result.available is False
    assert "No valid or active enterprise license" in result.error_message
    
    # 2. Save a valid license (limit: 10 users, 100 documents)
    valid_license_b64 = "eyJ1c2VyX2NvdW50IjogMTAsICJkb2N1bWVudF9jb3VudCI6IDEwMCwgImV4cGlyeV9kYXRlIjogIjIwMjgtMTItMzEiLCAic2lnbmF0dXJlIjogImhad3F5K0kraDBjajVFTDlIZmgzSU91bnVNTUlwQWFsYU5wNTJ2S2hMREppbEdhL3dXUGxQVnM2RzMrdlhtUXdaY2ZoMWNDOU5BWjRmOW1kaHN0MnBoUjNwNDZTUFM4R2ZYRGt6T2c1LytSdzV0THk3d29GU0VnREg2K01VWjBvQ0ZFRFFVbmhBdWFpaDA1eXovL2djVVQwVGZhSkJXSUdoWVF0QXBXT0U0ZUEvcVpsS09WRjhLYnljK0xDTDM2M1hmK1haWlQ0ZE9LZCsrU3AzYytKVWpkbzF3SGZvczBDTWZMZDNGZk4raUtkVHZVRllYWG8zZkdsdDc0bS92bVp1c1ZJYWh2ZTdOWHRhZktNUTlMbmxSTkJMbitESUQyYVdHa2ZzOGxncEZNeTdZRWpvUnpMbzlNbndtSHhLWlpEVGVrY2lzbG1SNHVwd0Mxc2tHY0xKZz09In0="
    
    mock_license = MagicMock()
    mock_license.license_data = valid_license_b64
    db_session.query().first.return_value = mock_license
    
    # Clear cache and reload
    invalidate_license_cache()
    
    # Mock user count <= 10 (returns 3)
    # Mock document count <= 100 (returns 50)
    db_session.query().filter().count.return_value = 3
    db_session.query().count.return_value = 50
    
    # check_seat_availability should now pass successfully
    result = check_seat_availability(db_session)
    assert result.available is True
    
    # 3. Mock document count exceeding limit (returns 105)
    db_session.query().count.return_value = 105
    
    # check_seat_availability should now fail due to document limit
    result = check_seat_availability(db_session)
    assert result.available is False
    assert "Document limit exceeded" in result.error_message
    
    # Reset count to normal (returns 5)
    db_session.query().count.return_value = 5
    
    # 4. Mock user count exceeding limit (returns 15)
    db_session.query().filter().count.return_value = 15
    
    # check_seat_availability should now fail due to user limit
    result = check_seat_availability(db_session)
    assert result.available is False
    assert "Active seat limit exceeded" in result.error_message
    
    # 5. Test apply settings changes
    db_session.query().filter().count.return_value = 3
    db_session.query().count.return_value = 5
    
    settings = Settings()
    settings = apply_license_status_to_settings(settings, db_session)
    assert settings.ee_features_enabled is True
    assert settings.seat_count == 10
    assert settings.used_seats == 3
    
    invalidate_license_cache()
