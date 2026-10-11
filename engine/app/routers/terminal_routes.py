"""WebSocket SSH terminal (PTY bridge)."""

from __future__ import annotations

import asyncio
import json
import shlex
from typing import Any

import asyncssh
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.session_store import store
from app.terminal_color import interactive_shell_command

router = APIRouter(prefix="/api/sessions/{session_id}", tags=["terminal"])


def _clamp(value: int, low: int, high: int) -> int:
    return max(low, min(value, high))


def _as_int(value: object, default: int) -> int:
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


def control_message(text: str) -> dict[str, Any] | None:
    """Return a resize/input payload. Keystrokes stay raw even if they look like JSON."""
    if not text.startswith('{"type":'):
        return None
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    if payload.get("type") not in {"resize", "input"}:
        return None
    return payload


async def remote_shell(conn: asyncssh.SSHClientConnection) -> str:
    """Return the remote login shell path. Empty when it cannot be read."""
    try:
        result = await conn.run('printf %s "$SHELL"', check=False, timeout=4)
    except Exception:
        return ""
    stdout = result.stdout or ""
    if isinstance(stdout, bytes):
        stdout = stdout.decode("utf-8", "replace")
    if not isinstance(stdout, str):
        return ""
    return stdout.strip()


async def write_stdin(process: asyncssh.SSHClientProcess[bytes], data: bytes) -> None:
    """Write to the PTY. asyncssh's write() is synchronous; only drain() is awaitable."""
    process.stdin.write(data)
    await process.stdin.drain()


@router.websocket("/terminal")
async def terminal_ws(websocket: WebSocket, session_id: str) -> None:
    session = await store.get(session_id)
    if session is None:
        await websocket.close(code=4404)
        return
    await websocket.accept()
    cwd = websocket.query_params.get("cwd") or session.home or "/"
    cols = _clamp(_as_int(websocket.query_params.get("cols"), 80), 20, 500)
    rows = _clamp(_as_int(websocket.query_params.get("rows"), 24), 5, 200)

    shell = await remote_shell(session.conn)
    try:
        process = await session.conn.create_process(
            interactive_shell_command(shell),
            term_type="xterm-256color",
            term_size=(cols, rows),
            encoding=None,
            stderr=asyncssh.STDOUT,
            request_pty=True,
        )
    except Exception as exc:
        await websocket.send_json({"type": "error", "message": f"Shell failed to start: {exc}"})
        await websocket.close()
        return

    if cwd:
        try:
            await write_stdin(process, f"cd {shlex.quote(cwd)}\n".encode())
        except Exception:
            pass

    await websocket.send_json({"type": "status", "status": "connected"})

    async def pump_output() -> None:
        try:
            while True:
                data = await process.stdout.read(4096)
                if not data:
                    break
                if isinstance(data, str):
                    data = data.encode("utf-8")
                await websocket.send_bytes(data)
        except Exception:
            pass

    output_task = asyncio.create_task(pump_output())

    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            raw = message.get("bytes") or b""
            if raw:
                await write_stdin(process, raw)
                continue
            text = message.get("text") or ""
            if not text:
                continue
            payload = control_message(text)
            if payload and payload.get("type") == "resize":
                new_cols = _clamp(_as_int(payload.get("cols"), cols), 20, 500)
                new_rows = _clamp(_as_int(payload.get("rows"), rows), 5, 200)
                try:
                    await process.change_terminal_size(new_cols, new_rows)
                except Exception:
                    pass
                continue
            if payload and payload.get("type") == "input":
                await write_stdin(process, str(payload.get("data", "")).encode())
                continue
            await write_stdin(process, text.encode())
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
    finally:
        output_task.cancel()
        try:
            process.terminate()
        except Exception:
            pass
        try:
            await process.wait()
        except Exception:
            pass
