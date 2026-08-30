from ...schema_ingest.schemas import NormalizedTable
from ..clients import anthropic_client
from ..clients.retry import with_retries
from ..schemas import AnalystDraft, CriticRefinement
from .prompts import CRITIC_SYSTEM, build_critic_prompt

CRITIC_MODEL = "claude-haiku-4-5-20251001"


async def critique_and_refine(table: NormalizedTable, context: str, draft: AnalystDraft) -> CriticRefinement:
    async def _call() -> CriticRefinement:
        response = await anthropic_client.get_client().messages.parse(
            model=CRITIC_MODEL,
            max_tokens=2048,
            system=CRITIC_SYSTEM,
            messages=[{"role": "user", "content": build_critic_prompt(context, draft)}],
            output_format=CriticRefinement,
        )
        parsed = response.parsed_output
        if parsed is None:
            raise ValueError(f"Critic returned no parsed output for table {table.table!r}")
        return parsed

    return await with_retries(_call)
