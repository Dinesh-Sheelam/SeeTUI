"""Open a remote path in a local VS Code-compatible editor.

The editor runs on this computer and connects with Remote SSH. Nothing is
written to the remote host.
"""

from __future__ import annotations

import os
import posixpath
import re
import shutil
import subprocess
from collections.abc import Callable
from pathlib import Path
from typing import Any
from urllib.parse import quote

from app import platform
from app.session_store import Session
from app.ssh_service import expand_key_path

_ALIAS_RE = re.compile(r"[^A-Za-z0-9.-]+")
_HOST_RE = re.compile(r"^[A-Za-z0-9._:-]{1,253}$")
_USER_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
_BEGIN = "# BEGIN SeeTUI "
_END = "# END SeeTUI "
_HOSTS_NAME = "SeeTUI_hosts"
_LEGACY_HOSTS_NAMES = ("seetui_hosts", "VSC_hosts")
_KEYS_DIR = "SeeTUI-keys"
_MANAGED_PREFIXES = ("SeeTUI-", "seetui-", "VSC-")

_CODE_CANDIDATES = (
    "/usr/local/bin/code",
    "/opt/homebrew/bin/code",
    "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
)
_CURSOR_CANDIDATES = (
    "/usr/local/bin/cursor",
    "/opt/homebrew/bin/cursor",
    "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
)
_ANTIGRAVITY_CANDIDATES = (
    "/usr/local/bin/antigravity",
    "/opt/homebrew/bin/antigravity",
    "/usr/local/bin/antigravity-ide",
    "/opt/homebrew/bin/antigravity-ide",
    "/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity",
    "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide",
)
_KIRO_CANDIDATES = (
    "/usr/local/bin/kiro",
    "/opt/homebrew/bin/kiro",
    "/Applications/Kiro.app/Contents/Resources/app/bin/kiro",
    "/usr/local/bin/kiro-ide",
    "/opt/homebrew/bin/kiro-ide",
    "/Applications/Kiro.app/Contents/Resources/app/bin/kiro-ide",
)
_WINDSURF_CANDIDATES = (
    "/usr/local/bin/windsurf",
    "/opt/homebrew/bin/windsurf",
    "/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf",
    "/Applications/Windsurf - Next.app/Contents/Resources/app/bin/windsurf",
)

