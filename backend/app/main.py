"""FastAPI application entrypoint."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.config import get_settings
from app.routers import (
    audit,
    auth,
    health,
    invoices,
    projects,
    qbo,
    users,
    vendors,
    webhooks,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("cbg")

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting Cambridge Invoice Portal backend (env=%s)", settings.app_env)
    yield
    log.info("Shutting down")


app = FastAPI(
    title="Cambridge Invoice Portal API",
    version="0.1.0",
    lifespan=lifespan,
)


class UnhandledExceptionMiddleware(BaseHTTPMiddleware):
    """Convert unhandled exceptions into JSON 500 responses.

    This must run *inside* CORSMiddleware so the response still gets CORS
    headers. FastAPI's ``@app.exception_handler(Exception)`` registers with
    Starlette's ``ServerErrorMiddleware`` which sits OUTSIDE CORSMiddleware,
    meaning any response it produces never gets a CORS header and the browser
    reports a CORS failure instead of the real 500.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        try:
            return await call_next(request)
        except Exception as exc:
            log.exception(
                "Unhandled exception on %s %s", request.method, request.url.path
            )
            detail = str(exc) if settings.app_env != "production" else "Internal server error"
            return JSONResponse(
                status_code=500,
                content={"detail": detail, "error_type": type(exc).__name__},
            )


# Middleware is applied outermost-last. Add the error catcher FIRST so CORS
# wraps it — then CORS headers get applied to our JSON 500 responses.
app.add_middleware(UnhandledExceptionMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


API_PREFIX = "/api"

app.include_router(health.router, prefix=API_PREFIX)
app.include_router(auth.router, prefix=f"{API_PREFIX}/auth")
app.include_router(invoices.router, prefix=f"{API_PREFIX}/invoices")
app.include_router(vendors.router, prefix=f"{API_PREFIX}/vendors")
app.include_router(projects.router, prefix=f"{API_PREFIX}/projects")
app.include_router(qbo.router, prefix=f"{API_PREFIX}/qbo")
app.include_router(webhooks.router, prefix=f"{API_PREFIX}/webhooks")
app.include_router(audit.router, prefix=f"{API_PREFIX}/audit")
app.include_router(users.router, prefix=f"{API_PREFIX}/users")
