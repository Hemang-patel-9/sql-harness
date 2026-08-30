from ..schema_ingest.schemas import NormalizedTable
from . import openai_client
from .prompts import ANALYST_SYSTEM
from .retry import with_retries
from .schemas import AnalystDraft

ANALYST_MODEL = "gpt-4o-mini"


async def generate_draft(table: NormalizedTable, context: str) -> AnalystDraft:
    async def _call() -> AnalystDraft:
        response = await openai_client.get_client().chat.completions.parse(
            model=ANALYST_MODEL,
            messages=[
                {"role": "system", "content": ANALYST_SYSTEM},
                {"role": "user", "content": context},
            ],
            response_format=AnalystDraft,
        )
        parsed = response.choices[0].message.parsed
        if parsed is None:
            raise ValueError(f"Analyst returned no parsed output for table {table.table!r}")
        return parsed

    return await with_retries(_call)