EDITOR_ORDER = ("code", "cursor", "antigravity", "kiro", "windsurf")
_LABELS = {
    "code": "VS Code",
    "cursor": "Cursor",
    "antigravity": "Antigravity",
    "kiro": "Kiro",
    "windsurf": "Windsurf",
}
_CANDIDATES = {
    "code": _CODE_CANDIDATES,
    "cursor": _CURSOR_CANDIDATES,
    "antigravity": _ANTIGRAVITY_CANDIDATES,
    "kiro": _KIRO_CANDIDATES,
    "windsurf": _WINDSURF_CANDIDATES,
}
_COMMANDS = {
    "code": ("code",),
    "cursor": ("cursor",),
    "antigravity": ("antigravity", "antigravity-ide"),
    "kiro": ("kiro", "kiro-ide"),
    "windsurf": ("windsurf",),
}
_SKIP_BASENAMES = {
    "kiro": frozenset({"kiro-cli", "kiro-cli.exe", "kiro-cli.cmd", "kiro-cli.bat"}),
}
_WIN_ABS = re.compile(r"^[A-Za-z]:[\\/]")
_WIN_CLI = {
    "code": (
        ("LOCALAPPDATA", "Programs", "Microsoft VS Code", "bin", "code.cmd"),
        ("LOCALAPPDATA", "Programs", "Microsoft VS Code", "Code.exe"),
        ("ProgramFiles", "Microsoft VS Code", "bin", "code.cmd"),
        ("ProgramFiles", "Microsoft VS Code", "Code.exe"),
    ),
    "cursor": (
        ("LOCALAPPDATA", "Programs", "cursor", "resources", "app", "bin", "cursor.cmd"),
        ("LOCALAPPDATA", "Programs", "cursor", "Cursor.exe"),
        ("LOCALAPPDATA", "Programs", "Cursor", "resources", "app", "bin", "cursor.cmd"),
        ("LOCALAPPDATA", "Programs", "Cursor", "Cursor.exe"),
    ),
    "antigravity": (
        ("LOCALAPPDATA", "Programs", "Antigravity", "resources", "app", "bin", "antigravity.cmd"),
        ("LOCALAPPDATA", "Programs", "Antigravity", "Antigravity.exe"),
        ("ProgramFiles", "Antigravity", "bin", "antigravity.cmd"),
        ("LOCALAPPDATA", "Programs", "Antigravity IDE", "resources", "app", "bin", "antigravity-ide.cmd"),
        ("LOCALAPPDATA", "Programs", "Antigravity IDE", "Antigravity IDE.exe"),
        ("ProgramFiles", "Antigravity IDE", "bin", "antigravity-ide.cmd"),
    ),
    "kiro": (
        ("LOCALAPPDATA", "Programs", "Kiro", "resources", "app", "bin", "kiro.cmd"),
        ("LOCALAPPDATA", "Programs", "Kiro", "Kiro.exe"),
        ("LOCALAPPDATA", "Programs", "Kiro", "resources", "app", "bin", "kiro-ide.cmd"),
        ("ProgramFiles", "Kiro", "bin", "kiro.cmd"),
    ),
    "windsurf": (
        ("LOCALAPPDATA", "Programs", "Windsurf", "resources", "app", "bin", "windsurf.cmd"),
        ("LOCALAPPDATA", "Programs", "Windsurf", "Windsurf.exe"),
        ("ProgramFiles", "Windsurf", "bin", "windsurf.cmd"),
    ),
}


def safe_remote_path(path: str) -> str | None:
    """Absolute remote path safe to place in a vscode-remote URI."""
    if not path.startswith("/") or path.startswith("//"):
        return None
    if any(char in path for char in ("\n", "\r", "\x00", "\x1b", "\x1f")):
        return None
    normalized = posixpath.normpath(path)
    if not normalized.startswith("/") or normalized.startswith("//"):
        return None
    return normalized


def _executable(path: str) -> str | None:
    if not path:
        return None
    candidate = Path(path)
    if not candidate.is_file():
        return None
    if os.name == "nt":
        if candidate.suffix.lower() in {".exe", ".cmd", ".bat", ".com"}:
            return str(candidate)
        return str(candidate) if os.access(candidate, os.X_OK) else None
    if os.access(candidate, os.X_OK):
        return str(candidate)
    return None


def _windows_candidates(name: str) -> tuple[str, ...]:
    found: list[str] = []
    for env_name, *parts in _WIN_CLI.get(name, ()):
        root = os.environ.get(env_name, "")
        if root:
            found.append(os.path.join(root, *parts))
    return tuple(found)


def editor_candidates(name: str) -> tuple[str, ...]:
    """Known install paths on macOS, Linux, and Windows."""
    return _CANDIDATES.get(name, ()) + _windows_candidates(name)


def _cli_names(name: str) -> tuple[str, ...]:
    if os.name != "nt":
        return (name,)
    return (name, f"{name}.cmd", f"{name}.exe")


def find_cli(
    name: str,
    candidates: tuple[str, ...],
    *,
    skip_basenames: frozenset[str] | None = None,
) -> str | None:
    skipped = skip_basenames or frozenset()
    for cli_name in _cli_names(name):
        found = shutil.which(cli_name)
        if found and Path(found).name not in skipped:
            return found
    for candidate in candidates:
        resolved = _executable(candidate)
        if resolved and Path(resolved).name not in skipped:
            return resolved
    home_bins = [Path.home() / ".local" / "bin" / name]
    if os.name == "nt":
        home_bins.extend(
            Path.home() / "AppData" / "Local" / "Programs" / f"{name}{suffix}"
            for suffix in (".cmd", ".exe")
        )
        home_bins.extend(Path.home() / ".local" / "bin" / extra for extra in _cli_names(name)[1:])
    for home_bin in home_bins:
        resolved = _executable(str(home_bin))
        if resolved and Path(resolved).name not in skipped:
            return resolved
    return None


