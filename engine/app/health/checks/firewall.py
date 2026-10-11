"""Parse ufw, firewalld, and nftables status."""

from __future__ import annotations

import re
from typing import Any


def _ufw_status_word(output: str) -> str | None:
    """Read the `Status:` line only.

    Verbose ufw output can contain "not enabled" (IPv6) or the letters of
    "inactive" inside other words. Substring checks mark a running firewall as off.
    """
    match = re.search(r"^Status:\s*(\S+)", output or "", re.I | re.M)
    if not match:
        return None
    word = match.group(1).lower().strip(":")
    if word == "active":
        return "active"
    if word == "inactive":
        return "inactive"
    return "unknown"


def _ufw_conf_status(conf: str) -> str | None:
    match = re.search(r"^ENABLED=(yes|no)\s*$", conf or "", re.I | re.M)
    if not match:
        return None
    return "active" if match.group(1).lower() == "yes" else "inactive"


def ufw_allows_port(status: str, port: int) -> bool:
    for line in (status or "").splitlines():
        if re.search(rf"\b{int(port)}(?:/(?:tcp|udp))?\b", line, re.I) and re.search(r"\bALLOW\b", line, re.I):
            return True
    return False


def parse_ufw(output: str) -> dict[str, Any]:
    status = _ufw_status_word(output) or "unknown"
    rules: list[dict[str, str]] = []
    for line in output.splitlines():
        match = re.search(r"(\d+)(?:/?(tcp|udp))?\s+(ALLOW|DENY|REJECT|LIMIT)", line, re.I)
        if match:
            rules.append(
                {
                    "port": match.group(1),
                    "proto": (match.group(2) or "").lower(),
                    "action": match.group(3).upper(),
                    "raw": line.strip(),
                }
            )
        elif re.search(r"^\s*(\d+)\s+ALLOW", line, re.I):
            port = re.search(r"(\d+)", line)
            if port:
                rules.append({"port": port.group(1), "proto": "", "action": "ALLOW", "raw": line.strip()})
    return {"engine": "ufw", "status": status, "rules": rules, "raw": output}


def parse_firewalld(output: str) -> dict[str, Any]:
    text = (output or "").lower()
    if re.search(r"\bnot running\b", text):
        status = "inactive"
    elif re.search(r"\brunning\b", text):
        status = "active"
    else:
        status = "unknown"
    return {"engine": "firewalld", "status": status, "rules": [], "raw": output}


_PROBE_NOISE = (
    "open failed",
    "command not found",
    "you need to be root",
    "a password is required",
    "permission denied",
    "not found",
)


def _is_probe_noise(output: str) -> bool:
    text = (output or "").strip().lower()
    if not text:
        return True
    return any(part in text for part in _PROBE_NOISE)


def select_firewall(ufw_output: str, firewalld_output: str, nft_output: str, ufw_conf: str = "") -> dict[str, Any]:
    """Pick the engine from real status output, not from a failed SSH probe."""
    if _ufw_status_word(ufw_output):
        return parse_ufw(ufw_output)
    conf_status = None if _is_probe_noise(ufw_conf) else _ufw_conf_status(ufw_conf)
    if conf_status:
        return {"engine": "ufw", "status": conf_status, "rules": [], "raw": ufw_conf}
    if not _is_probe_noise(firewalld_output) and parse_firewalld(firewalld_output)["status"] != "unknown":
        return parse_firewalld(firewalld_output)
    if not _is_probe_noise(nft_output):
        return parse_nft(nft_output)
    return {"engine": "none", "status": "unknown", "rules": [], "raw": ""}


def parse_nft(output: str) -> dict[str, Any]:
    has_rules = bool(output.strip()) and "table" in output
    return {"engine": "nftables", "status": "active" if has_rules else "inactive", "rules": [], "raw": output}


def build_firewall_check(
    firewall: dict[str, Any],
    listeners: list[dict[str, Any]],
    ssh_port: int,
    has_web: bool,
) -> dict[str, Any]:
    listening_ports = {item["port"] for item in listeners if item.get("public")}
    open_ports = {int(rule["port"]) for rule in firewall.get("rules", []) if rule.get("port", "").isdigit()}
    unused = sorted(port for port in open_ports if port not in listening_ports and port not in {ssh_port})
    details = [f"Engine: {firewall.get('engine')} ({firewall.get('status')})"]
    if open_ports:
        details.append("Open: " + ", ".join(str(p) for p in sorted(open_ports)))
    for port in unused:
        details.append(f"port {port} is open but nothing is listening")
    firewall_status = firewall.get("status")
    status = "ok"
    if firewall_status == "unknown":
        status = "warning"
        details.append("Could not read firewall status")
    elif firewall_status != "active":
        status = "problem"
        details.append("Firewall is inactive")
    elif unused:
        status = "warning"
    fixes = []
    if firewall_status != "active":
        fixes.append({"id": "enable_ufw", "label": "Enable ufw (SSH first)"})
    for port in unused:
        fixes.append({"id": "ufw_deny_port", "label": f"Close port {port}", "inputs": ["port"]})
    if firewall_status == "unknown":
        summary = "Firewall status unreadable"
    elif status == "problem":
        summary = "Firewall is off"
    elif unused:
        summary = f"{len(unused)} unused open port(s)"
    else:
        summary = "Firewall is on and matches listeners"
    return {
        "id": "firewall",
        "title": "Firewall",
        "status": status,
        "summary": summary,
        "details": details,
        "facts": {
            "firewall": firewall,
            "unused_ports": unused,
            "ssh_port": ssh_port,
            "has_web": has_web,
        },
        "fixes": fixes,
    }
