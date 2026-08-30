from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import Principal, get_current_principal
from ..connections import repo as connections_repo
from ..core.config import get_settings
from ..core.crypto import decrypt_secret
from ..core.db import get_session
from . import repo as schema_repo
from .introspect import SCHEMA_QUERIES, TableResult, introspect_schema
from .schemas import (
    SchemaColumn,
    SchemaFetchResponse,
    SchemaForeignKey,
    SchemaIndex,
    SchemaQueryResponse,
    SchemaSnapshotResponse,
    SchemaTable,
)

settings = get_settings()

router = APIRouter(prefix="/api/connections/{connection_id}/schema", tags=["schema"])


def _to_schema_table(table: TableResult) -> SchemaTable:
    primary_key = set(table.primary_key)
    foreign_key_columns = {col for fk in table.foreign_keys for col in fk.columns}

    return SchemaTable(
        schema_name=table.schema_name,
        name=table.name,
        table_type=table.table_type,
        approx_row_count=table.approx_row_count,
        primary_key=table.primary_key,
        columns=[
            SchemaColumn(
                name=col.name,
                data_type=col.data_type,
                nullable=col.nullable,
                default=col.default,
                ordinal_position=col.ordinal_position,
                max_length=col.max_length,
                numeric_precision=col.numeric_precision,
                numeric_scale=col.numeric_scale,
                is_primary_key=col.name in primary_key,
                is_foreign_key=col.name in foreign_key_columns,
                enum_values=col.enum_values,
            )
            for col in table.columns
        ],
        foreign_keys=[
            SchemaForeignKey(
                constraint_name=fk.constraint_name,
                columns=fk.columns,
                referenced_table=fk.referenced_table,
                referenced_columns=fk.referenced_columns,
                on_update=fk.on_update,
                on_delete=fk.on_delete,
            )
            for fk in table.foreign_keys
        ],
        indexes=[
            SchemaIndex(
                name=idx.name,
                columns=idx.columns,
                is_unique=idx.is_unique,
                is_primary=idx.is_primary,
            )
            for idx in table.indexes
        ],
    )


def _queries_for(engine: str) -> list[SchemaQueryResponse]:
    return [SchemaQueryResponse(label=q.label, sql=q.sql) for q in SCHEMA_QUERIES[engine]]


@router.get("", response_model=SchemaSnapshotResponse)
async def get_schema(
    connection_id: UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> SchemaSnapshotResponse:
    connection = await connections_repo.get_connection(session, principal.tenant_id, connection_id)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")

    snapshot = await schema_repo.get_snapshot(session, principal.tenant_id, connection_id)
    if snapshot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No schema has been fetched for this connection yet.",
        )

    return SchemaSnapshotResponse(
        connection_id=connection_id,
        engine=connection["engine"],
        fetched_at=snapshot["fetched_at"],
        table_count=snapshot["table_count"],
        column_count=snapshot["column_count"],
        tables=schema_repo.parse_tables(snapshot["schema_json"]),
        queries=_queries_for(connection["engine"]),
    )


@router.post("/fetch", response_model=SchemaFetchResponse)
async def fetch_schema(
    connection_id: UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> SchemaFetchResponse:
    connection = await connections_repo.get_connection(session, principal.tenant_id, connection_id)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    if connection["status"] != "connected":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Test this connection successfully before fetching its schema.",
        )

    password = decrypt_secret(
        connection["password_ciphertext"],
        aad=connections_repo.build_aad(principal.tenant_id, connection_id),
    )

    result = await introspect_schema(
        engine=connection["engine"],
        host=connection["host"],
        port=connection["port"],
        database=connection["database_name"],
        username=connection["username"],
        password=password,
        ssl_mode=connection["ssl_mode"],
        allow_private_hosts=settings.allow_private_connection_hosts,
    )

    if not result.ok:
        return SchemaFetchResponse(ok=False, detail=result.detail, latency_ms=result.latency_ms)

    schema_tables = [_to_schema_table(t) for t in result.tables]
    column_count = sum(len(t.columns) for t in schema_tables)

    row = await schema_repo.upsert_snapshot(
        session,
        connection_id=connection_id,
        tenant_id=principal.tenant_id,
        fetched_by=principal.user_id,
        table_count=len(schema_tables),
        column_count=column_count,
        tables=[t.model_dump(mode="json") for t in schema_tables],
    )
    await session.commit()

    return SchemaFetchResponse(
        ok=True,
        detail=result.detail,
        latency_ms=result.latency_ms,
        snapshot=SchemaSnapshotResponse(
            connection_id=connection_id,
            engine=connection["engine"],
            fetched_at=row["fetched_at"],
            table_count=row["table_count"],
            column_count=row["column_count"],
            tables=schema_tables,
            queries=_queries_for(connection["engine"]),
        ),
    )
