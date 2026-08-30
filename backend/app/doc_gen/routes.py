from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.dependencies import Principal, get_current_principal
from ..connections import repo as connections_repo
from ..core.db import get_session
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

router = APIRouter(prefix="/api/connections/{connection_id}/documents", tags=["doc-gen"])

_NO_DOCUMENT_DETAIL = "No document generated for this table yet."


async def _generate_and_store(
    session: AsyncSession,
    *,
    principal: Principal,
    connection_id: UUID,
    schema_name: str | None,
    table_name: str,
    normalized_json: dict,
) -> None:
    table = NormalizedTable.model_validate(normalized_json)
    generated = await generate_document(table)
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


@router.post("/{table_name}/generate", response_model=TableDocumentResponse)
async def generate(
    connection_id: UUID,
    table_name: str,
    schema_name: str | None = None,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> TableDocumentResponse:
    await _require_connection(session, principal.tenant_id, connection_id)

    obj = await ingest_repo.get_object(session, principal.tenant_id, connection_id, schema_name, table_name)
    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Process this connection's schema before generating a document for this table.",
        )

    normalized_json = ingest_repo.parse_json(obj["normalized_json"])
    source_hash = repo.compute_source_hash(normalized_json)
    await _generate_and_store(
        session,
        principal=principal,
        connection_id=connection_id,
        schema_name=schema_name,
        table_name=table_name,
        normalized_json=normalized_json,
    )
    await session.commit()

    doc = await repo.get_document(session, principal.tenant_id, connection_id, schema_name, table_name)
    return _to_response(
        doc,
        connection_id=connection_id,
        schema_name=schema_name,
        table_name=table_name,
        live_source_hash=source_hash,
    )


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


@router.post("/{table_name}/ingest", response_model=IngestDocumentResponse)
async def ingest_document(
    connection_id: UUID,
    table_name: str,
    schema_name: str | None = None,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> IngestDocumentResponse:
    await _require_connection(session, principal.tenant_id, connection_id)

    doc = await repo.get_document(session, principal.tenant_id, connection_id, schema_name, table_name)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NO_DOCUMENT_DETAIL)

    point_id, embedded_at = await _embed_and_mark(
        session,
        tenant_id=principal.tenant_id,
        connection_id=connection_id,
        schema_name=schema_name,
        table_name=table_name,
        document=doc["document"],
    )
    await session.commit()

    return IngestDocumentResponse(
        connection_id=connection_id,
        schema_name=schema_name,
        table_name=table_name,
        qdrant_point_id=point_id,
        embedded_at=embedded_at,
    )


@router.post("/sync", response_model=SyncResponse)
async def sync_documents(
    connection_id: UUID,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> SyncResponse:
    """Brings every table up to date, doing only the work each one needs.

    A table whose schema hasn't moved since its document was generated costs
    nothing here - no LLM call, no embedding.
    """
    await _require_connection(session, principal.tenant_id, connection_id)

    objects = await ingest_repo.get_objects(session, principal.tenant_id, connection_id)
    docs = await repo.list_documents(session, principal.tenant_id, connection_id)
    docs_by_key = {(d["schema_name"], d["table_name"]): d for d in docs}

    outcomes: list[SyncTableOutcome] = []
    for obj in objects:
        schema_name, table_name = obj["schema_name"], obj["table_name"]
        normalized_json = ingest_repo.parse_json(obj["normalized_json"])
        live_hash = repo.compute_source_hash(normalized_json)
        doc = docs_by_key.get((schema_name, table_name))

        if doc is not None and doc["source_hash"] != live_hash and doc["edited_at"] is not None:
            # A hand-edited document is the user's writing; regenerating would
            # destroy it with no undo, so a moved schema is reported, not applied.
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
            if doc is None or doc["source_hash"] != live_hash:
                await _generate_and_store(
                    session,
                    principal=principal,
                    connection_id=connection_id,
                    schema_name=schema_name,
                    table_name=table_name,
                    normalized_json=normalized_json,
                )
                fresh = await repo.get_document(
                    session, principal.tenant_id, connection_id, schema_name, table_name
                )
                if fresh is None:
                    raise RuntimeError("document disappeared immediately after being written")
                await _embed_and_mark(
                    session,
                    tenant_id=principal.tenant_id,
                    connection_id=connection_id,
                    schema_name=schema_name,
                    table_name=table_name,
                    document=fresh["document"],
                )
                action = SyncAction.generated if doc is None else SyncAction.regenerated
            elif doc["embedded_at"] is None or (doc["edited_at"] or doc["generated_at"]) > doc["embedded_at"]:
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
                outcomes.append(
                    SyncTableOutcome(
                        schema_name=schema_name, table_name=table_name, action=SyncAction.unchanged
                    )
                )
                continue
            # Per table, so one failure late in a long run can't discard the
            # LLM calls already paid for.
            await session.commit()
            outcomes.append(
                SyncTableOutcome(schema_name=schema_name, table_name=table_name, action=action)
            )
        except Exception as exc:  # noqa: BLE001 - one table failing must not abort the rest
            await session.rollback()
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
    return SyncResponse(connection_id=connection_id, counts=counts, tables=outcomes)
