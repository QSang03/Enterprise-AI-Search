import io
import os
import logging
import tempfile
import base64
import json
from typing import Any, List, Dict

import numpy as np
from PIL import Image
import uvicorn
import httpx
from fastapi import FastAPI, File, UploadFile, Query, HTTPException

# pyrefly: ignore [missing-import]
import fitz  # PyMuPDF

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("document_intelligence_ocr")

app = FastAPI(title="Local Document Intelligence Service")

PDF_DPI = int(os.environ.get("PDF_DPI", "300"))
VLM_TRIGGER_BLOCK_THRESHOLD = int(os.environ.get("VLM_TRIGGER_BLOCK_THRESHOLD", "20"))
MAX_VLM_IMAGE_DIM = int(os.environ.get("MAX_VLM_IMAGE_DIM", "1024"))

# ---------------------------------------------------------------------------
# Model initialization — RapidOCR (ONNX Runtime)
# ---------------------------------------------------------------------------

logger.info("Initializing RapidOCR...")
try:
    # pyrefly: ignore [missing-import]
    from rapidocr_onnxruntime import RapidOCR

    ocr = RapidOCR()
    logger.info("RapidOCR initialized successfully.")
except Exception as e:
    logger.error(f"Failed to initialize RapidOCR: {e}")
    raise


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run_rapidocr_on_array(img_array: np.ndarray) -> Dict[str, Any]:
    """Run RapidOCR on a numpy array (RGB). Returns raw bbox+text results."""
    text_lines: List[str] = []
    layout_blocks: List[Dict[str, Any]] = []
    total_confidence = 0.0
    char_count = 0

    try:
        # RapidOCR returns (result, elapse)
        results, elapse = ocr(img_array)
    except Exception as e:
        logger.warning(f"RapidOCR predict failed: {e}")
        return {"text_content": "", "layout_blocks": [], "ocr_confidence": 0.0}

    if not results:
        return {"text_content": "", "layout_blocks": [], "ocr_confidence": 0.0}

    for item in results:
        if not item or len(item) < 3:
            continue
        
        poly, text, score = item[0], item[1], item[2]
        if not text:
            continue

        try:
            xs = [p[0] for p in poly]
            ys = [p[1] for p in poly]
            xmin, ymin, xmax, ymax = min(xs), min(ys), max(xs), max(ys)
        except Exception:
            xmin = ymin = xmax = ymax = 0.0

        start_idx = char_count
        end_idx = start_idx + len(text)
        char_count = end_idx + 1

        text_lines.append(text)
        layout_blocks.append(
            {
                "type": "text",
                "text": text,
                "bbox": [float(xmin), float(ymin), float(xmax), float(ymax)],
                "confidence": float(score),
                "char_start": start_idx,
                "char_end": end_idx,
            }
        )
        total_confidence += float(score)

    avg_confidence = total_confidence / len(text_lines) if text_lines else 0.0
    return {
        "text_content": "\n".join(text_lines),
        "layout_blocks": layout_blocks,
        "ocr_confidence": avg_confidence,
    }


def _is_complex_layout(blocks: List[Dict[str, Any]], img_width: int) -> bool:
    """Determine if spatial layout requires VLM correction.
    Fires if block count is high OR if there are distinct columns separated by gap > 15% of width."""
    if len(blocks) > VLM_TRIGGER_BLOCK_THRESHOLD:
        return True
    if len(blocks) < 3:
        return False
        
    x_centers = sorted([(b["bbox"][0] + b["bbox"][2]) / 2 for b in blocks])
    gap_threshold = img_width * 0.15
    for i in range(1, len(x_centers)):
        if x_centers[i] - x_centers[i-1] > gap_threshold:
            return True
            
    return False


