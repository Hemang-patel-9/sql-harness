import logging

from ..core.progress import ProgressFn, noop_progress
from ..schema_ingest.schemas import NormalizedTable
from .agents import analyst, critic
from .agents.prompts import build_schema_context
from .schemas import GeneratedDocument
from .tools.render import render_document

log = logging.getLogger("uvicorn.error")


async def generate_document(
    table: NormalizedTable, *, on_progress: ProgressFn = noop_progress
) -> GeneratedDocument:
    context = build_schema_context(table)

    await on_progress(f"Drafting a description for {table.table} ({analyst.ANALYST_MODEL})")
    draft = await analyst.generate_draft(table, context)
    log.info("doc_gen: %s - analyst draft ready (%d business terms)", table.table, len(draft.business_terms))

    await on_progress(f"Refining {table.table} with the critic ({critic.CRITIC_MODEL})")
    refinement = await critic.critique_and_refine(table, context, draft)
    log.info("doc_gen: %s - critic score %d/10", table.table, refinement.quality_score)

    document = render_document(
        table,
        description=refinement.refined_description,
        business_terms=refinement.refined_business_terms,
    )
    return GeneratedDocument(
        document=document,
        critic_score=max(1, min(10, refinement.quality_score)),
        critic_notes={
            "missing_information": refinement.missing_information,
            "suggestions": refinement.suggestions,
        },
    )
