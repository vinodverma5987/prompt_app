"""Application factory allows isolated storage/providers in tests."""

import os
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import UUID

from fastapi import FastAPI, Query
from fastapi.staticfiles import StaticFiles

from .errors import register_error_handlers
from .repository import Repository
from .schemas import ClarificationResponse, ErrorResponse, PromptRequest, SuccessResponse
from .service import LocalInsightProvider, PromptService


def create_app(database_path: str | None = None, provider=None) -> FastAPI:
    repository = Repository(
        database_path or os.getenv("DATABASE_PATH", "data/prompt-studio.sqlite3")
    )
    service = PromptService(
        repository, provider if provider is not None else LocalInsightProvider()
    )

    @asynccontextmanager
    async def lifespan(_app):
        repository.initialize()
        yield

    app = FastAPI(title="Prompt Studio API", version="1.0.0", lifespan=lifespan)
    register_error_handlers(app)
    errors = {code: {"model": ErrorResponse} for code in (404, 409, 422, 500)}

    @app.get("/api/health")
    def health():
        return {"status": "ok", "provider": "local-fixture"}

    @app.post(
        "/api/prompts", response_model=SuccessResponse | ClarificationResponse, responses=errors
    )
    def submit_prompt(body: PromptRequest):
        return service.submit(body)

    @app.get(
        "/api/requests/{request_id}/insights", response_model=SuccessResponse, responses=errors
    )
    def get_insights(request_id: UUID, page: int = Query(default=1, ge=1, le=100_000)):
        return service.page(str(request_id), page)

    # A production build can be served by Python on the same origin as the API.
    frontend = Path(
        os.getenv("FRONTEND_DIST", str(Path(__file__).parents[2] / "frontend" / "dist"))
    )
    if frontend.is_dir():
        app.mount("/", StaticFiles(directory=frontend, html=True), name="frontend")
    return app


app = create_app()
