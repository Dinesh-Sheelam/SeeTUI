"""SSH connect, SFTP helpers, and quoted remote command execution."""

from __future__ import annotations

import asyncio
import posixpath
import shlex
import stat
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import asyncssh

from app import platform
from app.schemas import FileEntry
from app.session_store import Session, new_session_id


PREVIEW_LIMIT = 512 * 1024
SFTP_CHUNK = 64 * 1024


def format_connect_error(exc: Exception) -> str:
    """Turn low-level socket errors into actionable connect messages."""
    text = str(exc)
    errno = getattr(exc, "errno", None)
    winerror = getattr(exc, "winerror", None)
    if platform.is_windows():
        return _format_windows_connect_error(text, errno, winerror)
    if errno == 1 or "Operation not permitted" in text:
        return (
            "macOS blocked the outbound TCP connection (Operation not permitted). "
            "VPN being connected does not fix this — the SeeTUI process needs permission to open sockets. "
            "Try: run `./run.sh` from Terminal.app; allow Python in System Settings → Network → Firewall; "
            "check VPN/security tools (Little Snitch, etc.) for a block on Python/uvicorn; "
            "confirm `ssh` to this host works in Terminal first."
        )
    if errno in {51, 65} or "Network is unreachable" in text or "No route to host" in text:
        return f"Network unreachable — VPN may not be routing this host: {text}"
    if errno == 61 or "Connection refused" in text:
        return f"Connection refused on port — SSH may not be running there: {text}"
    if errno == 60 or "timed out" in text.lower():
        return f"Connection timed out — host may be offline or blocked by firewall: {text}"
    return text


def _format_windows_connect_error(text: str, errno: object, winerror: object) -> str:
    code = winerror if isinstance(winerror, int) else errno
    if code == 10013 or errno == 10013 or "Operation not permitted" in text or "access permissions" in text.lower():
        return (
            "Windows blocked the outbound TCP connection. "
            "Allow Python through Windows Security → Firewall & network protection, "
            "and confirm `ssh` to this host works in PowerShell. "
            "Start SeeTUI with .\\run.ps1."
        )
    if code == 10061 or "Connection refused" in text or "actively refused" in text:
        return f"Connection refused on port — SSH may not be running there: {text}"
    if code == 10060 or "timed out" in text.lower():
        return f"Connection timed out — host may be offline or blocked by firewall: {text}"
    if code in {10051, 10065} or "Network is unreachable" in text or "No route to host" in text:
        return f"Network unreachable — VPN may not be routing this host: {text}"
    return text


class ProgressClient(asyncssh.SSHClient):
    """Reports handshake and host-key fingerprint to the connect stream."""

    def __init__(self) -> None:
        self.fingerprint = ""
        self.handshake_event = asyncio.Event()
        self.peer_host = ""

    def connection_made(self, conn: asyncssh.SSHClientConnection) -> None:
        try:
            peer = conn.get_extra_info("peername")
            if peer:
                self.peer_host = str(peer[0])
        except Exception:
            pass
        self.handshake_event.set()

    def validate_host_public_key(
        self,
        host: str,
        addr: str,
        port: int,
        key: asyncssh.SSHKey,
    ) -> bool:
        try:
            self.fingerprint = key.get_fingerprint()
        except Exception:
            self.fingerprint = ""
        return True


def expand_key_path(key_path: str) -> Path:
    return Path(key_path).expanduser().resolve()


def key_mode_bits(path: Path) -> int:
    return path.stat().st_mode & 0o777


def key_is_group_or_world_accessible(path: Path) -> bool:
    """True when OpenSSH would refuse this private key for loose permissions."""
    if platform.is_windows():
        from app.win_acl import dacl_is_too_open

        return dacl_is_too_open(path)
    return bool(key_mode_bits(path) & 0o077)


