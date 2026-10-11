"""SeeTUI FastAPI application — bind to 127.0.0.1 only."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.routers import (
    archive_routes,
    editor_routes,
    file_routes,
    health_routes,
    performance_routes,
    remote_edit_routes,
    server_info_routes,
    session_routes,
    terminal_routes,
    test_routes,
    transfer_routes,
)
from app.session_store import store

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await store.start()
    try:
        yield
    finally:
        await store.stop()


app = FastAPI(title="SeeTUI", docs_url=None, redoc_url=None, lifespan=lifespan)


@app.middleware("http")
async def errors_as_json(request: Request, call_next):
    try:
        return await call_next(request)
    except HTTPException:
        raise
    except Exception:
        return JSONResponse({"detail": "internal error"}, status_code=500)


app.include_router(session_routes.router)
app.include_router(session_routes.local_router)
app.include_router(editor_routes.router)
app.include_router(test_routes.router)
app.include_router(terminal_routes.router)
app.include_router(file_routes.router)
app.include_router(transfer_routes.router)
app.include_router(archive_routes.router)
app.include_router(health_routes.router)
app.include_router(performance_routes.router)
app.include_router(server_info_routes.router)
app.include_router(remote_edit_routes.router)


@app.get("/api/healthz")
async def healthz() -> dict[str, str]:
    return {"ok": "true"}


if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
