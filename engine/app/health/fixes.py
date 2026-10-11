"""Whitelisted fix registry. Clients send fix_id + validated inputs only."""

from __future__ import annotations

import re
import shlex
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

DOMAIN_RE = re.compile(r"^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
UNIT_RE = re.compile(r"^[A-Za-z0-9:_.@\\-]+$")
SIZE_RE = re.compile(r"^[0-9]+[KMGTkmgt%]?$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PORT_RE = re.compile(r"^[1-9][0-9]{0,4}$")


class FixValidationError(ValueError):
    pass


def _require(inputs: dict[str, str], key: str, pattern: re.Pattern[str], label: str) -> str:
    value = (inputs.get(key) or "").strip()
    if not value or not pattern.match(value):
        raise FixValidationError(f"invalid {label}")
    if key == "port" and not (1 <= int(value) <= 65535):
        raise FixValidationError("invalid port")
    return value


@dataclass(frozen=True)
class Fix:
    id: str
    title: str
    description: str
    risk: str
    check_id: str
    inputs: list[str] = field(default_factory=list)
    renderer: Callable[[dict[str, str], dict[str, Any]], list[str]] | None = None


def _enable_certbot_timer(_inputs: dict[str, str], _ctx: dict[str, Any]) -> list[str]:
    return ["systemctl enable --now certbot.timer"]


def _renew_certs(_inputs: dict[str, str], _ctx: dict[str, Any]) -> list[str]:
    return ["certbot renew --non-interactive"]


def _issue_cert(inputs: dict[str, str], _ctx: dict[str, Any]) -> list[str]:
    domain = _require(inputs, "domain", DOMAIN_RE, "domain")
    email = _require(inputs, "email", EMAIL_RE, "email")
    return [f"certbot --nginx -d {shlex.quote(domain)} --non-interactive --agree-tos -m {shlex.quote(email)}"]


def _restart_service(inputs: dict[str, str], _ctx: dict[str, Any]) -> list[str]:
    unit = _require(inputs, "unit", UNIT_RE, "unit")
    return [f"systemctl restart {shlex.quote(unit)}"]


def _clear_space(_inputs: dict[str, str], _ctx: dict[str, Any]) -> list[str]:
    return ["journalctl --vacuum-size=200M", "apt-get clean"]


def _set_memory_max(inputs: dict[str, str], _ctx: dict[str, Any]) -> list[str]:
    unit = _require(inputs, "unit", UNIT_RE, "unit")
    memory_max = _require(inputs, "memory_max", SIZE_RE, "memory_max")
    return [f"systemctl set-property {shlex.quote(unit)} MemoryMax={shlex.quote(memory_max)}"]


def _install_caddy(inputs: dict[str, str], _ctx: dict[str, Any]) -> list[str]:
    domain = _require(inputs, "domain", DOMAIN_RE, "domain")
    port = _require(inputs, "port", PORT_RE, "port")
    block = f"{domain} {{\n    reverse_proxy localhost:{port}\n}}\n"
    quoted_block = shlex.quote(block)
    conf = "/etc/caddy/Caddyfile"
    return [
        "apt-get update",
        "apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl",
        (
            "curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key "
            "| gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg"
        ),
        (
            "curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt "
            "| tee /etc/apt/sources.list.d/caddy-stable.list"
        ),
        "apt-get update",
        "apt-get install -y caddy",
        f"cp {shlex.quote(conf)} {shlex.quote(conf)}.bak-$(date +%s) 2>/dev/null || true",
        f"printf %s {quoted_block} > {shlex.quote(conf)}",
        "caddy validate --config /etc/caddy/Caddyfile",
        "systemctl enable --now caddy",
        "systemctl reload caddy",
    ]


def ufw_dead_man_command() -> str:
    # AccuracySec defaults to 1min. On a 90s timer that window can elapse
    # early enough that `ufw disable` runs as soon as `ufw enable` finishes.
    return (
        "systemctl stop SeeTUI-ufw-undo.timer seetui-ufw-undo.timer vsc-ufw-undo.timer VSC-ufw-undo.timer 2>/dev/null || true; "
        "systemd-run --collect --unit=SeeTUI-ufw-undo.timer "
        "--on-active=90s --timer-property=AccuracySec=1us "
        "--description=SeeTUI-ufw-dead-man "
        "/usr/sbin/ufw disable"
    )


def cancel_ufw_dead_man_command() -> str:
    # The service unit is not loaded until the timer fires. Stopping a missing
    # unit fails the whole systemctl invocation, so the legacy name is separate.
    return (
        "systemctl stop SeeTUI-ufw-undo.timer && "
        "{ systemctl stop seetui-ufw-undo.timer vsc-ufw-undo.timer VSC-ufw-undo.timer 2>/dev/null || true; }"
    )


def _enable_ufw(_inputs: dict[str, str], ctx: dict[str, Any]) -> list[str]:
    ssh_port = int(ctx.get("ssh_port") or 22)
    commands = [
        ufw_dead_man_command(),
        f"ufw allow {ssh_port}/tcp",
    ]
    if ctx.get("has_web"):
        commands.extend(["ufw allow 80/tcp", "ufw allow 443/tcp"])
    commands.append("ufw --force enable")
    return commands


def _ufw_deny_port(inputs: dict[str, str], _ctx: dict[str, Any]) -> list[str]:
    port = _require(inputs, "port", PORT_RE, "port")
    return [f"ufw delete allow {shlex.quote(port)}", f"ufw deny {shlex.quote(port)}"]


def _apt_upgrade(_inputs: dict[str, str], _ctx: dict[str, Any]) -> list[str]:
    return [
        "DEBIAN_FRONTEND=noninteractive apt-get update",
        "DEBIAN_FRONTEND=noninteractive apt-get -y upgrade",
    ]


def _enable_unattended(_inputs: dict[str, str], _ctx: dict[str, Any]) -> list[str]:
    return [
        "DEBIAN_FRONTEND=noninteractive apt-get install -y unattended-upgrades",
        "dpkg-reconfigure -f noninteractive unattended-upgrades",
        "systemctl enable --now unattended-upgrades",
    ]


def _schedule_reboot(_inputs: dict[str, str], _ctx: dict[str, Any]) -> list[str]:
    return ["shutdown -r +5"]


def _dnf_upgrade(_inputs: dict[str, str], _ctx: dict[str, Any]) -> list[str]:
    return ["dnf -y upgrade"]


FIXES: dict[str, Fix] = {
    fix.id: fix
    for fix in (
        Fix(
            "enable_certbot_timer",
            "Enable certbot.timer",
            "Turn on systemd certbot.timer so certificates renew automatically.",
            "Low. Enables an existing timer.",
            "certificates",
            renderer=_enable_certbot_timer,
        ),
        Fix(
            "renew_certs",
            "Renew certificates now",
            "Run certbot renew immediately.",
            "Low. Renews existing certificates.",
            "certificates",
            renderer=_renew_certs,
        ),
        Fix(
            "issue_cert",
            "Issue a Let's Encrypt certificate",
            "Request a certificate for a domain with certbot --nginx.",
            "Medium. Changes nginx TLS configuration.",
            "certificates",
            ["domain", "email"],
            _issue_cert,
        ),
        Fix(
            "restart_service",
            "Restart a failed service",
            "systemctl restart the named unit.",
            "Medium. Restarts a process.",
            "monitoring",
            ["unit"],
            _restart_service,
        ),
        Fix(
            "clear_space",
            "Clear journals and apt cache",
            "Vacuum journald to 200M and run apt-get clean.",
            "Low. Deletes caches only.",
            "monitoring",
            renderer=_clear_space,
        ),
        Fix(
            "set_memory_max",
            "Set systemd MemoryMax",
            "Cap a service so a leak cannot take down the host.",
            "Medium. May OOM-kill the service if the cap is too low.",
            "quotas",
            ["unit", "memory_max"],
            _set_memory_max,
        ),
        Fix(
            "install_caddy_proxy",
            "Install Caddy reverse proxy",
            "Install Caddy and write a TLS site block that proxies to localhost.",
            "High. Installs packages and rewrites /etc/caddy/Caddyfile (backed up first).",
            "web",
            ["domain", "port"],
            _install_caddy,
        ),
        Fix(
            "enable_ufw",
            "Enable ufw",
            "Allow SSH first, then enable ufw. A 90s dead-man switch disables ufw unless SSH is allowed and ufw reports active.",
            "High. Can lock you out if SSH is not allowed. Dead-man switch is scheduled first.",
            "firewall",
            renderer=_enable_ufw,
        ),
        Fix(
            "ufw_deny_port",
            "Close an unused port",
            "Remove a ufw allow rule and deny the port.",
            "Medium. May break a service if the port was still needed.",
            "firewall",
            ["port"],
            _ufw_deny_port,
        ),
        Fix(
            "apt_upgrade",
            "Update and upgrade packages",
            "apt-get update && apt-get -y upgrade.",
            "Medium. Installs package updates. A reboot may still be required.",
            "packages",
            renderer=_apt_upgrade,
        ),
        Fix(
            "enable_unattended",
            "Enable unattended-upgrades",
            "Install and enable automatic security updates.",
            "Low.",
            "packages",
            renderer=_enable_unattended,
        ),
        Fix(
            "schedule_reboot",
            "Schedule a reboot",
            "Reboot in five minutes.",
            "High. The server will restart.",
            "packages",
            renderer=_schedule_reboot,
        ),
        Fix(
            "dnf_upgrade",
            "dnf upgrade",
            "Apply pending dnf upgrades.",
            "Medium.",
            "packages",
            renderer=_dnf_upgrade,
        ),
        Fix(
            "add_owner_note",
            "Add owner note",
            "Open the server info editor. This fix does not run a command.",
            "Low.",
            "owner_note",
        ),
    )
}


def get_fix(fix_id: str) -> Fix:
    fix = FIXES.get(fix_id)
    if fix is None:
        raise FixValidationError("unknown fix")
    return fix


def render_fix(fix_id: str, inputs: dict[str, str], ctx: dict[str, Any] | None = None) -> list[str]:
    fix = get_fix(fix_id)
    if fix.renderer is None:
        return []
    return fix.renderer(inputs, ctx or {})


def preview_fix(fix_id: str, inputs: dict[str, str], ctx: dict[str, Any] | None = None) -> dict[str, Any]:
    fix = get_fix(fix_id)
    commands = render_fix(fix_id, inputs, ctx)
    return {
        "id": fix.id,
        "title": fix.title,
        "description": fix.description,
        "risk": fix.risk,
        "check_id": fix.check_id,
        "commands": commands,
    }