def key_permission_message(path: Path) -> str:
    if platform.is_windows():
        return (
            "This private key is readable by other Windows accounts. "
            "OpenSSH only allows your user, Administrators, and SYSTEM."
        )
    return f"Key permissions are too open ({oct(key_mode_bits(path))}). OpenSSH requires 600."


def chmod_command(path: Path) -> str:
    if platform.is_windows():
        from app.win_acl import repair_command

        return repair_command(path)
    return f"chmod 600 {path}"


def looks_like_private_key(path: Path) -> bool:
    suffix = path.suffix.lower()
    if suffix in {".pem", ".key"} or path.name.startswith("id_"):
        return True
    try:
        head = path.read_text(encoding="utf-8", errors="replace")[:200]
    except OSError:
        return False
    return "PRIVATE KEY" in head


def apply_key_chmod(key_path: str) -> dict[str, str]:
    """Set a local private key to 0600. Never takes a raw mode from the client."""
    resolved = expand_key_path(key_path)
    if not resolved.is_file() or resolved.is_symlink():
        raise ValueError("key path must be a regular file")
    if not looks_like_private_key(resolved):
        raise ValueError("file does not look like a private key")
    if platform.is_windows():
        from app.win_acl import protect_private

        protect_private(resolved)
        mode = "user-only"
    else:
        resolved.chmod(0o600)
        mode = oct(key_mode_bits(resolved))
    return {
        "path": str(resolved),
        "mode": mode,
        "command": chmod_command(resolved),
    }


def file_kind(name: str, is_dir: bool, is_symlink: bool) -> str:
    if is_dir:
        return "folder"
    if is_symlink:
        return "symlink"
    ext = posixpath.splitext(name)[1].lower()
    mapping = {
        ".zip": "archive",
        ".tar": "archive",
        ".gz": "archive",
        ".tgz": "archive",
        ".bz2": "archive",
        ".xz": "archive",
        ".sh": "script",
        ".py": "script",
        ".js": "script",
        ".md": "text",
        ".txt": "text",
        ".log": "text",
        ".json": "text",
        ".yml": "text",
        ".yaml": "text",
        ".conf": "text",
        ".cfg": "text",
        ".pem": "key",
        ".png": "image",
        ".jpg": "image",
        ".jpeg": "image",
        ".gif": "image",
        ".svg": "image",
        ".pdf": "document",
    }
    return mapping.get(ext, "file")


def format_permissions(mode: int, is_dir: bool, is_symlink: bool) -> str:
    if is_symlink:
        prefix = "l"
    elif is_dir:
        prefix = "d"
    else:
        prefix = "-"
    flags = "rwxrwxrwx"
    bits = [(mode >> shift) & 1 for shift in range(8, -1, -1)]
    body = "".join(flag if bit else "-" for flag, bit in zip(flags, bits, strict=True))
    return prefix + body


def normalize_remote_path(path: str, home: str) -> str:
    raw = (path or "").strip() or home
    if raw.startswith("~"):
        raw = home + raw[1:]
    if not raw.startswith("/"):
        raw = posixpath.join(home, raw)
    normalized = posixpath.normpath(raw)
    if not normalized.startswith("/"):
        raise ValueError("invalid path")
    return normalized


def _remote_input(input_data: bytes | None) -> str | None:
    """Turn stdin bytes into text for asyncssh's `input` argument.

    `stdin=` is a file, path, or descriptor. Passing the sudo password as
    bytes makes asyncssh call `fileno()` on it.
    """
    if not input_data:
        return None
    return input_data.decode("utf-8")


