from fastapi import APIRouter
from pydantic import BaseModel

from . import client

router = APIRouter(prefix="/api", tags=["memory"])


class Mem0HealthResponse(BaseModel):
    connected: bool
    detail: str | None = None


@router.get("/health/mem0", response_model=Mem0HealthResponse)
async def health_mem0() -> Mem0HealthResponse:
    try:
        await client.ping()
    except Exception as exc:  # noqa: BLE001 - surfaced verbatim for local debugging
        return Mem0HealthResponse(connected=False, detail=str(exc))
    return Mem0HealthResponse(connected=True)
