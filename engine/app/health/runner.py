"""Assemble health reports from probe output."""

from __future__ import annotations

import re
from typing import Any

import httpx

from app.health.checks.certificates import (
    build_certificate_check,
    parse_letsencrypt_list,
    parse_renew_status,
)
from app.health.checks.firewall import build_firewall_check, select_firewall
from app.health.checks.monitoring import build_monitoring_check, parse_failed_units, parse_meminfo
from app.health.checks.owner_note import build_owner_note_check, parse_server_info
from app.health.checks.packages import (
    build_packages_check,
    parse_apt_history,
    parse_apt_stamp,
    parse_dnf_check,
    parse_upgrade_counts,
)
from app.health.checks.quotas import build_quotas_check, parse_service_limits, parse_ulimit
from app.health.checks.web import build_web_check, parse_ss_listen, parse_unit_active
from app.health.probes import gather_probes, read_firewall_outputs, show_service_limits
from app.health.sudo import resolve_sudo_password, sudo_prefix
from app.session_store import Session


async def external_uptime(host: str, listeners: list[dict[str, Any]]) -> dict[str, Any]:
    ports = sorted({item["port"] for item in listeners if item["port"] in {80, 443}})
    if not ports:
        return {"status": "unknown", "summary": "No public HTTP ports to probe"}
    results = []
    async with httpx.AsyncClient(timeout=4.0, follow_redirects=True, verify=False) as client:
        for port in ports:
            scheme = "https" if port == 443 else "http"
            url = f"{scheme}://{host}:{port}/"
            try:
                response = await client.get(url)
                results.append(f"{url} → {response.status_code}")
            except Exception as exc:
                results.append(f"{url} → {exc.__class__.__name__}")
    ok = any("→ 2" in row or "→ 3" in row for row in results)
    return {
        "status": "ok" if ok else "warning",
        "summary": "; ".join(results) if results else "No probe",
        "results": results,
    }


def _os_family(os_release: str) -> str:
    text = os_release.lower()
    if "id=fedora" in text or "id=rhel" in text or "id=centos" in text:
        return "dnf"
    return "apt"


_UNIT_NAME = re.compile(r"^[A-Za-z0-9:_.@\\-]+\.(?:service|timer|socket|mount)$")


async def build_report(session: Session) -> dict[str, Any]:
    raw = await gather_probes(session)
    memory = parse_meminfo(raw["meminfo"])
    load = {"load1": 0.0, "load5": 0.0, "load15": 0.0, "nproc": 1, "ratio": 0.0, "status": "ok"}
    failed = parse_failed_units(raw["failed"])
    listeners = parse_ss_listen(raw["ss_listen"])
    nginx = parse_unit_active(raw["nginx"])
    caddy = parse_unit_active(raw["caddy"])
    uptime = await external_uptime(session.host, listeners)

    units = [line.strip() for line in raw["user_services"].splitlines() if _UNIT_NAME.match(line.strip())]
    if failed:
        units = list(dict.fromkeys(failed + units))
    limit_blocks = await show_service_limits(session, units)
    services = parse_service_limits(limit_blocks)

    password = await resolve_sudo_password(session, sudo_password=None, use_ssh_password=False)
    firewall_raw = await read_firewall_outputs(
        session,
        sudo=sudo_prefix(password is not None),
        stdin=(password + "\n").encode() if password else None,
    )
    firewall = select_firewall(
        firewall_raw["ufw"],
        firewall_raw["firewalld"],
        firewall_raw["nft"],
        firewall_raw["ufw_conf"],
    )

    names = parse_letsencrypt_list(raw["le_live"])
    cert_outputs = []
    for name in names[:8]:
        from app.ssh_service import run_command
        import shlex

        code, stdout, _ = await run_command(
            session,
            f"openssl x509 -in {shlex.quote('/etc/letsencrypt/live/' + name + '/cert.pem')} -noout -dates 2>/dev/null || true",
        )
        if stdout.strip():
            cert_outputs.append({"name": name, "output": stdout})
    if not cert_outputs and raw["openssl443"].strip():
        cert_outputs.append({"name": "127.0.0.1:443", "output": raw["openssl443"]})
    renew = parse_renew_status(raw["certbot_timer"], raw["cron_certbot"], raw["caddy"])

    note = parse_server_info(raw["server_info_etc"])
    location = "/etc/server-info.json"
    if note is None:
        note = parse_server_info(raw["server_info_home"])
        location = "~/.server-info.json"

    family = _os_family(raw["os_release"])
    stamp = raw["apt_stamp"].strip()
    if not stamp:
        history = parse_apt_history(raw["apt_history"])
        stamp = history or ""
    last = parse_apt_stamp(stamp) if stamp else {"last_update": None, "age_days": None, "status": "unknown"}
    counts = parse_dnf_check(raw["dnf"]) if family == "dnf" else parse_upgrade_counts(raw["apt_upgradable"])
    unattended = "enabled" in raw["unattended"].lower() or "install ok" in raw["unattended"].lower()
    reboot = raw["reboot"].strip() == "yes"

    from app.health.performance import build_listening_ports_check

    port_listeners = [
        {
            "proto": "tcp",
            "port": item["port"],
            "host": item.get("host", ""),
            "pids": [{"name": item.get("process", ""), "pid": 0, "user": ""}],
        }
        for item in listeners
    ]

    checks = [
        build_certificate_check(cert_outputs, renew),
        build_monitoring_check([], memory, load, failed, uptime),
        build_quotas_check(parse_ulimit(raw["ulimit"]), services, memory.get("total_kb", 0)),
        build_web_check(nginx, caddy, listeners),
        build_listening_ports_check(port_listeners),
        build_firewall_check(firewall, listeners, session.port, nginx or caddy),
        build_packages_check(last, counts, reboot, unattended, family),
        build_owner_note_check(note, location),
    ]
    passing = sum(1 for check in checks if check["status"] == "ok")
    critical = sum(1 for check in checks if check["status"] == "problem")
    warning = sum(1 for check in checks if check["status"] == "warning")
    return {
        "passing": passing,
        "total": len(checks),
        "critical": critical,
        "warning": warning,
        "checks": checks,
        "os_release": raw["os_release"],
        "note": note,
        "note_location": location,
    }
