"""Intent & query understanding - the first stage of the query pipeline.

One `claude-haiku-4-5` call, deliberately schema-blind: the connection's
tables and columns are not in the prompt, so what comes back is the
question's own vocabulary. Resolving it onto real tables is retrieval's job.
"""

import logging
from datetime import date

from ..core.progress import UsageFn, noop_usage
from ..doc_gen.clients import anthropic_client
from ..doc_gen.clients.retry import with_retries
from .schemas import Aggregation, QueryUnderstanding, QuestionIntent, SortDirection

log = logging.getLogger("uvicorn.error")

UNDERSTANDING_MODEL = "claude-haiku-4-5"
MAX_TOKENS = 2048

_AGGREGATION_PHRASES = {
    Aggregation.row_count: "the total number of",
    Aggregation.distinct_count: "the number of distinct",
    Aggregation.sum: "the total",
    Aggregation.average: "the average",
    Aggregation.minimum: "the minimum",
    Aggregation.maximum: "the maximum",
}

_AGGREGATION_KEYWORDS = {
    Aggregation.row_count: ("number", "count", "total"),
    Aggregation.distinct_count: ("distinct", "unique"),
    Aggregation.sum: ("total", "sum"),
    Aggregation.average: ("average", "avg", "mean"),
    Aggregation.minimum: ("minimum", "min", "lowest"),
    Aggregation.maximum: ("maximum", "max", "highest"),
}


def _join(items: list[str]) -> str:
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return f"{', '.join(items[:-1])}, and {items[-1]}"


def describe_understanding(understanding: QueryUnderstanding) -> str:
    subjects = [e.name for e in understanding.entities]
    subject = _join(subjects) if subjects else "the data"

    if understanding.intent == QuestionIntent.aggregation and understanding.metrics:
        metric = understanding.metrics[0]
        phrase = _AGGREGATION_PHRASES.get(metric.aggregation)
        keywords = _AGGREGATION_KEYWORDS.get(metric.aggregation, ())
        already_named = any(word in metric.name.lower() for word in keywords)
        if phrase and not already_named:
            return f"You want {phrase} {metric.name}"
        return f"You want the {metric.name} for {subject}"

    if understanding.intent == QuestionIntent.ranking and understanding.ranking:
        direction = "top" if understanding.ranking.direction == SortDirection.descending else "bottom"
        limit = f"{understanding.ranking.limit} " if understanding.ranking.limit else ""
        return f"You want the {direction} {limit}{subject} by {understanding.ranking.by}"

    if understanding.intent == QuestionIntent.trend:
        time_grain = understanding.time.grain if understanding.time else None
        grain = f" by {time_grain.value}" if time_grain else ""
        return f"You want to see how {subject} changed over time{grain}"

    if understanding.intent == QuestionIntent.comparison:
        return f"You want to compare {subject}"

    if understanding.intent == QuestionIntent.lookup:
        return f"You want to see {subject}"

    return f"The question's intent isn't fully clear yet - looking at {subject}"

SYSTEM = """You extract the structure of a natural-language question about a \
database. You are given the question only - never the database's tables or \
columns - so your job is to describe what was *asked*, not to guess what it \
maps onto.

The single most important rule: extract only what the question actually says. \
An empty list is the correct answer when the question doesn't mention \
something. Never invent a filter, a metric, a time range or a limit that the \
user did not ask for - a confident wrong reading is far worse here than an \
empty field, because everything downstream trusts this.

Fill in:

- intent: the shape of the question. `lookup` for "show me the rows", \
`aggregation` for a computed number, `ranking` for top/bottom/most/least, \
`trend` for change over time, `comparison` for X versus Y, `unclear` when \
you genuinely cannot tell.
- entities: the things being asked about - what will become tables. Use \
`name` for the plain singular-or-plural noun and `mentioned_as` for the \
question's own wording, so a reader can see what you normalized.
- metrics: the values being measured. `aggregation` is `none` when the \
question names a value but asks for no arithmetic over it.
- filters: the conditions that narrow the rows. `field` is the thing being \
constrained in the user's words. Put every candidate in `values` for \
`one_of`, exactly a lower and an upper bound (in that order) for `between`, \
and nothing for `is_null`/`is_not_null`. A time restriction belongs in \
`time`, not here.
- time: the period asked about, or null if the question names none. \
`expression` is the phrase as written. Resolve `start_date`/`end_date` to \
ISO-8601 dates against the current date you are given, but only when the \
phrase is unambiguous - leave them null otherwise, and never resolve a \
vague phrase like "recently". `grain` is the bucket size a trend would use, \
null if the question implies no bucketing.
- grouping: what the results should be broken down by ("per customer", "by \
region"). Empty when the question asks for one number or a flat list.
- ranking: order and cut-off, or null if the question asks for neither. \
`limit` is null when the question orders without capping ("worst performing \
regions" with no number).
- ambiguities: what a SQL author still could not decide from this question \
alone. Real gaps only - a genuinely precise question has none. Because you \
cannot see the schema, do not list "which table/column holds this" here; \
that is expected and gets resolved later. List things the *question* leaves \
open: an undefined term, an unstated tie-break, an unclear date boundary, a \
word with two plausible readings."""


def build_prompt(question: str, *, today: date) -> str:
    """The date is the only outside fact this stage gets, so a phrase like
    "last quarter" can resolve to real dates."""
    return f"Current date: {today.isoformat()}\n\nQuestion: {question}"


async def understand_question(
    question: str, *, today: date | None = None, on_usage: UsageFn = noop_usage
) -> QueryUnderstanding:
    prompt = build_prompt(question, today=today or date.today())

    async def _call() -> QueryUnderstanding:
        response = await anthropic_client.get_client().messages.parse(
            model=UNDERSTANDING_MODEL,
            max_tokens=MAX_TOKENS,
            system=SYSTEM,
            messages=[{"role": "user", "content": prompt}],
            output_format=QueryUnderstanding,
        )
        await on_usage("Parsing intent", response.usage.input_tokens, response.usage.output_tokens)
        parsed = response.parsed_output
        if parsed is None:
            raise ValueError("The model returned no parsed output for this question")
        return parsed

    log.info("understanding: calling %s", UNDERSTANDING_MODEL)
    understanding = await with_retries(_call)
    log.info(
        "understanding: intent=%s entities=%d filters=%d ambiguities=%d",
        understanding.intent,
        len(understanding.entities),
        len(understanding.filters),
        len(understanding.ambiguities),
    )
    return understanding
