"""Parse apt/dnf update freshness and pending upgrades."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any


def parse_apt_stamp(stamp: str, now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(UTC)
    stamp = stamp.strip()
    last: datetime | None = None
    if stamp.isdigit():
        last = datetime.fromtimestamp(int(stamp), tz=UTC)
    else:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
            try:
                last = datetime.strptime(stamp, fmt).replace(tzinfo=UTC)
                break
            except ValueError:
                continue
    age_days = None
    if last is not None:
        age_days = int((now - last).total_seconds() // 86400)
    status = "ok"
    if age_days is None:
        status = "unknown"
    elif age_days >= 14:
        status = "problem"
    elif age_days >= 7:
        status = "warning"
    return {"last_update": last.isoformat() if last else None, "age_days": age_days, "status": status}


def parse_apt_history(output: str) -> str | None:
    dates = re.findall(r"Start-Date:\s+(.+)", output)
    return dates[-1].strip() if dates else None


def parse_upgrade_counts(output: str) -> dict[str, int]:
    pending = 0
    security = 0
    match = re.search(r"(\d+) upgraded", output)
    if match:
        pending = int(match.group(1))
    else:
        pending = len([line for line in output.splitlines() if line.strip() and not line.startswith("Listing")])
    security = len(re.findall(r"security", output, re.I))
    return {"pending": pending, "security": security}


def parse_dnf_check(output: str) -> dict[str, int]:
    lines = [line for line in output.splitlines() if line.strip() and not line.startswith("Last metadata")]
    return {"pending": len(lines), "security": len([line for line in lines if "security" in line.lower()])}


def build_packages_check(
    last: dict[str, Any],
    counts: dict[str, int],
    reboot_required: bool,
    unattended: bool,
    family: str,
) -> dict[str, Any]:
    details = []
    if last.get("last_update"):
        details.append(f"Last update: {last['last_update']} ({last.get('age_days')} days ago)")
    else:
        details.append("Last update date unknown")
    details.append(f"Pending upgrades: {counts.get('pending', 0)} ({counts.get('security', 0)} security)")
    details.append("Reboot required" if reboot_required else "No reboot required")
    details.append("unattended-upgrades enabled" if unattended else "unattended-upgrades off")
    rank = {"ok": 0, "unknown": 1, "warning": 2, "problem": 3}
    status = last.get("status", "unknown")
    if counts.get("security", 0) > 0 and rank["warning"] > rank[status]:
        status = "warning"
    if reboot_required and status == "ok":
        status = "warning"
    if not unattended and status == "ok":
        status = "warning"
    fixes = []
    if family == "apt":
        fixes.append({"id": "apt_upgrade", "label": "Update and upgrade packages"})
        if not unattended:
            fixes.append({"id": "enable_unattended", "label": "Enable unattended-upgrades"})
        if reboot_required:
            fixes.append({"id": "schedule_reboot", "label": "Schedule reboot"})
    else:
        fixes.append({"id": "dnf_upgrade", "label": "dnf upgrade"})
    summary = (
        f"{counts.get('pending', 0)} pending, last update {last.get('age_days')} days ago"
        if last.get("age_days") is not None
        else f"{counts.get('pending', 0)} pending upgrades"
    )
    return {
        "id": "packages",
        "title": "Packages",
        "status": status,
        "summary": summary,
        "details": details,
        "facts": {
            "last": last,
            "counts": counts,
            "reboot_required": reboot_required,
            "unattended": unattended,
            "family": family,
        },
        "fixes": fixes,
    }
