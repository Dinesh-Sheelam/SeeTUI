from typing import cast

import asyncssh

from app.remote_edit import save_remote_edit, sha256_text
from app.remote_edit_store import RemoteEditSession, remote_edit_store
from app.session_store import Session


def _session() -> Session:
    return Session(
        session_id="remote-edit-svc",
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


async def test_save_rolls_back_when_verification_fails(monkeypatch) -> None:
    session = _session()
    item = RemoteEditSession(
        edit_id="edit-rollback",
        session_id=session.session_id,
        path="/etc/demo.conf",
        backup_path="/etc/demo.conf.SeeTUI-bak-1",
        original_sha256=sha256_text("old\n"),
        needs_sudo=True,
    )
    await remote_edit_store.create(item)

    async def fake_save_editor(*_args, **_kwargs) -> None:
        return None

    reads = iter(["wrong\n", "old\n"])

    async def fake_read(*_args, **_kwargs) -> str:
        return next(reads)

    restores: list[str] = []

    async def fake_restore(*_args, **_kwargs) -> None:
        restores.append("ok")

    monkeypatch.setattr("app.remote_edit.write_remote_text", fake_save_editor)
    monkeypatch.setattr("app.remote_edit.read_remote_text", fake_read)
    monkeypatch.setattr("app.remote_edit.restore_backup", fake_restore)
    async def fake_password(*_a, **_k) -> str:
        return "pw"

    monkeypatch.setattr("app.health.sudo.resolve_sudo_password", fake_password)
    monkeypatch.setattr("app.remote_edit.resolve_sudo_password", fake_password)

    try:
        try:
            await save_remote_edit(session, "edit-rollback", "new\n", use_ssh_password=True, sudo_password=None)
        except ValueError as exc:
            assert "verification failed" in str(exc).lower()
        else:
            raise AssertionError("expected verification failure")
        assert restores == ["ok"]
    finally:
        await remote_edit_store.remove("edit-rollback")
