"""In-memory remote edit sessions (one active edit per path per SSH session)."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

ActivityStep = dict[str, str]


@dataclass
class RemoteEditSession:
    edit_id: str
    session_id: str
    path: str
    backup_path: str
    original_sha256: str
    needs_sudo: bool
    activity: list[ActivityStep] = field(default_factory=list)
    busy: bool = False


class RemoteEditStore:
    def __init__(self) -> None:
        self._by_id: dict[str, RemoteEditSession] = {}
        self._by_path: dict[tuple[str, str], str] = {}
        self._lock = asyncio.Lock()

    async def create(self, session: RemoteEditSession) -> RemoteEditSession:
        async with self._lock:
            key = (session.session_id, session.path)
            old = self._by_path.get(key)
            if old and old in self._by_id:
                del self._by_id[old]
            self._by_id[session.edit_id] = session
            self._by_path[key] = session.edit_id
            return session

    async def get(self, edit_id: str) -> RemoteEditSession | None:
        return self._by_id.get(edit_id)

    async def remove(self, edit_id: str) -> None:
        async with self._lock:
            item = self._by_id.pop(edit_id, None)
            if item:
                self._by_path.pop((item.session_id, item.path), None)


remote_edit_store = RemoteEditStore()
