"""Parse reverse-proxy presence and public listening ports."""

from __future__ import annotations

import re
from typing import Any


def parse_ss_listen(output: str) -> list[dict[str, Any]]:
    listeners: list[dict[str, Any]] = []
    for line in output.splitlines():
        if not line.startswith(("LISTEN", "UNCONN", "udp")) and "LISTEN" not in line:
            continue
        parts = line.split()
        if len(parts) < 4:
            continue
        address = ""
        for token in parts:
            if token.startswith("users:"):
                continue
            if ":" in token and token.rsplit(":", 1)[-1].isdigit():
                address = token
                break
        if not address:
            continue
        host, _, port_s = address.rpartition(":")
        if not port_s.isdigit():
            match = re.search(r":(\d+)$", address)
            if not match:
                continue
            port_s = match.group(1)
            host = address[: match.start()]
        process = ""
        users = re.search(r'"([^"]+)"', line)
        if users:
            process = users.group(1)
        listeners.append(
            {
                "address": address,
                "host": host.strip("[]"),
                "port": int(port_s),
                "process": process,
                "public": host in {"0.0.0.0", "*", "::", "[::]", ""},
            }
        )
    return listeners


def parse_unit_active(output: str) -> bool:
    token = output.strip().split()[0] if output.strip() else ""
    return token in {"active", "enabled"}


def build_web_check(
    nginx_active: bool,
    caddy_active: bool,
    listeners: list[dict[str, Any]],
) -> dict[str, Any]:
    proxy = nginx_active or caddy_active
    public_apps = [
        item
        for item in listeners
        if item["public"] and item["port"] not in {22, 80, 443} and item["process"] not in {"sshd", "systemd-resolve"}
    ]
    details = []
    if nginx_active:
        details.append("nginx is active")
    if caddy_active:
        details.append("Caddy is active")
    if not proxy:
        details.append("No nginx or Caddy reverse proxy")
    for item in public_apps:
        details.append(f"port {item['port']} ({item['process'] or 'unknown'}) is public without TLS or a proxy")
    status = "ok"
    if public_apps:
        status = "problem"
    elif not proxy:
        status = "warning"
    fixes = []
    if public_apps:
        fixes.append(
            {
                "id": "install_caddy_proxy",
                "label": "Install Caddy reverse proxy",
                "inputs": ["domain", "port"],
            }
        )
    summary = (
        f"{len(public_apps)} public app port(s) without TLS"
        if public_apps
        else ("Reverse proxy is in place" if proxy else "No reverse proxy detected")
    )
    return {
        "id": "web",
        "title": "W — Web",
        "status": status,
        "summary": summary,
        "details": details,
        "facts": {
            "nginx": nginx_active,
            "caddy": caddy_active,
            "listeners": listeners,
            "public_apps": public_apps,
        },
        "fixes": fixes,
    }
