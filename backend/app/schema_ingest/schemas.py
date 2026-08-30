from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel

from ..schema_explorer.schemas import SchemaColumn, SchemaIndex


class RelationshipDirection(StrEnum):
    outgoing = "outgoing"
    incoming = "incoming"


class NormalizedRelationship(BaseModel):
    direction: RelationshipDirection
    constraint_name: str
    table: str
    columns: list[str]
    referenced_table: str
    referenced_columns: list[str]
    on_update: str | None
    on_delete: str | None


class NormalizedTable(BaseModel):
    """The exact shape persisted in schema_objects.normalized_json."""

    table: str
    columns: list[SchemaColumn]
    relationships: list[NormalizedRelationship]
    indexes: list[SchemaIndex]


class IngestRunResponse(BaseModel):
    connection_id: UUID
    processed_at: datetime
    table_count: int
    tables: list[NormalizedTable]


class IngestStatusResponse(BaseModel):
    connection_id: UUID
    processed_at: datetime
    table_count: int
    tables: list[NormalizedTable]


class IngestConnectionSummary(BaseModel):
    connection_id: UUID
    label: str
    engine: str
    host: str
    port: int
    database_name: str
    status: str
    has_snapshot: bool
    snapshot_fetched_at: datetime | None
    snapshot_table_count: int | None
    is_processed: bool
    processed_at: datetime | None
    processed_table_count: int | None
