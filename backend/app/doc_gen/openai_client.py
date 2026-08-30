"""Mirrors app/vectorstore/client.py's shape, for OpenAI instead of Qdrant."""

from functools import lru_cache

from openai import AsyncOpenAI

from ..core.config import get_settings


@lru_cache
def get_client() -> AsyncOpenAI:
    return AsyncOpenAI(api_key=get_settings().openai_api_key)


async def ping() -> bool:
    await get_client().models.list()
    return True


async def dispose() -> None:
    await get_client().close()
    get_client.cache_clear()
