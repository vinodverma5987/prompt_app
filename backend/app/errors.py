"""Translate domain and framework errors into one safe client-facing shape."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

logger = logging.getLogger(__name__)


class ApiError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        self.status_code, self.code, self.message = status_code, code, message


def register_error_handlers(app: FastAPI):
    @app.exception_handler(ApiError)
    async def domain_error(_request: Request, exc: ApiError):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.code, "message": exc.message, "details": []},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, exc: RequestValidationError):
        issues = exc.errors()
        language_error = any(e["loc"][-1] == "targetLanguage" for e in issues)
        return JSONResponse(
            status_code=422,
            content={
                "error": "INVALID_LANGUAGE" if language_error else "INVALID_REQUEST",
                "message": "Target language must be en, es, fr, or de."
                if language_error
                else "Please correct the highlighted request fields.",
                "details": [
                    {"field": ".".join(map(str, e["loc"][1:])) or "body", "message": e["msg"]}
                    for e in issues
                ],
            },
        )

    @app.exception_handler(HTTPException)
    async def http_error(_request: Request, exc: HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": "HTTP_ERROR",
                "message": str(exc.detail),
                "details": [],
            },
            headers=exc.headers,
        )

    @app.exception_handler(Exception)
    async def unexpected_error(_request: Request, exc: Exception):
        logger.error("Unhandled API error", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content={
                "error": "INTERNAL_ERROR",
                "message": "Something went wrong. Please try again.",
                "details": [],
            },
        )
