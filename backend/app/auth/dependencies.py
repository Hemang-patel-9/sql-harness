"""FastAPI dependencies for identifying the caller.

`get_current_user` is enough for auth-only endpoints (/api/auth/me).
Every tenant-scoped feature (connections, schema, and whatever comes next)
depends on `get_current_principal` instead, since it also resolves which
workspace the request is acting in.
"""

from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..core.db import get_session
from . import repo as auth_repo
from .schemas import UserResponse

settings = get_settings()


async def get_current_user(
    request: Request, session: AsyncSession = Depends(get_session)
) -> UserResponse:
    row = await auth_repo.resolve_active_session(
        session, request.cookies.get(settings.session_cookie_name)
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in")

    await session.commit()
    return UserResponse(
        id=row["id"], email=row["email"], full_name=row["full_name"], created_at=row["created_at"]
    )


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
