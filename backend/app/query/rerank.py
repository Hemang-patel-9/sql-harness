"""Cross-encoder reranking of retrieved table documents.

`bge-reranker-v2-m3` is chosen for its 8192-token context: a table document's
COLUMNS block alone can run past a thousand tokens, and a 512-token reranker
would never reach the part that decides relevance.

sentence-transformers is synchronous and CPU-bound, so every call into it goes
through a worker thread - inline would stall the event loop.
"""

import asyncio
import logging
from functools import lru_cache

log = logging.getLogger("uvicorn.error")

RERANKER_MODEL = "BAAI/bge-reranker-v2-m3"
# The model's own limit. Long documents are truncated to this, not dropped.
MAX_LENGTH = 8192


@lru_cache
def _get_model():  # noqa: ANN202 - CrossEncoder, imported lazily
    # Lazy so importing the app doesn't drag torch in.
    from sentence_transformers import CrossEncoder

    log.info("Loading reranker %s (first call downloads ~2.3GB)", RERANKER_MODEL)
    model = CrossEncoder(RERANKER_MODEL, max_length=MAX_LENGTH)
    log.info("Reranker %s ready", RERANKER_MODEL)
    return model


def _score_sync(query: str, documents: list[str]) -> list[float]:
    scores = _get_model().predict([(query, document) for document in documents])
    return [float(score) for score in scores]


async def rerank_scores(query: str, documents: list[str]) -> list[float]:
    """Relevance of each document to the query, in the order given.

    Scores are logits: comparable within one query, meaningless across queries.
    """
    if not documents:
        return []
    return await asyncio.to_thread(_score_sync, query, documents)


async def warm() -> None:
    """Pay the load cost at startup instead of inside the first question."""
    await asyncio.to_thread(_get_model)
