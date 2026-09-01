from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel

from .tracker import JobStatus


class JobHandleResponse(BaseModel):
    job_id: UUID


class JobStatusResponse(BaseModel):
    id: UUID
    kind: str
    status: JobStatus
    progress_current: int
    progress_total: int
    progress_message: str
    progress_log: list[str]
    tokens_input: int
    tokens_output: int
    result: dict[str, Any] | None
    error: str | None
    created_at: datetime
    updated_at: datetime
