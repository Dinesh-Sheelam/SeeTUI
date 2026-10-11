"""Read-only remote probe commands, run in parallel."""

from __future__ import annotations

import asyncio

from app.session_store import Session
from app.ssh_service import run_command

PROBE_TIMEOUT = 20
_PROBE_PARALLEL = 4


def _probe_text(stdout: str, stderr: str) -> str:
    if stdout.strip():
        return stdout
    # A failed SSH channel ("open failed") is not command output. Treating it as
    # firewalld/ufw status made a running firewall look off.
    if "open failed" in (stderr or "").lower():
        return ""
    return stderr or ""


async def _probe(session: Session, command: str, *, input_data: bytes | None = None) -> str:
    _code, stdout, stderr = await run_command(session, command, timeout=PROBE_TIMEOUT, input_data=input_data)
    return _probe_text(stdout, stderr)


async def gather_probes(session: Session) -> dict[str, str]:
    commands = {
        "os_release": "cat /etc/os-release 2>/dev/null || true",
        "meminfo": "cat /proc/meminfo",
        "failed": "systemctl --failed --no-legend --no-pager 2>/dev/null || true",
        "ulimit": "ulimit -a",
        "ss_listen": "ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || true",
        "nginx": "systemctl is-active nginx 2>/dev/null || true",
        "caddy": "systemctl is-active caddy 2>/dev/null || true",
        "certbot_timer": "systemctl is-enabled certbot.timer 2>/dev/null || true",
        "cron_certbot": "crontab -l 2>/dev/null; grep -R certbot /etc/cron* 2>/dev/null | head || true",
        "le_live": "ls -1 /etc/letsencrypt/live 2>/dev/null || true",
        "apt_stamp": "stat -c %Y /var/lib/apt/periodic/update-success-stamp 2>/dev/null || true",
        "apt_history": "grep Start-Date /var/log/apt/history.log 2>/dev/null | tail -5 || true",
        "apt_upgradable": "apt-get -s upgrade 2>/dev/null | tail -5 || true",
        "reboot": "test -f /var/run/reboot-required && echo yes || echo no",
        "unattended": "systemctl is-enabled unattended-upgrades 2>/dev/null || dpkg-query -W unattended-upgrades 2>/dev/null || true",
        "dnf": "command -v dnf >/dev/null && dnf -q check-update || true",
        "server_info_etc": "cat /etc/server-info.json 2>/dev/null || echo missing",
        "server_info_home": "cat \"$HOME/.server-info.json\" 2>/dev/null || echo missing",
        "openssl443": "echo | openssl s_client -connect 127.0.0.1:443 -servername localhost 2>/dev/null | openssl x509 -noout -dates 2>/dev/null || true",
        "user_services": (
            "systemctl list-units --type=service --state=running --no-legend --no-pager 2>/dev/null "
            "| awk '{print $1}' | grep -Ev '^(systemd|dbus|ssh|cron|rsyslog|snap|getty|user@|polkit)' | head -20"
        ),
    }
    keys = list(commands)
    sem = asyncio.Semaphore(_PROBE_PARALLEL)

    async def run(key: str) -> str:
        async with sem:
            return await _probe(session, commands[key])

    results = await asyncio.gather(*(run(key) for key in keys), return_exceptions=True)
    output: dict[str, str] = {}
    for key, result in zip(keys, results, strict=True):
        output[key] = "" if isinstance(result, Exception) else str(result)
    return output


async def read_firewall_outputs(
    session: Session,
    *,
    sudo: str | None,
    stdin: bytes | None,
) -> dict[str, str]:
    """Read firewall state as root when we can.

    `ufw status` exits before printing anything unless it is root, and the
    health check used to discard that error. The UI then kept saying the
    firewall was off after a successful `ufw enable`.
    """

    async def run(command: str, *, privileged: bool) -> str:
        wrapped = f"{sudo} -- {command}" if privileged and sudo else command
        return await _probe(session, wrapped, input_data=stdin if privileged and sudo else None)

    ufw = await run("ufw status verbose", privileged=True) if sudo else ""
    if "Status:" not in ufw:
        plain = await run("ufw status verbose", privileged=False)
        ufw = plain if "Status:" in plain else ""
    firewalld = await run("firewall-cmd --state", privileged=bool(sudo))
    if sudo and "running" not in firewalld.lower():
        plain_fw = await run("firewall-cmd --state", privileged=False)
        if "running" in plain_fw.lower():
            firewalld = plain_fw
    nft = await run("nft list ruleset 2>/dev/null | head -c 4000 || true", privileged=False)
    conf = await run("cat /etc/ufw/ufw.conf 2>/dev/null || true", privileged=False)
    return {"ufw": ufw, "firewalld": firewalld, "nft": nft, "ufw_conf": conf}


async def show_service_limits(session: Session, units: list[str]) -> list[dict[str, str]]:
    blocks = []
    for unit in units[:12]:
        output = await _probe(
            session,
            f"systemctl show -p MemoryMax,TasksMax,LimitNOFILE -- {__import__('shlex').quote(unit)}",
        )
        blocks.append({"name": unit, "output": output})
    return blocks
