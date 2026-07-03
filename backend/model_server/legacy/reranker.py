import asyncio
from typing import Any
from typing import Optional
from typing import TYPE_CHECKING

from fastapi import APIRouter
from fastapi import HTTPException

from model_server.utils import simple_log_function_time
from onyx.utils.logger import setup_logger
from shared_configs.configs import INDEXING_ONLY
from shared_configs.model_server_models import RerankRequest
from shared_configs.model_server_models import RerankResponse

if TYPE_CHECKING:
    from sentence_transformers import CrossEncoder

logger = setup_logger()

router = APIRouter(prefix="/encoder")

# Standard CrossEncoder cache (BGE, ms-marco, etc.)
_RERANK_MODEL: Optional["CrossEncoder"] = None
_RERANK_MODEL_NAME: Optional[str] = None

# Qwen3-Reranker uses a causal LM backbone — needs separate handling
_QWEN3_RERANKER_MODEL: Optional[Any] = None
_QWEN3_RERANKER_TOKENIZER: Optional[Any] = None
_QWEN3_RERANKER_MODEL_NAME: Optional[str] = None

_QWEN3_RERANKER_PREFIXES = [
    "Qwen/Qwen3-Reranker",
    "qwen3-reranker",
    "Qwen3-Reranker",
]

_QWEN3_RERANKER_INSTRUCTION = (
    "Given a query A and a passage B, determine whether the passage contains "
    "an answer to the query by providing a prediction of either 'yes' or 'no'."
)

# Token IDs for "yes" / "no" responses; resolved lazily after tokenizer is loaded
_QWEN3_YES_TOKEN_ID: Optional[int] = None
_QWEN3_NO_TOKEN_ID: Optional[int] = None


def _is_qwen3_reranker(model_name: str) -> bool:
    lower = model_name.lower()
    return any(p.lower() in lower for p in _QWEN3_RERANKER_PREFIXES)


def _get_qwen3_reranker(model_name: str) -> tuple[Any, Any]:
    """Load (or return cached) Qwen3-Reranker model + tokenizer."""
    global _QWEN3_RERANKER_MODEL, _QWEN3_RERANKER_TOKENIZER
    global _QWEN3_RERANKER_MODEL_NAME
    global _QWEN3_YES_TOKEN_ID, _QWEN3_NO_TOKEN_ID

    if _QWEN3_RERANKER_MODEL is None or _QWEN3_RERANKER_MODEL_NAME != model_name:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        logger.notice("Loading Qwen3-Reranker: %s", model_name)
        tokenizer = AutoTokenizer.from_pretrained(model_name, padding_side="left")
        model = AutoModelForCausalLM.from_pretrained(
            model_name,
            torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
            device_map="auto" if torch.cuda.is_available() else None,
        )
        model.eval()

        # Resolve yes/no token IDs once
        _QWEN3_YES_TOKEN_ID = tokenizer.convert_tokens_to_ids("yes")
        _QWEN3_NO_TOKEN_ID = tokenizer.convert_tokens_to_ids("no")

        _QWEN3_RERANKER_TOKENIZER = tokenizer
        _QWEN3_RERANKER_MODEL = model
        _QWEN3_RERANKER_MODEL_NAME = model_name

    return _QWEN3_RERANKER_MODEL, _QWEN3_RERANKER_TOKENIZER


def _format_qwen3_prompt(query: str, doc: str, tokenizer: Any) -> str:
    """Format a single (query, doc) pair as a chat prompt for Qwen3-Reranker."""
    prefix = f"Query: {query}\nPassage: {doc}"
    messages = [
        {"role": "system", "content": _QWEN3_RERANKER_INSTRUCTION},
        {"role": "user", "content": prefix},
    ]
    # apply_chat_template adds the generation prompt so the model produces "yes"/"no"
    return tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True,
    )


def _qwen3_rerank_sync(
    query: str,
    docs: list[str],
    model_name: str,
) -> list[float]:
    """Synchronous Qwen3-Reranker inference. Run inside a thread pool."""
    import torch

    model, tokenizer = _get_qwen3_reranker(model_name)

    prompts = [_format_qwen3_prompt(query, doc, tokenizer) for doc in docs]
    encoded = tokenizer(
        prompts,
        padding=True,
        truncation=True,
        max_length=8192,
        return_tensors="pt",
    )

    device = next(model.parameters()).device
    encoded = {k: v.to(device) for k, v in encoded.items()}

    with torch.no_grad():
        outputs = model(**encoded)

    # logits shape: (batch, seq_len, vocab)
    # We only need the last-token logit for "yes" vs "no"
    last_token_logits = outputs.logits[:, -1, :]  # (batch, vocab)
    yes_logits = last_token_logits[:, _QWEN3_YES_TOKEN_ID]  # (batch,)
    no_logits = last_token_logits[:, _QWEN3_NO_TOKEN_ID]  # (batch,)

    # Softmax over (yes, no) → probability of "yes"
    stacked = torch.stack([yes_logits, no_logits], dim=-1)  # (batch, 2)
    probs = torch.softmax(stacked, dim=-1)
    yes_probs = probs[:, 0]  # (batch,)

    return yes_probs.float().cpu().tolist()


def get_local_reranking_model(model_name: str) -> "CrossEncoder":
    global _RERANK_MODEL, _RERANK_MODEL_NAME
    from sentence_transformers import CrossEncoder

    if _RERANK_MODEL is None or _RERANK_MODEL_NAME != model_name:
        logger.notice("Loading CrossEncoder reranker: %s", model_name)
        _RERANK_MODEL = CrossEncoder(model_name)
        _RERANK_MODEL_NAME = model_name
    return _RERANK_MODEL


@simple_log_function_time()
async def local_rerank(query: str, docs: list[str], model_name: str) -> list[float]:
    if _is_qwen3_reranker(model_name):
        return await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: _qwen3_rerank_sync(query, docs, model_name),
        )

    cross_encoder = get_local_reranking_model(model_name)
    return await asyncio.get_event_loop().run_in_executor(
        None,
        lambda: cross_encoder.predict([(query, doc) for doc in docs]).tolist(),
    )


@router.post("/cross-encoder-scores")
async def process_rerank_request(rerank_request: RerankRequest) -> RerankResponse:
    """Handles local reranking for both standard CrossEncoder and Qwen3-Reranker models."""
    if rerank_request.provider_type is not None:
        raise ValueError(
            f"Model server reranking endpoint should only be used for local models. "
            f"API provider '{rerank_request.provider_type}' should make direct API calls instead."
        )

    if INDEXING_ONLY:
        raise RuntimeError("Indexing model server should not call reranking endpoint")

    if not rerank_request.documents or not rerank_request.query:
        raise HTTPException(
            status_code=400, detail="Missing documents or query for reranking"
        )
    if not all(rerank_request.documents):
        raise ValueError("Empty documents cannot be reranked.")

    try:
        sim_scores = await local_rerank(
            query=rerank_request.query,
            docs=rerank_request.documents,
            model_name=rerank_request.model_name,
        )
        return RerankResponse(scores=sim_scores)

    except Exception as e:
        logger.exception(f"Error during reranking process:\n{str(e)}")
        raise HTTPException(
            status_code=500, detail="Failed to run reranking"
        )
