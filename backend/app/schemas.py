from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"


class QueryRequest(BaseModel):
    question: str = Field(..., min_length=1, description="Natural language question")


class QueryResponse(BaseModel):
    question: str
    sql: str
    note: str = "Stubbed response. Wire up a real NL-to-SQL model in app/services.py."
