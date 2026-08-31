"""One-off repair: add the missing `bm25` vector to points that predate it.

Points written before `doc_gen/tools/embed.py` wrote sparse vectors have only
the dense half, so the lexical arm skips them. The document text is already on
each payload, so this needs no LLM call and no re-generation. Idempotent.
"""

import logging
from dataclasses import dataclass
from uuid import UUID

from qdrant_client import models

from ..core.config import get_settings
from . import sparse
from .client import get_client
from .collections import SPARSE_VECTOR_NAME

log = logging.getLogger("uvicorn.error")

SCROLL_BATCH = 64


@dataclass
class BackfillResult:
    scanned: int = 0
    updated: int = 0
    already_had_sparse: int = 0
    skipped_no_document: int = 0


async def backfill_sparse_vectors(
    *, tenant_id: UUID | None = None, force: bool = False
) -> BackfillResult:
    """`tenant_id` scopes the repair; None does the whole collection."""
    client = get_client()
    collection = get_settings().qdrant_collection_name
    result = BackfillResult()

    scroll_filter = (
        models.Filter(
            must=[
                models.FieldCondition(
                    key="tenant_id", match=models.MatchValue(value=str(tenant_id))
                )
            ]
        )
        if tenant_id is not None
        else None
    )

    offset = None
    while True:
        points, offset = await client.scroll(
            collection_name=collection,
            scroll_filter=scroll_filter,
            limit=SCROLL_BATCH,
            offset=offset,
            with_payload=True,
            # No reason to pull 3072 dense floats per point just to look.
            with_vectors=[SPARSE_VECTOR_NAME],
        )

        updates: list[models.PointVectors] = []
        for point in points:
            result.scanned += 1

            vectors = point.vector if isinstance(point.vector, dict) else {}
            if not force and vectors.get(SPARSE_VECTOR_NAME) is not None:
                result.already_had_sparse += 1
                continue

            document = (point.payload or {}).get("document")
            if not document:
                result.skipped_no_document += 1
                continue

            updates.append(
                models.PointVectors(
                    id=point.id,
                    vector={SPARSE_VECTOR_NAME: sparse.encode_document(document)},
                )
            )

        if updates:
            await client.update_vectors(collection_name=collection, points=updates)
            result.updated += len(updates)

        if offset is None:
            break

    log.info(
        "Sparse backfill: scanned=%d updated=%d already_had=%d no_document=%d",
        result.scanned,
        result.updated,
        result.already_had_sparse,
        result.skipped_no_document,
    )
    return result
