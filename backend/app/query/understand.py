"""Intent & query understanding - the first stage of the query pipeline.

One `claude-haiku-4-5` call, deliberately schema-blind: the connection's
tables and columns are not in the prompt, so what comes back is the
question's own vocabulary. Resolving it onto real tables is retrieval's job.
"""

from datetime import date

from ..doc_gen.clients import anthropic_client
from ..doc_gen.clients.retry import with_retries
from .schemas import QueryUnderstanding

UNDERSTANDING_MODEL = "claude-haiku-4-5"
MAX_TOKENS = 2048

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


async def understand_question(question: str, *, today: date | None = None) -> QueryUnderstanding:
    prompt = build_prompt(question, today=today or date.today())

    async def _call() -> QueryUnderstanding:
        response = await anthropic_client.get_client().messages.parse(
            model=UNDERSTANDING_MODEL,
            max_tokens=MAX_TOKENS,
            system=SYSTEM,
            messages=[{"role": "user", "content": prompt}],
            output_format=QueryUnderstanding,
        )
        parsed = response.parsed_output
        if parsed is None:
            raise ValueError("The model returned no parsed output for this question")
        return parsed

    return await with_retries(_call)
