"""Open a session home directory in a local VS Code-compatible editor."""

from __future__ import annotations

import os
import stat
from pathlib import Path
from typing import Any, cast

import asyncssh
from httpx import ASGITransport, AsyncClient

from app.editor_launch import (
    choose_editor,
    editor_candidates,
    ensure_ssh_alias,
    find_existing_alias,
    open_remote_directory,
    render_host_block,
    safe_remote_path,
)
from app.main import app
from app.session_store import Session, store


def test_unsafe_paths_are_dropped() -> None:
    assert safe_remote_path("/home/cognisee") == "/home/cognisee"
    assert safe_remote_path("/home/../etc/passwd") == "/etc/passwd"
    assert safe_remote_path("home/cognisee") is None
    assert safe_remote_path("/home/cognisee\nHost") is None
    assert safe_remote_path("//evil/path") is None


def test_existing_ssh_host_is_reused() -> None:
    config = "\n".join(
        [
            "Host cognisee",
            "  HostName 192.178.1.129",
            "  User cognisee",
            "  ProxyJump bastion",
            "",
        ]
    )
    assert find_existing_alias(config, "192.178.1.129", "cognisee", 22) == "cognisee"


def test_ssh_alias_is_written_once(tmp_path: Path) -> None:
    ssh_dir = tmp_path / ".ssh"
    key = tmp_path / "id_ed25519"
    key.write_text("-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----\n")
    key.chmod(0o600)
    first = ensure_ssh_alias(
        host="192.178.1.129",
        port=2222,
        username="cognisee",
        key_path=str(key),
        key_content=None,
        ssh_dir=ssh_dir,
    )
    second = ensure_ssh_alias(
        host="192.178.1.129",
        port=2222,
        username="cognisee",
        key_path=str(key),
        key_content=None,
        ssh_dir=ssh_dir,
    )
    text = (ssh_dir / "SeeTUI_hosts").read_text(encoding="utf-8")
    assert first == second
    assert text.count("BEGIN SeeTUI") == 1
    assert f"IdentityFile {key}" in text
    assert "Include SeeTUI_hosts" in (ssh_dir / "config").read_text(encoding="utf-8")
    mode = stat.S_IMODE((ssh_dir / "SeeTUI_hosts").stat().st_mode)
    assert mode == 0o600


def test_ssh_config_rejects_injection() -> None:
    try:
        render_host_block("SeeTUI-box", "evil\nHost *", "cognisee", 22, None)
    except ValueError:
        return
    raise AssertionError("newline in hostname was accepted")


