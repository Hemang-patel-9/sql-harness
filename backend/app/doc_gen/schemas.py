from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, Field


class BusinessTerm(BaseModel):
    term: str
    synonyms: list[str]


class AnalystDraft(BaseModel):
    description: str
    business_terms: list[BusinessTerm]
    example_questions: list[str]


class CriticRefinement(BaseModel):
    quality_score: int
    missing_information: list[str]
    suggestions: list[str]
    refined_description: str
    refined_business_terms: list[BusinessTerm]
    refined_example_questions: list[str]


class GeneratedDocument(BaseModel):
    document: str
    critic_score: int
    critic_notes: dict


class TableDocumentResponse(BaseModel):
    connection_id: UUID
    schema_name: str | None
    table_name: str
    document: str
    critic_score: int | None
    critic_notes: dict | None
    has_document: bool
    is_embedded: bool
    is_stale: bool
    stale_reason: str | None
    generated_at: datetime | None
    edited_at: datetime | None
    embedded_at: datetime | None


class DocumentListItem(BaseModel):
    schema_name: str | None
    table_name: str
    has_document: bool
    is_embedded: bool
    is_stale: bool
    stale_reason: str | None
    generated_at: datetime | None
    embedded_at: datetime | None


class DocumentListResponse(BaseModel):
    connection_id: UUID
    documents: list[DocumentListItem]


class DocumentPatchRequest(BaseModel):
    document: str = Field(min_length=1)


class IngestDocumentResponse(BaseModel):
    connection_id: UUID
    schema_name: str | None
    table_name: str
    qdrant_point_id: UUID
    embedded_at: datetime


class SyncAction(StrEnum):
    generated = "generated"
    regenerated = "regenerated"
    embedded = "embedded"
    unchanged = "unchanged"
    skipped_edited = "skipped_edited"
    failed = "failed"


class SyncTableOutcome(BaseModel):
    schema_name: str | None
    table_name: str
    action: SyncAction
    detail: str | None = None


class SyncResponse(BaseModel):
    connection_id: UUID
    counts: dict[str, int]
    tables: list[SyncTableOutcome]