def choose_editor(prefer: str) -> tuple[str, str] | None:
    """Pick the requested editor CLI. No silent fallback to another app."""
    commands = _COMMANDS.get(prefer)
    if commands is None:
        return None
    skipped = _SKIP_BASENAMES.get(prefer)
    candidates = editor_candidates(prefer)
    for command in commands:
        found = find_cli(command, candidates, skip_basenames=skipped)
        if found:
            return prefer, found
    return None


def editor_label(name: str) -> str:
    return _LABELS.get(name, name)


def missing_editor_message(name: str | None = None) -> str:
    if name and name in _LABELS:
        return f"{editor_label(name)} is not installed on this computer."
    return "No supported editor is installed on this computer."


def editor_status() -> dict[str, Any]:
    """Which local editors can open a remote folder."""
    editors: list[dict[str, Any]] = []
    any_available = False
    for name in EDITOR_ORDER:
        available = choose_editor(name) is not None
        any_available = any_available or available
        editors.append({"id": name, "label": editor_label(name), "available": available})
    return {"available": any_available, "editors": editors}


def host_alias(username: str, host: str, port: int) -> str:
    raw = f"SeeTUI-{username}-{host}-{port}"
    alias = _ALIAS_RE.sub("-", raw).strip("-.")
    if not alias or not alias[0].isalnum():
        raise ValueError("invalid ssh alias")
    return alias[:200]


def remote_uri(alias: str, path: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.-]{0,200}", alias):
        raise ValueError("invalid ssh alias")
    safe = safe_remote_path(path)
    if safe is None:
        raise ValueError("invalid path")
    return "vscode-remote://ssh-remote+" + quote(alias, safe=".-") + quote(safe, safe="/")


def editor_argv(bin_path: str, kind: str, alias: str, path: str) -> list[str]:
    """Open a remote path in a new window so an existing root/home tab is not reused."""
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.-]{0,200}", alias):
        raise ValueError("invalid ssh alias")
    cleaned = safe_remote_path(path)
    if cleaned is None:
        raise ValueError("invalid path")
    if kind == "dir":
        return [bin_path, "--new-window", "--remote", f"ssh-remote+{alias}", cleaned]
    return [bin_path, "--new-window", "--file-uri", remote_uri(alias, cleaned)]


def _ssh_token(value: str, pattern: re.Pattern[str]) -> str:
    if not pattern.fullmatch(value):
        raise ValueError("invalid ssh config value")
    return value


def _is_absolute_identity(path: str) -> bool:
    return path.startswith("/") or bool(_WIN_ABS.match(path))


def _config_path(path: str) -> str:
    if any(char in path for char in "\n\r\""):
        raise ValueError("invalid identity file")
    normalized = path.replace("\\", "/")
    if not _is_absolute_identity(normalized):
        raise ValueError("identity file must be absolute")
    allowed = r"[A-Za-z0-9_./:+@ -]+" if " " in normalized else r"[A-Za-z0-9_./:+@-]+"
    if not re.fullmatch(allowed, normalized):
        raise ValueError("invalid identity file")
    if " " in normalized:
        return f'"{normalized}"'
    return normalized


