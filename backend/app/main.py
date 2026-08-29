import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .config import get_settings
from .crypto import EncryptionKeyError, ensure_encryption_key_configured
from .routes_auth import router as auth_router
from .routes_connections import router as connections_router
from .schemas import DbHealthResponse, HealthResponse, QueryRequest, QueryResponse
from .services import generate_sql


log = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Refuse to serve without a database or a valid encryption key: both are
    startup preconditions, not things to discover at first use."""
    try:
        await db.ping()
    except Exception as exc:
        await db.dispose()
        log.error("Cannot reach PostgreSQL at %s: %s", db.safe_url(), exc)
        raise RuntimeError(
            f"Database unreachable at {db.safe_url()} - check DATABASE_URL in "
            f"backend/.env and that the server is running. API not started."
        ) from exc

    log.info("Connected to PostgreSQL at %s", db.safe_url())

    try:
        ensure_encryption_key_configured()
    except EncryptionKeyError as exc:
        await db.dispose()
        log.error("Connection encryption key is not configured: %s", exc)
        raise RuntimeError(str(exc)) from exc

    yield
    await db.dispose()


settings = get_settings()

app = FastAPI(title=settings.app_name, debug=settings.debug, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(connections_router)


@app.get("/", response_model=HealthResponse)
def root() -> HealthResponse:
    return HealthResponse()


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse()


@app.get("/api/health/db", response_model=DbHealthResponse)
async def health_db() -> DbHealthResponse:
    """Read-only connectivity probe. Never writes, never migrates."""
    try:
        await db.ping()
    except Exception as exc:  # noqa: BLE001 - surfaced verbatim for local debugging
        return DbHealthResponse(connected=False, detail=str(exc))
    return DbHealthResponse(connected=True)


@app.post("/api/query", response_model=QueryResponse)
def query(payload: QueryRequest) -> QueryResponse:
    return generate_sql(payload)
