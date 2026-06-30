import re
from typing import Any, List

class VietnameseLegalSplitter:
    def __init__(self, fallback_splitter: Any = None) -> None:
        self.article_pattern = re.compile(r'^(Điều\s+\d+[a-z]?\.)', re.IGNORECASE)
        self.fallback_splitter = fallback_splitter

    def chunk(self, text: str) -> List[str]:
        lines = text.split("\n")
        
        chunks: List[str] = []
        current_chunk: List[str] = []
        
        for line in lines:
            line_strip = line.strip()
            if self.article_pattern.match(line_strip):
                if current_chunk:
                    chunks.append("\n".join(current_chunk))
                    current_chunk = []
                current_chunk.append(line)
            else:
                current_chunk.append(line)
                
        if current_chunk:
            chunks.append("\n".join(current_chunk))
            
        final_chunks: List[str] = []
        for c in chunks:
            if not c.strip():
                continue
            # If there's a fallback splitter, use it to ensure token limit constraints
            if self.fallback_splitter:
                c_splits = self.fallback_splitter.chunk(c)
                final_chunks.extend(c_splits)
            else:
                final_chunks.append(c)
                
        return final_chunks
