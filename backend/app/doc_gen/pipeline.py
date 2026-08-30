from ..schema_ingest.schemas import NormalizedTable
from .agents import analyst, critic
from .agents.prompts import build_schema_context
from .schemas import GeneratedDocument
from .tools.render import render_document


async def generate_document(table: NormalizedTable) -> GeneratedDocument:
    context = build_schema_context(table)
    draft = await analyst.generate_draft(table, context)
    refinement = await critic.critique_and_refine(table, context, draft)

    document = render_document(
        table,
        description=refinement.refined_description,
        business_terms=refinement.refined_business_terms,
        example_questions=refinement.refined_example_questions,
    )
    return GeneratedDocument(
        document=document,
        critic_score=max(1, min(10, refinement.quality_score)),
        critic_notes={
            "missing_information": refinement.missing_information,
            "suggestions": refinement.suggestions,
        },
    )
