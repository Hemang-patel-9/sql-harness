from dataclasses import dataclass
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from . import auth as auth_repo
from . import connections_repo
from .config import get_settings
from .crypto import decrypt_secret, encrypt_secret
from .db import get_session
from .db_probe import probe_connection
from .schemas import (
    ConnectionCreateRequest,
    ConnectionResponse,
    ConnectionTestResponse,
    ConnectionUpdateRequest,
)

settings = get_settings()

router = APIRouter(prefix="/api/connections", tags=["connections"])


@dataclass
class Principal:
    user_id: UUID
    tenant_id: UUID


async def get_current_principal(
    request: Request, session: AsyncSession = Depends(get_session)
) -> Principal:
    row = await auth_repo.resolve_active_session(
        session, request.cookies.get(settings.session_cookie_name)
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in")
    if row["tenant_id"] is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="This account has no workspace"
        )
    await session.commit()
    return Principal(user_id=row["id"], tenant_id=row["tenant_id"])


def _aad(tenant_id: UUID, connection_id: UUID) -> bytes:
    return f"{tenant_id}:{connection_id}".encode("utf-8")


@router.get("", response_model=list[ConnectionResponse])
async def list_connections(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> list[ConnectionResponse]:
    rows = await connections_repo.list_connections(session, principal.tenant_id)
    return [ConnectionResponse(**row) for row in rows]


@router.post("", response_model=ConnectionResponse, status_code=status.HTTP_201_CREATED)
async def create_connection(
    payload: ConnectionCreateRequest,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> ConnectionResponse:
    connection_id = uuid4()
    ciphertext = encrypt_secret(
        payload.password, aad=_aad(principal.tenant_id, connection_id)
    )

    row = await connections_repo.create_connection(
        session,
        id=connection_id,
        tenant_id=principal.tenant_id,
        created_by=principal.user_id,
        label=payload.label,
        engine=payload.engine.value,
        host=payload.host,
        port=payload.port,
        database_name=payload.database_name,
        username=payload.username,
        password_ciphertext=ciphertext,
        ssl_mode=payload.ssl_mode.value,
    )
    await session.commit()
    return ConnectionResponse(**row)


@router.patch("/{connection_id}", response_model=ConnectionResponse)
async def update_connection(
    connection_id: UUID,
    payload: ConnectionUpdateRequest,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> ConnectionResponse:
    ciphertext = None
    if payload.password is not None:
        ciphertext = encrypt_secret(
            payload.password, aad=_aad(principal.tenant_id, connection_id)
        )

    row = await connections_repo.update_connection(
        session,
        id=connection_id,
        tenant_id=principal.tenant_id,
        label=payload.label,
        engine=payload.engine.value,
        host=payload.host,
        port=payload.port,
        database_name=payload.database_name,
        username=payload.username,
        password_ciphertext=ciphertext,
        ssl_mode=payload.ssl_mode.value,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    await session.commit()
    return ConnectionResponse(**row)


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_connection(
    connection_id: UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> None:
    deleted = await connections_repo.soft_delete_connection(
        session, principal.tenant_id, connection_id
    )
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    await session.commit()


@router.post("/{connection_id}/test", response_model=ConnectionTestResponse)
async def test_connection(
    connection_id: UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> ConnectionTestResponse:
    row = await connections_repo.get_connection(session, principal.tenant_id, connection_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")

    password = decrypt_secret(
        row["password_ciphertext"], aad=_aad(principal.tenant_id, connection_id)
    )

    result = await probe_connection(
        engine=row["engine"],
        host=row["host"],
        port=row["port"],
        database=row["database_name"],
        username=row["username"],
        password=password,
        ssl_mode=row["ssl_mode"],
        allow_private_hosts=settings.allow_private_connection_hosts,
    )

    await connections_repo.record_test_result(
        session, connection_id, ok=result.ok, detail=result.detail
    )
    await session.commit()

    return ConnectionTestResponse(
        ok=result.ok,
        detail=result.detail,
        current_user=result.current_user,
        current_database=result.current_database,
        table_count=result.table_count,
        latency_ms=result.latency_ms,
    )