def render_host_block(
    alias: str,
    host: str,
    username: str,
    port: int,
    identity: str | None,
) -> str:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.-]{0,200}", alias):
        raise ValueError("invalid ssh alias")
    if not 1 <= port <= 65535:
        raise ValueError("invalid port")
    lines = [
        f"{_BEGIN}{alias}",
        f"Host {alias}",
        f"  HostName {_ssh_token(host, _HOST_RE)}",
        f"  User {_ssh_token(username, _USER_RE)}",
        f"  Port {port}",
    ]
    if identity:
        lines.append(f"  IdentityFile {_config_path(identity)}")
        lines.append("  IdentitiesOnly yes")
    lines.append(f"{_END} {alias}")
    return "\n".join(lines) + "\n"


def upsert_host_block(existing: str, block: str, alias: str) -> str:
    pattern = re.compile(
        rf"{re.escape(_BEGIN + alias)}\n.*?{re.escape(_END + ' ' + alias)}\n",
        re.S,
    )
    if pattern.search(existing):
        return pattern.sub(block, existing, count=1)
    if existing and not existing.endswith("\n"):
        existing += "\n"
    return existing + block


def _blocks(text: str) -> list[tuple[list[str], dict[str, str]]]:
    blocks: list[tuple[list[str], dict[str, str]]] = []
    names: list[str] = []
    values: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        parts = line.split(None, 1)
        key = parts[0]
        rest = parts[1].strip() if len(parts) > 1 else ""
        if key.lower() == "host":
            if names:
                blocks.append((names, values))
            names = rest.split()
            values = {}
            continue
        if names and key.lower() in {"hostname", "user", "port"}:
            values[key.lower()] = rest.strip('"')
    if names:
        blocks.append((names, values))
    return blocks


def find_existing_alias(config_text: str, host: str, username: str, port: int) -> str | None:
    """Reuse an SSH config host that already points at this server."""
    found: list[str] = []
    for names, values in _blocks(config_text):
        if len(names) != 1 or any(char in names[0] for char in "*?!"):
            continue
        pattern = names[0]
        hostname = values.get("hostname", "")
        user = values.get("user", "")
        try:
            block_port = int(values.get("port", "22"))
        except ValueError:
            continue
        name_ok = hostname == host or (not hostname and pattern == host)
        user_ok = not user or user == username
        if name_ok and user_ok and block_port == port:
            found.append(pattern)
    for pattern in found:
        if pattern != host:
            return pattern
    return found[0] if found else None


def _write_private(path: Path, content: str, mode: int) -> None:
    parent = path.parent
    parent_existed = parent.is_dir()
    parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if platform.is_windows():
        from app.win_acl import protect_private

        if not parent_existed:
            protect_private(parent)
        path.write_text(content)
        protect_private(path)
        return
    parent.chmod(0o700)
    path.write_text(content)
    path.chmod(mode)


def default_ssh_dir() -> Path:
    return Path.home() / ".ssh"


def ensure_ssh_alias(
    *,
    host: str,
    port: int,
    username: str,
    key_path: str | None,
    key_content: str | None,
    ssh_dir: Path,
) -> str:
    """Return an SSH config host a local editor can connect with."""
    config_path = ssh_dir / "config"
    hosts_path = ssh_dir / _HOSTS_NAME
    created_ssh_dir = not ssh_dir.is_dir()
    existing_config = config_path.read_text(encoding="utf-8") if config_path.is_file() else ""
    existing_hosts = hosts_path.read_text(encoding="utf-8") if hosts_path.is_file() else ""
    legacy_hosts = "\n".join(
        (ssh_dir / name).read_text(encoding="utf-8")
        for name in _LEGACY_HOSTS_NAMES
        if (ssh_dir / name).is_file()
    )
    known = find_existing_alias(
        "\n".join((existing_config, existing_hosts, legacy_hosts)),
        host,
        username,
        port,
    )
    if known and not known.startswith(_MANAGED_PREFIXES):
        return known

    alias = host_alias(username, host, port)
    identity = _identity_file(
        alias=alias,
        key_path=key_path,
        key_content=key_content,
        ssh_dir=ssh_dir,
    )
    block = render_host_block(alias, host, username, port, identity)
    ssh_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    _write_private(hosts_path, upsert_host_block(existing_hosts, block, alias), 0o600)
    if not re.search(rf"(?m)^[ \t]*Include[ \t]+{re.escape(_HOSTS_NAME)}[ \t]*$", existing_config):
        prefix = f"Include {_HOSTS_NAME}\n"
        _write_private(config_path, prefix + existing_config, 0o600)
    if created_ssh_dir and platform.is_windows():
        from app.win_acl import protect_private

        protect_private(ssh_dir)
    return alias


