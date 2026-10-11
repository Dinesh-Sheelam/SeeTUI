"""Open a remote file in the editor and write it back, with sudo when required."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_session
from app.remote_edit import (
    close_remote_edit,
    open_remote_edit,
    reload_remote_edit,
    restore_remote_edit,
    save_remote_edit,
    validate_remote_edit,
)
from app.schemas import (
    RemoteEditActionResponse,
    RemoteEditEditRequest,
    RemoteEditOpenRequest,
    RemoteEditOpenResponse,
    RemoteEditRestoreResponse,
    RemoteEditSaveRequest,
    RemoteEditSaveResponse,
)
from app.session_store import Session

router = APIRouter(prefix="/api/sessions/{session_id}", tags=["remote-edit"])


@router.post("/remote-edit/open")
async def remote_edit_open(
    payload: RemoteEditOpenRequest,
    session: Session = Depends(get_session),
) -> RemoteEditOpenResponse:
    try:
        result = await open_remote_edit(
            session,
            payload.path,
            use_ssh_password=payload.use_ssh_password,
            sudo_password=None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return RemoteEditOpenResponse.model_validate(result)


@router.post("/remote-edit/save")
async def remote_edit_save(
    payload: RemoteEditSaveRequest,
    session: Session = Depends(get_session),
) -> RemoteEditSaveResponse:
    try:
        result = await save_remote_edit(
            session,
            payload.edit_id,
            payload.content,
            use_ssh_password=payload.use_ssh_password,
            sudo_password=None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if payload.exit_after:
        await close_remote_edit(payload.edit_id, session.session_id or "")
    return RemoteEditSaveResponse.model_validate(result)


@router.post("/remote-edit/exit")
async def remote_edit_exit(
    payload: RemoteEditEditRequest,
    session: Session = Depends(get_session),
) -> dict[str, bool]:
    await close_remote_edit(payload.edit_id, session.session_id or "")
    return {"ok": True}


@router.post("/remote-edit/validate")
async def remote_edit_validate(
    payload: RemoteEditEditRequest,
    session: Session = Depends(get_session),
) -> RemoteEditActionResponse:
    try:
        result = await validate_remote_edit(
            session,
            payload.edit_id,
            use_ssh_password=payload.use_ssh_password,
            sudo_password=None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return RemoteEditActionResponse.model_validate(result)


@router.post("/remote-edit/reload")
async def remote_edit_reload(
    payload: RemoteEditEditRequest,
    session: Session = Depends(get_session),
) -> RemoteEditActionResponse:
    try:
        result = await reload_remote_edit(
            session,
            payload.edit_id,
            use_ssh_password=payload.use_ssh_password,
            sudo_password=None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return RemoteEditActionResponse.model_validate(result)


@router.post("/remote-edit/restore")
async def remote_edit_restore(
    payload: RemoteEditEditRequest,
    session: Session = Depends(get_session),
) -> RemoteEditRestoreResponse:
    try:
        result = await restore_remote_edit(
            session,
            payload.edit_id,
            use_ssh_password=payload.use_ssh_password,
            sudo_password=None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return RemoteEditRestoreResponse.model_validate(result)
