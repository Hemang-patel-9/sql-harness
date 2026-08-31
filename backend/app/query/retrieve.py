"""Hybrid retrieval: find the tables that could answer the question.

Two searches over the same collection, each given the input its algorithm is
good at - dense gets the question as written, BM25 gets the terms
`understand.py` pulled out. Their union is deduplicated and reranked.

Both are filtered on tenant_id AND connection_id: that filter is the tenant
boundary inside the vector store, so it is never optional.
"""

import logging
from dataclasses import dataclass, field
from uuid import UUID

from qdrant_client import models

from ..core.config import get_settings
from ..doc_gen.tools.embed import embed_text
from ..vectorstore import sparse
from ..vectorstore.client import get_client
from ..vectorstore.collections import DENSE_VECTOR_NAME, SPARSE_VECTOR_NAME
from .rerank import rerank_scores
from .schemas import QueryUnderstanding

log = logging.getLogger("uvicorn.error")

TOP_K_PER_ARM = 6


@dataclass
class Candidate:
    schema_name: str | None
    table_name: str
    document: str
    dense_rank: int | None = None
    dense_score: float | None = None
    bm25_rank: int | None = None
    bm25_score: float | None = None
    rerank_score: float = 0.0
    sources: list[str] = field(default_factory=list)


def build_keyword_query(understanding: QueryUnderstanding) -> str:
    """The lexical arm's input: every content word understanding found.

    Entity names keep the phrasing they were normalized from - a document may
    use either the singular or the plural.
    """
    terms: list[str] = []
    for entity in understanding.entities:
        terms.append(entity.name)
        if entity.mentioned_as.lower() != entity.name.lower():
            terms.append(entity.mentioned_as)
    terms.extend(metric.name for metric in understanding.metrics)
    terms.extend(filter_.field for filter_ in understanding.filters)
    terms.extend(understanding.grouping)
    if understanding.ranking is not None:
        terms.append(understanding.ranking.by)
    if understanding.time is not None and understanding.time.field:
        terms.append(understanding.time.field)

    # Order-preserving dedupe, case-insensitively.
    seen: set[str] = set()
    unique: list[str] = []
    for term in terms:
        cleaned = term.strip()
        if not cleaned or cleaned.lower() in seen:
            continue
        seen.add(cleaned.lower())
        unique.append(cleaned)
    return " ".join(unique)


def _scope_filter(tenant_id: UUID, connection_id: UUID) -> models.Filter:
    return models.Filter(
        must=[
            models.FieldCondition(key="tenant_id", match=models.MatchValue(value=str(tenant_id))),
            models.FieldCondition(
                key="connection_id", match=models.MatchValue(value=str(connection_id))
            ),
        ]
    )


def _key(point) -> tuple[str | None, str]:  # noqa: ANN001 - qdrant ScoredPoint
    payload = point.payload or {}
    return (payload.get("schema_name"), payload.get("table_name", ""))


async def retrieve_tables(
    *,
    tenant_id: UUID,
    connection_id: UUID,
    question: str,
    understanding: QueryUnderstanding,
) -> tuple[list[Candidate], str]:
    """Returns the reranked candidates and the keyword query BM25 was given."""
    client = get_client()
    collection = get_settings().qdrant_collection_name
    scope = _scope_filter(tenant_id, connection_id)

    keyword_query = build_keyword_query(understanding)

    dense_hits = await client.query_points(
        collection_name=collection,
        query=await embed_text(question),
        using=DENSE_VECTOR_NAME,
        query_filter=scope,
        limit=TOP_K_PER_ARM,
        with_payload=True,
    )

    # An empty BM25 query matches everything equally, which is noise, not
    # recall - so a question with no extractable terms skips the lexical arm.
    bm25_hits = None
    if keyword_query:
        bm25_hits = await client.query_points(
            collection_name=collection,
            query=sparse.encode_query(keyword_query),
            using=SPARSE_VECTOR_NAME,
            query_filter=scope,
            limit=TOP_K_PER_ARM,
            with_payload=True,
        )

    candidates: dict[tuple[str | None, str], Candidate] = {}

    def upsert(point, *, arm: str, rank: int) -> None:  # noqa: ANN001, ANN202
        payload = point.payload or {}
        key = _key(point)
        candidate = candidates.get(key)
        if candidate is None:
            candidate = Candidate(
                schema_name=payload.get("schema_name"),
                table_name=payload.get("table_name", ""),
                document=payload.get("document", ""),
            )
            candidates[key] = candidate
        candidate.sources.append(arm)
        if arm == "dense":
            candidate.dense_rank, candidate.dense_score = rank, float(point.score)
        else:
            candidate.bm25_rank, candidate.bm25_score = rank, float(point.score)

    for rank, point in enumerate(dense_hits.points, start=1):
        upsert(point, arm="dense", rank=rank)
    if bm25_hits is not None:
        for rank, point in enumerate(bm25_hits.points, start=1):
            upsert(point, arm="bm25", rank=rank)

    ordered = list(candidates.values())
    if not ordered:
        return [], keyword_query

    # The question, not the keyword query: the cross-encoder wants the phrasing.
    scores = await rerank_scores(question, [c.document for c in ordered])
    for candidate, score in zip(ordered, scores, strict=True):
        candidate.rerank_score = score

    ordered.sort(key=lambda c: c.rerank_score, reverse=True)
    return ordered, keyword_query
