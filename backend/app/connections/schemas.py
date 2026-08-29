from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class DbEngine(StrEnum):
    postgresql = "postgresql"
    mysql = "mysql"


class SslMode(StrEnum):
    disable = "disable"
    require = "require"


def _require_nonblank(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("This field is required")
    return value


class ConnectionCreateRequest(BaseModel):
    label: str = Field(..., min_length=1, max_length=120)
    engine: DbEngine
    host: str = Field(..., min_length=1, max_length=255)
    port: int = Field(..., ge=1, le=65535)
    database_name: str = Field(..., min_length=1, max_length=120)
    username: str = Field(..., min_length=1, max_length=120)
    password: str = Field(..., min_length=1, max_length=500)
    ssl_mode: SslMode = SslMode.require

    @field_validator("label", "host", "database_name", "username")
    @classmethod
    def _strip(cls, value: str) -> str:
        return _require_nonblank(value)


class ConnectionUpdateRequest(BaseModel):
    """Same shape as create, except password is optional: blank/omitted
    means keep the currently stored password."""

    label: str = Field(..., min_length=1, max_length=120)
    engine: DbEngine
    host: str = Field(..., min_length=1, max_length=255)
    port: int = Field(..., ge=1, le=65535)
    database_name: str = Field(..., min_length=1, max_length=120)
    username: str = Field(..., min_length=1, max_length=120)
    password: str | None = Field(None, max_length=500)
    ssl_mode: SslMode = SslMode.require

    @field_validator("label", "host", "database_name", "username")
    @classmethod
    def _strip(cls, value: str) -> str:
        return _require_nonblank(value)

    @field_validator("password")
    @classmethod
    def _blank_password_means_unchanged(cls, value: str | None) -> str | None:
        return value if value else None


class ConnectionResponse(BaseModel):
    """Never includes the password or its ciphertext."""

    id: UUID
    label: str
    engine: DbEngine
    host: str
    port: int
    database_name: str
    username: str
    ssl_mode: SslMode
    status: str
    last_tested_at: datetime | None
    last_test_ok: bool | None
    last_test_detail: str | None
    created_at: datetime


class ConnectionTestResponse(BaseModel):
    ok: bool
    detail: str
    current_user: str | None = None
    current_database: str | None = None
    table_count: int | None = None
    latency_ms: int | None = None
