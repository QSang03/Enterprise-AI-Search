import io
import os
import logging
import tempfile
from typing import Any, List, Dict

import numpy as np
from PIL import Image
import uvicorn
from fastapi import FastAPI, File, UploadFile, Query, HTTPException

# pyrefly: ignore [missing-import]
import fitz  # PyMuPDF

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("document_intelligence_ocr")

app = FastAPI(title="Local Document Intelligence Service")

USE_GPU = os.environ.get("USE_GPU", "True").lower() == "true"
PDF_DPI = int(os.environ.get("PDF_DPI", "300"))

# ---------------------------------------------------------------------------
# Model initialization — PP-OCRv6_medium (PaddleOCR 3.x) + PaddleOCR-VL-1.6
# ---------------------------------------------------------------------------

logger.info(f"Initializing PP-OCRv6 (use_gpu={USE_GPU})...")
try:
    # pyrefly: ignore [missing-import]
    from paddleocr import PaddleOCR

    _ocr_kwargs: Dict[str, Any] = {
        "lang": "vi",
        "use_textline_orientation": True,
        "text_det_limit_side_len": 1920,
    }
    if USE_GPU:
        _ocr_kwargs["device"] = "gpu:0"
    else:
        _ocr_kwargs["device"] = "cpu"

    ocr = PaddleOCR(**_ocr_kwargs)
    logger.info("PP-OCRv6 initialized successfully.")
except Exception as e:
    logger.error(f"Failed to initialize PP-OCRv6: {e}")
    raise

logger.info("Initializing PaddleOCR-VL-1.6 (0.9B) for layout reconstruction...")
try:
    # pyrefly: ignore [missing-import]
    from paddleocr import PaddleOCRVL

    vl_pipeline = PaddleOCRVL()
    logger.info("PaddleOCR-VL-1.6 initialized successfully.")
except Exception as e:
    logger.warning(
        f"PaddleOCR-VL not available, will skip layout reconstruction: {e}"
    )
    vl_pipeline = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run_ppocr_on_array(img_array: np.ndarray) -> Dict[str, Any]:
    """Run PP-OCRv6 on a numpy array (RGB). Returns raw bbox+text results."""
    text_lines: List[str] = []
    layout_blocks: List[Dict[str, Any]] = []
    total_confidence = 0.0
    char_count = 0

    try:
        results = list(ocr.predict(img_array))
    except Exception as e:
        logger.warning(f"PP-OCRv6 predict failed: {e}")
        return {"text_content": "", "layout_blocks": [], "ocr_confidence": 0.0}

    for res in results:
        if res is None:
            continue

        # PaddleOCR 3.x result can be an object with attributes or a dict.
        # Try object attributes first, then dict access, then .json property.
        dt_polys: List[Any] = []
        rec_texts: List[str] = []
        rec_scores: List[float] = []

        if hasattr(res, "dt_polys"):
            dt_polys = list(getattr(res, "dt_polys", []) or [])
            rec_texts = list(getattr(res, "rec_texts", []) or [])
            rec_scores = list(getattr(res, "rec_scores", []) or [])
        elif isinstance(res, dict):
            dt_polys = res.get("dt_polys", [])
            rec_texts = res.get("rec_texts", [])
            rec_scores = res.get("rec_scores", [])
        else:
            # Fallback: try .json property
            try:
                data = res.json if hasattr(res, "json") else {}
                if callable(data):
                    data = data()
                dt_polys = data.get("dt_polys", [])
                rec_texts = data.get("rec_texts", [])
                rec_scores = data.get("rec_scores", [])
            except Exception:
                logger.warning(f"Cannot parse PP-OCRv6 result object: {type(res)}")

        for poly, text, score in zip(dt_polys, rec_texts, rec_scores):
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


