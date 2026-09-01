from collections.abc import Awaitable, Callable

ProgressFn = Callable[[str], Awaitable[None]]
UsageFn = Callable[[int, int], Awaitable[None]]


async def noop_progress(_message: str) -> None:
    return None


async def noop_usage(_input_tokens: int, _output_tokens: int) -> None:
    return None
