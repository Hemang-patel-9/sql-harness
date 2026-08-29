from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "SQL Harness API"
    debug: bool = True
    # Comma-separated list of allowed CORS origins.
    cors_origins: str = "http://localhost:3000"

    # Local PostgreSQL 18 listens on 5433. Override the whole URL in .env.
    # asyncpg, not psycopg: psycopg's async mode refuses Windows' ProactorEventLoop.
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5433/nl2sql"
    db_echo: bool = False
    db_pool_size: int = 5
    db_max_overflow: int = 5

    # Session cookie (opaque token; only its sha256 hash is stored, see security.py).
    session_cookie_name: str = "sqlharness_session"
    session_ttl_days: int = 30

    # Base64, must decode to 32 bytes (AES-256). See app/core/crypto.py.
    connection_encryption_key: str = ""
    # Dev-only escape hatch so "fire demo query" can reach your own localhost
    # Postgres. Leave false anywhere the backend isn't fully trusted.
    allow_private_connection_hosts: bool = False

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
