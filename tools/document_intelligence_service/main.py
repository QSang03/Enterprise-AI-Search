import io
import os
import logging
from typing import Any, List, Dict
import numpy as np
from PIL import Image
import uvicorn
from fastapi import FastAPI, File, UploadFile, Query, HTTPException
from pydantic import BaseModel
# pyrefly: ignore [missing-import]
import fitz  # PyMuPDF
# pyrefly: ignore [missing-import]
from paddleocr import PaddleOCR

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("document_intelligence_ocr")

app = FastAPI(title="Local Document Intelligence Service")

# Initialize PaddleOCR
# Check if CUDA is available for GPU acceleration
USE_GPU = os.environ.get("USE_GPU", "True").lower() == "true"
logger.info(f"Initializing PaddleOCR (use_gpu={USE_GPU}) with Vietnamese/English support...")
try:
    ocr = PaddleOCR(use_angle_cls=True, lang="vi", use_gpu=USE_GPU)
except Exception as e:
    logger.warning(f"Failed to initialize PaddleOCR with GPU, falling back to CPU: {e}")
    ocr = PaddleOCR(use_angle_cls=True, lang="vi", use_gpu=False)

def run_ocr_on_image(image: Image.Image) -> Dict[str, Any]:
    """Run PaddleOCR on a PIL Image and format into blocks and pages."""
    # Convert PIL Image to numpy array
    img_np = np.array(image.convert("RGB"))
    
    # PaddleOCR expects BGR format
    # Convert RGB to BGR
    img_np = img_np[:, :, ::-1]
    
    # Run OCR
    result = ocr.ocr(img_np, cls=True)
    
    text_lines = []
    layout_blocks = []
    total_confidence = 0.0
    char_count = 0
    
    if result and result[0]:
        for idx, line in enumerate(result[0]):
            box = line[0]  # [[[x1, y1], [x2, y2], [x3, y3], [x4, y4]]]
            text, confidence = line[1]
            
            # Calculate standard bbox format [xmin, ymin, xmax, ymax]
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]
            xmin, ymin, xmax, ymax = min(xs), min(ys), max(xs), max(ys)
            
            text_lines.append(text)
            
            # Calculate char start/end indices for layout blocks
            start_idx = char_count
            end_idx = start_idx + len(text)
            char_count = end_idx + 1  # include space or newline
            
            layout_blocks.append({
                "type": "text",
                "text": text,
                "bbox": [float(xmin), float(ymin), float(xmax), float(ymax)],
                "confidence": float(confidence),
                "char_start": start_idx,
                "char_end": end_idx
            })
            total_confidence += confidence
            
    text_content = "\n".join(text_lines)
    avg_confidence = total_confidence / len(text_lines) if text_lines else 0.0
    
    return {
        "text_content": text_content,
        "layout_blocks": layout_blocks,
        "ocr_confidence": avg_confidence
    }

@app.post("/parse")
async def parse_file(
    file: UploadFile = File(...),
    parser_mode: str = Query("accurate")
):
    logger.info(f"Received parse request for file: {file.filename}, mode: {parser_mode}")
    
    try:
        file_bytes = await file.read()
        file_name = file.filename or "uploaded_file"
        file_ext = os.path.splitext(file_name)[1].lower()
        
        ocr_pages = []
        all_layout_blocks = []
        all_text_content_parts = []
        
        # 1. Process PDF
        if file_ext == ".pdf":
            logger.info("Parsing PDF file...")
            try:
                doc = fitz.open(stream=file_bytes, filetype="pdf")
                for page_idx, page in enumerate(doc):
                    page_num = page_idx + 1
                    logger.info(f"Processing PDF page {page_num}/{len(doc)}")
                    
                    # Render page to image
                    pix = page.get_pixmap(dpi=150)
                    img_data = pix.tobytes("png")
                    image = Image.open(io.BytesIO(img_data))
                    
                    # Run OCR
                    page_res = run_ocr_on_image(image)
                    
                    # Format as ocr_pages entry
                    ocr_pages.append({
                        "page_number": page_num,
                        "ocr_text": page_res["text_content"],
                        "ocr_confidence": page_res["ocr_confidence"],
                        "layout_data": {}
                    })
                    
                    # Shift layout block char starts/ends based on existing accumulated text
                    char_offset = len("\n\n".join(all_text_content_parts)) + (2 if all_text_content_parts else 0)
                    for block in page_res["layout_blocks"]:
                        block["char_start"] += char_offset
                        block["char_end"] += char_offset
                        all_layout_blocks.append(block)
                        
                    if page_res["text_content"]:
                        all_text_content_parts.append(page_res["text_content"])
            except Exception as pdf_err:
                logger.error(f"Failed to process PDF: {pdf_err}")
                raise HTTPException(status_code=400, detail=f"Invalid PDF file: {pdf_err}")
                
        # 2. Process Image files
        elif file_ext in [".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tiff"]:
            logger.info("Parsing image file...")
            try:
                image = Image.open(io.BytesIO(file_bytes))
                page_res = run_ocr_on_image(image)
                
                ocr_pages.append({
                    "page_number": 1,
                    "ocr_text": page_res["text_content"],
                    "ocr_confidence": page_res["ocr_confidence"],
                    "layout_data": {}
                })
                all_layout_blocks = page_res["layout_blocks"]
                all_text_content_parts.append(page_res["text_content"])
            except Exception as img_err:
                logger.error(f"Failed to process image: {img_err}")
                raise HTTPException(status_code=400, detail=f"Invalid image file: {img_err}")
        else:
            logger.warning(f"Unsupported file type: {file_ext}")
            raise HTTPException(status_code=400, detail=f"Unsupported file extension: {file_ext}")
            
        full_text = "\n\n".join(all_text_content_parts)
        
        # Build Response payload compatible with Onyx DocumentIntelligenceClient
        response_payload = {
            "text_content": full_text,
            "metadata": {
                "ocr_pages": ocr_pages
            },
            "layout_blocks": all_layout_blocks,
            "images": []  # Not extracting embedded sub-images for now
        }
        
        logger.info(f"Parsing complete. Extracted {len(ocr_pages)} pages, {len(all_layout_blocks)} layout blocks.")
        return response_payload
        
    except Exception as e:
        logger.exception("Error during parse endpoint execution")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8090"))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
