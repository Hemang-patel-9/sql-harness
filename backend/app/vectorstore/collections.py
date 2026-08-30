"""Configuration/provisioning only - no embedding, search, or ranking here."""

from qdrant_client import models

from ..core.config import get_settings
from .client import get_client

DENSE_VECTOR_NAME = "dense"
DENSE_DISTANCE = models.Distance.COSINE

# Modifier.IDF turns this into BM25-style lexical scoring.
SPARSE_VECTOR_NAME = "bm25"

PAYLOAD_INDEXES: dict[str, models.PayloadSchemaType] = {
    "tenant_id": models.PayloadSchemaType.KEYWORD,
    "connection_id": models.PayloadSchemaType.KEYWORD,
    "schema_name": models.PayloadSchemaType.KEYWORD,
    "table_name": models.PayloadSchemaType.KEYWORD,
    "object_type": models.PayloadSchemaType.KEYWORD,
}


def _vectors_config() -> dict[str, models.VectorParams]:
    return {
        DENSE_VECTOR_NAME: models.VectorParams(
            size=get_settings().qdrant_dense_vector_size,
            distance=DENSE_DISTANCE,
        )
    }


def _sparse_vectors_config() -> dict[str, models.SparseVectorParams]:
    return {
        SPARSE_VECTOR_NAME: models.SparseVectorParams(
            modifier=models.Modifier.IDF,
        )
    }


async def ensure_collection() -> None:
    """Idempotent: no-ops if the collection already exists."""
    client = get_client()
    collection_name = get_settings().qdrant_collection_name

    if await client.collection_exists(collection_name):
        return

    await client.create_collection(
        collection_name=collection_name,
        vectors_config=_vectors_config(),
        sparse_vectors_config=_sparse_vectors_config(),
    )

    for field_name, schema_type in PAYLOAD_INDEXES.items():
        await client.create_payload_index(
            collection_name=collection_name,
            field_name=field_name,
            field_schema=schema_type,
        )
