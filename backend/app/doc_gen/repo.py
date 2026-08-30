"""Generated-document storage: raw SQL, mirroring schema_ingest/repo.py.

Not tied to schema_objects' replace-on-reprocess lifecycle - see the table
comment in schema.sql for why.
"""

import hashlib
import json
from collections.abc import Mapping
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


def compute_source_hash(normalized_json: dict) -> str:
    canonical = json.dumps(normalized_json, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def derive_status(doc: Mapping[str, Any] | None, live_source_hash: str) -> tuple[bool, bool, str | None]:
    if doc is None:
        return False, False, None
    is_embedded = doc["embedded_at"] is not None
    if not is_embedded:
        return True, False, None
    if doc["source_hash"] != live_source_hash:
        return True, True, "schema_changed"
    content_updated_at = doc["edited_at"] or doc["generated_at"]
    if content_updated_at > doc["embedded_at"]:
        return True, True, "document_changed"
    return True, True, None


async def get_document(
    session: AsyncSession, tenant_id: UUID, connection_id: UUID, schema_name: str | None, table_name: str
) -> Any | None:
    result = await session.execute(
        text(
            """
            SELECT schema_name, table_name, document, source_hash, critic_score, critic_notes,
                   generated_at, edited_at, embedded_at, qdrant_point_id
            FROM schema_documents
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


async def list_documents(session: AsyncSession, tenant_id: UUID, connection_id: UUID) -> list[Any]:
    result = await session.execute(
        text(
            """
            SELECT schema_name, table_name, document, source_hash, critic_score, critic_notes,
                   generated_at, edited_at, embedded_at, qdrant_point_id
            FROM schema_documents
            WHERE connection_id = :connection_id AND tenant_id = :tenant_id
            """
        ),
        {"connection_id": connection_id, "tenant_id": tenant_id},
    )
    return list(result.mappings().all())


async def upsert_document(
    session: AsyncSession,
    *,
    connection_id: UUID,
    tenant_id: UUID,
    schema_name: str | None,
    table_name: str,
    document: str,
    source_hash: str,
    critic_score: int,
    critic_notes: dict,
    generated_by: UUID,
    generated_at: datetime,
    qdrant_point_id: UUID,
) -> None:
    await session.execute(
        text(
            """
            INSERT INTO schema_documents
                (connection_id, tenant_id, schema_name, table_name, document, source_hash,
                 critic_score, critic_notes, generated_by, generated_at, edited_at, qdrant_point_id)
            VALUES
                (:connection_id, :tenant_id, :schema_name, :table_name, :document, :source_hash,
                 :critic_score, CAST(:critic_notes AS jsonb), :generated_by, :generated_at, NULL,
                 :qdrant_point_id)
            ON CONFLICT (connection_id, schema_name, table_name) DO UPDATE SET
                document = EXCLUDED.document,
                source_hash = EXCLUDED.source_hash,
                critic_score = EXCLUDED.critic_score,
                critic_notes = EXCLUDED.critic_notes,
                generated_by = EXCLUDED.generated_by,
                generated_at = EXCLUDED.generated_at,
                edited_at = NULL,
                qdrant_point_id = EXCLUDED.qdrant_point_id
            """
        ),
        {
            "connection_id": connection_id,
            "tenant_id": tenant_id,
            "schema_name": schema_name,
            "table_name": table_name,
            "document": document,
            "source_hash": source_hash,
            "critic_score": critic_score,
            "critic_notes": json.dumps(critic_notes),
            "generated_by": generated_by,
            "generated_at": generated_at,
            "qdrant_point_id": qdrant_point_id,
        },
    )


async def edit_document(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    connection_id: UUID,
    schema_name: str | None,
    table_name: str,
    document: str,
    edited_at: datetime,
) -> None:
    await session.execute(
        text(
            """
            UPDATE schema_documents SET document = :document, edited_at = :edited_at
            WHERE connection_id = :connection_id AND tenant_id = :tenant_id
              AND schema_name IS NOT DISTINCT FROM :schema_name AND table_name = :table_name
            """
        ),
        {
            "connection_id": connection_id,
            "tenant_id": tenant_id,
            "schema_name": schema_name,
            "table_name": table_name,
            "document": document,
            "edited_at": edited_at,
        },
    )


async def mark_embedded(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    connection_id: UUID,
    schema_name: str | None,
    table_name: str,
    embedded_at: datetime,
) -> None:
    await session.execute(
        text(
            """
            UPDATE schema_documents SET embedded_at = :embedded_at
            WHERE connection_id = :connection_id AND tenant_id = :tenant_id
              AND schema_name IS NOT DISTINCT FROM :schema_name AND table_name = :table_name
            """
        ),
        {
            "connection_id": connection_id,
            "tenant_id": tenant_id,
            "schema_name": schema_name,
            "table_name": table_name,
            "embedded_at": embedded_at,
        },
    )


def parse_json(value: Any) -> Any:
    return json.loads(value) if isinstance(value, str) else value
