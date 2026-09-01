"""In-memory tracker for background jobs (doc sync, doc generation, query)."""

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import UUID, uuid4

log = logging.getLogger("uvicorn.error")

JobStatus = Literal["running", "succeeded", "failed"]

_MAX_JOB_AGE = timedelta(hours=1)
_MAX_LOG_LINES = 200


@dataclass
class Job:
    id: UUID
    kind: str
    tenant_id: UUID
    status: JobStatus = "running"
    progress_current: int = 0
    progress_total: int = 1
    progress_message: str = "Starting…"
    progress_log: list[str] = field(default_factory=list)
    tokens_input: int = 0
    tokens_output: int = 0
    result: dict[str, Any] | None = None
    error: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))


_jobs: dict[UUID, Job] = {}


def _prune_stale() -> None:
    cutoff = datetime.now(UTC) - _MAX_JOB_AGE
    stale = [job_id for job_id, job in _jobs.items() if job.updated_at < cutoff]
    for job_id in stale:
        del _jobs[job_id]


def create_job(kind: str, *, tenant_id: UUID, total: int = 1, message: str = "Starting…") -> Job:
    _prune_stale()
    job = Job(
        id=uuid4(), kind=kind, tenant_id=tenant_id, progress_total=max(total, 1), progress_message=message
    )
    _jobs[job.id] = job
    log.info("job %s (%s) started for tenant %s - %d step(s)", job.id, kind, tenant_id, job.progress_total)
    return job


def get_job(job_id: UUID, *, tenant_id: UUID) -> Job | None:
    job = _jobs.get(job_id)
    if job is None or job.tenant_id != tenant_id:
        return None
    return job


def step(job: Job, message: str, *, advance: bool = True) -> None:
    if advance and job.progress_current < job.progress_total:
        job.progress_current += 1
    job.progress_message = message
    job.progress_log.append(message)
    if len(job.progress_log) > _MAX_LOG_LINES:
        del job.progress_log[0]
    job.updated_at = datetime.now(UTC)
    log.info("job %s (%s) [%d/%d] %s", job.id, job.kind, job.progress_current, job.progress_total, message)


def add_tokens(job: Job, *, input_tokens: int, output_tokens: int) -> None:
    job.tokens_input += input_tokens
    job.tokens_output += output_tokens
    job.updated_at = datetime.now(UTC)
    log.info(
        "job %s (%s) +%d in / +%d out tokens (total %d/%d)",
        job.id,
        job.kind,
        input_tokens,
        output_tokens,
        job.tokens_input,
        job.tokens_output,
    )


def succeed(job: Job, result: dict[str, Any]) -> None:
    job.status = "succeeded"
    job.progress_current = job.progress_total
    job.result = result
    job.updated_at = datetime.now(UTC)
    log.info("job %s (%s) succeeded", job.id, job.kind)


def fail(job: Job, error: str) -> None:
    job.status = "failed"
    job.error = error
    job.updated_at = datetime.now(UTC)
    log.error("job %s (%s) failed: %s", job.id, job.kind, error)
