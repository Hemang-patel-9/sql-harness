import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import Principal, get_current_principal
from ..connections import repo as connections_repo
from ..core.db import get_session
from .schemas import QueryRequest, QueryResponse
from .service import analyze_question

log = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api", tags=["query"])


@router.post("/query", response_model=QueryResponse)
async def query(
    payload: QueryRequest,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> QueryResponse:
    """Ask one of the caller's own connected databases a question.

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

    try:
        return await analyze_question(
            payload.question,
            tenant_id=principal.tenant_id,
            connection_id=payload.connection_id,
            connection_label=connection["label"],
        )
    except Exception as exc:  # noqa: BLE001 - upstream failure, not a bug in this request
        # The provider's message can name the account or the key, so it goes
        # to the log and a flat sentence goes to the caller.
        log.exception("Query analysis failed for connection %s", payload.connection_id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not analyze the question - the language model or the vector store "
            "was unreachable. Try again.",
        ) from exc
