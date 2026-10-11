"""FastAPI dependencies for session lookup."""

from __future__ import annotations

from fastapi import HTTPException, Path

from app.session_store import Session, store


async def get_session(session_id: str = Path(..., min_length=8, max_length=64)) -> Session:
    session = await store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found or expired")
    return session
