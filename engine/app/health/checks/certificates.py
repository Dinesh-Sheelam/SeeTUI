"""Parse certificate expiry and auto-renew signals."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

from app.schemas import CheckStatus


def _status_from_days(days: int | None) -> CheckStatus:
    if days is None:
        return "unknown"
    if days < 7:
        return "problem"
    if days < 21:
        return "warning"
    return "ok"


def parse_openssl_dates(output: str, now: datetime | None = None) -> dict[str, Any]:
    """Parse `openssl x509 -noout -dates` or `openssl s_client` certificate dates."""
    now = now or datetime.now(UTC)
    not_after = None
    match = re.search(r"notAfter=(.+)", output)
    if match:
        raw = match.group(1).strip()
        for fmt in ("%b %d %H:%M:%S %Y %Z", "%b %d %H:%M:%S %Y GMT"):
            try:
                parsed = datetime.strptime(raw, fmt).replace(tzinfo=UTC)
                not_after = parsed
                break
            except ValueError:
                continue
    days = None
    if not_after is not None:
        days = int((not_after - now).total_seconds() // 86400)
    return {
        "not_after": not_after.isoformat() if not_after else None,
        "days_remaining": days,
        "status": _status_from_days(days),
    }


def parse_letsencrypt_list(output: str) -> list[str]:
    names: list[str] = []
    for line in output.splitlines():
        line = line.strip()
        if not line or line.startswith("total "):
            continue
        if line.endswith("/"):
            names.append(line.rstrip("/").split()[-1])
        elif "live" not in line.lower() or "/" not in line:
            names.append(line.split()[-1])
    return names


def parse_renew_status(timer_output: str, cron_output: str, caddy_output: str) -> dict[str, Any]:
    timer_on = "enabled" in timer_output.lower() and "disabled" not in timer_output.lower()
    cron_on = bool(re.search(r"certbot|letsencrypt", cron_output, re.I))
    caddy_on = "caddy" in caddy_output.lower() and (
        "active" in caddy_output.lower() or "enabled" in caddy_output.lower()
    )
    auto = timer_on or cron_on or caddy_on
    return {
        "certbot_timer": timer_on,
        "cron": cron_on,
        "caddy": caddy_on,
        "auto_renew": auto,
        "status": "ok" if auto else "warning",
    }


def build_certificate_check(
    cert_outputs: list[dict[str, str]],
    renew: dict[str, Any],
) -> dict[str, Any]:
    certs = []
    worst: CheckStatus = "ok"
    details: list[str] = []
    if not cert_outputs:
        if not renew.get("auto_renew"):
            return {
                "id": "certificates",
                "title": "C — Certificates",
                "status": "unknown",
                "summary": "No TLS certificates found",
                "details": ["No Let's Encrypt live certs and no listener on 443."],
                "facts": {"certs": [], "renew": renew},
                "fixes": [
                    {
                        "id": "issue_cert",
                        "label": "Issue certificate",
                        "inputs": ["domain", "email"],
                    }
                ],
            }
    rank = {"ok": 0, "unknown": 1, "warning": 2, "problem": 3}
    for item in cert_outputs:
        parsed = parse_openssl_dates(item.get("output", ""))
        parsed["name"] = item.get("name", "cert")
        certs.append(parsed)
        if rank[parsed["status"]] > rank[worst]:
            worst = parsed["status"]
        days = parsed["days_remaining"]
        label = parsed["name"]
        if days is None:
            details.append(f"{label}: expiry unknown")
        else:
            details.append(f"{label}: {days} days remaining")
    if not renew.get("auto_renew") and worst != "problem":
        worst = "warning"
        details.append("Auto-renew is not enabled")
    elif renew.get("auto_renew"):
        details.append("Auto-renew is enabled")
    if certs:
        soonest = min((c["days_remaining"] for c in certs if c["days_remaining"] is not None), default=None)
        if soonest is None:
            summary = "Certificates found, expiry unknown"
        else:
            summary = f"Soonest expiry in {soonest} days"
    else:
        summary = "No certificates found"
    fixes = []
    if not renew.get("auto_renew"):
        fixes.append({"id": "enable_certbot_timer", "label": "Enable certbot.timer"})
    if any((c.get("days_remaining") or 999) < 21 for c in certs):
        fixes.append({"id": "renew_certs", "label": "Renew now"})
    fixes.append({"id": "issue_cert", "label": "Issue certificate", "inputs": ["domain", "email"]})
    return {
        "id": "certificates",
        "title": "C — Certificates",
        "status": worst if certs else "unknown",
        "summary": summary,
        "details": details,
        "facts": {"certs": certs, "renew": renew},
        "fixes": fixes,
    }
