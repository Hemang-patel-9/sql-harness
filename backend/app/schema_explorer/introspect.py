"""Schema introspection for a customer's database ("fetch schema").

Opens a short-lived, read-only connection with the caller's own credentials
and reads table/column/foreign-key/index metadata from the engine's own
catalog views (information_schema / pg_catalog). Nothing here ever touches
the customer's data, only its catalog.

Every query run is also exposed as static text via `SCHEMA_QUERIES` so the
API (and the UI) can show the caller exactly what will run, before it runs.
"""

import asyncio
import itertools
import ssl as ssl_lib
import time
from dataclasses import dataclass, field

import aiomysql
import asyncpg

from ..connections.probe import CONNECT_TIMEOUT_SECONDS, UnsafeHostError, _assert_host_is_safe
from ..connections.schemas import DbEngine, SslMode

INTROSPECT_TIMEOUT_SECONDS = 20


@dataclass
class QuerySpec:
    label: str
    sql: str


@dataclass
class ColumnResult:
    name: str
    data_type: str
    nullable: bool
    default: str | None
    ordinal_position: int
    max_length: int | None
    numeric_precision: int | None
    numeric_scale: int | None


@dataclass
class ForeignKeyResult:
    constraint_name: str
    columns: list[str]
    referenced_table: str
    referenced_columns: list[str]
    on_update: str | None
    on_delete: str | None


@dataclass
class IndexResult:
    name: str
    columns: list[str]
    is_unique: bool
    is_primary: bool


@dataclass
class TableResult:
    schema_name: str | None
    name: str
    table_type: str
    approx_row_count: int | None
    columns: list[ColumnResult] = field(default_factory=list)
    primary_key: list[str] = field(default_factory=list)
    foreign_keys: list[ForeignKeyResult] = field(default_factory=list)
    indexes: list[IndexResult] = field(default_factory=list)


@dataclass
class IntrospectResult:
    ok: bool
    detail: str
    tables: list[TableResult] = field(default_factory=list)
    latency_ms: int | None = None


# ---------------------------------------------------------------------------
# PostgreSQL — pg_catalog / information_schema
# ---------------------------------------------------------------------------

_PG_TABLES_SQL = """\
SELECT
    n.nspname AS table_schema,
    c.relname AS table_name,
    CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized_view'
    END AS table_type,
    GREATEST(c.reltuples, 0)::bigint AS approx_row_count
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'v', 'm')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%'
ORDER BY n.nspname, c.relname;"""

_PG_COLUMNS_SQL = """\
SELECT
    table_schema,
    table_name,
    column_name,
    ordinal_position,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length,
    numeric_precision,
    numeric_scale
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_name, ordinal_position;"""

_PG_FOREIGN_KEYS_SQL = """\
SELECT
    tc.table_schema,
    tc.table_name,
    tc.constraint_name,
    kcu.column_name,
    kcu.ordinal_position,
    ccu.table_name AS referenced_table,
    ccu.column_name AS referenced_column,
    rc.update_rule,
    rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints rc
    ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY tc.table_schema, tc.table_name, tc.constraint_name, kcu.ordinal_position;"""

_PG_INDEXES_SQL = """\
SELECT
    n.nspname AS table_schema,
    t.relname AS table_name,
    i.relname AS index_name,
    ix.indisunique AS is_unique,
    ix.indisprimary AS is_primary,
    array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) AS columns
FROM pg_catalog.pg_index ix
JOIN pg_catalog.pg_class t ON t.oid = ix.indrelid
JOIN pg_catalog.pg_class i ON i.oid = ix.indexrelid
JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
GROUP BY n.nspname, t.relname, i.relname, ix.indisunique, ix.indisprimary
ORDER BY n.nspname, t.relname, i.relname;"""

# ---------------------------------------------------------------------------
# MySQL — information_schema
# ---------------------------------------------------------------------------

_MYSQL_TABLES_SQL = """\
SELECT
    table_schema,
    table_name,
    table_type,
    table_rows AS approx_row_count
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY table_name;"""

