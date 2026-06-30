import os
from unittest.mock import MagicMock
from onyx.chat.models import Packet, StreamingError, MessageResponseIDInfo
from onyx.server.query_and_chat.streaming_models import AgentResponseDelta
from onyx.context.search.models import SearchDoc
from onyx.configs.constants import DocumentSource

def run_test() -> None:
    from onyx.chat.process_message import verify_citations_and_stream
    
    # Mock LLM
    mock_llm = MagicMock()
    
    # Mock retrieved doc
    doc = SearchDoc(
        document_id="doc_001",
        chunk_ind=0,
        semantic_identifier="Quy chế tiếp khách",
        blurb="Công ty chi tiêu tiếp khách không quá 5 triệu đồng một lần.",
        source_type=DocumentSource.FILE,
        hidden=False,
        metadata={},
        match_highlights=[],
        boost=0
    )
    
    # Mock state container
    mock_state_container = MagicMock()
    mock_state_container.get_all_search_docs.return_value = {"doc_001": doc}
    
    from onyx.server.query_and_chat.placement import Placement
    placement = Placement(turn_index=0)
    
    def make_run_stream():
        yield Packet(placement=placement, obj=AgentResponseDelta(content="Công ty chi tiêu không quá 5 triệu. "))
        yield Packet(placement=placement, obj=AgentResponseDelta(content="Ngoài ra chủ tịch được chi tiêu vô hạn."))
        yield MessageResponseIDInfo(reserved_assistant_message_id=1, user_message_id=0) # dummy non-delta packet
        
    # --- Case 1: High unsupported claim rate (> 5%) ---
    # The first sentence gets YES, the second gets NO. (Unsupported count = 1/2 = 50% > 5%)
    mock_llm.invoke.side_warnings = []
    mock_llm.invoke.side_effect = ["YES", "NO"]
    
    print("\n=== Testing Case 1: High unsupported claim rate (Expect refusal) ===")
    os.environ["CITATION_VERIFICATION_REFUSAL_MSG"] = "Xin lỗi, thông tin không được hỗ trợ bởi tài liệu nguồn."
    
    stream_out = list(verify_citations_and_stream(make_run_stream(), mock_llm, mock_state_container))
    
    deltas = [p.obj.content for p in stream_out if isinstance(p, Packet) and isinstance(p.obj, AgentResponseDelta)]
    print(f"Delivered answer tokens: {deltas}")
    assert len(deltas) == 1
    assert deltas[0] == "Xin lỗi, thông tin không được hỗ trợ bởi tài liệu nguồn."
    print("SUCCESS: Answer was successfully rejected and replaced by refusal message!")
    
    # --- Case 2: Low unsupported claim rate (<= 5%) ---
    # Both sentences get YES. (Unsupported count = 0/2 = 0% <= 5%)
    mock_llm.invoke.side_effect = ["YES", "YES"]
    
    print("\n=== Testing Case 2: Supported claims (Expect original answer) ===")
    stream_out2 = list(verify_citations_and_stream(make_run_stream(), mock_llm, mock_state_container))
    
    deltas2 = [p.obj.content for p in stream_out2 if isinstance(p, Packet) and isinstance(p.obj, AgentResponseDelta)]
    print(f"Delivered answer tokens: {deltas2}")
    assert len(deltas2) == 2
    assert deltas2[0] == "Công ty chi tiêu không quá 5 triệu. "
    assert deltas2[1] == "Ngoài ra chủ tịch được chi tiêu vô hạn."
    print("SUCCESS: Supported answer was successfully delivered!")

if __name__ == "__main__":
    run_test()
