import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .auth.routes import router as auth_router
from .connections.routes import router as connections_router
from .core import db
from .core.config import get_settings
from .core.crypto import EncryptionKeyError, ensure_encryption_key_configured
from .doc_gen.clients import anthropic_client, openai_client
from .doc_gen.routes import router as doc_gen_router
from .memory import client as mem0
from .memory.routes import router as memory_router
from .query import rerank
from .query.routes import router as query_router
from .schema_explorer.routes import router as schema_router
from .schema_ingest.routes import router as schema_ingest_router
from .vectorstore import client as qdrant
from .vectorstore.collections import ensure_collection as ensure_qdrant_collection
from .vectorstore.routes import router as vectorstore_router

log = logging.getLogger("uvicorn.error")


class HealthResponse(BaseModel):
    status: str = "ok"


class DbHealthResponse(BaseModel):
    connected: bool
    detail: str | None = None


async def _warm_reranker() -> None:
    try:
        await rerank.warm()
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001 - non-fatal, logged for visibility only
        log.warning("Reranker could not be loaded: %s", exc)


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

    # Non-fatal, unlike Postgres above: nothing calls Qdrant yet.
    try:
        await ensure_qdrant_collection()
        log.info("Qdrant collection %r ready", get_settings().qdrant_collection_name)
    except Exception as exc:  # noqa: BLE001 - non-fatal, logged for visibility only
        log.warning("Qdrant not reachable/provisioned: %s", exc)

    # Non-fatal too: nothing calls Mem0 yet.
    try:
        await mem0.ping()
        log.info("Mem0 reachable")
    except Exception as exc:  # noqa: BLE001 - non-fatal, logged for visibility only
        log.warning("Mem0 not reachable: %s", exc)

    try:
        await openai_client.ping()
        log.info("OpenAI reachable")
    except Exception as exc:  # noqa: BLE001 - non-fatal, logged for visibility only
        log.warning("OpenAI not reachable: %s", exc)

    try:
        await anthropic_client.ping()
        log.info("Anthropic reachable")
    except Exception as exc:  # noqa: BLE001 - non-fatal, logged for visibility only
        log.warning("Anthropic not reachable: %s", exc)

    # A cold cache means a 2.3GB download, so this is warmed off the startup
    # path - the API serves meanwhile and only the first question waits.
    warm_task = asyncio.create_task(_warm_reranker())

    yield

    warm_task.cancel()
    await db.dispose()
    await qdrant.dispose()
    await mem0.dispose()
    await openai_client.dispose()
    await anthropic_client.dispose()


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
app.include_router(schema_router)
app.include_router(schema_ingest_router)
app.include_router(query_router)
app.include_router(vectorstore_router)
app.include_router(memory_router)
app.include_router(doc_gen_router)


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
