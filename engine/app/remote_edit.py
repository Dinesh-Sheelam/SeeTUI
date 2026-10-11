"""Open, save, backup, and verify remote file edits."""

from __future__ import annotations

import hashlib
import posixpath
import secrets
import shlex
import time
from typing import Any

from app.health.sudo import resolve_sudo_password, sudo_prefix
from app.remote_edit_store import RemoteEditSession, remote_edit_store
from app.remote_edit_validate import reload_path, validate_path
from app.session_store import Session
from app.ssh_service import PREVIEW_LIMIT, normalize_remote_path, preview_text, run_command

MAX_BACKUPS = 5
ActivityStep = dict[str, str]


def write_script(path: str) -> str:
    """Replace a file from stdin, keeping owner, mode, and symlink targets."""
    target = shlex.quote(path)
    parent = shlex.quote(posixpath.dirname(path) or "/")
    return (
        "set -eu\n"
        f"parent={parent}\n"
        f"target={target}\n"
        'tmp=$(mktemp "$parent/.SeeTUI-edit.XXXXXX")\n'
        'cleanup() { rm -f "$tmp"; }\n'
        "trap cleanup EXIT\n"
        'cat > "$tmp"\n'
        'if [ -e "$target" ] || [ -L "$target" ]; then\n'
        '  chown --reference="$target" "$tmp" 2>/dev/null || true\n'
        '  chmod --reference="$target" "$tmp" 2>/dev/null || true\n'
        "fi\n"
        'if [ -L "$target" ]; then\n'
        '  cat "$tmp" > "$target"\n'
        "else\n"
        '  mv -f "$tmp" "$target"\n'
        "  trap - EXIT\n"
        "fi\n"
    )


def compose_write_input(content: str, sudo_password: str | None) -> bytes:
    body = content.encode("utf-8")
    if sudo_password is None:
        return body
    return f"{sudo_password}\n".encode() + body


def write_command(path: str, *, needs_sudo: bool, needs_password: bool) -> str:
    inner = f"sh -c {shlex.quote(write_script(path))}"
    if not needs_sudo:
        return inner
    return f"{sudo_prefix(needs_password)} -- {inner}"


def run_prefix(needs_sudo: bool, sudo_password: str | None) -> tuple[str, bytes | None]:
    if not needs_sudo:
        return "", None
    prefix = f"{sudo_prefix(sudo_password is not None)} "
    stdin = f"{sudo_password}\n".encode() if sudo_password else None
    return prefix, stdin


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


async def path_is_writable(session: Session, path: str) -> bool:
    code, _, _ = await run_command(session, f"test -w {shlex.quote(path)}", timeout=10)
    return code == 0


async def read_remote_text(
    session: Session,
    path: str,
    *,
    needs_sudo: bool,
    sudo_password: str | None,
) -> str:
    if not needs_sudo:
        _, text = await preview_text(session, path)
        return text
    prefix = sudo_prefix(sudo_password is not None)
    command = f"{prefix} cat {shlex.quote(path)}"
    stdin = (sudo_password + "\n").encode() if sudo_password else None
    code, stdout, stderr = await run_command(session, command, input_data=stdin, timeout=30)
    if code != 0:
        raise ValueError(stderr or stdout or "Could not read file")
    data = stdout.encode("utf-8")
    if len(data) > PREVIEW_LIMIT:
        raise ValueError("file is larger than 512 KB")
    return stdout


async def create_backup(
    session: Session,
    path: str,
    *,
    needs_sudo: bool,
    sudo_password: str | None,
    activity: list[ActivityStep],
) -> str:
    stamp = int(time.time())
    backup = f"{path}.SeeTUI-bak-{stamp}"
    prefix, stdin = run_prefix(needs_sudo, sudo_password)
    command = f"{prefix}cp -p {shlex.quote(path)} {shlex.quote(backup)}"
    activity.append({"step": "command", "detail": command})
    code, stdout, stderr = await run_command(session, command, input_data=stdin, timeout=30)
    if code != 0:
        raise ValueError(stderr or stdout or "Backup failed")
    await trim_backups(session, path, needs_sudo=needs_sudo, sudo_password=sudo_password)
    return backup


