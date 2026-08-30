from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from ..connections.schemas import DbEngine


class SchemaColumn(BaseModel):
    name: str
    data_type: str
    nullable: bool
    default: str | None
    ordinal_position: int
    max_length: int | None
    numeric_precision: int | None
    numeric_scale: int | None
    is_primary_key: bool
    is_foreign_key: bool
    # Defaulted so snapshots stored before enum support still validate.
    enum_values: list[str] | None = None


class SchemaForeignKey(BaseModel):
    constraint_name: str
    columns: list[str]
    referenced_table: str
    referenced_columns: list[str]
    on_update: str | None
    on_delete: str | None


class SchemaIndex(BaseModel):
    name: str
    columns: list[str]
    is_unique: bool
    is_primary: bool


class SchemaTable(BaseModel):
    schema_name: str | None
    name: str
    table_type: str
    approx_row_count: int | None
    columns: list[SchemaColumn]
    primary_key: list[str]
    foreign_keys: list[SchemaForeignKey]
    indexes: list[SchemaIndex]


class SchemaQueryResponse(BaseModel):
    label: str
    sql: str


class SchemaSnapshotResponse(BaseModel):
    connection_id: UUID
    engine: DbEngine
    fetched_at: datetime
    table_count: int
    column_count: int
    tables: list[SchemaTable]
    queries: list[SchemaQueryResponse]


class SchemaFetchResponse(BaseModel):
    ok: bool
    detail: str
    latency_ms: int | None = None
    snapshot: SchemaSnapshotResponse | None = None
