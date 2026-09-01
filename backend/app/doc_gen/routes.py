import asyncio
import logging
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import Principal, get_current_principal
from ..connections import repo as connections_repo
from ..core.db import SessionLocal, get_session
from ..core.progress import ProgressFn, noop_progress
from ..jobs import tracker as jobs
from ..jobs.schemas import JobHandleResponse
from ..jobs.tracker import Job
from ..schema_ingest import repo as ingest_repo
from ..schema_ingest.schemas import NormalizedTable
from . import repo
from .pipeline import generate_document
from .schemas import (
    DocumentListItem,
    DocumentListResponse,
    DocumentPatchRequest,
    IngestDocumentResponse,
    SyncAction,
    SyncResponse,
    SyncTableOutcome,
    TableDocumentResponse,
)
from .tools import embed

log = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/connections/{connection_id}/documents", tags=["doc-gen"])

_NO_DOCUMENT_DETAIL = "No document generated for this table yet."

_GENERATE_JOB_STEPS = 2


async def _generate_and_store(
    session: AsyncSession,
    *,
    principal: Principal,
    connection_id: UUID,
    schema_name: str | None,
    table_name: str,
    normalized_json: dict,
    on_progress: ProgressFn = noop_progress,
) -> None:
    table = NormalizedTable.model_validate(normalized_json)
    generated = await generate_document(table, on_progress=on_progress)
    await repo.upsert_document(
        session,
        connection_id=connection_id,
        tenant_id=principal.tenant_id,
        schema_name=schema_name,
        table_name=table_name,
        document=generated.document,
        source_hash=repo.compute_source_hash(normalized_json),
        critic_score=generated.critic_score,
        critic_notes=generated.critic_notes,
        generated_by=principal.user_id,
        generated_at=datetime.now(UTC),
        qdrant_point_id=embed.point_id(connection_id, schema_name, table_name),
    )


async def _embed_and_mark(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    connection_id: UUID,
    schema_name: str | None,
    table_name: str,
    document: str,
) -> tuple[UUID, datetime]:
    vector = await embed.embed_text(document)
    point_id = await embed.upsert_point(
        tenant_id=tenant_id,
        connection_id=connection_id,
        schema_name=schema_name,
        table_name=table_name,
        document=document,
        vector=vector,
    )
    embedded_at = datetime.now(UTC)
    await repo.mark_embedded(
        session,
        tenant_id=tenant_id,
        connection_id=connection_id,
        schema_name=schema_name,
        table_name=table_name,
        embedded_at=embedded_at,
    )
    return point_id, embedded_at


def _to_response(
    doc: Mapping[str, Any] | None,
    *,
    connection_id: UUID,
    schema_name: str | None,
    table_name: str,
    live_source_hash: str,
) -> TableDocumentResponse:
    has_document, is_embedded, stale_reason = repo.derive_status(doc, live_source_hash)
    critic_notes = doc["critic_notes"] if doc else None
    return TableDocumentResponse(
        connection_id=connection_id,
        schema_name=schema_name,
        table_name=table_name,
        document=doc["document"] if doc else "",
        critic_score=doc["critic_score"] if doc else None,
        critic_notes=repo.parse_json(critic_notes) if critic_notes is not None else None,
        has_document=has_document,
        is_embedded=is_embedded,
        is_stale=stale_reason is not None,
        stale_reason=stale_reason,
        generated_at=doc["generated_at"] if doc else None,
        edited_at=doc["edited_at"] if doc else None,
        embedded_at=doc["embedded_at"] if doc else None,
    )


