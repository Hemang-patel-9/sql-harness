"""Auth data access: raw SQL over the tables in schema.sql.

Mirrors the style of db.py/services.py - no ORM models, just parameterized
`text()` queries against the schema that already exists.
"""

import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

FAILED_LOGIN_LIMIT = 5
LOCKOUT_MINUTES = 15

_SLUG_INVALID = re.compile(r"[^a-z0-9-]+")
_SLUG_EDGE = re.compile(r"(^-+|-+$)")


def _slugify(seed: str) -> str:
    base = _SLUG_INVALID.sub("-", seed.lower())
    base = _SLUG_EDGE.sub("", base)[:40] or "workspace"
    return f"{base}-{secrets.token_hex(3)}"


async def get_user_by_email(session: AsyncSession, email: str) -> Any | None:
    result = await session.execute(
        text(
            """
            SELECT id, email, password_hash, full_name, created_at,
                   failed_login_count, locked_until
            FROM users
            WHERE email = :email AND deleted_at IS NULL
            """
        ),
        {"email": email},
    )
    return result.mappings().first()


async def create_user(
    session: AsyncSession, *, email: str, password_hash: str, full_name: str
) -> Any:
    result = await session.execute(
        text(
            """
            INSERT INTO users (email, password_hash, full_name)
            VALUES (:email, :password_hash, :full_name)
            RETURNING id, email, full_name, created_at
            """
        ),
        {"email": email, "password_hash": password_hash, "full_name": full_name},
    )
    return result.mappings().one()


async def create_personal_tenant(
    session: AsyncSession, *, user_id: UUID, email: str, full_name: str
) -> UUID:
    slug = _slugify(email.split("@", 1)[0])
    tenant_name = f"{full_name}'s workspace"

    tenant = (
        await session.execute(
            text(
                """
                INSERT INTO tenants (slug, name)
                VALUES (:slug, :name)
                RETURNING id
                """
            ),
            {"slug": slug, "name": tenant_name},
        )
    ).mappings().one()
    tenant_id = tenant["id"]

    await session.execute(
        text(
            """
            INSERT INTO memberships (tenant_id, user_id, role)
            VALUES (:tenant_id, :user_id, 'owner')
            """
        ),
        {"tenant_id": tenant_id, "user_id": user_id},
    )
    await session.execute(
        text("UPDATE users SET last_tenant_id = :tenant_id WHERE id = :user_id"),
        {"tenant_id": tenant_id, "user_id": user_id},
    )
    return tenant_id


async def create_session(
    session: AsyncSession,
    *,
    user_id: UUID,
    token_hash: bytes,
    ttl_days: int,
    user_agent: str | None,
    ip: str | None,
) -> UUID:
    expires_at = datetime.now(timezone.utc) + timedelta(days=ttl_days)
    result = await session.execute(
        text(
            """
            INSERT INTO sessions (user_id, refresh_token_hash, user_agent, ip, expires_at)
            VALUES (:user_id, :token_hash, :user_agent, CAST(:ip AS inet), :expires_at)
            RETURNING id
            """
        ),
        {
            "user_id": user_id,
            "token_hash": token_hash,
            "user_agent": user_agent,
            "ip": ip,
            "expires_at": expires_at,
        },
    )
    return result.scalar_one()


async def get_session_by_token_hash(session: AsyncSession, token_hash: bytes) -> Any | None:
    result = await session.execute(
        text(
            """
            SELECT s.id AS session_id, u.id, u.email, u.full_name, u.created_at
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.refresh_token_hash = :token_hash
              AND s.revoked_at IS NULL
              AND s.expires_at > now()
              AND u.deleted_at IS NULL
            """
        ),
        {"token_hash": token_hash},
    )
    return result.mappings().first()


async def touch_session(session: AsyncSession, session_id: UUID) -> None:
    await session.execute(
        text("UPDATE sessions SET last_seen_at = now() WHERE id = :id"),
        {"id": session_id},
    )


async def revoke_session_by_token_hash(
    session: AsyncSession, token_hash: bytes, reason: str
) -> None:
    await session.execute(
        text(
            """
            UPDATE sessions
            SET revoked_at = now(), revoked_reason = :reason
            WHERE refresh_token_hash = :token_hash AND revoked_at IS NULL
            """
        ),
        {"token_hash": token_hash, "reason": reason},
    )


async def register_failed_login(session: AsyncSession, user_id: UUID) -> None:
    await session.execute(
        text(
            """
            UPDATE users
            SET failed_login_count = failed_login_count + 1,
                locked_until = CASE
                    WHEN failed_login_count + 1 >= :limit
                        THEN now() + make_interval(mins => :lockout_minutes)
                    ELSE locked_until
                END
            WHERE id = :user_id
            """
        ),
        {"user_id": user_id, "limit": FAILED_LOGIN_LIMIT, "lockout_minutes": LOCKOUT_MINUTES},
    )


async def clear_failed_logins(session: AsyncSession, user_id: UUID) -> None:
    await session.execute(
        text(
            """
            UPDATE users
            SET failed_login_count = 0, locked_until = NULL, last_login_at = now()
            WHERE id = :user_id
            """
        ),
        {"user_id": user_id},
    )


async def record_auth_event(
    session: AsyncSession,
    *,
    type: str,
    user_id: UUID | None = None,
    email: str | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
) -> None:
    await session.execute(
        text(
            """
            INSERT INTO auth_events (user_id, email, type, ip, user_agent)
            VALUES (:user_id, :email, :type, CAST(:ip AS inet), :user_agent)
            """
        ),
        {"user_id": user_id, "email": email, "type": type, "ip": ip, "user_agent": user_agent},
    )
