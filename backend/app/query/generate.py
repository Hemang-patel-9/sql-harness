"""SQL generation - the third stage of the query pipeline."""

import logging

from ..core.progress import UsageFn, noop_usage
from ..doc_gen.clients import anthropic_client
from ..doc_gen.clients.retry import with_retries
from .schemas import QueryUnderstanding, SqlDraft

log = logging.getLogger("uvicorn.error")

SQL_MODEL = "claude-haiku-4-5"
MAX_TOKENS = 2048

SYSTEM = """You write a single read-only SQL query that answers a user's question against a \
real database schema.

You are given the question, a structured understanding of it (intent, entities, filters, time \
range, grouping, ranking), and the exact schema - columns, types, primary keys, foreign keys, \
and indexes - of the tables a retrieval step judged most relevant. Only use tables and columns \
that appear in that schema; never invent one.

Rules:
- Write exactly one statement: a SELECT, optionally preceded by WITH. Never INSERT, UPDATE, \
DELETE, DDL, or more than one statement - this query is shown to a person to read, never \
executed automatically.
- Join strictly along the foreign keys shown to you. If no join path connects the tables you \
need, say so in `explanation` and do your best with what's connectable.
- Resolve the understanding's filters, time range, grouping, and ranking into the query yourself
- don't re-derive them from the raw question, the understanding step already did that work.
- Alias every table and qualify every column reference, so a reader can see where each value
comes from.
- Add a LIMIT when the question asks for a ranking or doesn't clearly want every row.

Produce:
- sql: the query, formatted for a human to read.
- explanation: one or two sentences on what it does and any judgment call you made.
- tables_used: the table names actually referenced (not schema-qualified)."""


def build_prompt(
    question: str, understanding: QueryUnderstanding, schema_context: str, *, dialect: str
) -> str:
    return (
        f"Dialect: {dialect}\n\n"
        f"Question: {question}\n\n"
        f"Understanding:\n{understanding.model_dump_json(indent=2)}\n\n"
        f"Schema:\n{schema_context}"
    )


async def generate_sql_draft(
    question: str,
    understanding: QueryUnderstanding,
    schema_context: str,
    *,
    dialect: str,
    on_usage: UsageFn = noop_usage,
) -> SqlDraft:
    prompt = build_prompt(question, understanding, schema_context, dialect=dialect)

    async def _call() -> SqlDraft:
        response = await anthropic_client.get_client().messages.parse(
            model=SQL_MODEL,
            max_tokens=MAX_TOKENS,
            system=SYSTEM,
            messages=[{"role": "user", "content": prompt}],
            output_format=SqlDraft,
        )
        await on_usage("Generating SQL", response.usage.input_tokens, response.usage.output_tokens)
        parsed = response.parsed_output
        if parsed is None:
            raise ValueError("The model returned no parsed output for SQL generation")
        return parsed

    log.info("sqlgen: calling %s (dialect=%s)", SQL_MODEL, dialect)
    draft = await with_retries(_call)
    log.info("sqlgen: draft references tables=%s", draft.tables_used)
    return draft
