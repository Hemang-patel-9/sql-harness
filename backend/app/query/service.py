"""NL-to-SQL: understand the question, then retrieve the tables for it.

Generation is still missing, so nothing runs against the customer's database
on this path. Retrieval reads understanding's output rather than the raw
question, which is the reason understanding runs first.
"""

from uuid import UUID

from .rerank import RERANKER_MODEL
from .retrieve import TOP_K_PER_ARM, retrieve_tables
from .schemas import QueryResponse, Retrieval, RetrievalArm, RetrievedTable
from .understand import understand_question

_NOTHING_EMBEDDED = (
    "No table documents are embedded for this connection yet - generate and "
    "sync them on the Ingest page, then ask again."
)


async def analyze_question(
    question: str, *, tenant_id: UUID, connection_id: UUID, connection_label: str
) -> QueryResponse:
    understanding = await understand_question(question)

    candidates, keyword_query = await retrieve_tables(
        tenant_id=tenant_id,
        connection_id=connection_id,
        question=question,
        understanding=understanding,
    )

    tables = [
        RetrievedTable(
            schema_name=candidate.schema_name,
            table_name=candidate.table_name,
            document=candidate.document,
            found_by=[RetrievalArm(arm) for arm in candidate.sources],
            dense_rank=candidate.dense_rank,
            dense_score=candidate.dense_score,
            bm25_rank=candidate.bm25_rank,
            bm25_score=candidate.bm25_score,
            rerank_score=candidate.rerank_score,
            final_rank=index,
        )
        for index, candidate in enumerate(candidates, start=1)
    ]

    if not tables:
        note = _NOTHING_EMBEDDED
    elif not keyword_query:
        # Distinguishes "BM25 found nothing" from "BM25 was never run".
        note = "The question yielded no search terms, so only the dense arm ran."
    else:
        note = None

    return QueryResponse(
        connection_id=connection_id,
        connection_label=connection_label,
        question=question,
        understanding=understanding,
        retrieval=Retrieval(
            dense_query=question,
            keyword_query=keyword_query,
            top_k_per_arm=TOP_K_PER_ARM,
            reranker_model=RERANKER_MODEL,
            dense_hit_count=sum(1 for t in tables if t.dense_rank is not None),
            bm25_hit_count=sum(1 for t in tables if t.bm25_rank is not None),
            candidate_count=len(tables),
            tables=tables,
            note=note,
        ),
    )
