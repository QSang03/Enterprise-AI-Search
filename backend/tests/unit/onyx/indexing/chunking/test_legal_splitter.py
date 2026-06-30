from onyx.indexing.chunking.legal_splitter import VietnameseLegalSplitter

class MockSplitter:
    def chunk(self, text: str) -> list[str]:
        # Simple split by punctuation for testing
        return [s.strip() for s in text.split(".") if s.strip()]

def test_vietnamese_legal_splitter_basic() -> None:
    text = (
        "Điều 1. Phạm vi điều chỉnh\n"
        "Quy định này quy định về phạm vi điều chỉnh.\n"
        "Điều 2. Đối tượng áp dụng\n"
        "Áp dụng đối với các cán bộ nhân viên công ty."
    )
    
    splitter = VietnameseLegalSplitter()
    chunks = splitter.chunk(text)
    
    assert len(chunks) == 2
    assert "Điều 1." in chunks[0]
    assert "Điều 2." in chunks[1]
    assert "Đối tượng áp dụng" in chunks[1]

def test_vietnamese_legal_splitter_fallback() -> None:
    text = (
        "Điều 1. Phạm vi điều chỉnh\n"
        "Quy định này quy định về phạm vi điều chỉnh."
    )
    
    mock_fallback = MockSplitter()
    splitter = VietnameseLegalSplitter(fallback_splitter=mock_fallback)
    chunks = splitter.chunk(text)
    
    # Text split by ".":
    # "Điều 1"
    # "Phạm vi điều chỉnh\nQuy định này quy định về phạm vi điều chỉnh"
    assert len(chunks) >= 2
