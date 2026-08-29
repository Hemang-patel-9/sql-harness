from .schemas import QueryRequest, QueryResponse


def generate_sql(payload: QueryRequest) -> QueryResponse:
    """Placeholder NL-to-SQL translation.

    Replace this with a real implementation (LLM call, schema-aware prompt, etc.).
    """
    question = payload.question.strip()
    sql = f"-- TODO: translate to SQL\nSELECT * FROM your_table WHERE description ILIKE '%{question}%';"
    return QueryResponse(question=question, sql=sql)