def _run_vllm_multimodal(image: Image.Image, blocks: List[Dict[str, Any]], raw_text: str) -> str:
    """Send original resized image, OCR bboxes and raw text to vLLM multimodal Gemma-4 API."""
    vllm_api_url = os.environ.get("VLLM_API_URL", "http://host.docker.internal:9000/v1")
    vllm_api_key = os.environ.get("VLLM_API_KEY", "sk-ai-atom-gemma4-9000")
    vllm_model = os.environ.get("VLLM_MODEL", "gemma-4-e2b")

    if not raw_text.strip():
        return ""

    # 1. Resize image to avoid token overflow and keep VLM inference fast
    img_copy = image.copy()
    if img_copy.mode not in ("RGB", "RGBA"):
        img_copy = img_copy.convert("RGB")
    img_copy.thumbnail((MAX_VLM_IMAGE_DIM, MAX_VLM_IMAGE_DIM))
    
    # 2. Encode to base64
    buffered = io.BytesIO()
    img_copy.save(buffered, format="PNG")
    img_base64 = base64.b64encode(buffered.getvalue()).decode("utf-8")

    # 3. Create structural payload info for VLM
    bbox_info = [
        {"text": b["text"], "bbox": b["bbox"]}
        for b in blocks
    ]
    bbox_str = json.dumps(bbox_info, ensure_ascii=False, indent=2)

    # Ensure the endpoint url is correct (ends with /chat/completions)
    endpoint = vllm_api_url
    if not endpoint.endswith("/chat/completions"):
        if endpoint.endswith("/v1"):
            endpoint = endpoint + "/chat/completions"
        elif endpoint.endswith("/v1/"):
            endpoint = endpoint + "chat/completions"
        else:
            endpoint = endpoint.rstrip("/") + "/v1/chat/completions"

    prompt = (
        "Bạn là một chuyên gia sắp xếp trật tự đọc văn bản từ tài liệu/ảnh chụp.\n"
        "Hãy thực hiện theo quy trình sau:\n"
        "1. Xem kỹ bức ảnh được cung cấp để xác định cấu trúc layout (ví dụ: chia cột bên trái/phải, bảng biểu, thanh công cụ, menu chat).\n"
        "2. Sử dụng tọa độ bbox (x1, y1, x2, y2) của các khối chữ OCR dưới đây để phân nhóm chúng vào các phân vùng cột/khu vực tương ứng.\n"
        "   Ví dụ: Nếu ảnh có 2 cột (cột trái và cột phải), bạn phải nhận diện và gom toàn bộ chữ của cột trái trước (sắp xếp từ trên xuống dưới), rồi mới gom toàn bộ chữ của cột phải (sắp xếp từ trên xuống dưới).\n"
        "3. Tuyệt đối KHÔNG trộn xen kẽ các dòng thuộc các cột khác nhau với nhau theo hàng ngang. Phải giữ nguyên cấu trúc khối dọc của từng cột.\n"
        "4. Sửa các lỗi chính tả nhỏ do OCR nhận diện sai ký tự (ví dụ: 'Rank 1: Ihe T' -> 'Rank 1: User_100' hoặc 'ine 2' -> 'Line 2' nếu ngữ cảnh rõ ràng). Nếu không chắc chắn, giữ nguyên.\n"
        "5. Chỉ trả về văn bản sạch sau khi sắp xếp, KHÔNG tóm tắt, KHÔNG bình luận hay giải thích thêm.\n\n"
        f"Danh sách OCR blocks thô kèm tọa độ bbox:\n{bbox_str}"
    )

    headers = {
        "Authorization": f"Bearer {vllm_api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": vllm_model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img_base64}"}}
                ]
            }
        ],
        "temperature": 0.1,
        "max_tokens": 4096,
        "chat_template_kwargs": {"enable_thinking": False}
    }

    try:
        logger.info(f"Sending multimodal request to vLLM (thinking disabled): {endpoint}")
        with httpx.Client(proxy=None, timeout=600.0) as client:
            response = client.post(endpoint, headers=headers, json=payload)
            if response.status_code == 200:
                resp_json = response.json()
                content = resp_json["choices"][0]["message"]["content"]
                # Clean reasoning thinking tags if somehow leaked
                if "<thinking>" in content and "</thinking>" in content:
                    parts = content.split("</thinking>")
                    content = parts[-1].strip()
                elif "</thought>" in content:
                    parts = content.split("</thought>")
                    content = parts[-1].strip()
                return content.strip()
            else:
                logger.error(f"vLLM API returned status {response.status_code}: {response.text}")
                return ""
    except Exception as e:
        logger.error(f"Failed to query multimodal vLLM layout correction: {e}")
        return ""