async def run_command(
    session: Session,
    command: str,
    *,
    timeout: float = 60,
    input_data: bytes | None = None,
) -> tuple[int, str, str]:
    session.log_activity(command)
    try:
        result = await session.conn.run(
            command,
            check=False,
            timeout=timeout,
            input=_remote_input(input_data),
        )
    except asyncssh.TimeoutError:
        session.log_activity(command, "timed out", ok=False)
        return 124, "", "command timed out"
    except Exception as exc:
        session.log_activity(command, str(exc), ok=False)
        return 1, "", str(exc)
    stdout = result.stdout if isinstance(result.stdout, str) else (result.stdout or b"").decode("utf-8", "replace")
    stderr = result.stderr if isinstance(result.stderr, str) else (result.stderr or b"").decode("utf-8", "replace")
    code = int(result.exit_status or 0)
    session.log_activity(command, (stdout or stderr)[:400], ok=code == 0)
    return code, stdout, stderr


async def stream_command(
    session: Session,
    command: str,
    *,
    timeout: float = 300,
    input_data: bytes | None = None,
    exit_codes: list[int] | None = None,
) -> AsyncIterator[str]:
    session.log_activity(command)
    process = await session.conn.create_process(
        command,
        input=_remote_input(input_data),
        encoding="utf-8",
    )
    code = 1
    try:
        try:
            async with asyncio.timeout(timeout):
                async for line in process.stdout:
                    yield line
                remaining = await process.stderr.read()
                if remaining:
                    yield remaining
                await process.wait()
                code = int(getattr(process, "exit_status", 0) or 0)
        except TimeoutError:
            process.terminate()
            code = 124
            yield "command timed out\n"
    finally:
        if exit_codes is not None:
            exit_codes.append(code)
        try:
            process.close()
        except Exception:
            pass


def _attrs_to_entry(name: str, path: str, attrs: asyncssh.SFTPAttrs) -> FileEntry:
    mode = attrs.permissions or 0
    is_dir = bool(stat.S_ISDIR(mode))
    is_symlink = bool(stat.S_ISLNK(mode))
    return FileEntry(
        name=name,
        path=path,
        is_dir=is_dir,
        is_symlink=is_symlink,
        size=int(attrs.size or 0),
        mtime=float(attrs.mtime or 0),
        permissions=format_permissions(mode, is_dir, is_symlink),
        kind=file_kind(name, is_dir, is_symlink),
    )


async def list_dir(session: Session, path: str) -> list[FileEntry]:
    remote = normalize_remote_path(path, session.home)
    entries: list[FileEntry] = []
    for item in await session.sftp.readdir(remote):
        name = item.filename
        if name in {".", ".."}:
            continue
        child = posixpath.join(remote, name)
        attrs = item.attrs
        if attrs.permissions is None:
            try:
                attrs = await session.sftp.lstat(child)
            except Exception:
                continue
        entries.append(_attrs_to_entry(name, child, attrs))
    entries.sort(key=lambda entry: (not entry.is_dir, entry.name.lower()))
    return entries


async def mkdir(session: Session, path: str) -> str:
    remote = normalize_remote_path(path, session.home)
    await session.sftp.mkdir(remote)
    session.log_activity(f"mkdir {shlex.quote(remote)}")
    return remote


async def rename(session: Session, src: str, dest: str) -> tuple[str, str]:
    src_path = normalize_remote_path(src, session.home)
    dest_path = normalize_remote_path(dest, session.home)
    await session.sftp.rename(src_path, dest_path)
    session.log_activity(f"mv {shlex.quote(src_path)} {shlex.quote(dest_path)}")
    return src_path, dest_path


async def delete(session: Session, path: str, recursive: bool) -> str:
    remote = normalize_remote_path(path, session.home)
    attrs = await session.sftp.lstat(remote)
    is_dir = bool(stat.S_ISDIR(attrs.permissions or 0))
    if is_dir:
        if not recursive:
            raise ValueError("folder delete requires confirmation")
        command = f"rm -rf -- {shlex.quote(remote)}"
        code, _, stderr = await run_command(session, command)
        if code != 0:
            raise RuntimeError(stderr or "delete failed")
        return remote
    await session.sftp.remove(remote)
    session.log_activity(f"rm {shlex.quote(remote)}")
    return remote


