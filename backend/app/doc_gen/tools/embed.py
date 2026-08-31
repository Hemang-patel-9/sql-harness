import uuid
from uuid import UUID

from qdrant_client import models

from ...core.config import get_settings
from ...vectorstore import client as qdrant_client
from ...vectorstore import sparse
from ...vectorstore.collections import DENSE_VECTOR_NAME, SPARSE_VECTOR_NAME
from ..clients import openai_client
from ..clients.retry import with_retries

EMBEDDING_MODEL = "text-embedding-3-large"


async def embed_text(text: str) -> list[float]:
    async def _call() -> list[float]:
        response = await openai_client.get_client().embeddings.create(model=EMBEDDING_MODEL, input=text)
        return response.data[0].embedding

    return await with_retries(_call)


def point_id(connection_id: UUID, schema_name: str | None, table_name: str) -> UUID:
    return uuid.uuid5(uuid.NAMESPACE_URL, f"{connection_id}/{schema_name or ''}/{table_name}")


async def upsert_point(
    *,
    tenant_id: UUID,
    connection_id: UUID,
    schema_name: str | None,
    table_name: str,
    document: str,
    vector: list[float],
) -> UUID:
    pid = point_id(connection_id, schema_name, table_name)
    await qdrant_client.get_client().upsert(
        collection_name=get_settings().qdrant_collection_name,
        points=[
            models.PointStruct(
                id=str(pid),
                # Both halves: dense-only is what left older points
                # unsearchable by the lexical arm.
                vector={
                    DENSE_VECTOR_NAME: vector,
                    SPARSE_VECTOR_NAME: sparse.encode_document(document),
                },
                payload={
                    "tenant_id": str(tenant_id),
                    "connection_id": str(connection_id),
                    "schema_name": schema_name,
                    "table_name": table_name,
                    "object_type": "table",
                    "document": document,
                },
            )
        ],
    )
    return pid
