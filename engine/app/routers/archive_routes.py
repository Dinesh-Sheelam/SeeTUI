"""Compress and extract archives using quoted remote commands."""

from __future__ import annotations

import posixpath
import shlex

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_session
from app.schemas import ArchiveRequest, ExtractRequest
from app.session_store import Session
from app.ssh_service import normalize_remote_path, quoted_join, run_command

router = APIRouter(prefix="/api/sessions/{session_id}", tags=["archives"])


@router.post("/archive")
async def create_archive(payload: ArchiveRequest, session: Session = Depends(get_session)) -> dict:
    remotes = [normalize_remote_path(path, session.home) for path in payload.paths]
    parent = posixpath.dirname(remotes[0])
    names = [posixpath.basename(path) for path in remotes]
    if payload.format == "zip" and not payload.archive_name.endswith(".zip"):
        archive_name = f"{payload.archive_name}.zip"
    elif payload.format == "tar.gz" and not payload.archive_name.endswith((".tar.gz", ".tgz")):
        archive_name = f"{payload.archive_name}.tar.gz"
    else:
        archive_name = payload.archive_name
    dest = posixpath.join(parent, archive_name)
    items = quoted_join(names)
    if payload.format == "zip":
        command = f"cd {shlex.quote(parent)} && zip -r {shlex.quote(archive_name)} {items}"
    else:
        command = f"cd {shlex.quote(parent)} && tar -czf {shlex.quote(archive_name)} {items}"
    code, stdout, stderr = await run_command(session, command, timeout=180)
    if code != 0:
        detail = stderr or stdout or "archive failed"
        if payload.format == "zip" and ("zip:" in detail.lower() or "not found" in detail.lower()):
            raise HTTPException(
                status_code=400,
                detail="zip is not installed on the server. Use .tar.gz instead.",
            )
        raise HTTPException(status_code=400, detail=detail)
    return {"path": dest, "command": command}


@router.post("/extract")
async def extract_archive(payload: ExtractRequest, session: Session = Depends(get_session)) -> dict:
    remote = normalize_remote_path(payload.path, session.home)
    dest = normalize_remote_path(payload.dest or posixpath.dirname(remote), session.home)
    lower = remote.lower()
    if lower.endswith(".zip"):
        command = f"cd {shlex.quote(dest)} && unzip -o {shlex.quote(remote)}"
    elif lower.endswith((".tar.gz", ".tgz", ".tar")):
        command = f"cd {shlex.quote(dest)} && tar -xzf {shlex.quote(remote)}"
    else:
        raise HTTPException(status_code=400, detail="unsupported archive type")
    code, stdout, stderr = await run_command(session, command, timeout=180)
    if code != 0:
        raise HTTPException(status_code=400, detail=stderr or stdout or "extract failed")
    return {"path": dest, "command": command}
