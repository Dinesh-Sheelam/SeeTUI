"""In-memory SSH session store with idle timeout."""

from __future__ import annotations

import asyncio
import secrets
import time
from dataclasses import dataclass, field
from typing import Any

import asyncssh

IDLE_TIMEOUT_SECONDS = 30 * 60


@dataclass
class Session:
    session_id: str
    host: str
    port: int
    username: str
    conn: asyncssh.SSHClientConnection
    sftp: asyncssh.SFTPClient
    home: str
    fingerprint: str
    uname: str
    auth_method: str
    password: str | None = None
    key_path: str | None = None
    key_content: str | None = None
    passphrase: str | None = None
    sudo_password: str | None = None
    last_used: float = field(default_factory=time.monotonic)
    activity: list[dict[str, Any]] = field(default_factory=list)

    def touch(self) -> None:
        self.last_used = time.monotonic()

    def log_activity(self, command: str, result: str = "", ok: bool = True) -> None:
        self.activity.append(
            {
                "command": command,
                "result": result[:4000],
                "ok": ok,
                "ts": time.time(),
            }
        )
        if len(self.activity) > 200:
            self.activity = self.activity[-200:]

    async def close(self) -> None:
        try:
            self.sftp.exit()
        except Exception:
            pass
        try:
            self.conn.close()
            await asyncio.wait_for(self.conn.wait_closed(), timeout=2)
        except Exception:
            pass
        self.password = None
        self.key_content = None
        self.passphrase = None
        self.sudo_password = None


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}
        self._lock = asyncio.Lock()
        self._reaper: asyncio.Task[None] | None = None

    async def start(self) -> None:
        if self._reaper is None:
            self._reaper = asyncio.create_task(self._reap_idle())

    async def stop(self) -> None:
        if self._reaper is not None:
            self._reaper.cancel()
            try:
                await self._reaper
            except asyncio.CancelledError:
                pass
            self._reaper = None
        async with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()
        await asyncio.gather(*(session.close() for session in sessions), return_exceptions=True)

    async def add(self, session: Session) -> str:
        async with self._lock:
            self._sessions[session.session_id] = session
        return session.session_id

    async def get(self, session_id: str) -> Session | None:
        async with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return None
            session.touch()
            return session

    async def remove(self, session_id: str) -> Session | None:
        async with self._lock:
            return self._sessions.pop(session_id, None)

    async def _reap_idle(self) -> None:
        while True:
            await asyncio.sleep(60)
            now = time.monotonic()
            stale: list[Session] = []
            async with self._lock:
                for session_id, session in list(self._sessions.items()):
                    if now - session.last_used > IDLE_TIMEOUT_SECONDS:
                        stale.append(self._sessions.pop(session_id))
            await asyncio.gather(*(session.close() for session in stale), return_exceptions=True)


store = SessionStore()


def new_session_id() -> str:
    return secrets.token_urlsafe(24)
