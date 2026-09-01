import asyncio
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import Principal, get_current_principal
from ..connections import repo as connections_repo
from ..core.db import get_session
from ..jobs import tracker as jobs
from ..jobs.schemas import JobHandleResponse
from ..jobs.tracker import Job
from .schemas import QueryRequest
from .service import analyze_question

log = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api", tags=["query"])

_QUERY_JOB_STEPS = 13


async def _run_query_job(
    job: Job,
    *,
    question: str,
    tenant_id: UUID,
    connection_id: UUID,
    connection_label: str,
    engine: str,
) -> None:
    async def on_progress(message: str) -> None:
        jobs.step(job, message)

    async def on_usage(phase: str, input_tokens: int, output_tokens: int) -> None:
        jobs.add_tokens(job, phase=phase, input_tokens=input_tokens, output_tokens=output_tokens)

    try:
        result = await analyze_question(
            question,
            tenant_id=tenant_id,
            connection_id=connection_id,
            connection_label=connection_label,
            engine=engine,
            on_progress=on_progress,
            on_usage=on_usage,
        )
        jobs.succeed(job, result.model_dump(mode="json"))
    except Exception:  # noqa: BLE001 - upstream failure, not a bug in this request
        log.exception("Query analysis failed for connection %s", connection_id)
        jobs.fail(
            job,
            "Could not analyze the question - the language model or the vector store "
            "was unreachable. Try again.",
        )


@router.post("/query", response_model=JobHandleResponse)
async def query(
    payload: QueryRequest,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> JobHandleResponse:
    """Kicks off understanding + retrieval for one of the caller's connected
    databases and returns a job id - poll GET /api/jobs/{job_id} for progress
    and the final QueryResponse.

    The lookup is tenant-scoped, so another tenant's connection id is a 404
    rather than a 403 - a 403 would confirm it exists.
    """
    connection = await connections_repo.get_connection(
        session, principal.tenant_id, payload.connection_id
    )
    if connection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")

    # Enforced here, not just hidden in the UI: an untested connection has
    # never been proven reachable.
    if connection["status"] != "connected":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fire a successful demo query on this connection before asking questions against it.",
        )

    job = jobs.create_job("query", tenant_id=principal.tenant_id, total=_QUERY_JOB_STEPS)
    asyncio.create_task(
        _run_query_job(
            job,
            question=payload.question,
            tenant_id=principal.tenant_id,
            connection_id=payload.connection_id,
            connection_label=connection["label"],
            engine=connection["engine"],
        )
    )
    return JobHandleResponse(job_id=job.id)