def run_ocr_on_image(image: Image.Image) -> Dict[str, Any]:
    """
    Two-step pipeline:
    1. RapidOCR → raw bbox + text + confidence (always runs).
    2. Gemma-4 Multimodal VLM → layout-aware reconstructed text (reading order corrected).
       Only runs when layout is determined to be complex.
    Option C: Trả về corrected text_content, raw_text_content, và layout_blocks khớp với raw_text_content.
    """
    img_rgb = np.array(image.convert("RGB"))
    width, height = image.size

    # Step 1: PP-OCRv4 (via RapidOCR) for bbox + per-line confidence
    ocr_result = _run_rapidocr_on_array(img_rgb)
    layout_blocks = ocr_result["layout_blocks"]
    avg_confidence = ocr_result["ocr_confidence"]
    raw_text = ocr_result["text_content"]

    # Step 2: Spatial complexity check & Multimodal Gemma-4 correction
    corrected_text = ""
    used_vlm = False
    
    if _is_complex_layout(layout_blocks, width):
        logger.info(
            f"run_ocr_on_image - Detected complex spatial layout (blocks={len(layout_blocks)}, width={width}). "
            "Running Gemma-4 Multimodal layout correction..."
        )
        corrected_text = _run_vllm_multimodal(image, layout_blocks, raw_text)
        if corrected_text.strip():
            used_vlm = True
    else:
        logger.info(
            f"run_ocr_on_image - Simple spatial layout (blocks={len(layout_blocks)}). "
            "Skipping VLM (using RapidOCR raw text directly)"
        )

    # Use corrected text as main text_content, save raw in raw_text_content
    text_content = corrected_text if used_vlm else raw_text

    return {
        "text_content": text_content,
        "raw_text_content": raw_text,
        "layout_blocks": layout_blocks,
        "ocr_confidence": avg_confidence,
        "used_vlm": used_vlm,
    }


# ---------------------------------------------------------------------------
# API endpoint
# ---------------------------------------------------------------------------

