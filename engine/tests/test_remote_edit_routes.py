from typing import Any, cast

import asyncssh
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.session_store import Session, store


def _session() -> Session:
    return Session(
        session_id="remote-edit-route-test",
        host="10.0.0.8",
        port=22,
        username="cognisee",
        conn=cast(asyncssh.SSHClientConnection, object()),
        sftp=cast(asyncssh.SFTPClient, object()),
        home="/home/cognisee",
        fingerprint="test",
        uname="Linux",
        auth_method="password",
        password="pw",
    )


async def test_remote_edit_open_and_save(monkeypatch) -> None:
    async def fake_open(session, path, **kwargs):
        return {
            "edit_id": "edit-test-1",
            "path": path,
            "text": "hello\n",
            "sha256": "abc",
            "uses_sudo": False,
            "activity": [{"step": "info", "detail": "test"}],
            "can_validate": False,
            "can_reload": False,
        }

    async def fake_save(session, edit_id, content, **kwargs):
        assert edit_id == "edit-test-1"
        assert content == "hello world\n"
        return {
            "ok": True,
            "message": "Saved",
            "path": "/home/cognisee/.env",
            "sha256": "def",
            "activity": [{"step": "write", "detail": "saved"}],
        }

    monkeypatch.setattr("app.routers.remote_edit_routes.open_remote_edit", fake_open)
    monkeypatch.setattr("app.routers.remote_edit_routes.save_remote_edit", fake_save)
    async def fake_close(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setattr("app.routers.remote_edit_routes.close_remote_edit", fake_close)
    session = _session()
    await store.add(session)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            opened = await client.post(
                f"/api/sessions/{session.session_id}/remote-edit/open",
                json={"path": "/home/cognisee/.env"},
            )
            saved = await client.post(
                f"/api/sessions/{session.session_id}/remote-edit/save",
                json={"edit_id": "edit-test-1", "content": "hello world\n", "exit_after": True},
            )
        assert opened.status_code == 200
        assert opened.json()["path"] == "/home/cognisee/.env"
        assert "editor" not in opened.json()
        assert saved.status_code == 200
        assert saved.json()["message"] == "Saved"
    finally:
        await store.remove(session.session_id)