async def _require_connection(session: AsyncSession, tenant_id: UUID, connection_id: UUID) -> None:
    connection = await connections_repo.get_connection(session, tenant_id, connection_id)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    connection_id: UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> DocumentListResponse:
    await _require_connection(session, principal.tenant_id, connection_id)

    objects = await ingest_repo.get_objects(session, principal.tenant_id, connection_id)
    docs = await repo.list_documents(session, principal.tenant_id, connection_id)
    docs_by_key = {(d["schema_name"], d["table_name"]): d for d in docs}

    items = []
    for obj in objects:
        key = (obj["schema_name"], obj["table_name"])
        live_source_hash = repo.compute_source_hash(ingest_repo.parse_json(obj["normalized_json"]))
        doc = docs_by_key.get(key)
        has_document, is_embedded, stale_reason = repo.derive_status(doc, live_source_hash)
        items.append(
            DocumentListItem(
                schema_name=obj["schema_name"],
                table_name=obj["table_name"],
                has_document=has_document,
                is_embedded=is_embedded,
                is_stale=stale_reason is not None,
                stale_reason=stale_reason,
                generated_at=doc["generated_at"] if doc else None,
                embedded_at=doc["embedded_at"] if doc else None,
            )
        )
    return DocumentListResponse(connection_id=connection_id, documents=items)


async def _run_generate_job(
    job: Job,
    *,
    principal: Principal,
    connection_id: UUID,
    schema_name: str | None,
    table_name: str,
    normalized_json: dict,
) -> None:
    async def on_progress(message: str) -> None:
        jobs.step(job, message)

    try:
        async with SessionLocal() as session:
            await _generate_and_store(
                session,
                principal=principal,
                connection_id=connection_id,
                schema_name=schema_name,
                table_name=table_name,
                normalized_json=normalized_json,
                on_progress=on_progress,
            )
            await session.commit()

            source_hash = repo.compute_source_hash(normalized_json)
            doc = await repo.get_document(
                session, principal.tenant_id, connection_id, schema_name, table_name
            )
        response = _to_response(
            doc,
            connection_id=connection_id,
            schema_name=schema_name,
            table_name=table_name,
            live_source_hash=source_hash,
        )
        jobs.succeed(job, response.model_dump(mode="json"))
    except Exception:  # noqa: BLE001 - upstream failure, not a bug in this request
        log.exception(
            "Document generation failed for %s.%s on connection %s", schema_name, table_name, connection_id
        )
        jobs.fail(
            job,
            "Could not generate a document for this table - the language model was unreachable. Try again.",
        )


@router.post("/{table_name}/generate", response_model=JobHandleResponse)
async def generate(
    connection_id: UUID,
    table_name: str,
    schema_name: str | None = None,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> JobHandleResponse:
    """Kicks off the two-stage LLM pipeline for one table and returns a job
    id - poll GET /api/jobs/{job_id} for progress and the resulting document."""
    await _require_connection(session, principal.tenant_id, connection_id)

    obj = await ingest_repo.get_object(session, principal.tenant_id, connection_id, schema_name, table_name)
    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Process this connection's schema before generating a document for this table.",
        )

    normalized_json = ingest_repo.parse_json(obj["normalized_json"])
    job = jobs.create_job("doc_generate", tenant_id=principal.tenant_id, total=_GENERATE_JOB_STEPS)
    asyncio.create_task(
        _run_generate_job(
            job,
            principal=principal,
            connection_id=connection_id,
            schema_name=schema_name,
            table_name=table_name,
            normalized_json=normalized_json,
        )
    )
    return JobHandleResponse(job_id=job.id)


@router.get("/{table_name}", response_model=TableDocumentResponse)
async def get_document(
    connection_id: UUID,
    table_name: str,
    schema_name: str | None = None,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> TableDocumentResponse:
    await _require_connection(session, principal.tenant_id, connection_id)

    doc = await repo.get_document(session, principal.tenant_id, connection_id, schema_name, table_name)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NO_DOCUMENT_DETAIL)

    obj = await ingest_repo.get_object(session, principal.tenant_id, connection_id, schema_name, table_name)
    live_source_hash = repo.compute_source_hash(ingest_repo.parse_json(obj["normalized_json"])) if obj else ""
    return _to_response(
        doc,
        connection_id=connection_id,
        schema_name=schema_name,
        table_name=table_name,
        live_source_hash=live_source_hash,
    )


