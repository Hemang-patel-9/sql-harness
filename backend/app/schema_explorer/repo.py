"""Schema snapshot data access: raw SQL, mirroring connections/repo.py's style.

One snapshot per connection (upserted on every fetch) — a schema tab shows
the *last* fetch, not a history of them.
"""

import json
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def get_snapshot(session: AsyncSession, tenant_id: UUID, connection_id: UUID) -> Any | None:
    result = await session.execute(
        text(
            """
            SELECT connection_id, fetched_at, table_count, column_count, schema_json
            FROM schema_snapshots
            WHERE connection_id = :connection_id AND tenant_id = :tenant_id
            """
        ),
        {"connection_id": connection_id, "tenant_id": tenant_id},
    )
    return result.mappings().first()


async def upsert_snapshot(
    session: AsyncSession,
    *,
    connection_id: UUID,
    tenant_id: UUID,
    fetched_by: UUID,
    table_count: int,
    column_count: int,
    tables: list[dict],
) -> Any:
    result = await session.execute(
        text(
            """
            INSERT INTO schema_snapshots
                (connection_id, tenant_id, fetched_by, table_count, column_count, schema_json)
            VALUES
                (:connection_id, :tenant_id, :fetched_by, :table_count, :column_count,
                 CAST(:schema_json AS jsonb))
            ON CONFLICT (connection_id) DO UPDATE SET
                fetched_by = EXCLUDED.fetched_by,
                fetched_at = now(),
                table_count = EXCLUDED.table_count,
                column_count = EXCLUDED.column_count,
                schema_json = EXCLUDED.schema_json
            RETURNING connection_id, fetched_at, table_count, column_count, schema_json
            """
        ),
        {
            "connection_id": connection_id,
            "tenant_id": tenant_id,
            "fetched_by": fetched_by,
            "table_count": table_count,
            "column_count": column_count,
            "schema_json": json.dumps(tables),
        },
    )
    return result.mappings().one()


def parse_tables(schema_json: Any) -> list[dict]:
    """asyncpg hands jsonb columns back as raw text; decode if so."""
    return json.loads(schema_json) if isinstance(schema_json, str) else schema_json
