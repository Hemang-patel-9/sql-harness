"""Normalized per-table schema storage: raw SQL, mirroring schema_explorer/repo.py.

One row per (connection, table), fully replaced on every re-process - a
row-by-row diff isn't worth the complexity for what's a derived cache of
schema_snapshots, not its own source of truth.
"""

import json
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def replace_objects(
    session: AsyncSession,
    *,
    connection_id: UUID,
    tenant_id: UUID,
    processed_by: UUID,
    processed_at: datetime,
    rows: list[dict[str, Any]],
) -> None:
    """rows: [{"schema_name", "table_name", "normalized_json"}, ...]"""
    await session.execute(
        text("DELETE FROM schema_objects WHERE connection_id = :connection_id AND tenant_id = :tenant_id"),
        {"connection_id": connection_id, "tenant_id": tenant_id},
    )

    for row in rows:
        await session.execute(
            text(
                """
                INSERT INTO schema_objects
                    (connection_id, tenant_id, processed_by, processed_at, schema_name,
                     table_name, normalized_json)
                VALUES
                    (:connection_id, :tenant_id, :processed_by, :processed_at, :schema_name,
                     :table_name, CAST(:normalized_json AS jsonb))
                """
            ),
            {
                "connection_id": connection_id,
                "tenant_id": tenant_id,
                "processed_by": processed_by,
                "processed_at": processed_at,
                "schema_name": row["schema_name"],
                "table_name": row["table_name"],
                "normalized_json": json.dumps(row["normalized_json"]),
            },
        )


async def get_objects(session: AsyncSession, tenant_id: UUID, connection_id: UUID) -> list[Any]:
    result = await session.execute(
        text(
            """
            SELECT processed_at, schema_name, table_name, normalized_json
            FROM schema_objects
            WHERE connection_id = :connection_id AND tenant_id = :tenant_id
            ORDER BY table_name
            """
        ),
        {"connection_id": connection_id, "tenant_id": tenant_id},
    )
    return list(result.mappings().all())


async def get_object(
    session: AsyncSession, tenant_id: UUID, connection_id: UUID, schema_name: str | None, table_name: str
) -> Any | None:
    result = await session.execute(
        text(
            """
            SELECT processed_at, schema_name, table_name, normalized_json
            FROM schema_objects
            WHERE connection_id = :connection_id AND tenant_id = :tenant_id
              AND schema_name IS NOT DISTINCT FROM :schema_name AND table_name = :table_name
            """
        ),
        {
            "connection_id": connection_id,
            "tenant_id": tenant_id,
            "schema_name": schema_name,
            "table_name": table_name,
        },
    )
    return result.mappings().first()


async def list_ingest_summaries(session: AsyncSession, tenant_id: UUID) -> list[Any]:
    result = await session.execute(
        text(
            """
            SELECT
                c.id AS connection_id,
                c.label,
                c.engine,
                c.host,
                c.port,
                c.database_name,
                c.status,
                ss.fetched_at   AS snapshot_fetched_at,
                ss.table_count  AS snapshot_table_count,
                obj.processed_at,
                obj.processed_table_count
            FROM connections c
            LEFT JOIN schema_snapshots ss ON ss.connection_id = c.id
            LEFT JOIN LATERAL (
                SELECT max(o.processed_at) AS processed_at, count(*) AS processed_table_count
                FROM schema_objects o
                WHERE o.connection_id = c.id
            ) obj ON true
            WHERE c.tenant_id = :tenant_id AND c.deleted_at IS NULL
            ORDER BY c.created_at DESC
            """
        ),
        {"tenant_id": tenant_id},
    )
    return list(result.mappings().all())


def parse_json(value: Any) -> Any:
    """asyncpg hands jsonb columns back as raw text; decode if so."""
    return json.loads(value) if isinstance(value, str) else value
