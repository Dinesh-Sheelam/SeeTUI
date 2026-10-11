"""Live performance snapshot and process actions."""

from __future__ import annotations

import shlex

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_session
from app.health.performance import (
    build_snapshot,
    parse_ss_listeners,
    parse_systemctl_units,
    service_state_counts,
)
from app.health.sudo import resolve_sudo_password, sudo_prefix
from app.schemas import PortKillRequest, ProcessSignalRequest, RestartUnitRequest, UnitActionRequest
from app.session_store import Session
from app.ssh_service import run_command

router = APIRouter(prefix="/api/sessions/{session_id}/performance", tags=["performance"])

COMBINED = (
    "echo '---STAT0---'; cat /proc/stat; "
    "echo '---DISK0---'; cat /proc/diskstats; "
    "echo '---NET0---'; cat /proc/net/dev; "
    "sleep 0.5; "
    "echo '---STAT---'; cat /proc/stat; "
    "echo '---MEM---'; cat /proc/meminfo; "
    "echo '---VMSTAT---'; cat /proc/vmstat; "
    "echo '---LOAD---'; cat /proc/loadavg; "
    "echo '---NPROC---'; nproc; "
    "echo '---CPUINFO---'; grep -m1 'model name' /proc/cpuinfo 2>/dev/null; grep -c '^processor' /proc/cpuinfo; "
    "echo '---CPUFREQ---'; "
    "printf 'cur=%s\\n' \"$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq 2>/dev/null || echo 0)\"; "
    "printf 'base=%s\\n' \"$(cat /sys/devices/system/cpu/cpu0/cpufreq/base_frequency 2>/dev/null || echo 0)\"; "
    "printf 'max=%s\\n' \"$(cat /sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_max_freq 2>/dev/null || echo 0)\"; "
    "echo '---THERMAL---'; "
    "for f in /sys/class/thermal/thermal_zone*/temp; do [ -r \"$f\" ] && cat \"$f\"; done 2>/dev/null | head -n 8; "
    "echo '---PS_EO---'; "
    "ps -eo pid,ppid,nlwp,user,pcpu,pmem,rss,etimes,stat,comm,args --sort=-pcpu | head -n 81; "
    "echo '---DF---'; df -PB1 -x nfs -x nfs4 -x cifs 2>/dev/null | head -n 40; "
    "echo '---BLOCK---'; "
    "for d in /sys/block/*; do n=\"$(basename \"$d\")\"; "
    "case \"$n\" in loop*|ram*|sr*) continue;; esac; "
    "printf '%s %s\\n' \"$n\" \"$(cat \"$d/queue/rotational\" 2>/dev/null || echo 1)\"; done; "
    "echo '---SSS---'; ss -s 2>/dev/null || true; "
    "echo '---SS---'; ss -tunap 2>/dev/null | head -n 200 || true; "
    "echo '---DISK---'; cat /proc/diskstats; "
    "echo '---NET---'; cat /proc/net/dev; "
    "echo '---TCP4---'; cat /proc/net/tcp; "
    "echo '---TCP6---'; cat /proc/net/tcp6; "
    "echo '---IP---'; ip -4 -o addr show 2>/dev/null | head -n 20; "
    "echo '---ROUTE---'; ip -4 route show default 2>/dev/null | head -n 3; "
    "echo '---RESOLV---'; grep -E '^nameserver' /etc/resolv.conf 2>/dev/null | head -n 5; "
    "echo '---HOST---'; "
    "printf 'hostname=%s\\n' \"$(cat /etc/hostname 2>/dev/null || hostname 2>/dev/null)\"; "
    "printf 'uptime=%s\\n' \"$(cut -d' ' -f1 /proc/uptime 2>/dev/null)\"; "
    "printf 'os=%s\\n' \"$(grep -E '^PRETTY_NAME=' /etc/os-release 2>/dev/null | cut -d= -f2- | tr -d '\\\"')\"; "
    "printf 'kernel=%s\\n' \"$(uname -r 2>/dev/null)\"; "
    "printf 'arch=%s\\n' \"$(uname -m 2>/dev/null)\"; "
    "printf 'virt=%s\\n' \"$(systemd-detect-virt 2>/dev/null || echo none)\"; "
    "printf 'gateway=%s\\n' \"$(ip -4 route show default 2>/dev/null | awk '/default/ {print $3; exit}')\"; "
    "printf 'dns=%s\\n' \"$(grep -E '^nameserver' /etc/resolv.conf 2>/dev/null | awk '{print $2}' | paste -sd, -)\""
)

SERVICES_PROBE = (
    "echo '---SERVICES---'; "
    "systemctl list-units --type=service --all --no-legend --plain --no-pager 2>/dev/null | head -n 80"
)

PORTS_CMD = "sudo -n ss -tulnpH 2>/dev/null || ss -tulnpH 2>/dev/null || ss -tulnH 2>/dev/null"