_MYSQL_COLUMNS_SQL = """\
SELECT
    table_schema,
    table_name,
    column_name,
    ordinal_position,
    column_type,
    is_nullable,
    column_default,
    character_maximum_length,
    numeric_precision,
    numeric_scale
FROM information_schema.columns
WHERE table_schema = DATABASE()
ORDER BY table_name, ordinal_position;"""

_MYSQL_FOREIGN_KEYS_SQL = """\
SELECT
    kcu.table_name,
    kcu.constraint_name,
    kcu.column_name,
    kcu.ordinal_position,
    kcu.referenced_table_name AS referenced_table,
    kcu.referenced_column_name AS referenced_column,
    rc.update_rule,
    rc.delete_rule
FROM information_schema.key_column_usage kcu
JOIN information_schema.referential_constraints rc
    ON rc.constraint_name = kcu.constraint_name AND rc.constraint_schema = kcu.table_schema
WHERE kcu.table_schema = DATABASE()
  AND kcu.referenced_table_name IS NOT NULL
ORDER BY kcu.table_name, kcu.constraint_name, kcu.ordinal_position;"""

_MYSQL_INDEXES_SQL = """\
SELECT
    table_name,
    index_name,
    non_unique,
    seq_in_index,
    column_name
FROM information_schema.statistics
WHERE table_schema = DATABASE()
ORDER BY table_name, index_name, seq_in_index;"""


SCHEMA_QUERIES: dict[DbEngine, list[QuerySpec]] = {
    DbEngine.postgresql: [
        QuerySpec("Tables", _PG_TABLES_SQL),
        QuerySpec("Columns", _PG_COLUMNS_SQL),
        QuerySpec("Foreign keys", _PG_FOREIGN_KEYS_SQL),
        QuerySpec("Indexes (primary key included)", _PG_INDEXES_SQL),
    ],
    DbEngine.mysql: [
        QuerySpec("Tables", _MYSQL_TABLES_SQL),
        QuerySpec("Columns", _MYSQL_COLUMNS_SQL),
        QuerySpec("Foreign keys", _MYSQL_FOREIGN_KEYS_SQL),
        QuerySpec("Indexes (primary key included)", _MYSQL_INDEXES_SQL),
    ],
}


async def introspect_schema(
    *,
    engine: DbEngine,
    host: str,
    port: int,
    database: str,
    username: str,
    password: str,
    ssl_mode: SslMode,
    allow_private_hosts: bool,
) -> IntrospectResult:
    try:
        _assert_host_is_safe(host, allow_private=allow_private_hosts)
    except UnsafeHostError as exc:
        return IntrospectResult(ok=False, detail=str(exc))

    start = time.monotonic()
    try:
        if engine == DbEngine.postgresql:
            tables = await asyncio.wait_for(
                _introspect_postgres(host, port, database, username, password, ssl_mode),
                timeout=INTROSPECT_TIMEOUT_SECONDS,
            )
        else:
            tables = await asyncio.wait_for(
                _introspect_mysql(host, port, database, username, password, ssl_mode),
                timeout=INTROSPECT_TIMEOUT_SECONDS,
            )
    except TimeoutError:
        return IntrospectResult(ok=False, detail="Timed out reading the schema.")
    except Exception as exc:  # noqa: BLE001 - shown to the user as a result
        return IntrospectResult(ok=False, detail=_friendly_error(exc))

    latency_ms = int((time.monotonic() - start) * 1000)
    return IntrospectResult(ok=True, detail="Fetched", tables=tables, latency_ms=latency_ms)


def _friendly_error(exc: Exception) -> str:
    message = str(exc).strip() or exc.__class__.__name__
    return message[:300]


