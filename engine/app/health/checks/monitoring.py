"""Parse disk, memory, load, and failed services."""

from __future__ import annotations

import re
from typing import Any

from app.schemas import CheckStatus


def parse_df(output: str) -> list[dict[str, Any]]:
    mounts: list[dict[str, Any]] = []
    for line in output.splitlines()[1:]:
        parts = line.split()
        if len(parts) < 6:
            continue
        filesystem, blocks, used, available, percent, mount = parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]
        if any(filesystem.startswith(prefix) for prefix in ("tmpfs", "devtmpfs", "overlay", "squashfs")):
            continue
        if mount.startswith("/snap"):
            continue
        used_pct = int(percent.rstrip("%") or 0)
        status: CheckStatus = "ok"
        if used_pct >= 90:
            status = "problem"
        elif used_pct >= 80:
            status = "warning"
        mounts.append(
            {
                "filesystem": filesystem,
                "blocks": blocks,
                "used": used,
                "available": available,
                "used_pct": used_pct,
                "mount": mount,
                "status": status,
            }
        )
    return mounts


def parse_df_inodes(output: str) -> list[dict[str, Any]]:
    return parse_df(output)


def parse_meminfo(output: str) -> dict[str, Any]:
    values: dict[str, int] = {}
    for line in output.splitlines():
        if ":" not in line:
            continue
        key, rest = line.split(":", 1)
        number = re.search(r"(\d+)", rest)
        if number:
            values[key] = int(number.group(1))
    total = values.get("MemTotal", 0)
    available = values.get("MemAvailable", values.get("MemFree", 0))
    used = max(total - available, 0)
    swap_total = values.get("SwapTotal", 0)
    swap_free = values.get("SwapFree", 0)
    swap_used = max(swap_total - swap_free, 0)
    used_pct = int(used * 100 / total) if total else 0
    status: CheckStatus = "ok"
    if used_pct >= 90 or (swap_total and swap_used > swap_total * 0.5):
        status = "problem"
    elif used_pct >= 80:
        status = "warning"
    return {
        "total_kb": total,
        "used_kb": used,
        "available_kb": available,
        "used_pct": used_pct,
        "swap_total_kb": swap_total,
        "swap_used_kb": swap_used,
        "status": status,
    }


def parse_loadavg(output: str, nproc: int) -> dict[str, Any]:
    parts = output.split()
    load1 = float(parts[0]) if parts else 0.0
    load5 = float(parts[1]) if len(parts) > 1 else 0.0
    load15 = float(parts[2]) if len(parts) > 2 else 0.0
    cpus = max(nproc, 1)
    ratio = load1 / cpus
    status: CheckStatus = "ok"
    if ratio >= 2.0:
        status = "problem"
    elif ratio >= 1.0:
        status = "warning"
    return {
        "load1": load1,
        "load5": load5,
        "load15": load15,
        "nproc": cpus,
        "ratio": round(ratio, 2),
        "status": status,
    }


def parse_failed_units(output: str) -> list[str]:
    units: list[str] = []
    for line in output.splitlines():
        line = line.strip()
        if not line or line.startswith("UNIT") or line.startswith("●") and "LOAD" in line:
            continue
        if line.startswith("0 loaded units") or line.startswith("0 units"):
            continue
        match = re.match(r"(\S+\.(?:service|timer|socket|mount))", line)
        if match:
            units.append(match.group(1))
    return units


def build_monitoring_check(
    mounts: list[dict[str, Any]],
    memory: dict[str, Any],
    load: dict[str, Any],
    failed: list[str],
    uptime_external: dict[str, Any] | None = None,
) -> dict[str, Any]:
    rank = {"ok": 0, "unknown": 1, "warning": 2, "problem": 3}
    worst: CheckStatus = "ok"
    details: list[str] = []
    for mount in mounts:
        details.append(f"{mount['mount']}: {mount['used_pct']}% used")
        if rank[mount["status"]] > rank[worst]:
            worst = mount["status"]
    details.append(f"Memory: {memory.get('used_pct', 0)}% used")
    if rank[memory.get("status", "ok")] > rank[worst]:
        worst = memory.get("status", "ok")
    details.append(f"Load: {load.get('load1')} on {load.get('nproc')} CPUs")
    if rank[load.get("status", "ok")] > rank[worst]:
        worst = load.get("status", "ok")
    if failed:
        details.append("Failed units: " + ", ".join(failed))
        worst = "problem"
    else:
        details.append("No failed systemd units")
    if uptime_external:
        details.append(f"External uptime: {uptime_external.get('summary', 'n/a')}")
        if rank[uptime_external.get("status", "ok")] > rank[worst]:
            worst = uptime_external.get("status", "ok")
    disk_problem = any(m["status"] == "problem" for m in mounts)
    fixes = []
    if failed:
        fixes.append({"id": "restart_service", "label": "Restart failed service", "inputs": ["unit"]})
    if disk_problem or any(m["status"] == "warning" for m in mounts):
        fixes.append({"id": "clear_space", "label": "Clear apt cache and journals"})
    summary_bits = []
    if any(m["status"] != "ok" for m in mounts):
        hottest = max(mounts, key=lambda m: m["used_pct"])
        summary_bits.append(f"{hottest['mount']} at {hottest['used_pct']}%")
    if failed:
        summary_bits.append(f"{len(failed)} failed service(s)")
    if memory.get("status") != "ok":
        summary_bits.append(f"RAM {memory.get('used_pct')}%")
    summary = "; ".join(summary_bits) if summary_bits else "Disk, memory, load, and services look healthy"
    return {
        "id": "monitoring",
        "title": "M — Monitoring",
        "status": worst,
        "summary": summary,
        "details": details,
        "facts": {
            "mounts": mounts,
            "memory": memory,
            "load": load,
            "failed": failed,
            "uptime_external": uptime_external or {},
        },
        "fixes": fixes,
    }