def test_open_directory_uses_folder_uri(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("app.editor_launch.choose_editor", lambda _prefer: ("code", "/usr/bin/true"))
    launched: list[list[str]] = []
    result = open_remote_directory(
        "/home/cognisee",
        editor="code",
        host="10.0.0.8",
        port=22,
        username="cognisee",
        key_path=None,
        key_content=None,
        ssh_dir=tmp_path / "ssh",
        launch=launched.append,
    )
    assert result["ok"] is True
    assert result["message"] == "Opened /home/cognisee in VS Code"
    assert launched[0][0] == "/usr/bin/true"
    assert launched[0][1:] == [
        "--new-window",
        "--remote",
        "ssh-remote+SeeTUI-cognisee-10.0.0.8-22",
        "/home/cognisee",
    ]


def test_open_opt_folder_uses_that_path(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("app.editor_launch.choose_editor", lambda _prefer: ("cursor", "/usr/bin/true"))
    launched: list[list[str]] = []
    result = open_remote_directory(
        "/opt",
        editor="cursor",
        host="10.0.0.8",
        port=22,
        username="cognisee",
        key_path=None,
        key_content=None,
        ssh_dir=tmp_path / "ssh",
        launch=launched.append,
    )
    assert result["message"] == "Opened /opt in Cursor"
    assert launched[0][1:] == [
        "--new-window",
        "--remote",
        "ssh-remote+SeeTUI-cognisee-10.0.0.8-22",
        "/opt",
    ]


def test_open_file_uses_file_uri(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("app.editor_launch.choose_editor", lambda _prefer: ("cursor", "/usr/bin/true"))
    launched: list[list[str]] = []
    result = open_remote_directory(
        "/home/cognisee/app.py",
        editor="cursor",
        kind="file",
        host="10.0.0.8",
        port=22,
        username="cognisee",
        key_path=None,
        key_content=None,
        ssh_dir=tmp_path / "ssh",
        launch=launched.append,
    )
    assert result["ok"] is True
    assert result["message"] == "Opened /home/cognisee/app.py in Cursor"
    assert launched[0][1:] == [
        "--new-window",
        "--file-uri",
        "vscode-remote://ssh-remote+SeeTUI-cognisee-10.0.0.8-22/home/cognisee/app.py",
    ]


def test_windows_candidates_include_program_paths(monkeypatch) -> None:
    monkeypatch.setenv("LOCALAPPDATA", r"C:\Users\ada\AppData\Local")
    monkeypatch.setenv("ProgramFiles", r"C:\Program Files")
    cursor = editor_candidates("cursor")
    code = editor_candidates("code")
    assert any(item.endswith("Cursor.exe") or item.endswith("cursor.cmd") for item in cursor)
    assert any("Microsoft VS Code" in item for item in code)
    assert any(item.endswith("code.cmd") or item.endswith("Code.exe") for item in code)


def test_windows_identity_file_is_accepted() -> None:
    block = render_host_block(
        "SeeTUI-box",
        "example.com",
        "cognisee",
        22,
        r"C:\Users\ada\.ssh\id_ed25519",
    )
    assert "IdentityFile C:/Users/ada/.ssh/id_ed25519" in block


def test_choose_editor_uses_requested_cli(monkeypatch) -> None:
    def fake_find(name: str, _candidates: tuple[str, ...], **_kwargs: object) -> str | None:
        paths = {
            "code": "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
            "windsurf": "/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf",
        }
        return paths.get(name)

    monkeypatch.setattr("app.editor_launch.find_cli", fake_find)
    assert choose_editor("code") == (
        "code",
        "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
    )
    assert choose_editor("windsurf") == (
        "windsurf",
        "/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf",
    )
    assert choose_editor("cursor") is None
    assert choose_editor("notepad") is None


def test_antigravity_ide_bundle_is_a_candidate() -> None:
    candidates = editor_candidates("antigravity")
    assert "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide" in candidates


def test_choose_editor_finds_antigravity_ide(monkeypatch) -> None:
    def fake_find(name: str, _candidates: tuple[str, ...], **_kwargs: object) -> str | None:
        if name == "antigravity-ide":
            return "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide"
        return None

    monkeypatch.setattr("app.editor_launch.find_cli", fake_find)
    assert choose_editor("antigravity") == (
        "antigravity",
        "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide",
    )


def test_choose_editor_skips_kiro_cli(monkeypatch) -> None:
    def fake_find(name: str, _candidates: tuple[str, ...], **_kwargs: object) -> str | None:
        if name == "kiro-ide":
            return "/Applications/Kiro.app/Contents/Resources/app/bin/kiro-ide"
        return None

    monkeypatch.setattr("app.editor_launch.find_cli", fake_find)
    assert choose_editor("kiro") == (
        "kiro",
        "/Applications/Kiro.app/Contents/Resources/app/bin/kiro-ide",
    )


def test_pasted_key_is_not_world_readable(tmp_path: Path) -> None:
    ssh_dir = tmp_path / ".ssh"
    ensure_ssh_alias(
        host="example.com",
        port=22,
        username="cognisee",
        key_path=None,
        key_content="-----BEGIN OPENSSH PRIVATE KEY-----\nsecret\n-----END OPENSSH PRIVATE KEY-----\n",
        ssh_dir=ssh_dir,
    )
    keys = list((ssh_dir / "SeeTUI-keys").iterdir())
    assert len(keys) == 1
    assert stat.S_IMODE(keys[0].stat().st_mode) == 0o600
    assert os.access(keys[0], os.R_OK)
    assert stat.S_IMODE((ssh_dir / "SeeTUI-keys").stat().st_mode) == 0o700


def _session() -> Session:
    return Session(
        session_id="editor-session-test",
        host="10.0.0.8",
        port=22,
        username="cognisee",
        conn=cast(asyncssh.SSHClientConnection, object()),
        sftp=cast(asyncssh.SFTPClient, object()),
        home="/home/cognisee",
        fingerprint="test",
        uname="Linux",
        auth_method="password",
        password="do-not-write-this-password",
    )


def _installed(*names: str):
    def fake_choose(prefer: str) -> tuple[str, str] | None:
        if prefer in names:
            return prefer, "/usr/bin/true"
        return None

    return fake_choose


def _all_editors(*, available: bool) -> list[dict[str, object]]:
    labels = {
        "code": "VS Code",
        "cursor": "Cursor",
        "antigravity": "Antigravity",
        "kiro": "Kiro",
        "windsurf": "Windsurf",
    }
    return [{"id": name, "label": label, "available": available} for name, label in labels.items()]


async def test_editor_routes_open_home_folder(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("app.editor_launch.choose_editor", _installed("cursor"))
    monkeypatch.setattr("app.editor_launch.default_ssh_dir", lambda: tmp_path / "ssh")
    launched: list[list[str]] = []
    monkeypatch.setattr("app.editor_launch.launch_editor", launched.append)
    session = _session()
    await store.add(session)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            status = await client.get(f"/api/sessions/{session.session_id}/editor")
            assert status.status_code == 200
            assert status.json() == {
                "available": True,
                "editors": [
                    {"id": "code", "label": "VS Code", "available": False},
                    {"id": "cursor", "label": "Cursor", "available": True},
                    {"id": "antigravity", "label": "Antigravity", "available": False},
                    {"id": "kiro", "label": "Kiro", "available": False},
                    {"id": "windsurf", "label": "Windsurf", "available": False},
                ],
            }
            opened = await client.post(
                f"/api/sessions/{session.session_id}/editor",
                json={
                    "editor": "cursor",
                    "path": "/home/cognisee/app",
                    "kind": "dir",
                    "host": "evil.example",
                    "password": "hunter2",
                },
            )
        assert opened.status_code == 200
        assert opened.json() == {"ok": True, "message": "Opened /home/cognisee/app in Cursor"}
    finally:
        await store.remove(session.session_id)

    assert launched[0] == [
        "/usr/bin/true",
        "--new-window",
        "--remote",
        "ssh-remote+SeeTUI-cognisee-10.0.0.8-22",
        "/home/cognisee/app",
    ]
    written = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (tmp_path / "ssh").rglob("*")
        if path.is_file()
    )
    assert "do-not-write-this-password" not in written
    assert "hunter2" not in written
    assert "evil.example" not in written


async def test_editor_routes_reject_missing_editor(monkeypatch) -> None:
    monkeypatch.setattr("app.editor_launch.choose_editor", lambda _prefer: None)
    launched: list[Any] = []
    monkeypatch.setattr("app.editor_launch.launch_editor", launched.append)
    session = _session()
    session.session_id = "editor-missing-test"
    await store.add(session)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            status = await client.get(f"/api/sessions/{session.session_id}/editor")
            opened = await client.post(
                f"/api/sessions/{session.session_id}/editor",
                json={"editor": "windsurf"},
            )
        assert status.status_code == 200
        assert status.json() == {"available": False, "editors": _all_editors(available=False)}
        assert opened.status_code == 400
        assert "not installed" in opened.json()["detail"]
    finally:
        await store.remove(session.session_id)
    assert launched == []


async def test_editor_routes_open_requested_editor(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("app.editor_launch.choose_editor", _installed("code", "kiro"))
    monkeypatch.setattr("app.editor_launch.default_ssh_dir", lambda: tmp_path / "ssh")
    launched: list[list[str]] = []
    monkeypatch.setattr("app.editor_launch.launch_editor", launched.append)
    session = _session()
    session.session_id = "editor-requested-test"
    await store.add(session)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            opened = await client.post(
                f"/api/sessions/{session.session_id}/editor",
                json={"editor": "kiro", "path": "/var/log", "kind": "dir"},
            )
        assert opened.status_code == 200
        assert opened.json() == {"ok": True, "message": "Opened /var/log in Kiro"}
    finally:
        await store.remove(session.session_id)
    assert launched[0] == [
        "/usr/bin/true",
        "--new-window",
        "--remote",
        "ssh-remote+SeeTUI-cognisee-10.0.0.8-22",
        "/var/log",
    ]


async def test_editor_routes_reject_unsafe_path(monkeypatch) -> None:
    monkeypatch.setattr("app.editor_launch.choose_editor", _installed("cursor"))
    launched: list[Any] = []
    monkeypatch.setattr("app.editor_launch.launch_editor", launched.append)
    session = _session()
    session.session_id = "editor-unsafe-path-test"
    await store.add(session)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            opened = await client.post(
                f"/api/sessions/{session.session_id}/editor",
                json={"editor": "cursor", "path": "home/cognisee"},
            )
        assert opened.status_code == 400
        assert "cannot be opened" in opened.json()["detail"]
    finally:
        await store.remove(session.session_id)
    assert launched == []


async def test_editor_routes_default_to_home(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("app.editor_launch.choose_editor", _installed("cursor"))
    monkeypatch.setattr("app.editor_launch.default_ssh_dir", lambda: tmp_path / "ssh")
    launched: list[list[str]] = []
    monkeypatch.setattr("app.editor_launch.launch_editor", launched.append)
    session = _session()
    session.session_id = "editor-default-home-test"
    await store.add(session)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            opened = await client.post(
                f"/api/sessions/{session.session_id}/editor",
                json={"editor": "cursor"},
            )
        assert opened.status_code == 200
        assert opened.json() == {"ok": True, "message": "Opened /home/cognisee in Cursor"}
    finally:
        await store.remove(session.session_id)
    assert launched[0][1:] == [
        "--new-window",
        "--remote",
        "ssh-remote+SeeTUI-cognisee-10.0.0.8-22",
        "/home/cognisee",
    ]
