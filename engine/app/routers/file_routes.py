"""SFTP file listing and mutation routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import get_session
from app.schemas import CreateFileRequest, DeleteRequest, FileEntry, MkdirRequest, RenameRequest, WriteFileRequest
from app.session_store import Session
from app.ssh_service import create_empty_file, delete, list_dir, mkdir, preview_text, rename, write_text

router = APIRouter(prefix="/api/sessions/{session_id}", tags=["files"])


@router.get("/files")
async def get_files(
    path: str = Query(default=""),
    session: Session = Depends(get_session),
) -> dict[str, list[FileEntry] | str]:
    try:
        entries = await list_dir(session, path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    from app.ssh_service import normalize_remote_path

    return {"path": normalize_remote_path(path, session.home), "entries": entries}


@router.post("/mkdir")
async def create_dir(payload: MkdirRequest, session: Session = Depends(get_session)) -> dict:
    try:
        remote = await mkdir(session, payload.path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"path": remote}


@router.post("/rename")
async def rename_path(payload: RenameRequest, session: Session = Depends(get_session)) -> dict:
    try:
        src, dest = await rename(session, payload.src, payload.dest)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"src": src, "dest": dest}


@router.post("/delete")
async def delete_path(payload: DeleteRequest, session: Session = Depends(get_session)) -> dict:
    try:
        remote = await delete(session, payload.path, payload.recursive)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"path": remote}


@router.post("/create-file")
async def create_file(payload: CreateFileRequest, session: Session = Depends(get_session)) -> dict:
    try:
        remote = await create_empty_file(session, payload.path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"path": remote}


@router.put("/write")
async def write_file(payload: WriteFileRequest, session: Session = Depends(get_session)) -> dict:
    try:
        remote = await write_text(session, payload.path, payload.content)
    except ValueError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"path": remote}


@router.get("/preview")
async def preview(path: str, session: Session = Depends(get_session)) -> dict:
    try:
        remote, text = await preview_text(session, path)
    except ValueError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"path": remote, "text": text}
