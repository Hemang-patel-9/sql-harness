from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from ..auth.dependencies import Principal, get_current_principal
from . import tracker
from .schemas import JobStatusResponse, UsageEventResponse

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=JobStatusResponse)
async def get_job_status(
    job_id: UUID,
    principal: Principal = Depends(get_current_principal),
) -> JobStatusResponse:
    job = tracker.get_job(job_id, tenant_id=principal.tenant_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    return JobStatusResponse(
        id=job.id,
        kind=job.kind,
        status=job.status,
        progress_current=job.progress_current,
        progress_total=job.progress_total,
        progress_message=job.progress_message,
        progress_log=list(job.progress_log),
        tokens_input=job.tokens_input,
        tokens_output=job.tokens_output,
        usage_log=[
            UsageEventResponse(phase=e.phase, input_tokens=e.input_tokens, output_tokens=e.output_tokens)
            for e in job.usage_log
        ],
        result=job.result,
        error=job.error,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )
