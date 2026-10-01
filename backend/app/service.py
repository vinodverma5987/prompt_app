"""Prompt policy and replaceable local provider, independent of HTTP."""

import json
import re
from pathlib import Path
from typing import Protocol
from uuid import uuid4

from .errors import ApiError
from .repository import Repository
from .schemas import PromptRequest

PAGE_SIZE = 10
CLARIFICATION_MESSAGE = (
    "Please add a topic and what you want to learn or improve. "
    "For example: How can we improve onboarding for new customers?"
)


def needs_clarification(prompt: str) -> bool:
    words = re.findall(r"[^\W_]+", prompt.casefold(), flags=re.UNICODE)
    normalized = " ".join(words)
    return (
        len(prompt) < 5
        or len(words) < 2
        or normalized
        in {
            "help me",
            "tell me",
            "do it",
            "tell me more",
            "what is this",
            "give me insights",
        }
    )


class InsightProvider(Protocol):
    def generate(self, prompt: str, language: str) -> list[dict]: ...


class LocalInsightProvider:
    """Deliberately deterministic fixture provider; no model or network calls."""

    def __init__(self):
        self.catalog = json.loads((Path(__file__).parent / "data" / "insights.json").read_text())

    def generate(self, prompt: str, language: str) -> list[dict]:
        # Fixtures are a product-onboarding example, not answers inferred from the prompt.
        return [
            {
                **item,
                "metadata": {
                    **item["metadata"],
                    "source": "Local demo dataset",
                    "language": language,
                },
            }
            for item in self.catalog[language]
        ]


class PromptService:
    def __init__(self, repository: Repository, provider: InsightProvider):
        self.repository, self.provider = repository, provider

    def submit(self, body: PromptRequest):
        context_id = str(body.contextId) if body.contextId else str(uuid4())
        if body.contextId and not self.repository.context_exists(context_id):
            raise ApiError(
                404,
                "CONTEXT_NOT_FOUND",
                "This conversation could not be found. Start a new request.",
            )
        request_id = str(uuid4())
        clarify = needs_clarification(body.prompt)
        # Policy gate MUST precede the provider. Clarification never invokes it.
        insights = [] if clarify else self.provider.generate(body.prompt, body.targetLanguage)
        self.repository.save(
            request_id=request_id,
            context_id=context_id,
            prompt=body.prompt,
            language=body.targetLanguage,
            status="NEEDS_CLARIFICATION" if clarify else "SUCCESS",
            insights=insights,
            message=CLARIFICATION_MESSAGE if clarify else None,
        )
        if clarify:
            return {
                "status": "NEEDS_CLARIFICATION",
                "requestId": request_id,
                "contextId": context_id,
                "message": CLARIFICATION_MESSAGE,
            }
        return self.page(request_id, 1)

    def page(self, request_id: str, page: int):
        result = self.repository.read_page(request_id, page, PAGE_SIZE)
        if result is None:
            raise ApiError(404, "REQUEST_NOT_FOUND", "This request could not be found.")
        request, insights, total = result
        if request["status"] != "SUCCESS":
            raise ApiError(
                409, "CLARIFICATION_REQUIRED", "Add more details before viewing insights."
            )
        pages = max(1, (total + PAGE_SIZE - 1) // PAGE_SIZE)
        if page > pages:
            raise ApiError(404, "PAGE_NOT_FOUND", "There are no insights on this page.")
        return {
            "status": "SUCCESS",
            "requestId": request_id,
            "contextId": request["context_id"],
            "targetLanguage": request["language"],
            "insights": insights,
            "pagination": {
                "page": page,
                "pageSize": PAGE_SIZE,
                "totalItems": total,
                "totalPages": pages,
                "hasMore": page < pages,
                "nextPage": page + 1 if page < pages else None,
            },
        }
