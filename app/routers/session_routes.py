"""Connect, disconnect, and session metadata routes."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.dependencies import get_session
from app.schemas import ChmodKeyRequest, ConnectRequest
from app.session_store import Session, store
from app.ssh_service import apply_key_chmod, connect_stream

router = APIRouter(prefix="/api/sessions", tags=["sessions"])
local_router = APIRouter(prefix="/api/local", tags=["local"])


@local_router.post("/chmod-key")
async def chmod_key(payload: ChmodKeyRequest) -> dict:
    try:
        return apply_key_chmod(payload.path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=400, detail=f"Could not update key permissions: {exc}") from exc


@router.post("")
async def create_session(payload: ConnectRequest) -> StreamingResponse:
    async def events():
        async for event in connect_stream(payload.model_dump()):
            yield json.dumps(event, separators=(",", ":")) + "\n"

    return StreamingResponse(events(), media_type="application/x-ndjson")


@router.get("/{session_id}")
async def session_info(session: Session = Depends(get_session)) -> dict:
    return {
        "session_id": session.session_id,
        "host": session.host,
        "port": session.port,
        "username": session.username,
        "home": session.home,
        "uname": session.uname,
        "fingerprint": session.fingerprint,
        "activity": session.activity[-50:],
    }


@router.get("/{session_id}/activity")
async def session_activity(session: Session = Depends(get_session)) -> dict:
    return {"activity": session.activity}


@router.delete("/{session_id}")
async def disconnect(session: Session = Depends(get_session)) -> dict:
    removed = await store.remove(session.session_id)
    if removed:
        await removed.close()
    return {"ok": True}