def _split_combined(output: str) -> dict[str, str]:
    mapping = {
        "STAT0": "stat_prev",
        "STAT": "stat",
        "MEM": "meminfo",
        "VMSTAT": "vmstat",
        "LOAD": "loadavg",
        "NPROC": "nproc",
        "CPUINFO": "cpuinfo",
        "CPUFREQ": "cpufreq",
        "THERMAL": "thermal",
        "PS_EO": "ps_eo",
        "PS": "ps",
        "DF": "df",
        "BLOCK": "block",
        "SSS": "ss_s",
        "SS": "ss",
        "DISK0": "diskstats_prev",
        "DISK": "diskstats",
        "NET0": "netdev_prev",
        "NET": "netdev",
        "TCP4": "tcp4",
        "TCP6": "tcp6",
        "IP": "ip_addr",
        "ROUTE": "route",
        "RESOLV": "resolv",
        "HOST": "host",
        "SERVICES": "services",
    }
    chunks: dict[str, list[str]] = {key: [] for key in mapping.values()}
    current = None
    for line in output.splitlines():
        if line.startswith("---") and line.endswith("---"):
            tag = line.strip("-")
            current = mapping.get(tag)
            continue
        if current:
            chunks[current].append(line)
    return {key: "\n".join(lines) for key, lines in chunks.items()}


async def _run_unit_action(session: Session, unit: str, action: str, payload_sudo: str | None, use_ssh: bool) -> dict:
    password = await resolve_sudo_password(
        session,
        sudo_password=payload_sudo,
        use_ssh_password=use_ssh,
    )
    stdin = (password + "\n").encode() if password else None
    command = f"{sudo_prefix(password is not None)} -- systemctl {action} {shlex.quote(unit)}"
    code, stdout, stderr = await run_command(session, command, timeout=30, input_data=stdin)
    if code != 0:
        raise HTTPException(status_code=400, detail=stderr or stdout or f"{action} failed")
    return {"ok": True, "unit": unit, "action": action}


@router.get("/snapshot")
async def snapshot(session: Session = Depends(get_session)) -> dict:
    code, stdout, stderr = await run_command(session, COMBINED, timeout=18)
    if code != 0 and not stdout:
        raise HTTPException(status_code=400, detail=stderr or "probe failed")
    raw = _split_combined(stdout)
    return build_snapshot(raw)


@router.get("/services")
async def services(session: Session = Depends(get_session)) -> dict:
    code, stdout, stderr = await run_command(session, SERVICES_PROBE, timeout=15)
    if code != 0 and not stdout:
        raise HTTPException(status_code=400, detail=stderr or "services probe failed")
    raw = _split_combined(stdout)
    units = parse_systemctl_units(raw.get("services", ""))
    return {"counts": service_state_counts(units), "services": units}


@router.get("/ports")
async def ports(session: Session = Depends(get_session)) -> dict:
    code, stdout, stderr = await run_command(session, PORTS_CMD, timeout=10)
    if code != 0 and not stdout:
        raise HTTPException(status_code=400, detail=stderr or "ports probe failed")
    listeners = parse_ss_listeners(stdout)
    return {"listeners": listeners, "ssh_port": session.port}


@router.post("/ports/kill")
async def kill_port(payload: PortKillRequest, session: Session = Depends(get_session)) -> dict:
    code, stdout, stderr = await run_command(session, PORTS_CMD, timeout=10)
    if code != 0 and not stdout:
        raise HTTPException(status_code=400, detail=stderr or "ports probe failed")
    listeners = parse_ss_listeners(stdout)
    matches = [item for item in listeners if item["port"] == payload.port and item["proto"] == payload.proto]
    if not matches:
        raise HTTPException(status_code=404, detail=f"no listener on {payload.proto}/{payload.port}")
    pids = sorted({pid["pid"] for item in matches for pid in item.get("pids", []) if pid.get("pid", 0) > 1})
    if not pids:
        raise HTTPException(status_code=404, detail="no killable process found for port")
    if payload.port == session.port and not payload.force:
        raise HTTPException(
            status_code=400,
            detail=f"refusing to kill SSH port {session.port} without force=true",
        )
    password = await resolve_sudo_password(
        session,
        sudo_password=payload.sudo_password,
        use_ssh_password=payload.use_ssh_password,
    )
    stdin = (password + "\n").encode() if password else None
    prefix = sudo_prefix(password is not None)
    killed: list[int] = []
    for pid in pids:
        command = f"{prefix} -- kill -s {payload.signal} {int(pid)}"
        code, stdout, stderr = await run_command(session, command, timeout=10, input_data=stdin)
        if code != 0:
            raise HTTPException(status_code=400, detail=stderr or stdout or f"signal failed for pid {pid}")
        killed.append(pid)
    return {"ok": True, "port": payload.port, "proto": payload.proto, "pids": killed, "signal": payload.signal}


@router.post("/processes/{pid}/signal")
async def signal_process(
    pid: int,
    payload: ProcessSignalRequest,
    session: Session = Depends(get_session),
) -> dict:
    if pid <= 1:
        raise HTTPException(status_code=400, detail="refusing to signal pid <= 1")
    password = await resolve_sudo_password(
        session,
        sudo_password=payload.sudo_password,
        use_ssh_password=payload.use_ssh_password,
    )
    stdin = (password + "\n").encode() if password else None
    command = f"{sudo_prefix(password is not None)} -- kill -s {payload.signal} {int(pid)}"
    code, stdout, stderr = await run_command(session, command, timeout=10, input_data=stdin)
    if code != 0:
        raise HTTPException(status_code=400, detail=stderr or stdout or "signal failed")
    return {"ok": True, "pid": pid, "signal": payload.signal}


@router.post("/units/action")
async def unit_action(payload: UnitActionRequest, session: Session = Depends(get_session)) -> dict:
    return await _run_unit_action(session, payload.unit, payload.action, payload.sudo_password, payload.use_ssh_password)


@router.post("/units/restart")
async def restart_unit(payload: RestartUnitRequest, session: Session = Depends(get_session)) -> dict:
    return await _run_unit_action(session, payload.unit, "restart", payload.sudo_password, payload.use_ssh_password)
