from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import Principal, get_current_principal
from ..connections import repo as connections_repo
from ..core.db import get_session
from ..schema_explorer import repo as schema_repo
from ..schema_explorer.schemas import SchemaTable
from . import repo as ingest_repo
from .normalize import normalize_tables
from .schemas import (
    IngestConnectionSummary,
    IngestRunResponse,
    IngestStatusResponse,
    NormalizedTable,
)

router = APIRouter(prefix="/api", tags=["schema-ingest"])


@router.get("/schema-ingest/connections", response_model=list[IngestConnectionSummary])
async def list_ingest_connections(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> list[IngestConnectionSummary]:
    rows = await ingest_repo.list_ingest_summaries(session, principal.tenant_id)
    return [
        IngestConnectionSummary(
            connection_id=row["connection_id"],
            label=row["label"],
            engine=row["engine"],
            host=row["host"],
            port=row["port"],
            database_name=row["database_name"],
            status=row["status"],
            has_snapshot=row["snapshot_fetched_at"] is not None,
            snapshot_fetched_at=row["snapshot_fetched_at"],
            snapshot_table_count=row["snapshot_table_count"],
            is_processed=row["processed_at"] is not None,
            processed_at=row["processed_at"],
            processed_table_count=row["processed_table_count"],
        )
        for row in rows
    ]


@router.post("/connections/{connection_id}/ingest", response_model=IngestRunResponse)
async def ingest_connection_schema(
    connection_id: UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> IngestRunResponse:
    connection = await connections_repo.get_connection(session, principal.tenant_id, connection_id)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")

    snapshot = await schema_repo.get_snapshot(session, principal.tenant_id, connection_id)
    if snapshot is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fetch this connection's schema before processing it.",
        )

    source_tables = [SchemaTable.model_validate(t) for t in schema_repo.parse_tables(snapshot["schema_json"])]
    normalized = normalize_tables(source_tables)
    processed_at = datetime.now(UTC)

    await ingest_repo.replace_objects(
        session,
        connection_id=connection_id,
        tenant_id=principal.tenant_id,
        processed_by=principal.user_id,
        processed_at=processed_at,
        rows=[
            {
                "schema_name": source.schema_name,
                "table_name": source.name,
                "normalized_json": table.model_dump(mode="json"),
            }
            for source, table in zip(source_tables, normalized, strict=True)
        ],
    )
    await session.commit()

    return IngestRunResponse(
        connection_id=connection_id,
        processed_at=processed_at,
        table_count=len(normalized),
        tables=normalized,
    )


@router.get("/connections/{connection_id}/ingest", response_model=IngestStatusResponse)
async def get_ingest_status(
    connection_id: UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> IngestStatusResponse:
    connection = await connections_repo.get_connection(session, principal.tenant_id, connection_id)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")

    rows = await ingest_repo.get_objects(session, principal.tenant_id, connection_id)
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This connection's schema hasn't been processed yet.",
        )

    tables = [
        NormalizedTable.model_validate(ingest_repo.parse_json(row["normalized_json"])) for row in rows
    ]
    return IngestStatusResponse(
        connection_id=connection_id,
        processed_at=max(row["processed_at"] for row in rows),
        table_count=len(rows),
        tables=tables,
    )