async def _introspect_postgres(
    host: str, port: int, database: str, username: str, password: str, ssl_mode: SslMode
) -> list[TableResult]:
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
        table_rows = await conn.fetch(_PG_TABLES_SQL)
        column_rows = await conn.fetch(_PG_COLUMNS_SQL)
        fk_rows = await conn.fetch(_PG_FOREIGN_KEYS_SQL)
        index_rows = await conn.fetch(_PG_INDEXES_SQL)
    finally:
        await conn.close()

    tables: dict[tuple[str, str], TableResult] = {}
    for row in table_rows:
        key = (row["table_schema"], row["table_name"])
        tables[key] = TableResult(
            schema_name=row["table_schema"],
            name=row["table_name"],
            table_type=row["table_type"],
            approx_row_count=row["approx_row_count"],
        )

    for row in column_rows:
        table = tables.get((row["table_schema"], row["table_name"]))
        if table is None:
            continue
        table.columns.append(
            ColumnResult(
                name=row["column_name"],
                data_type=row["data_type"],
                nullable=row["is_nullable"] == "YES",
                default=row["column_default"],
                ordinal_position=row["ordinal_position"],
                max_length=row["character_maximum_length"],
                numeric_precision=row["numeric_precision"],
                numeric_scale=row["numeric_scale"],
            )
        )

    def _fk_group_key(row: asyncpg.Record) -> tuple[str, str, str]:
        return (row["table_schema"], row["table_name"], row["constraint_name"])

    for (schema, name, constraint_name), rows in itertools.groupby(fk_rows, key=_fk_group_key):
        table = tables.get((schema, name))
        if table is None:
            continue
        rows = list(rows)
        table.foreign_keys.append(
            ForeignKeyResult(
                constraint_name=constraint_name,
                columns=[r["column_name"] for r in rows],
                referenced_table=rows[0]["referenced_table"],
                referenced_columns=[r["referenced_column"] for r in rows],
                on_update=rows[0]["update_rule"],
                on_delete=rows[0]["delete_rule"],
            )
        )

    for row in index_rows:
        table = tables.get((row["table_schema"], row["table_name"]))
        if table is None:
            continue
        index = IndexResult(
            name=row["index_name"],
            columns=list(row["columns"]),
            is_unique=row["is_unique"],
            is_primary=row["is_primary"],
        )
        table.indexes.append(index)
        if index.is_primary:
            table.primary_key = index.columns

    return list(tables.values())


async def _introspect_mysql(
    host: str, port: int, database: str, username: str, password: str, ssl_mode: SslMode
) -> list[TableResult]:
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
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(_MYSQL_TABLES_SQL)
            table_rows = await cur.fetchall()

            await cur.execute(_MYSQL_COLUMNS_SQL)
            column_rows = await cur.fetchall()

            await cur.execute(_MYSQL_FOREIGN_KEYS_SQL)
            fk_rows = await cur.fetchall()

            await cur.execute(_MYSQL_INDEXES_SQL)
            index_rows = await cur.fetchall()
    finally:
        conn.close()

    tables: dict[str, TableResult] = {}
    for row in table_rows:
        tables[row["table_name"]] = TableResult(
            schema_name=row["table_schema"],
            name=row["table_name"],
            table_type=row["table_type"].lower(),
            approx_row_count=row["approx_row_count"],
        )

    for row in column_rows:
        table = tables.get(row["table_name"])
        if table is None:
            continue
        table.columns.append(
            ColumnResult(
                name=row["column_name"],
                data_type=row["column_type"],
                nullable=row["is_nullable"] == "YES",
                default=row["column_default"],
                ordinal_position=row["ordinal_position"],
                max_length=row["character_maximum_length"],
                numeric_precision=row["numeric_precision"],
                numeric_scale=row["numeric_scale"],
            )
        )

    for row in fk_rows:
        table = tables.get(row["table_name"])
        if table is None:
            continue
        table.foreign_keys.append(
            ForeignKeyResult(
                constraint_name=row["constraint_name"],
                columns=[row["column_name"]],
                referenced_table=row["referenced_table"],
                referenced_columns=[row["referenced_column"]],
                on_update=row["update_rule"],
                on_delete=row["delete_rule"],
            )
        )

    def _index_group_key(row: dict) -> tuple[str, str]:
        return (row["table_name"], row["index_name"])

    for (table_name, index_name), rows in itertools.groupby(index_rows, key=_index_group_key):
        table = tables.get(table_name)
        if table is None:
            continue
        rows = list(rows)
        index = IndexResult(
            name=index_name,
            columns=[r["column_name"] for r in rows],
            is_unique=rows[0]["non_unique"] == 0,
            is_primary=index_name == "PRIMARY",
        )
        table.indexes.append(index)
        if index.is_primary:
            table.primary_key = index.columns

    return list(tables.values())
