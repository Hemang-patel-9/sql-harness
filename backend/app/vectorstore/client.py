"""Mirrors app/core/db.py's shape, for Qdrant instead of Postgres."""

from functools import lru_cache

from qdrant_client import AsyncQdrantClient

from ..core.config import get_settings


@lru_cache
def get_client() -> AsyncQdrantClient:
    settings = get_settings()
    return AsyncQdrantClient(
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key or None,
        timeout=settings.qdrant_timeout_seconds,
    )


async def ping() -> bool:
    await get_client().get_collections()
    return True


async def dispose() -> None:
    await get_client().close()
    get_client.cache_clear()
