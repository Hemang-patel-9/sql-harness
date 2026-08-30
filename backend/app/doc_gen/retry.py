import asyncio
from collections.abc import Awaitable, Callable


async def with_retries[T](fn: Callable[[], Awaitable[T]], *, attempts: int = 3, base_delay: float = 1.0) -> T:
    last_exc: Exception | None = None
    for attempt in range(attempts):
        try:
            return await fn()
        except Exception as exc:  # noqa: BLE001 - retried broadly, re-raised verbatim on the last attempt
            last_exc = exc
            if attempt == attempts - 1:
                break
            await asyncio.sleep(base_delay * (2**attempt))
    assert last_exc is not None
    raise last_exc
