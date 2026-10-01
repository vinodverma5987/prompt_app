"""Public API contracts. Never coerce numbers or booleans into request strings."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictStr, field_validator

Language = Literal["en", "es", "fr", "de"]


class PromptRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    prompt: StrictStr = Field(min_length=1, max_length=4000)
    targetLanguage: Language
    contextId: UUID | None = None

    @field_validator("prompt", mode="before")
    @classmethod
    def trim_prompt(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("contextId", mode="before")
    @classmethod
    def require_uuid_string(cls, value):
        if value is not None and not isinstance(value, str):
            raise ValueError("contextId must be a UUID string")
        return value


class Insight(BaseModel):
    id: str
    title: str
    content: str
    metadata: dict[str, str | list[str]]


class Pagination(BaseModel):
    page: int
    pageSize: int
    totalItems: int
    totalPages: int
    hasMore: bool
    nextPage: int | None


class SuccessResponse(BaseModel):
    status: Literal["SUCCESS"] = "SUCCESS"
    requestId: UUID
    contextId: UUID
    targetLanguage: Language
    insights: list[Insight]
    pagination: Pagination


class ClarificationResponse(BaseModel):
    status: Literal["NEEDS_CLARIFICATION"] = "NEEDS_CLARIFICATION"
    requestId: UUID
    contextId: UUID
    message: str


class ErrorResponse(BaseModel):
    error: str
    message: str
    details: list[dict[str, str]] = Field(default_factory=list)
