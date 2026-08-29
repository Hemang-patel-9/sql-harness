"""Connections data access: raw SQL, mirroring auth.py's style."""

from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def list_connections(session: AsyncSession, tenant_id: UUID) -> list[Any]:
    result = await session.execute(
        text(
            """
            SELECT id, label, engine, host, port, database_name, username, ssl_mode,
                   status, last_tested_at, last_test_ok, last_test_detail, created_at
            FROM connections
            WHERE tenant_id = :tenant_id AND deleted_at IS NULL
            ORDER BY created_at DESC
            """
        ),
        {"tenant_id": tenant_id},
    )
    return list(result.mappings().all())


async def get_connection(session: AsyncSession, tenant_id: UUID, connection_id: UUID) -> Any | None:
    result = await session.execute(
        text(
            """
            SELECT id, tenant_id, label, engine, host, port, database_name, username,
                   password_ciphertext, ssl_mode, status, last_tested_at, last_test_ok,
                   last_test_detail, created_at
            FROM connections
            WHERE id = :id AND tenant_id = :tenant_id AND deleted_at IS NULL
            """
        ),
        {"id": connection_id, "tenant_id": tenant_id},
    )
    return result.mappings().first()


async def create_connection(
    session: AsyncSession,
    *,
    id: UUID,
    tenant_id: UUID,
    created_by: UUID,
    label: str,
    engine: str,
    host: str,
    port: int,
    database_name: str,
    username: str,
    password_ciphertext: bytes,
    ssl_mode: str,
) -> Any:
    result = await session.execute(
        text(
            """
            INSERT INTO connections
                (id, tenant_id, created_by, label, engine, host, port,
                 database_name, username, password_ciphertext, ssl_mode)
            VALUES
                (:id, :tenant_id, :created_by, :label, :engine, :host, :port,
                 :database_name, :username, :password_ciphertext, :ssl_mode)
            RETURNING id, label, engine, host, port, database_name, username, ssl_mode,
                      status, last_tested_at, last_test_ok, last_test_detail, created_at
            """
        ),
        {
            "id": id,
            "tenant_id": tenant_id,
            "created_by": created_by,
            "label": label,
            "engine": engine,
            "host": host,
            "port": port,
            "database_name": database_name,
            "username": username,
            "password_ciphertext": password_ciphertext,
            "ssl_mode": ssl_mode,
        },
    )
    return result.mappings().one()


async def update_connection(
    session: AsyncSession,
    *,
    id: UUID,
    tenant_id: UUID,
    label: str,
    engine: str,
    host: str,
    port: int,
    database_name: str,
    username: str,
    password_ciphertext: bytes | None,
    ssl_mode: str,
) -> Any | None:
    """Edits reset the test status: a changed connection hasn't been proven
    to work yet, so the previous test result no longer means anything.
    password_ciphertext=None leaves the stored password untouched.
    """
    result = await session.execute(
        text(
            """
            UPDATE connections
            SET label = :label,
                engine = :engine,
                host = :host,
                port = :port,
                database_name = :database_name,
                username = :username,
                ssl_mode = :ssl_mode,
                password_ciphertext = COALESCE(:password_ciphertext, password_ciphertext),
                status = 'untested',
                last_tested_at = NULL,
                last_test_ok = NULL,
                last_test_detail = NULL
            WHERE id = :id AND tenant_id = :tenant_id AND deleted_at IS NULL
            RETURNING id, label, engine, host, port, database_name, username, ssl_mode,
                      status, last_tested_at, last_test_ok, last_test_detail, created_at
            """
        ),
        {
            "id": id,
            "tenant_id": tenant_id,
            "label": label,
            "engine": engine,
            "host": host,
            "port": port,
            "database_name": database_name,
            "username": username,
            "password_ciphertext": password_ciphertext,
            "ssl_mode": ssl_mode,
        },
    )
    return result.mappings().first()


async def soft_delete_connection(session: AsyncSession, tenant_id: UUID, connection_id: UUID) -> bool:
    result = await session.execute(
        text(
            """
            UPDATE connections
            SET deleted_at = now()
            WHERE id = :id AND tenant_id = :tenant_id AND deleted_at IS NULL
            """
        ),
        {"id": connection_id, "tenant_id": tenant_id},
    )
    return result.rowcount > 0


async def record_test_result(
    session: AsyncSession, connection_id: UUID, *, ok: bool, detail: str
) -> None:
    await session.execute(
        text(
            """
            UPDATE connections
            SET status = (CASE WHEN :ok THEN 'connected' ELSE 'failed' END)::connection_status,
                last_tested_at = now(),
                last_test_ok = :ok,
                last_test_detail = :detail
            WHERE id = :id
            """
        ),
        {"id": connection_id, "ok": ok, "detail": detail[:2000]},
    )
