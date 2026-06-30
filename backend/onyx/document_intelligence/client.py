import os
import httpx
import base64
from typing import Any, IO, NamedTuple, Sequence, Tuple
from onyx.utils.logger import setup_logger

logger = setup_logger()

DOCUMENT_INTELLIGENCE_URL = os.environ.get("DOCUMENT_INTELLIGENCE_URL", "")

class DocIntelResult(NamedTuple):
    text_content: str
    metadata: dict[str, Any]
    layout_blocks: list[dict[str, Any]]
    embedded_images: Sequence[Tuple[bytes, str]]


def is_document_intelligence_enabled() -> bool:
    return bool(DOCUMENT_INTELLIGENCE_URL)


class DocumentIntelligenceClient:
    def __init__(self, url: str = DOCUMENT_INTELLIGENCE_URL):
        self.url = url

    def parse_file(self, file: IO[Any], file_name: str, parser_mode: str = "accurate") -> DocIntelResult:
        logger.info(f"Calling Document Intelligence Service at {self.url} for file {file_name} in {parser_mode} mode")
        
        file.seek(0)
        file_bytes = file.read()
        file.seek(0)
        
        files = {
            "file": (file_name, file_bytes)
        }
        params = {
            "parser_mode": parser_mode
        }
        
        try:
            with httpx.Client(timeout=300.0) as client:
                response = client.post(self.url, files=files, params=params)
                
            if response.status_code != 200:
                logger.error(f"Document Intelligence Service returned status {response.status_code}: {response.text}")
                raise RuntimeError(f"Document Intelligence error: {response.text}")
                
            data = response.json()
            
            text_content = data.get("text_content", "")
            metadata = data.get("metadata", {})
            layout_blocks = data.get("layout_blocks", [])
            
            embedded_images = []
            images_data = data.get("images", [])
            for img in images_data:
                img_name = img.get("name", "image.png")
                b64_content = img.get("base64", "")
                if b64_content:
                    img_bytes = base64.b64decode(b64_content)
                    embedded_images.append((img_bytes, img_name))
            
            return DocIntelResult(
                text_content=text_content,
                metadata=metadata,
                layout_blocks=layout_blocks,
                embedded_images=embedded_images
            )
            
        except Exception as e:
            logger.exception(f"Failed to call Document Intelligence Service: {e}")
            raise