async def trim_backups(
    session: Session,
    path: str,
    *,
    needs_sudo: bool,
    sudo_password: str | None,
) -> None:
    parent = posixpath.dirname(path) or "/"
    base = posixpath.basename(path)
    pattern = f"{base}.SeeTUI-bak-*"
    legacy_pattern = f"{base}.seetui-bak-*"
    older_pattern = f"{base}.vsc-bak-*"
    prefix, stdin = run_prefix(needs_sudo, sudo_password)
    list_cmd = (
        f"{prefix}sh -c "
        + shlex.quote(
            f"ls -1t {parent}/{pattern} {parent}/{legacy_pattern} {parent}/{older_pattern} 2>/dev/null || true"
        )
    )
    code, stdout, _ = await run_command(session, list_cmd, input_data=stdin, timeout=20)
    if code != 0:
        return
    files = [line.strip() for line in stdout.splitlines() if line.strip()]
    for extra in files[MAX_BACKUPS:]:
        rm = f"{prefix}rm -f {shlex.quote(extra)}"
        await run_command(session, rm, input_data=stdin, timeout=15)


async def restore_backup(
    session: Session,
    path: str,
    backup_path: str,
    *,
    needs_sudo: bool,
    sudo_password: str | None,
) -> None:
    prefix, stdin = run_prefix(needs_sudo, sudo_password)
    command = f"{prefix}cp -p {shlex.quote(backup_path)} {shlex.quote(path)}"
    code, stdout, stderr = await run_command(session, command, input_data=stdin, timeout=30)
    if code != 0:
        raise ValueError(stderr or stdout or "Restore failed")


async def write_remote_text(
    session: Session,
    path: str,
    content: str,
    *,
    needs_sudo: bool,
    sudo_password: str | None,
    activity: list[ActivityStep],
) -> None:
    command = write_command(path, needs_sudo=needs_sudo, needs_password=sudo_password is not None)
    activity.append({"step": "write", "detail": command})
    code, stdout, stderr = await run_command(
        session,
        command,
        input_data=compose_write_input(content, sudo_password if needs_sudo else None),
        timeout=30,
    )
    if code != 0:
        raise ValueError(stderr or stdout or "Could not write file")


async def open_remote_edit(
    session: Session,
    path: str,
    *,
    use_ssh_password: bool,
    sudo_password: str | None,
) -> dict[str, Any]:
    remote = normalize_remote_path(path, session.home)
    password = await resolve_sudo_password(
        session,
        sudo_password=sudo_password,
        use_ssh_password=use_ssh_password,
    )
    writable = await path_is_writable(session, remote)
    needs_sudo = not writable
    read_with_sudo = needs_sudo
    if not read_with_sudo:
        try:
            text_probe, _ = await preview_text(session, remote)
            _ = text_probe
        except Exception:
            read_with_sudo = True
    activity: list[ActivityStep] = []
    backup_path = await create_backup(session, remote, needs_sudo=needs_sudo, sudo_password=password, activity=activity)
    text = await read_remote_text(session, remote, needs_sudo=read_with_sudo, sudo_password=password)
    digest = sha256_text(text)
    edit_id = secrets.token_urlsafe(16)
    item = RemoteEditSession(
        edit_id=edit_id,
        session_id=session.session_id or "",
        path=remote,
        backup_path=backup_path,
        original_sha256=digest,
        needs_sudo=needs_sudo,
        activity=activity,
    )
    activity.append({"step": "command", "detail": f"Prepared UI edit for {remote}"})
    await remote_edit_store.create(item)
    from app.remote_edit_validate import actions_for_path

    actions = actions_for_path(remote)
    return {
        "edit_id": edit_id,
        "path": remote,
        "text": text,
        "sha256": digest,
        "uses_sudo": needs_sudo,
        "activity": activity,
        "can_validate": actions is not None and bool(actions.validate),
        "can_reload": actions is not None and bool(actions.reload),
    }


