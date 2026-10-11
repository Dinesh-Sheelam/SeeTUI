"""Open a remote path in the user's chosen local editor."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_session
from app.editor_launch import editor_status, open_session_path
from app.schemas import EditorOpened, EditorOpenRequest, EditorStatus
from app.session_store import Session

router = APIRouter(prefix="/api/sessions/{session_id}", tags=["editor"])


@router.get("/editor")
async def read_editor(session: Session = Depends(get_session)) -> EditorStatus:
    if not session.session_id:
        raise HTTPException(status_code=404, detail="Session not found or expired")
    return EditorStatus.model_validate(editor_status())


@router.post("/editor")
async def open_editor(
    payload: EditorOpenRequest,
    session: Session = Depends(get_session),
) -> EditorOpened:
    try:
        result = open_session_path(
            session,
            editor=payload.editor,
            path=payload.path,
            kind=payload.kind,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return EditorOpened.model_validate(result)
