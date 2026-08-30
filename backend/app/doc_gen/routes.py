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
from . import embed, repo
from .pipeline import generate_document
from .schemas import (
    DocumentListItem,
    DocumentListResponse,
    DocumentPatchRequest,
    IngestDocumentResponse,
    TableDocumentResponse,
)

router = APIRouter(prefix="/api/connections/{connection_id}/documents", tags=["doc-gen"])

_NO_DOCUMENT_DETAIL = "No document generated for this table yet."


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
    table = NormalizedTable.model_validate(normalized_json)
    generated = await generate_document(table)
    source_hash = repo.compute_source_hash(normalized_json)
    qdrant_point_id = embed.point_id(connection_id, schema_name, table_name)
    generated_at = datetime.now(UTC)

    await repo.upsert_document(
        session,
        connection_id=connection_id,
        tenant_id=principal.tenant_id,
        schema_name=schema_name,
        table_name=table_name,
        document=generated.document,
        source_hash=source_hash,
        critic_score=generated.critic_score,
        critic_notes=generated.critic_notes,
        generated_by=principal.user_id,
        generated_at=generated_at,
        qdrant_point_id=qdrant_point_id,
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

    vector = await embed.embed_text(doc["document"])
    point_id = await embed.upsert_point(
        tenant_id=principal.tenant_id,
        connection_id=connection_id,
        schema_name=schema_name,
        table_name=table_name,
        document=doc["document"],
        vector=vector,
    )
    embedded_at = datetime.now(UTC)
    await repo.mark_embedded(
        session,
        tenant_id=principal.tenant_id,
        connection_id=connection_id,
        schema_name=schema_name,
        table_name=table_name,
        embedded_at=embedded_at,
    )
    await session.commit()

    return IngestDocumentResponse(
        connection_id=connection_id,
        schema_name=schema_name,
        table_name=table_name,
        qdrant_point_id=point_id,
        embedded_at=embedded_at,
    )
