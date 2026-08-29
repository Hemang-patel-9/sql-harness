from fastapi import APIRouter

from .schemas import QueryRequest, QueryResponse
from .service import generate_sql

router = APIRouter(prefix="/api", tags=["query"])


@router.post("/query", response_model=QueryResponse)
def query(payload: QueryRequest) -> QueryResponse:
    return generate_sql(payload)