async def write_text(session: Session, path: str, content: str) -> str:
    remote = normalize_remote_path(path, session.home)
    data = content.encode("utf-8")
    if len(data) > PREVIEW_LIMIT:
        raise ValueError("file content exceeds 512 KB")
    async with session.sftp.open(remote, "wb") as handle:
        await handle.write(data)
    session.log_activity(f"write {remote}")
    return remote


async def create_empty_file(session: Session, path: str) -> str:
    remote = normalize_remote_path(path, session.home)
    async with session.sftp.open(remote, "wb") as handle:
        await handle.write(b"")
    session.log_activity(f"touch {remote}")
    return remote


async def preview_text(session: Session, path: str) -> tuple[str, str]:
    remote = normalize_remote_path(path, session.home)
    attrs = await session.sftp.lstat(remote)
    size = int(attrs.size or 0)
    if size > PREVIEW_LIMIT:
        raise ValueError("file is larger than 512 KB")
    async with session.sftp.open(remote, "rb") as handle:
        data = await handle.read(PREVIEW_LIMIT)
    text = data.decode("utf-8", "replace")
    return remote, text


async def connect_stream(payload: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
    """Yield NDJSON-ready events while establishing an SSH session."""
    host: str = payload["host"]
    port: int = payload["port"]
    username: str = payload["username"]
    auth_method: str = payload["auth_method"]
    password: str | None = payload.get("password")
    key_path: str | None = payload.get("key_path")
    key_content: str | None = payload.get("key_content")
    passphrase: str | None = payload.get("passphrase")

    yield {"step": "resolve", "status": "running", "message": f"Resolving {host}"}
    try:
        infos = await asyncio.get_event_loop().getaddrinfo(host, port, family=0, type=1)
        resolved = infos[0][4][0] if infos else host
    except OSError as exc:
        yield {"step": "resolve", "status": "error", "message": format_connect_error(exc)}
        return
    yield {"step": "resolve", "status": "ok", "message": f"Resolved to {resolved}"}

    yield {"step": "tcp", "status": "running", "message": f"Opening TCP {resolved}:{port}"}
    try:
        opener = asyncio.open_connection(resolved, port)
        reader, writer = await asyncio.wait_for(opener, timeout=12)
        writer.close()
        await writer.wait_closed()
    except Exception as exc:
        yield {"step": "tcp", "status": "error", "message": format_connect_error(exc)}
        return
    yield {"step": "tcp", "status": "ok", "message": "TCP connection open"}

    yield {"step": "handshake", "status": "running", "message": "Starting SSH handshake"}
    client = ProgressClient()
    connect_kwargs: dict[str, Any] = {
        "host": host,
        "port": port,
        "username": username,
        "known_hosts": None,
        "client_factory": lambda: client,
        "connect_timeout": 20,
    }
    if auth_method == "password":
        if not password:
            yield {"step": "auth", "status": "error", "message": "Password is required"}
            return
        connect_kwargs["password"] = password
        connect_kwargs["client_keys"] = None
    elif auth_method == "key_path":
        if not key_path:
            yield {"step": "auth", "status": "error", "message": "Key path is required"}
            return
        try:
            resolved_key = expand_key_path(key_path)
            if not resolved_key.is_file():
                raise FileNotFoundError(str(resolved_key))
            connect_kwargs["client_keys"] = [str(resolved_key)]
        except Exception as exc:
            yield {"step": "auth", "status": "error", "message": f"Cannot read key: {exc}"}
            return
        if key_is_group_or_world_accessible(resolved_key):
            command = chmod_command(resolved_key)
            yield {
                "step": "auth",
                "status": "error",
                "code": "key_permissions",
                "message": key_permission_message(resolved_key),
                "key_path": str(resolved_key),
                "chmod_command": command,
            }
            return
        connect_kwargs["passphrase"] = passphrase
        connect_kwargs["password"] = password
    elif auth_method == "key_content":
        if not key_content:
            yield {"step": "auth", "status": "error", "message": "Key content is required"}
            return
        try:
            connect_kwargs["client_keys"] = [asyncssh.import_private_key(key_content, passphrase)]
        except Exception as exc:
            yield {"step": "auth", "status": "error", "message": f"Cannot parse PEM: {exc}"}
            return
        connect_kwargs["password"] = None
    else:
        yield {"step": "auth", "status": "error", "message": "Unknown auth method"}
        return

    try:
        conn = await asyncio.wait_for(
            asyncssh.connect(**connect_kwargs),
            timeout=25,
        )
    except asyncssh.PermissionDenied:
        yield {"step": "handshake", "status": "ok", "message": "SSH handshake complete"}
        yield {"step": "auth", "status": "error", "message": "Authentication failed"}
        return
    except asyncssh.DisconnectError as exc:
        yield {"step": "handshake", "status": "error", "message": f"SSH handshake failed: {exc}"}
        return
    except Exception as exc:
        message = str(exc)
        if "Authentication" in message or "auth" in message.lower():
            yield {"step": "handshake", "status": "ok", "message": "SSH handshake complete"}
            yield {"step": "auth", "status": "error", "message": "Authentication failed"}
            return
        yield {"step": "handshake", "status": "error", "message": format_connect_error(exc)}
        return

    fingerprint = client.fingerprint
    if not fingerprint:
        try:
            server_key = conn.get_server_host_key()
            if server_key:
                fingerprint = server_key.get_fingerprint()
        except Exception:
            fingerprint = ""
    yield {
        "step": "handshake",
        "status": "ok",
        "message": "SSH handshake complete",
        "fingerprint": fingerprint,
    }
    yield {"step": "auth", "status": "ok", "message": f"Authenticated as {username}"}

    yield {"step": "sftp", "status": "running", "message": "Opening SFTP channel"}
    try:
        sftp = await conn.start_sftp_client()
    except Exception as exc:
        conn.close()
        yield {"step": "sftp", "status": "error", "message": f"SFTP failed: {exc}"}
        return
    yield {"step": "sftp", "status": "ok", "message": "SFTP channel ready"}

    yield {"step": "info", "status": "running", "message": "Reading server info"}
    try:
        uname_result = await conn.run("uname -srm", check=False)
        who_result = await conn.run("whoami", check=False)
        home_result = await conn.run("printf %s \"$HOME\"", check=False)
        uname = (uname_result.stdout or "").strip() if isinstance(uname_result.stdout, str) else ""
        who = (who_result.stdout or "").strip() if isinstance(who_result.stdout, str) else username
        home = (home_result.stdout or "").strip() if isinstance(home_result.stdout, str) else ""
        if not home:
            home = f"/home/{username}" if username != "root" else "/root"
    except Exception as exc:
        await sftp.exit()
        conn.close()
        yield {"step": "info", "status": "error", "message": f"Could not read server info: {exc}"}
        return
    yield {"step": "info", "status": "ok", "message": f"{who} · {uname}", "uname": uname, "home": home}

    session = Session(
        session_id=new_session_id(),
        host=host,
        port=port,
        username=username,
        conn=conn,
        sftp=sftp,
        home=home,
        fingerprint=fingerprint,
        uname=uname,
        auth_method=auth_method,
        password=password,
        key_path=key_path,
        key_content=key_content,
        passphrase=passphrase,
    )
    from app.session_store import store

    await store.add(session)
    yield {
        "step": "ready",
        "status": "ok",
        "message": "Ready",
        "session_id": session.session_id,
        "home": home,
        "uname": uname,
        "username": username,
        "host": host,
        "port": port,
        "fingerprint": fingerprint,
    }


def quoted_join(paths: list[str]) -> str:
    return " ".join(shlex.quote(path) for path in paths)
