import time
from typing import Any
from unittest.mock import MagicMock

from onyx.configs.app_configs import POSTGRES_API_SERVER_POOL_OVERFLOW
from onyx.configs.app_configs import POSTGRES_API_SERVER_POOL_SIZE
from onyx.configs.constants import POSTGRES_WEB_APP_NAME
from onyx.db.engine.sql_engine import SqlEngine, get_session_with_current_tenant
from onyx.db.search_settings import get_active_search_settings
from onyx.db.users import get_all_users
from onyx.document_index.factory import get_default_document_index
from onyx.tools.tool_implementations.search.search_tool import SearchTool, SearchToolOverrideKwargs
from onyx.tools.tool_implementations.search.search_tool import PersonaSearchInfo
from shared_configs.contextvars import CURRENT_TENANT_ID_CONTEXTVAR

def run_test() -> None:
    CURRENT_TENANT_ID_CONTEXTVAR.set("public")
    
    SqlEngine.set_app_name(POSTGRES_WEB_APP_NAME)
    SqlEngine.init_engine(
        pool_size=POSTGRES_API_SERVER_POOL_SIZE,
        max_overflow=POSTGRES_API_SERVER_POOL_OVERFLOW,
    )
    
    print("Connecting to DB...")
    with get_session_with_current_tenant() as db_session:
        users = get_all_users(db_session)
        user = users[0] if users else None
        if not user:
            print("No user found. Exiting.")
            return
            
        active_search_settings = get_active_search_settings(db_session)
        primary_settings = active_search_settings.primary
        document_index = get_default_document_index(primary_settings, None, db_session)
        
        # Build dummy PersonaSearchInfo
        persona_search_info = PersonaSearchInfo(
            document_set_names=[],
            search_start_date=None,
            attached_document_ids=[],
            hierarchy_node_ids=[],
        )
        
        # Instantiate SearchTool
        search_tool = SearchTool(
            tool_id=1,
            emitter=MagicMock(),
            user=user,
            persona_search_info=persona_search_info,
            llm=MagicMock(), # Dummy LLM
            document_index=document_index,
            user_selected_filters=None,
            project_id_filter=None,
            persona_id_filter=None,
            bypass_acl=True,
            slack_context=None,
            enable_slack_search=False,
        )
        
        from onyx.db.memory import UserMemoryContext, UserInfo
        user_info_obj = UserInfo(name=user.email, role="user", email=user.email)
        user_memory_context = UserMemoryContext(
            user_id=user.id,
            user_info=user_info_obj,
            user_preferences=None,
            memories=(),
        )
        
        # Build SearchToolOverrideKwargs
        override_kwargs = SearchToolOverrideKwargs(
            original_query="Quy chế chi tiêu tiếp khách công ty",
            num_hits=10,
            message_history=[],
            user_memory_context=user_memory_context,
            user_info=None,
            skip_query_expansion=True,
            max_llm_chunks=None,
            starting_citation_num=1,
        )
        
        from onyx.server.query_and_chat.placement import Placement
        placement = Placement(turn_index=0)
        
        print("Executing SearchTool.run...")
        response = search_tool.run(
            placement=placement,
            override_kwargs=override_kwargs,
            queries=["Quy chế chi tiêu tiếp khách công ty"]
        )
        
        print("\n--- SearchTool Facing LLM Response ---")
        print(response.llm_facing_response)
        
        print("\n--- SearchDocs Response ---")
        if response.rich_response and hasattr(response.rich_response, "search_docs"):
            docs = response.rich_response.search_docs
            print(f"Retrieved {len(docs)} documents.")
            for idx, doc in enumerate(docs):
                print(f"  [{idx+1}] ID: {doc.document_id}, Link: {doc.link}")
                print(f"      Semantic ID: {doc.semantic_identifier}")
                print(f"      Blurb: {doc.blurb[:150]}...")
        else:
            print("No rich response or search docs.")

if __name__ == "__main__":
    run_test()
