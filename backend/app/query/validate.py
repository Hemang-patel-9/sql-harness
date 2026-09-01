"""SQL validation - static checks plus an LLM critic pass."""

import logging

import sqlglot
from sqlglot import exp

from ..core.progress import UsageFn, noop_usage
from ..doc_gen.clients import anthropic_client
from ..doc_gen.clients.retry import with_retries
from .schemas import SqlCritique, SqlDraft, SqlIssue, SqlIssueSeverity

log = logging.getLogger("uvicorn.error")

CRITIC_MODEL = "claude-haiku-4-5"
MAX_TOKENS = 2048

_DIALECTS = {"postgresql": "postgres", "mysql": "mysql"}

CRITIC_SYSTEM = """You are a SQL reviewer checking a draft query before it is shown to a user - \
it is never executed automatically, so your job is to catch mistakes a human reading it would \
otherwise have to find themselves.

You are given the original question, the draft SQL, the exact schema it was written against, \
and any issues a static checker already found (parse errors, unknown tables, or non-read-only \
statements - treat those as certainly wrong).

Check whether the query actually answers the question: right tables, right join conditions, \
right filters, right aggregation, right grouping, right sort/limit. If it's correct, say so. If \
something is wrong and you can fix it without guessing at business meaning the schema doesn't \
support, rewrite it in `revised_sql`. If you can't fix it confidently, leave `revised_sql` null \
and explain what's wrong in `issues` - don't guess.

`is_valid` is true only if the query (as given, or as you revised it) is safe to show the user \
as a correct answer to their question."""


def static_validate(sql: str, *, engine: str, known_tables: set[str]) -> list[SqlIssue]:
    dialect = _DIALECTS.get(engine, engine)
    try:
        parsed = sqlglot.parse_one(sql, dialect=dialect)
    except Exception as exc:  # noqa: BLE001 - any parse failure is reported, not raised
        log.warning("sql validate: parse failed: %s", exc)
        return [SqlIssue(severity=SqlIssueSeverity.error, message=f"Could not parse the SQL: {exc}")]

    issues: list[SqlIssue] = []

    if not isinstance(parsed, (exp.Select, exp.Union)):
        issues.append(
            SqlIssue(
                severity=SqlIssueSeverity.error,
                message=f"Expected a single read-only SELECT statement, got {type(parsed).__name__}.",
            )
        )

    cte_names = {c.alias.lower() for c in parsed.find_all(exp.CTE)}
    referenced = {t.name.lower() for t in parsed.find_all(exp.Table)} - cte_names
    known = {t.lower() for t in known_tables}
    for table in sorted(referenced - known):
        issues.append(
            SqlIssue(severity=SqlIssueSeverity.error, message=f"References an unknown table: {table!r}")
        )

    if issues:
        log.info("sql validate: %d issue(s) found - %s", len(issues), [i.message for i in issues])
    else:
        log.info("sql validate: static checks passed (%d table reference(s))", len(referenced))
    return issues


async def critique_sql(
    question: str,
    draft: SqlDraft,
    *,
    schema_context: str,
    static_issues: list[SqlIssue],
    dialect: str,
    on_usage: UsageFn = noop_usage,
) -> SqlCritique:
    static_summary = "\n".join(f"- [{i.severity.value}] {i.message}" for i in static_issues) or (
        "(none - the draft parsed cleanly and only references known tables)"
    )
    prompt = (
        f"Dialect: {dialect}\n\n"
        f"Question: {question}\n\n"
        f"Draft SQL:\n{draft.sql}\n\n"
        f"Draft's own explanation: {draft.explanation}\n\n"
        f"Static checker findings:\n{static_summary}\n\n"
        f"Schema:\n{schema_context}"
    )

    async def _call() -> SqlCritique:
        response = await anthropic_client.get_client().messages.parse(
            model=CRITIC_MODEL,
            max_tokens=MAX_TOKENS,
            system=CRITIC_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
            output_format=SqlCritique,
        )
        await on_usage("Verifying the query", response.usage.input_tokens, response.usage.output_tokens)
        parsed = response.parsed_output
        if parsed is None:
            raise ValueError("The model returned no parsed output for the SQL critique")
        return parsed

    log.info("sql critic: calling %s", CRITIC_MODEL)
    critique = await with_retries(_call)
    log.info("sql critic: is_valid=%s revised=%s", critique.is_valid, critique.revised_sql is not None)
    return critique
