"""Health report and streamed fix execution."""

from __future__ import annotations

import json
import shlex

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.dependencies import get_session
from app.health.checks.firewall import ufw_allows_port
from app.health.fixes import FixValidationError, cancel_ufw_dead_man_command, get_fix, preview_fix, render_fix
from app.health.runner import build_report
from app.health.sudo import resolve_sudo_password, sudo_prefix
from app.schemas import FixRequest
from app.session_store import Session
from app.ssh_service import run_command, stream_command

router = APIRouter(prefix="/api/sessions/{session_id}", tags=["health"])


@router.get("/health")
async def health_report(session: Session = Depends(get_session)) -> dict:
    return await build_report(session)


@router.get("/health/{check_id}")
async def health_check(check_id: str, session: Session = Depends(get_session)) -> dict:
    report = await build_report(session)
    for check in report["checks"]:
        if check["id"] == check_id:
            return check
    raise HTTPException(status_code=404, detail="unknown check")


@router.post("/health/fixes/{fix_id}/preview")
async def fix_preview(
    fix_id: str,
    payload: FixRequest,
    session: Session = Depends(get_session),
) -> dict:
    try:
        return preview_fix(fix_id, payload.inputs, {"ssh_port": session.port, "has_web": True})
    except FixValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/health/fixes/{fix_id}")
async def run_fix(
    fix_id: str,
    payload: FixRequest,
    session: Session = Depends(get_session),
) -> StreamingResponse:
    if fix_id == "add_owner_note":
        async def note_only():
            yield json.dumps({"type": "info", "message": "open-server-info"}) + "\n"
            yield json.dumps({"type": "done", "ok": True}) + "\n"

        return StreamingResponse(note_only(), media_type="application/x-ndjson")

    try:
        fix = get_fix(fix_id)
        commands = render_fix(fix_id, payload.inputs, {"ssh_port": session.port, "has_web": True})
    except FixValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    password = await resolve_sudo_password(
        session,
        sudo_password=payload.sudo_password,
        use_ssh_password=payload.use_ssh_password,
    )
    needs_password = password is not None
    stdin = (password + "\n").encode() if password else None

    async def events():
        yield json.dumps({"type": "start", "title": fix.title, "commands": commands}) + "\n"
        ok = True
        prefix = sudo_prefix(needs_password)
        for command in commands:
            wrapped = f"{prefix} -- sh -c {shlex.quote(command)}"
            yield json.dumps({"type": "command", "command": command}) + "\n"
            exit_codes: list[int] = []
            async for line in stream_command(session, wrapped, input_data=stdin, exit_codes=exit_codes):
                yield json.dumps({"type": "out", "line": line.rstrip("\n")}) + "\n"
            if exit_codes and exit_codes[-1] != 0:
                ok = False
        if fix_id == "enable_ufw":
            yield json.dumps({"type": "info", "message": "Checking that ufw is active and SSH is allowed"}) + "\n"
            code, stdout, err = await run_command(
                session,
                f"{prefix} -- ufw status verbose",
                input_data=stdin,
                timeout=20,
            )
            active = code == 0 and "Status: active" in stdout and ufw_allows_port(stdout, session.port)
            if active:
                cancel = f"{prefix} -- sh -c {shlex.quote(cancel_ufw_dead_man_command())}"
                stop_code, _, stop_err = await run_command(session, cancel, input_data=stdin)
                if stop_code == 0:
                    yield json.dumps({"type": "info", "message": "ufw is active and SSH is allowed. Dead-man switch cancelled."}) + "\n"
                else:
                    ok = False
                    yield json.dumps({"type": "info", "message": f"ufw is active but the dead-man switch could not be cancelled: {stop_err}"}) + "\n"
            else:
                ok = False
                detail = (stdout or err or "ufw status unreadable").strip().splitlines()
                reason = detail[0] if detail else "ufw status unreadable"
                yield json.dumps({
                    "type": "info",
                    "message": f"ufw did not stay active with SSH allowed ({reason}). It will disable itself in 90s.",
                }) + "\n"
        yield json.dumps({"type": "done", "ok": ok, "check_id": fix.check_id}) + "\n"

    return StreamingResponse(events(), media_type="application/x-ndjson")
