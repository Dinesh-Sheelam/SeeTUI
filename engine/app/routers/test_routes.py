"""Test SSH credentials without opening a full session."""

from __future__ import annotations

import asyncio

import asyncssh
from fastapi import APIRouter, HTTPException

from app.schemas import ConnectRequest
from app.ssh_service import chmod_command, expand_key_path, key_is_group_or_world_accessible, key_permission_message

router = APIRouter(prefix="/api", tags=["test"])


async def _try_connect(payload: ConnectRequest) -> dict:
    host = payload.host
    port = payload.port
    username = payload.username
    connect_kwargs: dict = {
        "host": host,
        "port": port,
        "username": username,
        "known_hosts": None,
        "connect_timeout": 15,
    }
    if payload.auth_method == "password":
        if not payload.password:
            raise ValueError("Password is required")
        connect_kwargs["password"] = payload.password
    elif payload.auth_method == "key_path":
        if not payload.key_path:
            raise ValueError("Key path is required")
        resolved = expand_key_path(payload.key_path)
        if not resolved.is_file():
            raise FileNotFoundError(str(resolved))
        if key_is_group_or_world_accessible(resolved):
            raise ValueError(f"{key_permission_message(resolved)} Fix them with: {chmod_command(resolved)}")
        connect_kwargs["client_keys"] = [str(resolved)]
        connect_kwargs["passphrase"] = payload.passphrase
    elif payload.auth_method == "key_content":
        if not payload.key_content:
            raise ValueError("Key content is required")
        connect_kwargs["client_keys"] = [
            asyncssh.import_private_key(payload.key_content, payload.passphrase)
        ]
    else:
        raise ValueError("Unknown auth method")

    conn = await asyncio.wait_for(asyncssh.connect(**connect_kwargs), timeout=20)
    try:
        fingerprint = ""
        server_key = conn.get_server_host_key()
        if server_key:
            fingerprint = server_key.get_fingerprint()
        result = await conn.run("uname -srm", check=False)
        uname = (result.stdout or "").strip() if isinstance(result.stdout, str) else ""
        return {"ok": True, "fingerprint": fingerprint, "uname": uname}
    finally:
        conn.close()
        await conn.wait_closed()


@router.post("/test-connect")
async def test_connect(payload: ConnectRequest) -> dict:
    try:
        return await _try_connect(payload)
    except asyncssh.PermissionDenied:
        raise HTTPException(status_code=400, detail="Authentication failed") from None
    except TimeoutError:
        raise HTTPException(status_code=400, detail="Connection timed out") from None
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
