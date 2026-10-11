"""Streaming upload and download over SFTP."""

from __future__ import annotations

import posixpath
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from app.dependencies import get_session
from app.session_store import Session
from app.ssh_service import SFTP_CHUNK, normalize_remote_path

router = APIRouter(prefix="/api/sessions/{session_id}", tags=["transfers"])


@router.put("/upload")
async def upload_file(
    request: Request,
    path: str = Query(..., min_length=1),
    session: Session = Depends(get_session),
) -> dict:
    remote = normalize_remote_path(path, session.home)
    parent = posixpath.dirname(remote)
    try:
        async with session.sftp.open(remote, "wb") as handle:
            async for chunk in request.stream():
                if chunk:
                    await handle.write(chunk)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    session.log_activity(f"upload {remote}")
    return {"path": remote, "parent": parent}


@router.get("/download")
async def download_file(
    path: str = Query(..., min_length=1),
    session: Session = Depends(get_session),
) -> StreamingResponse:
    remote = normalize_remote_path(path, session.home)
    name = posixpath.basename(remote)

    async def chunks():
        try:
            async with session.sftp.open(remote, "rb") as handle:
                while True:
                    data = await handle.read(SFTP_CHUNK)
                    if not data:
                        break
                    yield data
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    session.log_activity(f"download {remote}")
    headers = {
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}",
    }
    return StreamingResponse(chunks(), media_type="application/octet-stream", headers=headers)
