"""Fixed validate/reload commands for common config paths."""

from __future__ import annotations

import re
import shlex
from dataclasses import dataclass

from app.session_store import Session
from app.ssh_service import run_command


@dataclass(frozen=True)
class ServiceActions:
    validate: tuple[str, ...]
    reload: tuple[str, ...]


_RULES: tuple[tuple[re.Pattern[str], ServiceActions], ...] = (
    (
        re.compile(r"^/etc/nginx/.*\.conf$"),
        ServiceActions(
            validate=("nginx -t",),
            reload=("systemctl reload nginx", "service nginx reload"),
        ),
    ),
    (
        re.compile(r"^/etc/ssh/sshd_config$"),
        ServiceActions(
            validate=("sshd -t", "/usr/sbin/sshd -t"),
            reload=("systemctl reload ssh", "systemctl reload sshd", "service ssh reload"),
        ),
    ),
    (
        re.compile(r"^/etc/cron\.(d|tab)/"),
        ServiceActions(
            validate=("crontab -l >/dev/null 2>&1 || true",),
            reload=(),
        ),
    ),
    (
        re.compile(r"crontab$"),
        ServiceActions(
            validate=("crontab -l >/dev/null 2>&1 || true",),
            reload=(),
        ),
    ),
)


def actions_for_path(path: str) -> ServiceActions | None:
    for pattern, actions in _RULES:
        if pattern.search(path):
            return actions
    if path.endswith("nginx.conf"):
        return _RULES[0][1]
    return None


async def run_first_success(
    session: Session,
    commands: tuple[str, ...],
    *,
    sudo_wrap: str,
    sudo_password: str | None,
) -> tuple[bool, str]:
    last = ""
    for command in commands:
        if sudo_wrap:
            wrapped = f"{sudo_wrap} -- sh -c {shlex.quote(command)}"
            stdin = (sudo_password + "\n").encode() if sudo_password else None
        else:
            wrapped = command
            stdin = None
        code, stdout, stderr = await run_command(session, wrapped, input_data=stdin, timeout=45)
        last = (stdout or stderr).strip() or command
        if code == 0:
            return True, last
    return False, last


async def validate_path(
    session: Session,
    path: str,
    *,
    sudo_wrap: str,
    sudo_password: str | None,
) -> tuple[bool, str, list[str]]:
    actions = actions_for_path(path)
    if actions is None:
        return True, "No validator configured for this path.", []
    log: list[str] = []
    ok, detail = await run_first_success(
        session,
        actions.validate,
        sudo_wrap=sudo_wrap,
        sudo_password=sudo_password,
    )
    log.append(f"validate: {detail}")
    return ok, detail, log


async def reload_path(
    session: Session,
    path: str,
    *,
    sudo_wrap: str,
    sudo_password: str | None,
) -> tuple[bool, str, list[str]]:
    actions = actions_for_path(path)
    if actions is None or not actions.reload:
        return True, "No reload step for this path.", []
    log: list[str] = []
    ok, detail = await run_first_success(
        session,
        actions.reload,
        sudo_wrap=sudo_wrap,
        sudo_password=sudo_password,
    )
    log.append(f"reload: {detail}")
    return ok, detail, log
