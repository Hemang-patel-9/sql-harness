"""Mirrors app/vectorstore/client.py's shape, for Anthropic instead of Qdrant."""

from functools import lru_cache

from anthropic import AsyncAnthropic

from ..core.config import get_settings


@lru_cache
def get_client() -> AsyncAnthropic:
    return AsyncAnthropic(api_key=get_settings().anthropic_api_key)


async def ping() -> bool:
    await get_client().models.list(limit=1)
    return True


async def dispose() -> None:
    await get_client().close()
    get_client.cache_clear()
