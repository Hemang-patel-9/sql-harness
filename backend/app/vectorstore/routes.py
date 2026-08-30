from fastapi import APIRouter
from pydantic import BaseModel

from . import client

router = APIRouter(prefix="/api", tags=["vectorstore"])


class QdrantHealthResponse(BaseModel):
    connected: bool
    detail: str | None = None


@router.get("/health/qdrant", response_model=QdrantHealthResponse)
async def health_qdrant() -> QdrantHealthResponse:
    try:
        await client.ping()
    except Exception as exc:  # noqa: BLE001 - surfaced verbatim for local debugging
        return QdrantHealthResponse(connected=False, detail=str(exc))
    return QdrantHealthResponse(connected=True)
