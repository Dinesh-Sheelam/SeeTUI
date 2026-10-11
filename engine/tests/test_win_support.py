"""Windows permission checks, editor key files, and connect errors."""

from __future__ import annotations

from pathlib import Path

from app.editor_launch import ensure_ssh_alias, open_remote_directory
from app.ssh_service import apply_key_chmod, chmod_command, format_connect_error, key_is_group_or_world_accessible
from app.win_acl import acl_is_too_open, protect_private, repair_command


def test_acl_policy_allows_only_user_system_and_admins() -> None:
    user = "S-1-5-21-1-2-3-1001"
    assert not acl_is_too_open([user, "S-1-5-18", "S-1-5-32-544"], user)
    assert acl_is_too_open([user, "S-1-1-0"], user)
    assert acl_is_too_open([user, "S-1-5-32-545"], user)
    assert acl_is_too_open([], user, null_dacl=True)
    assert acl_is_too_open([user], user, unparsed_allow=True)


def test_windows_mode_bits_do_not_block_a_private_key(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("app.platform.is_windows", lambda: True)
    monkeypatch.setattr("app.win_acl.dacl_is_too_open", lambda _path: False)
    key = tmp_path / "id_ed25519"
    key.write_text("-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----\n")
    key.chmod(0o644)
    assert not key_is_group_or_world_accessible(key)


def test_windows_repair_limits_the_key_to_the_user(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("app.platform.is_windows", lambda: True)
    monkeypatch.setenv("USERNAME", "ada")
    seen: list[Path] = []
    monkeypatch.setattr("app.win_acl.protect_private", lambda path: seen.append(path))
    key = tmp_path / "id_ed25519"
    key.write_text("-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----\n")
    key.chmod(0o644)
    result = apply_key_chmod(str(key))
    assert seen == [key.resolve()]
    assert result["mode"] == "user-only"
    assert "icacls" in result["command"]
    assert "ada:(R,W)" in result["command"]
    assert key.stat().st_mode & 0o777 == 0o644


def test_repair_command_grants_before_removing_inheritance(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("USERNAME", "ada")
    key = tmp_path / "id_ed25519"
    key.write_text("key")
    command = repair_command(key)
    assert command.index("/grant:r") < command.index("/inheritance:r")


def test_protect_private_invokes_icacls_in_order(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("app.platform.is_windows", lambda: True)
    monkeypatch.setenv("USERNAME", "ada")
    calls: list[list[str]] = []

    def fake_run(argv: list[str], **_kwargs: object) -> object:
        calls.append(list(argv))

        class Result:
            returncode = 0
            stderr = ""
            stdout = ""

        return Result()

    monkeypatch.setattr("app.win_acl.subprocess.run", fake_run)
    key = tmp_path / "id_ed25519"
    key.write_text("key")
    protect_private(key)
    assert [call[1:] for call in calls] == [
        [str(key), "/reset"],
        [str(key), "/grant:r", "ada:(R,W)"],
        [str(key), "/inheritance:r"],
    ]


def test_windows_editor_files_are_user_only(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("app.platform.is_windows", lambda: True)
    protected: list[Path] = []
    monkeypatch.setattr("app.win_acl.protect_private", lambda path: protected.append(Path(path)))
    key = tmp_path / "id_ed25519"
    key.write_text("-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----\n")
    ssh_dir = tmp_path / ".ssh"
    ensure_ssh_alias(
        host="example.com",
        port=22,
        username="cognisee",
        key_path=str(key),
        key_content=None,
        ssh_dir=ssh_dir,
    )
    names = {path.name for path in protected}
    assert "config" in names
    assert "SeeTUI_hosts" in names
    assert ".ssh" in names
    text = (ssh_dir / "SeeTUI_hosts").read_text(encoding="utf-8")
    assert "IdentityFile" in text


def test_existing_ssh_dir_is_not_reset(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("app.platform.is_windows", lambda: True)
    protected: list[str] = []
    monkeypatch.setattr("app.win_acl.protect_private", lambda path: protected.append(Path(path).name))
    ssh_dir = tmp_path / ".ssh"
    ssh_dir.mkdir()
    ensure_ssh_alias(
        host="example.com",
        port=22,
        username="cognisee",
        key_path=None,
        key_content=None,
        ssh_dir=ssh_dir,
    )
    assert ".ssh" not in protected
    assert "SeeTUI_hosts" in protected
    assert "config" in protected


def test_editor_open_reports_acl_failure(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("app.platform.is_windows", lambda: True)
    monkeypatch.setattr("app.editor_launch.choose_editor", lambda _prefer: ("code", "/usr/bin/true"))

    def fail(_path: Path) -> None:
        raise OSError("icacls failed")

    monkeypatch.setattr("app.win_acl.protect_private", fail)
    try:
        open_remote_directory(
            "/home/cognisee",
            editor="code",
            host="10.0.0.8",
            port=22,
            username="cognisee",
            key_path=None,
            key_content=None,
            ssh_dir=tmp_path / "ssh",
            launch=lambda _argv: None,
        )
    except ValueError as exc:
        assert "Could not open the editor" in str(exc)
        return
    raise AssertionError("ACL failure was not reported")


def test_connect_errors_follow_the_host_os(monkeypatch) -> None:
    blocked = OSError(1, "Operation not permitted")
    monkeypatch.setattr("app.platform.is_windows", lambda: True)
    windows = format_connect_error(blocked)
    assert "Windows" in windows
    assert "run.ps1" in windows
    monkeypatch.setattr("app.platform.is_windows", lambda: False)
    macos = format_connect_error(blocked)
    assert "macOS" in macos
    assert "run.sh" in macos

    refused = OSError(10061, "No connection could be made because the target machine actively refused it")
    refused.winerror = 10061
    monkeypatch.setattr("app.platform.is_windows", lambda: True)
    assert "Connection refused" in format_connect_error(refused)


def test_chmod_command_stays_unix_on_posix(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("app.platform.is_windows", lambda: False)
    key = tmp_path / "id_ed25519"
    key.write_text("key")
    assert chmod_command(key) == f"chmod 600 {key}"
