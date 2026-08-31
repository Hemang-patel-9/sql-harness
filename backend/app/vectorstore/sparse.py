"""BM25 sparse vectors for the `bm25` half of the collection.

`Modifier.IDF` on the collection means Qdrant computes the IDF term itself,
so fastembed only produces per-term frequencies. That is also why documents
and queries encode differently below.
"""

from functools import lru_cache

from fastembed import SparseTextEmbedding
from qdrant_client import models

BM25_MODEL_NAME = "Qdrant/bm25"


@lru_cache
def get_model() -> SparseTextEmbedding:
    return SparseTextEmbedding(model_name=BM25_MODEL_NAME)


def _to_vector(embedding) -> models.SparseVector:  # noqa: ANN001 - fastembed's own dataclass
    return models.SparseVector(
        indices=embedding.indices.tolist(),
        values=embedding.values.tolist(),
    )


def encode_document(text: str) -> models.SparseVector:
    """For a stored table document: term frequencies included."""
    return _to_vector(next(iter(get_model().embed([text]))))


def encode_query(text: str) -> models.SparseVector:
    """For a search query: no term-frequency weighting, per BM25."""
    return _to_vector(next(iter(get_model().query_embed(text))))
