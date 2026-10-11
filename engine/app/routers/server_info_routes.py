"""Read and write the server owner note plus system facts."""

from __future__ import annotations

import json
import shlex

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_session
from app.health.sudo import resolve_sudo_password, sudo_prefix
from app.schemas import ServerInfoNote
from app.session_store import Session
from app.ssh_service import run_command


class ServerInfoWrite(ServerInfoNote):
    sudo_password: str | None = None
    use_ssh_password: bool = False

router = APIRouter(prefix="/api/sessions/{session_id}", tags=["server-info"])


async def _read_note(session: Session) -> tuple[dict | None, str]:
    code, stdout, _ = await run_command(session, "cat /etc/server-info.json 2>/dev/null || true")
    if code == 0 and stdout.strip():
        try:
            return json.loads(stdout), "/etc/server-info.json"
        except json.JSONDecodeError:
            pass
    code, stdout, _ = await run_command(session, 'cat "$HOME/.server-info.json" 2>/dev/null || true')
    if code == 0 and stdout.strip():
        try:
            return json.loads(stdout), "~/.server-info.json"
        except json.JSONDecodeError:
            pass
    return None, "/etc/server-info.json"


@router.get("/server-info")
async def get_server_info(session: Session = Depends(get_session)) -> dict:
    note, location = await _read_note(session)
    facts = {}
    probes = {
        "ips": "hostname -I 2>/dev/null || true",
        "last_update": "stat -c %y /var/lib/apt/periodic/update-success-stamp 2>/dev/null || true",
        "last_boot": "who -b 2>/dev/null || true",
        "who": "who",
    }
    for key, command in probes.items():
        _code, stdout, _err = await run_command(session, command, timeout=8)
        facts[key] = stdout.strip()
    return {
        "note": note,
        "location": location,
        "facts": facts,
        "host": session.host,
        "username": session.username,
        "uname": session.uname,
    }


@router.put("/server-info")
async def put_server_info(payload: ServerInfoWrite, session: Session = Depends(get_session)) -> dict:
    note = payload.model_dump(exclude={"sudo_password", "use_ssh_password"})
    body = json.dumps(note, indent=2)
    quoted = shlex.quote(body)
    etc_cmd = f"printf %s {quoted} > /etc/server-info.json"
    password = await resolve_sudo_password(
        session,
        sudo_password=payload.sudo_password,
        use_ssh_password=payload.use_ssh_password,
    )
    stdin = (password + "\n").encode() if password else None
    wrapped = f"{sudo_prefix(password is not None)} -- sh -c {shlex.quote(etc_cmd)}"
    code, _stdout, stderr = await run_command(session, wrapped, timeout=12, input_data=stdin)
    location = "/etc/server-info.json"
    if code != 0:
        home_cmd = f'printf %s {quoted} > "$HOME/.server-info.json"'
        code, _stdout, stderr = await run_command(session, home_cmd, timeout=8)
        location = "~/.server-info.json"
        if code != 0:
            raise HTTPException(status_code=400, detail=stderr or "could not write note")
    return {"ok": True, "location": location, "note": note}