def _identity_file(
    *,
    alias: str,
    key_path: str | None,
    key_content: str | None,
    ssh_dir: Path,
) -> str | None:
    if key_path:
        resolved = expand_key_path(key_path)
        if resolved.is_file():
            return str(resolved)
        return None
    if not key_content:
        return None
    if len(key_content) > 64 * 1024 or "PRIVATE KEY" not in key_content and "ssh-" not in key_content[:40]:
        return None
    key_file = ssh_dir / _KEYS_DIR / alias
    _write_private(key_file, key_content if key_content.endswith("\n") else key_content + "\n", 0o600)
    return str(key_file)


def launch_editor(argv: list[str]) -> None:
    if not argv or not Path(argv[0]).is_file():
        raise OSError("editor command is not installed")
    command = list(argv)
    kwargs: dict[str, Any] = {
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
    }
    if os.name == "nt":
        if command[0].lower().endswith((".cmd", ".bat")):
            command = [os.environ.get("COMSPEC", "cmd.exe"), "/c", *command]
        kwargs["creationflags"] = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(
            subprocess, "CREATE_NEW_PROCESS_GROUP", 0
        )
    else:
        kwargs["start_new_session"] = True
    subprocess.Popen(command, **kwargs)


def open_remote_directory(
    path: str,
    *,
    editor: str,
    host: str,
    port: int,
    username: str,
    key_path: str | None,
    key_content: str | None,
    kind: str = "dir",
    ssh_dir: Path | None = None,
    launch: Callable[[list[str]], None] | None = None,
) -> dict[str, Any]:
    """Open one remote path. Host details come from the session, not a client host."""
    if kind not in {"dir", "file"}:
        raise ValueError("That path cannot be opened.")
    chosen = choose_editor(editor)
    if chosen is None:
        raise ValueError(missing_editor_message(editor))
    name, bin_path = chosen
    cleaned = safe_remote_path(path)
    if cleaned is None:
        raise ValueError("That path cannot be opened.")
    directory = ssh_dir if ssh_dir is not None else default_ssh_dir()
    opener = launch if launch is not None else launch_editor
    try:
        alias = ensure_ssh_alias(
            host=host,
            port=port,
            username=username,
            key_path=key_path,
            key_content=key_content,
            ssh_dir=directory,
        )
        opener(editor_argv(bin_path, kind, alias, cleaned))
    except OSError as exc:
        raise ValueError(f"Could not open the editor: {exc}") from exc
    return {"ok": True, "message": f"Opened {cleaned} in {editor_label(name)}"}


def open_session_path(
    session: Session,
    *,
    editor: str,
    path: str | None = None,
    kind: str = "dir",
    ssh_dir: Path | None = None,
    launch: Callable[[list[str]], None] | None = None,
) -> dict[str, Any]:
    """Open a remote path. The SSH password is never written to config."""
    target = (path or session.home or "").strip()
    if path:
        if safe_remote_path(path) is None:
            raise ValueError("That path cannot be opened.")
        target = path
    if not target:
        raise ValueError("This session has no home directory to open.")
    return open_remote_directory(
        target,
        editor=editor,
        kind="dir" if not path else kind,
        host=session.host,
        port=session.port,
        username=session.username,
        key_path=session.key_path,
        key_content=session.key_content,
        ssh_dir=ssh_dir,
        launch=launch,
    )