async def save_remote_edit(
    session: Session,
    edit_id: str,
    content: str,
    *,
    use_ssh_password: bool,
    sudo_password: str | None,
) -> dict[str, Any]:
    item = await remote_edit_store.get(edit_id)
    if item is None or item.session_id != session.session_id:
        raise ValueError("Edit session not found or expired.")
    if item.busy:
        raise ValueError("Save already in progress for this file.")
    if len(content.encode("utf-8")) > PREVIEW_LIMIT:
        raise ValueError("file content exceeds 512 KB")
    item.busy = True
    password = await resolve_sudo_password(
        session,
        sudo_password=sudo_password,
        use_ssh_password=use_ssh_password,
    )
    expected = sha256_text(content)
    activity = list(item.activity)
    try:
        await write_remote_text(
            session,
            item.path,
            content,
            needs_sudo=item.needs_sudo,
            sudo_password=password,
            activity=activity,
        )
        actual = await read_remote_text(
            session,
            item.path,
            needs_sudo=item.needs_sudo,
            sudo_password=password,
        )
        if sha256_text(actual) != expected:
            await restore_backup(
                session,
                item.path,
                item.backup_path,
                needs_sudo=item.needs_sudo,
                sudo_password=password,
            )
            raise ValueError("Save verification failed — restored backup.")
        item.activity = activity
        return {
            "ok": True,
            "message": f"Saved {item.path}",
            "path": item.path,
            "sha256": expected,
            "activity": activity,
        }
    finally:
        item.busy = False


async def validate_remote_edit(
    session: Session,
    edit_id: str,
    *,
    use_ssh_password: bool,
    sudo_password: str | None,
) -> dict[str, Any]:
    item = await remote_edit_store.get(edit_id)
    if item is None or item.session_id != session.session_id:
        raise ValueError("Edit session not found or expired.")
    password = await resolve_sudo_password(
        session,
        sudo_password=sudo_password,
        use_ssh_password=use_ssh_password,
    )
    wrap = sudo_prefix(password is not None) if item.needs_sudo else ""
    ok, detail, log = await validate_path(
        session,
        item.path,
        sudo_wrap=wrap,
        sudo_password=password,
    )
    return {"ok": ok, "detail": detail, "log": log}


async def reload_remote_edit(
    session: Session,
    edit_id: str,
    *,
    use_ssh_password: bool,
    sudo_password: str | None,
) -> dict[str, Any]:
    item = await remote_edit_store.get(edit_id)
    if item is None or item.session_id != session.session_id:
        raise ValueError("Edit session not found or expired.")
    password = await resolve_sudo_password(
        session,
        sudo_password=sudo_password,
        use_ssh_password=use_ssh_password,
    )
    wrap = sudo_prefix(password is not None) if item.needs_sudo else ""
    ok, detail, log = await reload_path(
        session,
        item.path,
        sudo_wrap=wrap,
        sudo_password=password,
    )
    return {"ok": ok, "detail": detail, "log": log}


async def restore_remote_edit(
    session: Session,
    edit_id: str,
    *,
    use_ssh_password: bool,
    sudo_password: str | None,
) -> dict[str, Any]:
    item = await remote_edit_store.get(edit_id)
    if item is None or item.session_id != session.session_id:
        raise ValueError("Edit session not found or expired.")
    password = await resolve_sudo_password(
        session,
        sudo_password=sudo_password,
        use_ssh_password=use_ssh_password,
    )
    await restore_backup(
        session,
        item.path,
        item.backup_path,
        needs_sudo=item.needs_sudo,
        sudo_password=password,
    )
    text = await read_remote_text(session, item.path, needs_sudo=item.needs_sudo, sudo_password=password)
    return {"ok": True, "message": "Restored backup", "text": text, "sha256": sha256_text(text)}


async def close_remote_edit(edit_id: str, session_id: str) -> None:
    item = await remote_edit_store.get(edit_id)
    if item and item.session_id == session_id:
        await remote_edit_store.remove(edit_id)
