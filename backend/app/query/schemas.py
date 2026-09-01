from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

# A cheap bound on what an authenticated caller can push into an LLM prompt.
MAX_QUESTION_LENGTH = 2000


class QueryRequest(BaseModel):
    """`connection_id` names a connection; routes.py resolves it against the
    caller's own tenant."""

    connection_id: UUID
    question: str = Field(..., min_length=1, max_length=MAX_QUESTION_LENGTH)

    @field_validator("question")
    @classmethod
    def _require_nonblank(cls, value: str) -> str:
        # min_length runs against the raw string, so "   " reaches us here.
        value = value.strip()
        if not value:
            raise ValueError("Ask a question")
        return value


# ---------------------------------------------------------------------------
# Intent & query understanding - the shape claude-haiku-4-5 fills in.
# Schema-blind, so every value is the user's own vocabulary, not a resolved
# table or column.
# ---------------------------------------------------------------------------


class QuestionIntent(StrEnum):
    lookup = "lookup"
    aggregation = "aggregation"
    ranking = "ranking"
    trend = "trend"
    comparison = "comparison"
    unclear = "unclear"


class Aggregation(StrEnum):
    # `row_count`, not `count`: an enum member named `count` shadows
    # str.count on a StrEnum. The wire value is still "count".
    row_count = "count"
    distinct_count = "distinct_count"
    sum = "sum"
    average = "average"
    minimum = "minimum"
    maximum = "maximum"
    # The question names a value but no arithmetic over it.
    none = "none"


class FilterOperator(StrEnum):
    equals = "equals"
    not_equals = "not_equals"
    greater_than = "greater_than"
    greater_or_equal = "greater_or_equal"
    less_than = "less_than"
    less_or_equal = "less_or_equal"
    # `values` carries every candidate.
    one_of = "one_of"
    not_one_of = "not_one_of"
    contains = "contains"
    # `values` carries exactly the lower and upper bound, in that order.
    between = "between"
    is_null = "is_null"
    is_not_null = "is_not_null"


class SortDirection(StrEnum):
    ascending = "ascending"
    descending = "descending"


class TimeGrain(StrEnum):
    hour = "hour"
    day = "day"
    week = "week"
    month = "month"
    quarter = "quarter"
    year = "year"


class Entity(BaseModel):
    """A thing the question is about - a table-to-be, before retrieval."""

    name: str
    # The question's own words, so the UI can show what `name` came from.
    mentioned_as: str


class Metric(BaseModel):
    name: str
    aggregation: Aggregation


class Filter(BaseModel):
    field: str
    operator: FilterOperator
    # One entry for scalar operators, two for `between`, many for `one_of`,
    # none for `is_null`/`is_not_null`.
    values: list[str]


class TimeFrame(BaseModel):
    """When the question is asking about."""

    field: str | None
    # The phrase as written: "last quarter", "since March".
    expression: str
    # ISO-8601, resolved against the request date - null when the phrase was vague.
    start_date: str | None
    end_date: str | None
    grain: TimeGrain | None


class Ranking(BaseModel):
    by: str
    direction: SortDirection
    limit: int | None


class QueryUnderstanding(BaseModel):
    intent: QuestionIntent
    entities: list[Entity]
    metrics: list[Metric]
    filters: list[Filter]
    time: TimeFrame | None
    grouping: list[str]
    ranking: Ranking | None
    # What the *question* left open, not what the schema would answer.
    ambiguities: list[str]


# ---------------------------------------------------------------------------
# Retrieval - which tables could answer this, and how each was found.
# ---------------------------------------------------------------------------


class RetrievalArm(StrEnum):
    dense = "dense"
    bm25 = "bm25"


class RetrievedTable(BaseModel):
    schema_name: str | None
    table_name: str
    document: str

    # A null rank means that arm did not return this table in its top 6.
    found_by: list[RetrievalArm]
    dense_rank: int | None
    dense_score: float | None
    bm25_rank: int | None
    bm25_score: float | None

    # A logit: comparable within one question only. Read `final_rank`.
    rerank_score: float
    final_rank: int


class Retrieval(BaseModel):
    """What each arm was asked and what came back."""

    dense_query: str
    keyword_query: str
    top_k_per_arm: int
    reranker_model: str
    dense_hit_count: int
    bm25_hit_count: int
    candidate_count: int
    tables: list[RetrievedTable]
    # Set when there is nothing to search, so the UI can say which.
    note: str | None = None


class SqlIssueSeverity(StrEnum):
    error = "error"
    warning = "warning"


class SqlIssue(BaseModel):
    severity: SqlIssueSeverity
    message: str


class SqlDraft(BaseModel):
    """The analyst-equivalent step: a first-pass query."""

    sql: str
    explanation: str
    tables_used: list[str]


class SqlCritique(BaseModel):
    """The critic-equivalent step: reviews the draft against the question and schema."""

    is_valid: bool
    issues: list[str]
    revised_sql: str | None
    notes: str


class GeneratedSql(BaseModel):
    """What the frontend renders: the final SQL plus how much to trust it."""

    sql: str
    dialect: str
    explanation: str
    tables_used: list[str]
    is_valid: bool
    issues: list[SqlIssue]
    critic_notes: str


class QueryResponse(BaseModel):
    """Echoes the connection back so the caller can confirm the request was
    understood as the database they picked, not just that a 200 came back."""

    connection_id: UUID
    connection_label: str
    question: str
    understanding: QueryUnderstanding
    retrieval: Retrieval
    sql: GeneratedSql | None = None
