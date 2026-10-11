"""Sudo password handling — password never appears on a command line."""

from __future__ import annotations

from app.session_store import Session
from app.ssh_service import run_command


async def sudo_available(session: Session) -> bool:
    code, _, _ = await run_command(session, "sudo -n true", timeout=8)
    return code == 0


async def resolve_sudo_password(
    session: Session,
    *,
    sudo_password: str | None,
    use_ssh_password: bool,
) -> str | None:
    if await sudo_available(session):
        return None
    if use_ssh_password and session.password:
        session.sudo_password = session.password
        return session.password
    if sudo_password:
        session.sudo_password = sudo_password
        return sudo_password
    if session.sudo_password:
        return session.sudo_password
    return None


def sudo_prefix(needs_password: bool) -> str:
    return "sudo -S -p ''" if needs_password else "sudo -n"