@router.patch("/{table_name}", response_model=TableDocumentResponse)
async def edit_document(
    connection_id: UUID,
    table_name: str,
    payload: DocumentPatchRequest,
    schema_name: str | None = None,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> TableDocumentResponse:
    await _require_connection(session, principal.tenant_id, connection_id)

    existing = await repo.get_document(session, principal.tenant_id, connection_id, schema_name, table_name)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NO_DOCUMENT_DETAIL)

    await repo.edit_document(
        session,
        tenant_id=principal.tenant_id,
        connection_id=connection_id,
        schema_name=schema_name,
        table_name=table_name,
        document=payload.document,
        edited_at=datetime.now(UTC),
    )
    await session.commit()

    doc = await repo.get_document(session, principal.tenant_id, connection_id, schema_name, table_name)
    obj = await ingest_repo.get_object(session, principal.tenant_id, connection_id, schema_name, table_name)
    live_source_hash = repo.compute_source_hash(ingest_repo.parse_json(obj["normalized_json"])) if obj else ""
    return _to_response(
        doc,
        connection_id=connection_id,
        schema_name=schema_name,
        table_name=table_name,
        live_source_hash=live_source_hash,
    )


async def _run_ingest_job(
    job: Job,
    *,
    tenant_id: UUID,
    connection_id: UUID,
    schema_name: str | None,
    table_name: str,
    document: str,
) -> None:
    try:
        jobs.step(job, f"Embedding {table_name} (text-embedding-3-large)")
        async with SessionLocal() as session:
            point_id, embedded_at = await _embed_and_mark(
                session,
                tenant_id=tenant_id,
                connection_id=connection_id,
                schema_name=schema_name,
                table_name=table_name,
                document=document,
            )
            await session.commit()
        jobs.succeed(
            job,
            IngestDocumentResponse(
                connection_id=connection_id,
                schema_name=schema_name,
                table_name=table_name,
                qdrant_point_id=point_id,
                embedded_at=embedded_at,
            ).model_dump(mode="json"),
        )
    except Exception:  # noqa: BLE001 - upstream failure, not a bug in this request
        log.exception("Embedding failed for %s.%s on connection %s", schema_name, table_name, connection_id)
        jobs.fail(
            job,
            "Could not embed this document - the embedding model or the vector store was unreachable. "
            "Try again.",
        )


@router.post("/{table_name}/ingest", response_model=JobHandleResponse)
async def ingest_document(
    connection_id: UUID,
    table_name: str,
    schema_name: str | None = None,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> JobHandleResponse:
    """Kicks off embedding + Qdrant upsert for one table's current document
    and returns a job id - poll GET /api/jobs/{job_id} for progress and the result."""
    await _require_connection(session, principal.tenant_id, connection_id)

    doc = await repo.get_document(session, principal.tenant_id, connection_id, schema_name, table_name)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NO_DOCUMENT_DETAIL)

    job = jobs.create_job("doc_ingest", tenant_id=principal.tenant_id, total=1)
    asyncio.create_task(
        _run_ingest_job(
            job,
            tenant_id=principal.tenant_id,
            connection_id=connection_id,
            schema_name=schema_name,
            table_name=table_name,
            document=doc["document"],
        )
    )
    return JobHandleResponse(job_id=job.id)


