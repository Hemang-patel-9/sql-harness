from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth.dependencies import Principal, get_current_principal
from . import client
from .backfill import backfill_sparse_vectors

router = APIRouter(prefix="/api", tags=["vectorstore"])


class QdrantHealthResponse(BaseModel):
    connected: bool
    detail: str | None = None


class SparseBackfillResponse(BaseModel):
    scanned: int
    updated: int
    already_had_sparse: int
    skipped_no_document: int


@router.get("/health/qdrant", response_model=QdrantHealthResponse)
async def health_qdrant() -> QdrantHealthResponse:
    try:
        await client.ping()
    except Exception as exc:  # noqa: BLE001 - surfaced verbatim for local debugging
        return QdrantHealthResponse(connected=False, detail=str(exc))
    return QdrantHealthResponse(connected=True)


@router.post("/vectorstore/backfill-sparse", response_model=SparseBackfillResponse)
async def backfill_sparse(
    force: bool = False,
    principal: Principal = Depends(get_current_principal),
) -> SparseBackfillResponse:
    """Adds the `bm25` vector to this tenant's points that only have `dense`.

    Tenant-scoped and idempotent - re-running skips points that already carry
    a sparse vector unless `force=true`.
    """
    result = await backfill_sparse_vectors(tenant_id=principal.tenant_id, force=force)
    return SparseBackfillResponse(
        scanned=result.scanned,
        updated=result.updated,
        already_had_sparse=result.already_had_sparse,
        skipped_no_document=result.skipped_no_document,
    )
