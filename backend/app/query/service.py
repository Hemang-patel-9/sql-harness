"""NL-to-SQL: understand the question, retrieve the tables, generate SQL."""

import logging
from uuid import UUID

from ..core.db import SessionLocal
from ..core.progress import ProgressFn, UsageFn, noop_progress, noop_usage
from ..doc_gen.agents.prompts import build_schema_context
from ..schema_ingest import repo as ingest_repo
from ..schema_ingest.schemas import NormalizedTable
from . import generate, validate
from .rerank import RERANKER_MODEL
from .retrieve import TOP_K_PER_ARM, retrieve_tables
from .schemas import (
    GeneratedSql,
    QueryResponse,
    QueryUnderstanding,
    Retrieval,
    RetrievalArm,
    RetrievedTable,
    SqlIssueSeverity,
)
from .understand import describe_understanding, understand_question

log = logging.getLogger("uvicorn.error")

_NOTHING_EMBEDDED = (
    "No table documents are embedded for this connection yet - generate and "
    "sync them on the Ingest page, then ask again."
)

TOP_N_FOR_SQL = 5


async def _load_schema_context(
    tenant_id: UUID, connection_id: UUID, tables: list[RetrievedTable]
) -> tuple[str, set[str]]:
    top = tables[:TOP_N_FOR_SQL]
    contexts: list[str] = []
    known_tables: set[str] = set()
    async with SessionLocal() as session:
        for candidate in top:
            obj = await ingest_repo.get_object(
                session, tenant_id, connection_id, candidate.schema_name, candidate.table_name
            )
            if obj is None:
                log.warning(
                    "sql context: %s.%s has no normalized schema, skipping",
                    candidate.schema_name,
                    candidate.table_name,
                )
                continue
            normalized = NormalizedTable.model_validate(ingest_repo.parse_json(obj["normalized_json"]))
            contexts.append(build_schema_context(normalized))
            known_tables.add(normalized.table)
    return "\n\n---\n\n".join(contexts), known_tables


async def _generate_sql(
    question: str,
    understanding: QueryUnderstanding,
    tables: list[RetrievedTable],
    *,
    tenant_id: UUID,
    connection_id: UUID,
    dialect: str,
    on_progress: ProgressFn,
    on_usage: UsageFn,
) -> GeneratedSql | None:
    top = tables[:TOP_N_FOR_SQL]
    top_names = ", ".join(t.table_name for t in top)
    await on_progress(f"Looking at {len(top)} candidate table(s): {top_names}")
    schema_context, known_tables = await _load_schema_context(tenant_id, connection_id, tables)
    if not schema_context:
        log.warning("query: connection=%s no usable schema context, skipping SQL generation", connection_id)
        await on_progress("Could not load a schema for the retrieved tables - skipping SQL generation")
        return None

    await on_progress(f"Thinking through how to join {len(known_tables)} table(s)…")
    draft = await generate.generate_sql_draft(
        question, understanding, schema_context, dialect=dialect, on_usage=on_usage
    )
    await on_progress(f"Drafted a query using {', '.join(draft.tables_used) or 'no tables'}")

    await on_progress("Checking table and column references against the schema…")
    static_issues = validate.static_validate(draft.sql, engine=dialect, known_tables=known_tables)

    await on_progress("Verifying the query answers your question…")
    critique = await validate.critique_sql(
        question,
        draft,
        schema_context=schema_context,
        static_issues=static_issues,
        dialect=dialect,
        on_usage=on_usage,
    )

    final_sql = critique.revised_sql or draft.sql
    if critique.revised_sql and critique.revised_sql != draft.sql:
        static_issues = validate.static_validate(final_sql, engine=dialect, known_tables=known_tables)

    has_static_errors = any(issue.severity == SqlIssueSeverity.error for issue in static_issues)
    is_valid = critique.is_valid and not has_static_errors
    issue_count = len(static_issues) + len(critique.issues)
    if is_valid:
        await on_progress("The query looks correct")
    else:
        await on_progress(f"Found {issue_count} issue(s) with the query - flagged for review")
    log.info("query: connection=%s sql generated, is_valid=%s", connection_id, is_valid)

    return GeneratedSql(
        sql=final_sql,
        dialect=dialect,
        explanation=draft.explanation,
        tables_used=draft.tables_used,
        is_valid=is_valid,
        issues=static_issues,
        critic_notes=critique.notes,
    )


async def analyze_question(
    question: str,
    *,
    tenant_id: UUID,
    connection_id: UUID,
    connection_label: str,
    engine: str,
    on_progress: ProgressFn = noop_progress,
    on_usage: UsageFn = noop_usage,
) -> QueryResponse:
    log.info("query: connection=%s question=%r", connection_id, question)

    await on_progress("Parsing intent…")
    understanding = await understand_question(question, on_usage=on_usage)
    await on_progress(describe_understanding(understanding))

    candidates, keyword_query = await retrieve_tables(
        tenant_id=tenant_id,
        connection_id=connection_id,
        question=question,
        understanding=understanding,
        on_progress=on_progress,
    )
    log.info("query: connection=%s retrieved %d candidate table(s)", connection_id, len(candidates))

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

    sql: GeneratedSql | None = None
    if tables:
        sql = await _generate_sql(
            question,
            understanding,
            tables,
            tenant_id=tenant_id,
            connection_id=connection_id,
            dialect=engine,
            on_progress=on_progress,
            on_usage=on_usage,
        )

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
        sql=sql,
    )
