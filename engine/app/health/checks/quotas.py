"""Parse ulimit and systemd resource limits."""

from __future__ import annotations

import re
from typing import Any


def parse_ulimit(output: str) -> dict[str, str]:
    limits: dict[str, str] = {}
    for line in output.splitlines():
        if "(" not in line or ")" not in line:
            continue
        match = re.match(r"(.+?)\s+\((.+?)\)\s+(.+)", line)
        if match:
            limits[match.group(2)] = match.group(3).strip()
    return limits


def parse_systemctl_show(output: str) -> dict[str, str]:
    props: dict[str, str] = {}
    for line in output.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        props[key.strip()] = value.strip()
    return props


def parse_service_limits(blocks: list[dict[str, str]]) -> list[dict[str, Any]]:
    services = []
    for block in blocks:
        name = block.get("name", "")
        props = parse_systemctl_show(block.get("output", ""))
        memory_max = props.get("MemoryMax", "infinity")
        unlimited = memory_max in {"infinity", "18446744073709551615", ""}
        services.append(
            {
                "name": name,
                "MemoryMax": "infinity" if unlimited else memory_max,
                "TasksMax": props.get("TasksMax", ""),
                "LimitNOFILE": props.get("LimitNOFILE", ""),
                "unlimited_memory": unlimited,
            }
        )
    return services


def build_quotas_check(
    ulimit: dict[str, str],
    services: list[dict[str, Any]],
    ram_kb: int,
) -> dict[str, Any]:
    unlimited = [svc for svc in services if svc.get("unlimited_memory")]
    details = [f"ulimit open files: {ulimit.get('open files', ulimit.get('-n', 'n/a'))}"]
    for svc in services:
        details.append(f"{svc['name']}: MemoryMax={svc['MemoryMax']}")
    status = "warning" if unlimited else "ok"
    suggested = max(int(ram_kb * 0.75 * 1024) if ram_kb else 0, 0)
    fixes = []
    if unlimited:
        fixes.append(
            {
                "id": "set_memory_max",
                "label": "Cap service memory",
                "inputs": ["unit", "memory_max"],
            }
        )
    summary = (
        f"{len(unlimited)} service(s) have no MemoryMax — a leak can take down the host"
        if unlimited
        else "Service memory limits look set"
    )
    return {
        "id": "quotas",
        "title": "Q — Quotas and limits",
        "status": status,
        "summary": summary,
        "details": details,
        "facts": {
            "ulimit": ulimit,
            "services": services,
            "suggested_memory_max": str(suggested) if suggested else "2G",
        },
        "fixes": fixes,
    }