async def _run_sync_job(
    job: Job,
    *,
    principal: Principal,
    connection_id: UUID,
    objects: list[Any],
    docs_by_key: dict[tuple[str | None, str], Any],
) -> None:
    """Brings every table up to date, doing only the work each one needs -
    a table whose schema hasn't moved since its document was generated costs
    nothing here: no LLM call, no embedding.

    Runs against its own DB session because it outlives the HTTP request
    that started it. Commits per table, same as before, so one failure late
    in a long run can't discard the LLM calls already paid for.
    """
    outcomes: list[SyncTableOutcome] = []

    async with SessionLocal() as session:
        for obj in objects:
            schema_name, table_name = obj["schema_name"], obj["table_name"]
            jobs.step(job, f"Checking {table_name}")
            normalized_json = ingest_repo.parse_json(obj["normalized_json"])
            live_hash = repo.compute_source_hash(normalized_json)
            doc = docs_by_key.get((schema_name, table_name))

            if doc is not None and doc["source_hash"] != live_hash and doc["edited_at"] is not None:
                # A hand-edited document is the user's writing; regenerating would
                # destroy it with no undo, so a moved schema is reported, not applied.
                log.info("doc_sync: %s skipped - edited by hand, schema has since changed", table_name)
                outcomes.append(
                    SyncTableOutcome(
                        schema_name=schema_name,
                        table_name=table_name,
                        action=SyncAction.skipped_edited,
                        detail="Edited by hand and the schema has since changed - regenerate to overwrite.",
                    )
                )
                continue

            try:

                async def on_progress(message: str, *, table_name: str = table_name) -> None:
                    jobs.step(job, f"{table_name}: {message}", advance=False)

                if doc is None or doc["source_hash"] != live_hash:
                    await _generate_and_store(
                        session,
                        principal=principal,
                        connection_id=connection_id,
                        schema_name=schema_name,
                        table_name=table_name,
                        normalized_json=normalized_json,
                        on_progress=on_progress,
                    )
                    fresh = await repo.get_document(
                        session, principal.tenant_id, connection_id, schema_name, table_name
                    )
                    if fresh is None:
                        raise RuntimeError("document disappeared immediately after being written")
                    await on_progress("embedding")
                    await _embed_and_mark(
                        session,
                        tenant_id=principal.tenant_id,
                        connection_id=connection_id,
                        schema_name=schema_name,
                        table_name=table_name,
                        document=fresh["document"],
                    )
                    action = SyncAction.generated if doc is None else SyncAction.regenerated
                elif (
                    doc["embedded_at"] is None
                    or (doc["edited_at"] or doc["generated_at"]) > doc["embedded_at"]
                ):
                    await on_progress("embedding")
                    await _embed_and_mark(
                        session,
                        tenant_id=principal.tenant_id,
                        connection_id=connection_id,
                        schema_name=schema_name,
                        table_name=table_name,
                        document=doc["document"],
                    )
                    action = SyncAction.embedded
                else:
                    log.info("doc_sync: %s unchanged", table_name)
                    outcomes.append(
                        SyncTableOutcome(
                            schema_name=schema_name, table_name=table_name, action=SyncAction.unchanged
                        )
                    )
                    continue
                await session.commit()
                log.info("doc_sync: %s -> %s", table_name, action.value)
                outcomes.append(
                    SyncTableOutcome(schema_name=schema_name, table_name=table_name, action=action)
                )
            except Exception as exc:  # noqa: BLE001 - one table failing must not abort the rest
                await session.rollback()
                log.exception("doc_sync: %s failed", table_name)
                outcomes.append(
                    SyncTableOutcome(
                        schema_name=schema_name,
                        table_name=table_name,
                        action=SyncAction.failed,
                        detail=str(exc)[:300],
                    )
                )

    counts = {action.value: 0 for action in SyncAction}
    for outcome in outcomes:
        counts[outcome.action.value] += 1
    response = SyncResponse(connection_id=connection_id, counts=counts, tables=outcomes)
    jobs.succeed(job, response.model_dump(mode="json"))


@router.post("/sync", response_model=JobHandleResponse)
async def sync_documents(
    connection_id: UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> JobHandleResponse:
    """Kicks off a sync run over every table in this connection and returns
    a job id - poll GET /api/jobs/{job_id} for per-table progress and the
    final SyncResponse."""
    await _require_connection(session, principal.tenant_id, connection_id)

    objects = await ingest_repo.get_objects(session, principal.tenant_id, connection_id)
    docs = await repo.list_documents(session, principal.tenant_id, connection_id)
    docs_by_key = {(d["schema_name"], d["table_name"]): d for d in docs}

    job = jobs.create_job("doc_sync", tenant_id=principal.tenant_id, total=len(objects))
    asyncio.create_task(
        _run_sync_job(
            job,
            principal=principal,
            connection_id=connection_id,
            objects=objects,
            docs_by_key=docs_by_key,
        )
    )
    return JobHandleResponse(job_id=job.id)
