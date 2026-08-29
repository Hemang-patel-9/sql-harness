from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..core.db import get_session
from ..core.security import hash_password, hash_token, new_session_token, verify_password
from . import repo as auth_repo
from .dependencies import get_current_user
from .schemas import LoginRequest, SignupRequest, UserResponse

settings = get_settings()

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_ttl_days * 24 * 60 * 60,
        httponly=True,
        samesite="lax",
        secure=not settings.debug,
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=settings.session_cookie_name, path="/")


@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    payload: SignupRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> UserResponse:
    ip = _client_ip(request)
    user_agent = request.headers.get("user-agent")

    existing = await auth_repo.get_user_by_email(session, payload.email)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email is already registered"
        )

    user = await auth_repo.create_user(
        session,
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
    )
    await auth_repo.create_personal_tenant(
        session, user_id=user["id"], email=payload.email, full_name=payload.full_name
    )

    raw_token, token_hash = new_session_token()
    await auth_repo.create_session(
        session,
        user_id=user["id"],
        token_hash=token_hash,
        ttl_days=settings.session_ttl_days,
        user_agent=user_agent,
        ip=ip,
    )
    await auth_repo.record_auth_event(
        session, type="signup", user_id=user["id"], email=payload.email, ip=ip, user_agent=user_agent
    )
    await session.commit()

    _set_session_cookie(response, raw_token)
    return UserResponse(**user)


@router.post("/login", response_model=UserResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> UserResponse:
    ip = _client_ip(request)
    user_agent = request.headers.get("user-agent")
    invalid_credentials = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
    )

    user = await auth_repo.get_user_by_email(session, payload.email)
    if user is None or not user["password_hash"]:
        await auth_repo.record_auth_event(
            session, type="login_failed", email=payload.email, ip=ip, user_agent=user_agent
        )
        await session.commit()
        raise invalid_credentials

    if user["locked_until"] and user["locked_until"] > datetime.now(timezone.utc):
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Too many failed attempts. Try again in a few minutes.",
        )

    if not verify_password(payload.password, user["password_hash"]):
        await auth_repo.register_failed_login(session, user["id"])
        await auth_repo.record_auth_event(
            session,
            type="login_failed",
            user_id=user["id"],
            email=payload.email,
            ip=ip,
            user_agent=user_agent,
        )
        await session.commit()
        raise invalid_credentials

    await auth_repo.clear_failed_logins(session, user["id"])

    raw_token, token_hash = new_session_token()
    await auth_repo.create_session(
        session,
        user_id=user["id"],
        token_hash=token_hash,
        ttl_days=settings.session_ttl_days,
        user_agent=user_agent,
        ip=ip,
    )
    await auth_repo.record_auth_event(
        session,
        type="login_succeeded",
        user_id=user["id"],
        email=payload.email,
        ip=ip,
        user_agent=user_agent,
    )
    await session.commit()

    _set_session_cookie(response, raw_token)
    return UserResponse(
        id=user["id"], email=user["email"], full_name=user["full_name"], created_at=user["created_at"]
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request, response: Response, session: AsyncSession = Depends(get_session)
) -> None:
    raw_token = request.cookies.get(settings.session_cookie_name)
    if raw_token:
        await auth_repo.revoke_session_by_token_hash(
            session, hash_token(raw_token), reason="user_logout"
        )
        await auth_repo.record_auth_event(
            session,
            type="logout",
            ip=_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
        await session.commit()
    _clear_session_cookie(response)


@router.get("/me", response_model=UserResponse)
async def me(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    return current_user