@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/parse")
async def parse_file(
    file: UploadFile = File(...),
    parser_mode: str = Query("accurate"),
) -> Dict[str, Any]:
    logger.info(
        f"Received parse request: file={file.filename}, mode={parser_mode}"
    )

    try:
        file_bytes = await file.read()
        file_name = file.filename or "uploaded_file"
        file_ext = os.path.splitext(file_name)[1].lower()

        ocr_pages: List[Dict[str, Any]] = []
        all_layout_blocks: List[Dict[str, Any]] = []
        all_text_parts: List[str] = []
        all_raw_text_parts: List[str] = []

        # ----------------------------------------------------------------
        # PDF
        # ----------------------------------------------------------------
        if file_ext == ".pdf":
            logger.info("Processing PDF...")
            try:
                doc = fitz.open(stream=file_bytes, filetype="pdf")
                for page_idx, page in enumerate(doc):
                    page_num = page_idx + 1
                    
                    # Layer 2: Text-first extraction
                    page_text = page.get_text("text").strip()
                    
                    if len(page_text) > 100:
                        logger.info(
                            f"  PDF page {page_num}/{len(doc)}: extracted native text ({len(page_text)} chars). Skipping OCR."
                        )
                        ocr_pages.append(
                            {
                                "page_number": page_num,
                                "ocr_text": page_text,
                                "ocr_confidence": 1.0,
                                "layout_data": {},
                                "raw_text_content": page_text,
                                "used_vlm": False,
                            }
                        )
                        if page_text:
                            all_text_parts.append(page_text)
                            all_raw_text_parts.append(page_text)
                    else:
                        logger.info(
                            f"  PDF page {page_num}/{len(doc)}: native text too short ({len(page_text)} chars). Rasterizing page for OCR..."
                        )
                        pix = page.get_pixmap(dpi=PDF_DPI)
                        img_data = pix.tobytes("png")
                        image = Image.open(io.BytesIO(img_data))

                        page_res = run_ocr_on_image(image)

                        ocr_pages.append(
                            {
                                "page_number": page_num,
                                "ocr_text": page_res["text_content"],
                                "ocr_confidence": page_res["ocr_confidence"],
                                "layout_data": {},
                                "raw_text_content": page_res["raw_text_content"],
                                "used_vlm": page_res["used_vlm"],
                            }
                        )

                        # Shift char offsets relative to raw_text_content
                        char_offset = len("\n\n".join(all_raw_text_parts)) + (
                            2 if all_raw_text_parts else 0
                        )
                        for block in page_res["layout_blocks"]:
                            shifted = dict(block)
                            shifted["char_start"] += char_offset
                            shifted["char_end"] += char_offset
                            all_layout_blocks.append(shifted)

                        if page_res["text_content"]:
                            all_text_parts.append(page_res["text_content"])
                        if page_res["raw_text_content"]:
                            all_raw_text_parts.append(page_res["raw_text_content"])

            except Exception as pdf_err:
                logger.error(f"Failed to process PDF: {pdf_err}")
                raise HTTPException(
                    status_code=400, detail=f"Invalid PDF file: {pdf_err}"
                )

        # ----------------------------------------------------------------
        # Image
        # ----------------------------------------------------------------
        elif file_ext in {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tiff"}:
            logger.info("Parsing image file...")
            try:
                image = Image.open(io.BytesIO(file_bytes))
                page_res = run_ocr_on_image(image)

                ocr_pages.append(
                    {
                        "page_number": 1,
                        "ocr_text": page_res["text_content"],
                        "ocr_confidence": page_res["ocr_confidence"],
                        "layout_data": {},
                        "raw_text_content": page_res["raw_text_content"],
                        "used_vlm": page_res["used_vlm"],
                    }
                )
                all_layout_blocks = page_res["layout_blocks"]
                if page_res["text_content"]:
                    all_text_parts.append(page_res["text_content"])
                if page_res["raw_text_content"]:
                    all_raw_text_parts.append(page_res["raw_text_content"])

            except Exception as img_err:
                logger.error(f"Failed to process image: {img_err}")
                raise HTTPException(
                    status_code=400, detail=f"Invalid image file: {img_err}"
                )

        # ----------------------------------------------------------------
        # Unsupported
        # ----------------------------------------------------------------
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file extension: {file_ext}",
            )

        full_text = "\n\n".join(all_text_parts)
        full_raw_text = "\n\n".join(all_raw_text_parts)

        # Build Option C response:
        # - text_content: the best quality text (corrected by VLM if triggered)
        # - metadata: ocr_pages contains "raw_text_content" for debugging/raw reference
        # - layout_blocks: coordinates and char offsets aligned exactly with full_raw_text
        response_payload: Dict[str, Any] = {
            "text_content": full_text,
            "metadata": {
                "ocr_pages": ocr_pages,
                "raw_text_content": full_raw_text
            },
            "layout_blocks": all_layout_blocks,
            "images": [],
        }

        logger.info(
            f"Parsing complete. pages={len(ocr_pages)}, "
            f"blocks={len(all_layout_blocks)}, "
            f"chars={len(full_text)}"
        )
        return response_payload

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error during parse endpoint execution")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8090"))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