def _run_vl_on_file(file_path: str) -> str:
    """Run PaddleOCR-VL on a file path. Returns reconstructed text or empty string."""
    if vl_pipeline is None:
        return ""
    try:
        vl_results = list(vl_pipeline.predict(file_path))
        parts: List[str] = []
        for res in vl_results:
            if res is None:
                continue
            # Try multiple access patterns for VL result
            text = ""
            if hasattr(res, "text"):
                text = getattr(res, "text", "") or ""
            elif isinstance(res, dict):
                text = res.get("text", "") or res.get("res_text", "") or ""
            if not text:
                try:
                    data = res.json if hasattr(res, "json") else {}
                    if callable(data):
                        data = data()
                    if isinstance(data, dict):
                        text = (
                            data.get("text", "")
                            or data.get("res_text", "")
                            or data.get("markdown", "")
                            or ""
                        )
                except Exception:
                    pass
            if text and text.strip():
                parts.append(text.strip())
        return "\n\n".join(p for p in parts if p)
    except Exception as e:
        logger.warning(f"PaddleOCR-VL predict failed: {e}")
        return ""



def run_ocr_on_image(image: Image.Image, tmp_dir: str) -> Dict[str, Any]:
    """
    Two-step pipeline:
    1. PP-OCRv6 → raw bbox + text + confidence
    2. PaddleOCR-VL → layout-aware reconstructed text (reading order corrected)
    VLM text is used as the primary text_content; PP-OCRv6 bboxes become layout_blocks.
    """
    img_rgb = np.array(image.convert("RGB"))

    # Step 1: PP-OCRv6 for bbox + per-line confidence
    ocr_result = _run_ppocr_on_array(img_rgb)
    layout_blocks = ocr_result["layout_blocks"]
    avg_confidence = ocr_result["ocr_confidence"]

    # Step 2: PaddleOCR-VL for layout-aware text
    vl_text = ""
    if vl_pipeline is not None:
        tmp_path = os.path.join(tmp_dir, "_vl_input.png")
        image.save(tmp_path, format="PNG")
        vl_text = _run_vl_on_file(tmp_path)

    # Use VLM text if available, else fall back to PP-OCRv6 raw join
    text_content = vl_text if vl_text.strip() else ocr_result["text_content"]

    return {
        "text_content": text_content,
        "layout_blocks": layout_blocks,
        "ocr_confidence": avg_confidence,
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

        with tempfile.TemporaryDirectory() as tmp_dir:
            # ----------------------------------------------------------------
            # PDF
            # ----------------------------------------------------------------
            if file_ext == ".pdf":
                logger.info(f"Parsing PDF at {PDF_DPI} DPI...")
                try:
                    doc = fitz.open(stream=file_bytes, filetype="pdf")
                    for page_idx, page in enumerate(doc):
                        page_num = page_idx + 1
                        logger.info(
                            f"  Processing PDF page {page_num}/{len(doc)}"
                        )

                        pix = page.get_pixmap(dpi=PDF_DPI)
                        img_data = pix.tobytes("png")
                        image = Image.open(io.BytesIO(img_data))

                        page_res = run_ocr_on_image(image, tmp_dir)

                        ocr_pages.append(
                            {
                                "page_number": page_num,
                                "ocr_text": page_res["text_content"],
                                "ocr_confidence": page_res["ocr_confidence"],
                                "layout_data": {},
                            }
                        )

                        # Shift char offsets for accumulated text
                        char_offset = len("\n\n".join(all_text_parts)) + (
                            2 if all_text_parts else 0
                        )
                        for block in page_res["layout_blocks"]:
                            shifted = dict(block)
                            shifted["char_start"] += char_offset
                            shifted["char_end"] += char_offset
                            all_layout_blocks.append(shifted)

                        if page_res["text_content"]:
                            all_text_parts.append(page_res["text_content"])

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
                    page_res = run_ocr_on_image(image, tmp_dir)

                    ocr_pages.append(
                        {
                            "page_number": 1,
                            "ocr_text": page_res["text_content"],
                            "ocr_confidence": page_res["ocr_confidence"],
                            "layout_data": {},
                        }
                    )
                    all_layout_blocks = page_res["layout_blocks"]
                    if page_res["text_content"]:
                        all_text_parts.append(page_res["text_content"])

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

        response_payload: Dict[str, Any] = {
            "text_content": full_text,
            "metadata": {"ocr_pages": ocr_pages},
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
