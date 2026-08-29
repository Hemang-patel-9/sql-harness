"""Live connectivity test for a customer's database ("fire demo query").

Opens a short-lived connection with the caller's own credentials and runs a
small, read-only info query. A failed test is a normal, expected outcome
(bad credentials, unreachable host) and is reported back as data, not
raised as a server error.
"""

import asyncio
import ipaddress
import socket
import ssl as ssl_lib
import time
from dataclasses import dataclass

import aiomysql
import asyncpg

from .schemas import DbEngine, SslMode

CONNECT_TIMEOUT_SECONDS = 5


@dataclass
class ProbeResult:
    ok: bool
    detail: str
    current_user: str | None = None
    current_database: str | None = None
    table_count: int | None = None
    latency_ms: int | None = None


class UnsafeHostError(Exception):
    pass


def _assert_host_is_safe(host: str, *, allow_private: bool) -> None:
    if allow_private:
        return
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise UnsafeHostError(f"Could not resolve host {host!r}: {exc}") from exc

    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            raise UnsafeHostError(
                f"{host!r} resolves to {ip}, a private/internal address. "
                "Connecting to internal addresses isn't allowed."
            )


async def probe_connection(
    *,
    engine: DbEngine,
    host: str,
    port: int,
    database: str,
    username: str,
    password: str,
    ssl_mode: SslMode,
    allow_private_hosts: bool,
) -> ProbeResult:
    try:
        _assert_host_is_safe(host, allow_private=allow_private_hosts)
    except UnsafeHostError as exc:
        return ProbeResult(ok=False, detail=str(exc))

    start = time.monotonic()
    try:
        if engine == DbEngine.postgresql:
            result = await asyncio.wait_for(
                _probe_postgres(host, port, database, username, password, ssl_mode),
                timeout=CONNECT_TIMEOUT_SECONDS,
            )
        else:
            result = await asyncio.wait_for(
                _probe_mysql(host, port, database, username, password, ssl_mode),
                timeout=CONNECT_TIMEOUT_SECONDS,
            )
    except TimeoutError:
        return ProbeResult(ok=False, detail="Timed out connecting to the database.")
    except Exception as exc:  # noqa: BLE001 - shown to the user as a test result
        return ProbeResult(ok=False, detail=_friendly_error(exc))

    result.latency_ms = int((time.monotonic() - start) * 1000)
    return result


def _friendly_error(exc: Exception) -> str:
    message = str(exc).strip() or exc.__class__.__name__
    return message[:300]


async def _probe_postgres(
    host: str, port: int, database: str, username: str, password: str, ssl_mode: SslMode
) -> ProbeResult:
    conn = await asyncpg.connect(
        host=host,
        port=port,
        database=database,
        user=username,
        password=password,
        ssl=ssl_mode == SslMode.require,
        timeout=CONNECT_TIMEOUT_SECONDS,
    )
    try:
        row = await conn.fetchrow(
            """
            SELECT
                current_user AS current_user,
                current_database() AS current_database,
                (SELECT count(*)::int FROM information_schema.tables
                 WHERE table_schema NOT IN ('pg_catalog', 'information_schema')) AS table_count
            """
        )
        return ProbeResult(
            ok=True,
            detail="Connected",
            current_user=row["current_user"],
            current_database=row["current_database"],
            table_count=row["table_count"],
        )
    finally:
        await conn.close()


async def _probe_mysql(
    host: str, port: int, database: str, username: str, password: str, ssl_mode: SslMode
) -> ProbeResult:
    ssl_ctx = ssl_lib.create_default_context() if ssl_mode == SslMode.require else None
    conn = await aiomysql.connect(
        host=host,
        port=port,
        db=database,
        user=username,
        password=password,
        ssl=ssl_ctx,
        connect_timeout=CONNECT_TIMEOUT_SECONDS,
    )
    try:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT CURRENT_USER() AS current_user, DATABASE() AS current_database, "
                "(SELECT COUNT(*) FROM information_schema.tables "
                " WHERE table_schema = DATABASE()) AS table_count"
            )
            current_user, current_database, table_count = await cur.fetchone()
        return ProbeResult(
            ok=True,
            detail="Connected",
            current_user=current_user,
            current_database=current_database,
            table_count=table_count,
        )
    finally:
        conn.close()
