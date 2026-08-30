"""Mirrors app/vectorstore/client.py's shape, for Mem0 Cloud instead of Qdrant."""

from functools import lru_cache

from mem0 import AsyncMemoryClient

from ..core.config import get_settings


@lru_cache
def get_client() -> AsyncMemoryClient:
    return AsyncMemoryClient(api_key=get_settings().mem0_api_key)


async def ping() -> bool:
    await get_client().project.get(fields=["name"])
    return True


async def dispose() -> None:
    await get_client().async_client.aclose()
    get_client.cache_clear()
