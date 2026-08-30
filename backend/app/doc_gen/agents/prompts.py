import json

from ...schema_ingest.schemas import NormalizedTable
from ..schemas import AnalystDraft
from ..tools.render import (
    render_columns_block,
    render_constraints_block,
    render_indexes_block,
    render_relationships_block,
)

ANALYST_SYSTEM = """You are a schema analyst preparing a database table for retrieval in a \
natural-language-to-SQL system. Given a table's structure, your real job is to reason about \
what a user would ask that this table should answer - the description and business terms exist \
only to support that judgment.

Ground everything in the schema context given to you. Do not invent business meaning the schema \
doesn't support - infer conservatively from names, types, and relationships.

Produce:
- description: one or two sentences on what this table stores.
- business_terms: groups of synonymous terms a user might use for this table or its key columns \
(e.g. a table and its common names, a money column and its common names). Only include groups \
you're confident about.
- example_questions: 3-5 natural-language questions a user might ask that this table would help \
answer."""

CRITIC_SYSTEM = """You are a retrieval critic reviewing a draft table document for a \
natural-language-to-SQL retrieval system. You will be shown the table's schema context and an \
analyst's draft.

Score the draft 1-10 on how well it would help a semantic search retrieve this table for a \
relevant user question. List concrete missing information and concrete suggestions. Then produce \
refined versions of the description, business terms, and example questions - keep what's good, \
fix what's weak, and make sure the example questions are genuinely things a user would ask, not \
restatements of the schema."""


def build_schema_context(table: NormalizedTable) -> str:
    sections = [
        f"TABLE: {table.table}",
        f"COLUMNS:\n{render_columns_block(table)}",
        f"RELATIONSHIPS:\n{render_relationships_block(table)}",
        f"CONSTRAINTS:\n{render_constraints_block(table)}",
        f"INDEXES:\n{render_indexes_block(table)}",
    ]
    return "\n\n".join(sections)


def build_critic_prompt(context: str, draft: AnalystDraft) -> str:
    return f"{context}\n\nANALYST DRAFT:\n{json.dumps(draft.model_dump(), indent=2)}"
