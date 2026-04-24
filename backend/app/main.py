"""FastAPI application entrypoint."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import (
    audit,
    auth,
    health,
    invoices,
    projects,
    qbo,
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
