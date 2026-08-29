"""Async SQLAlchemy engine and session plumbing for the `nl2sql` database.

The schema itself lives in `backend/schema.sql` and is applied by hand with
psql — nothing here creates, alters or drops anything.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from .config import get_settings

settings = get_settings()

engine: AsyncEngine = create_async_engine(
    settings.database_url,
    echo=settings.db_echo,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_pre_ping=True,  # a stale connection after a laptop sleep is silently replaced
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: one session per request, rolled back on error."""
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


@asynccontextmanager
async def tenant_session(tenant_id: UUID) -> AsyncIterator[AsyncSession]:
    """A session pinned to one tenant for the life of its transaction.

    Sets the `app.tenant_id` GUC that `current_tenant_id()` (schema.sql) reads, so
    the row-level-security policies can be switched on without touching callers.
    """
    async with SessionLocal() as session:
        async with session.begin():
            await session.execute(
                text("SELECT set_config('app.tenant_id', :tenant_id, true)"),
                {"tenant_id": str(tenant_id)},
            )
            yield session


def safe_url() -> str:
    """The connection URL with the password masked, for logs and error messages."""
    return engine.url.render_as_string(hide_password=True)


async def ping() -> bool:
    """Read-only connectivity check used at startup and by /api/health/db."""
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    return True


async def dispose() -> None:
    await engine.dispose()
