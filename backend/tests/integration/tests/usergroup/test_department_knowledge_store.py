import os
from tests.integration.common_utils.constants import API_SERVER_URL
from tests.integration.common_utils.http_client import client
from tests.integration.common_utils.managers.user import UserManager
from tests.integration.common_utils.managers.user_group import UserGroupManager
from tests.integration.common_utils.test_models import DATestUser, DATestUserGroup
import pytest

def test_department_knowledge_store_flow(admin_user: DATestUser) -> None:
    # 1. Create a regular user
    member_user = UserManager.create()

    # 2. Create a UserGroup (Department)
    user_group = UserGroupManager.create(
        name="kỹ thuật",
        user_ids=[member_user.id],
        user_performing_action=admin_user,
    )

    # 3. Create a DocumentSet for this Department (is_department=True)
    # Let's create it via the API: POST /manage/admin/document-set
    from tests.integration.common_utils.managers.connector import ConnectorManager
    # Let's create a test connector first
    connector = ConnectorManager.create_web_connector(
        user_performing_action=admin_user,
    )
    cc_pair = ConnectorManager.create_cc_pair(
        connector=connector,
        user_performing_action=admin_user,
    )

    # Create document set
    doc_set_payload = {
        "name": "Kho Kỹ Thuật",
        "description": "Kho tài liệu của phòng Kỹ Thuật",
        "cc_pair_ids": [cc_pair.id],
        "is_public": False,
        "users": [member_user.id],
        "groups": [user_group.id],
        "is_department": True,
    }
    
    response = client.post(
        f"{API_SERVER_URL}/manage/admin/document-set",
        json=doc_set_payload,
        headers=admin_user.headers,
    )
    assert response.status_code == 200
    doc_set_id = response.json()

    # 4. Check that Kho Tổng (Master Store) auto-syncs and gets created with the connector
    response_master = client.get(
        f"{API_SERVER_URL}/manage/document-set",
        headers=admin_user.headers,
    )
    assert response_master.status_code == 200
    doc_sets = response_master.json()
    master_store = next((ds for ds in doc_sets if ds["is_master_store"]), None)
    assert master_store is not None
    assert master_store["name"] == "Kho Tổng"
    
    # 5. Clean up
    client.delete(
        f"{API_SERVER_URL}/manage/admin/document-set/{doc_set_id}",
        headers=admin_user.headers,
    )
    UserGroupManager.delete(user_group, admin_user)
