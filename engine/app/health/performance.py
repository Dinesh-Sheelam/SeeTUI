"""Parse a combined performance snapshot."""

from __future__ import annotations

import re
from typing import Any

STAT_LABELS = ["user", "nice", "system", "idle", "iowait", "irq", "softirq", "steal"]
PROBE_ELAPSED_SEC = 0.5


def parse_proc_stat(output: str) -> dict[str, int]:
    line = next((row for row in output.splitlines() if row.startswith("cpu ")), "")
    if not line:
        return {}
    parts = [int(p) for p in line.split()[1 : len(STAT_LABELS) + 1]]
    return dict(zip(STAT_LABELS, parts + [0] * len(STAT_LABELS), strict=False))


def parse_per_core_stats(output: str) -> dict[str, dict[str, int]]:
    cores: dict[str, dict[str, int]] = {}
    for line in output.splitlines():
        if not re.match(r"^cpu\d+\s", line):
            continue
        core_id = line.split()[0]
        parts = [int(p) for p in line.split()[1 : len(STAT_LABELS) + 1]]
        cores[core_id] = dict(zip(STAT_LABELS, parts + [0] * len(STAT_LABELS), strict=False))
    return cores


def _usage_from_stat_delta(prev: dict[str, int], curr: dict[str, int]) -> dict[str, float]:
    delta = {key: max(curr.get(key, 0) - prev.get(key, 0), 0) for key in curr}
    total = sum(delta.values())
    if not total:
        return {"usage_pct": 0.0, "user_pct": 0.0, "system_pct": 0.0, "iowait_pct": 0.0}
    idle = delta.get("idle", 0) + delta.get("iowait", 0)
    user = delta.get("user", 0) + delta.get("nice", 0)
    system = delta.get("system", 0) + delta.get("irq", 0) + delta.get("softirq", 0) + delta.get("steal", 0)
    return {
        "usage_pct": round(100 * (total - idle) / total, 1),
        "user_pct": round(100 * user / total, 1),
        "system_pct": round(100 * system / total, 1),
        "iowait_pct": round(100 * delta.get("iowait", 0) / total, 1),
    }


def cpu_percent(prev: dict[str, int], curr: dict[str, int]) -> dict[str, float]:
    usage = _usage_from_stat_delta(prev, curr)
    return {
        "cpu_pct": usage["usage_pct"],
        "user_pct": usage["user_pct"],
        "system_pct": usage["system_pct"],
        "iowait_pct": usage["iowait_pct"],
    }


def parse_cpu_cores(prev_output: str, curr_output: str) -> list[dict[str, Any]]:
    prev = parse_per_core_stats(prev_output)
    curr = parse_per_core_stats(curr_output)
    rows: list[dict[str, Any]] = []
    for core_id in sorted(curr.keys(), key=lambda k: int(k[3:])):
        usage = _usage_from_stat_delta(prev.get(core_id, {}), curr[core_id])
        rows.append({"id": core_id, "usage_pct": usage["usage_pct"]})
    return rows


def parse_cpuinfo(output: str) -> dict[str, Any]:
    model = ""
    cores = 0
    mhz: float | None = None
    for line in output.splitlines():
        if "model name" in line and not model:
            model = line.split(":", 1)[1].strip()
        if line.strip().isdigit() and cores == 0:
            cores = int(line.strip())
        if line.startswith("processor"):
            cores += 1
        if line.startswith("cpu MHz") and mhz is None:
            try:
                mhz = float(line.split(":", 1)[1].strip())
            except ValueError:
                pass
    return {"model": model, "cores": cores or None, "mhz": mhz}


def parse_thermal_max_c(output: str) -> float | None:
    best: float | None = None
    for line in output.splitlines():
        line = line.strip()
        if not line or line == "none":
            continue
        try:
            milli = int(line)
        except ValueError:
            continue
        c = milli / 1000.0
        if c > 0 and (best is None or c > best):
            best = c
    return round(best, 1) if best is not None else None


def parse_cpufreq_mhz(output: str) -> dict[str, float | None]:
    cur = base = max_mhz = None
    for line in output.splitlines():
        if line.startswith("cur="):
            try:
                cur = float(line.split("=", 1)[1]) / 1000.0
            except ValueError:
                pass
        elif line.startswith("base="):
            try:
                base = float(line.split("=", 1)[1]) / 1000.0
            except ValueError:
                pass
        elif line.startswith("max="):
            try:
                max_mhz = float(line.split("=", 1)[1]) / 1000.0
            except ValueError:
                pass
    return {"cur_mhz": cur, "base_mhz": base, "max_mhz": max_mhz}


def parse_meminfo_detail(output: str) -> dict[str, Any]:
    from app.health.checks.monitoring import parse_meminfo

    base = parse_meminfo(output)
    values: dict[str, int] = {}
    for line in output.splitlines():
        if ":" not in line:
            continue
        key, rest = line.split(":", 1)
        number = re.search(r"(\d+)", rest)
        if number:
            values[key] = int(number.group(1))
    cached = values.get("Cached", 0)
    buffers = values.get("Buffers", 0)
    base["cached_kb"] = cached
    base["buffers_kb"] = buffers
    base["mem_free_kb"] = values.get("MemFree", 0)
    return base


def parse_vmstat(output: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for line in output.splitlines():
        parts = line.split()
        if len(parts) != 2:
            continue
        try:
            out[parts[0]] = int(parts[1])
        except ValueError:
            continue
    return {
        "pgfault": out.get("pgfault", 0),
        "pgmajfault": out.get("pgmajfault", 0),
    }


def parse_ps(output: str) -> list[dict[str, Any]]:
    processes = []
    for line in output.splitlines()[1:]:
        parts = line.split(None, 10)
        if len(parts) < 11:
            continue
        try:
            processes.append(
                {
                    "user": parts[0],
                    "pid": int(parts[1]),
                    "cpu": float(parts[2]),
                    "mem": float(parts[3]),
                    "vsz": int(parts[4]),
                    "rss": int(parts[5]),
                    "tty": parts[6],
                    "stat": parts[7],
                    "start": parts[8],
                    "time": parts[9],
                    "command": parts[10],
                }
            )
        except ValueError:
            continue
    return processes


def parse_ps_eo(output: str) -> list[dict[str, Any]]:
    lines = [ln for ln in output.splitlines() if ln.strip()]
    if not lines:
        return []
    start = 0
    if lines[0].lower().startswith("pid"):
        start = 1
    processes: list[dict[str, Any]] = []
    for line in lines[start:]:
        parts = line.split(None, 10)
        if len(parts) < 11:
            continue
        try:
            processes.append(
                {
                    "pid": int(parts[0]),
                    "ppid": int(parts[1]),
                    "threads": int(parts[2]),
                    "user": parts[3],
                    "cpu": float(parts[4]),
                    "mem": float(parts[5]),
                    "rss": int(parts[6]),
                    "elapsed_seconds": int(parts[7]),
                    "stat": parts[8],
                    "name": parts[9],
                    "command": parts[10],
                }
            )
        except ValueError:
            continue
    return processes


def process_counts(processes: list[dict[str, Any]]) -> dict[str, int]:
    running = sum(1 for p in processes if "R" in p.get("stat", ""))
    root = sum(1 for p in processes if p.get("user") == "root")
    total = len(processes)
    return {
        "total": total,
        "running": running,
        "root": root,
        "user": max(total - root, 0),
    }


def parse_ss_summary(output: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for match in re.finditer(r"(\w+)\s+(\d+)", output):
        counts[match.group(1)] = int(match.group(2))
    return counts


def parse_ss_connections(output: str) -> list[dict[str, str]]:
    rows = []
    for line in output.splitlines()[1:]:
        parts = line.split()
        if len(parts) < 5:
            continue
        local = parts[3] if len(parts) > 3 else ""
        remote = parts[4] if len(parts) > 4 else ""
        state = parts[1] if len(parts) > 1 else ""
        process = ""
        users = re.search(r'"([^"]+)"', line)
        if users:
            process = users.group(1)
        remote_ip = remote.rsplit(":", 1)[0].strip("[]")
        rows.append(
            {
                "state": state,
                "local": local,
                "remote": remote,
                "remote_ip": remote_ip,
                "process": process,
            }
        )
    return rows


def _parse_ss_users(line: str) -> list[dict[str, Any]]:
    pids: list[dict[str, Any]] = []
    for match in re.finditer(r'"([^"]+)",pid=(\d+)', line):
        pids.append({"name": match.group(1), "pid": int(match.group(2)), "user": ""})
    return pids


def parse_ss_listeners(output: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line in output.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) < 4:
            continue
        proto = parts[0].lower()
        if proto not in {"tcp", "udp"}:
            continue
        local = ""
        for token in parts:
            if token.startswith("users:"):
                break
            if ":" in token and re.search(r":\d+$", token):
                local = token
        if not local:
            continue
        host, _, port_s = local.rpartition(":")
        port_s = port_s.split("%", 1)[0]
        if not port_s.isdigit():
            continue
        pids = _parse_ss_users(line)
        rows.append(
            {
                "proto": proto,
                "address": local,
                "host": host.strip("[]"),
                "port": int(port_s),
                "pids": pids,
            }
        )
    return rows


def parse_tcp_listen_ports(tcp4: str, tcp6: str) -> list[int]:
    ports: set[int] = set()
    for raw in (tcp4, tcp6):
        for line in raw.splitlines()[1:]:
            parts = line.split()
            if len(parts) < 4:
                continue
            if parts[3].lower() != "0a":
                continue
            local = parts[1]
            if ":" not in local:
                continue
            try:
                ports.add(int(local.split(":")[1], 16))
            except ValueError:
                continue
    return sorted(ports)[:24]


def parse_diskstats(output: str) -> list[dict[str, Any]]:
    disks = []
    for line in output.splitlines():
        parts = line.split()
        if len(parts) < 14:
            continue
        name = parts[2]
        if re.match(r"^(loop|ram|sr)\d", name):
            continue
        disks.append(
            {
                "name": name,
                "reads": int(parts[3]),
                "writes": int(parts[7]),
                "read_sectors": int(parts[5]),
                "write_sectors": int(parts[9]),
            }
        )
    return disks


def disk_io_rates(prev_output: str, curr_output: str, elapsed: float = PROBE_ELAPSED_SEC) -> list[dict[str, Any]]:
    prev = {d["name"]: d for d in parse_diskstats(prev_output)}
    curr = {d["name"]: d for d in parse_diskstats(curr_output)}
    rows: list[dict[str, Any]] = []
    if elapsed <= 0:
        return rows
    for name, now in curr.items():
        before = prev.get(name)
        if not before:
            continue
        dr = max(now["reads"] - before["reads"], 0)
        dw = max(now["writes"] - before["writes"], 0)
        ds = max(now["read_sectors"] - before["read_sectors"], 0)
        ws = max(now["write_sectors"] - before["write_sectors"], 0)
        rows.append(
            {
                "name": name,
                "read_bps": round(ds * 512 / elapsed),
                "write_bps": round(ws * 512 / elapsed),
                "read_iops": round(dr / elapsed, 1),
                "write_iops": round(dw / elapsed, 1),
            }
        )
    return rows


def _parse_netdev_rows(output: str) -> dict[str, tuple[int, int]]:
    rows: dict[str, tuple[int, int]] = {}
    for line in output.splitlines()[2:]:
        if ":" not in line:
            continue
        name, rest = line.split(":", 1)
        name = name.strip()
        if not name or name == "lo":
            continue
        parts = rest.split()
        if len(parts) >= 9:
            rows[name] = (int(parts[0]), int(parts[8]))
    return rows


def parse_netdev(output: str) -> dict[str, int]:
    rx = 0
    tx = 0
    for name, (r, t) in _parse_netdev_rows(output).items():
        rx += r
        tx += t
    return {"rx": rx, "tx": tx}


def net_iface_rates(
    prev_output: str,
    curr_output: str,
    ip_output: str = "",
    elapsed: float = PROBE_ELAPSED_SEC,
) -> list[dict[str, Any]]:
    prev = _parse_netdev_rows(prev_output)
    curr = _parse_netdev_rows(curr_output)
    ipv4_by_iface: dict[str, str] = {}
    for line in (ip_output or "").splitlines():
        parts = line.split()
        if len(parts) < 4:
            continue
        iface = parts[1].rstrip(":")
        for idx, field in enumerate(parts):
            if field == "inet" and idx + 1 < len(parts):
                ipv4_by_iface[iface] = parts[idx + 1].split("/", 1)[0]
                break
    rows: list[dict[str, Any]] = []
    if elapsed <= 0:
        return rows
    for name, (rx, tx) in curr.items():
        prx, ptx = prev.get(name, (rx, tx))
        rows.append(
            {
                "name": name,
                "rx_bps": max(0, round((rx - prx) / elapsed)),
                "tx_bps": max(0, round((tx - ptx) / elapsed)),
                "rx_bytes": rx,
                "tx_bytes": tx,
                "ipv4": ipv4_by_iface.get(name, ""),
            }
        )
    return rows


def parse_df_pb1(output: str) -> list[dict[str, Any]]:
    mounts: list[dict[str, Any]] = []
    for line in output.splitlines()[1:]:
        parts = line.split()
        if len(parts) < 6:
            continue
        filesystem, size, used, avail, percent, mount = parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]
        if any(filesystem.startswith(prefix) for prefix in ("tmpfs", "devtmpfs", "overlay", "squashfs")):
            continue
        if mount.startswith("/snap"):
            continue
        used_pct = int(percent.rstrip("%") or 0)
        mounts.append(
            {
                "filesystem": filesystem,
                "size_bytes": int(size),
                "used_bytes": int(used),
                "avail_bytes": int(avail),
                "used_pct": used_pct,
                "mount": mount,
            }
        )
    return mounts


def parse_block_types(output: str) -> dict[str, str]:
    types: dict[str, str] = {}
    for line in output.splitlines():
        parts = line.split()
        if len(parts) != 2:
            continue
        name, rot = parts[0], parts[1]
        types[name] = "ssd" if rot == "0" else "hdd"
    return types


def parse_host_section(output: str) -> dict[str, Any]:
    data: dict[str, str] = {}
    for line in output.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key.strip()] = value.strip()
    uptime = 0.0
    try:
        uptime = float(data.get("uptime", "0") or 0)
    except ValueError:
        pass
    dns = [d for d in data.get("dns", "").split(",") if d]
    return {
        "hostname": data.get("hostname", ""),
        "uptime_seconds": int(uptime),
        "os_name": data.get("os", ""),
        "kernel": data.get("kernel", ""),
        "arch": data.get("arch", ""),
        "virtualization": data.get("virt", ""),
        "gateway": data.get("gateway", ""),
        "dns": dns,
    }


def parse_systemctl_units(output: str) -> list[dict[str, Any]]:
    units: list[dict[str, Any]] = []
    for line in output.splitlines():
        line = line.strip()
        if not line or line.startswith("UNIT"):
            continue
        parts = line.split(None, 4)
        if len(parts) < 4:
            continue
        name = parts[0]
        if not name.endswith(".service"):
            continue
        description = parts[4] if len(parts) > 4 else ""
        units.append(
            {
                "name": name,
                "load": parts[1],
                "state": parts[2],
                "sub_state": parts[3],
                "description": description.strip(),
            }
        )
    return units


def attach_service_metrics(units: list[dict[str, Any]], processes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_comm: dict[str, dict[str, Any]] = {}
    for proc in processes:
        key = proc.get("name") or proc.get("command", "").split()[0]
        if key and (key not in by_comm or proc.get("cpu", 0) > by_comm[key].get("cpu", 0)):
            by_comm[key] = proc
    aliases = {"sshd.service": "sshd", "ssh.service": "sshd", "nginx.service": "nginx", "docker.service": "dockerd"}
    enriched: list[dict[str, Any]] = []
    for unit in units:
        stem = unit["name"].removesuffix(".service")
        proc = by_comm.get(aliases.get(unit["name"], stem)) or by_comm.get(stem)
        row = dict(unit)
        if proc:
            row["cpu"] = proc.get("cpu", 0)
            row["memory"] = proc.get("mem", 0)
            row["memory_bytes"] = (proc.get("rss") or 0) * 1024
            row["pid"] = proc.get("pid")
        else:
            row["cpu"] = 0.0
            row["memory"] = 0.0
            row["memory_bytes"] = 0
        enriched.append(row)
    return enriched


def service_state_counts(units: list[dict[str, Any]]) -> dict[str, int]:
    counts = {"running": 0, "stopped": 0, "failed": 0, "other": 0}
    for unit in units:
        state = unit.get("state", "")
        sub = unit.get("sub_state", "")
        if state == "active" and sub == "running":
            counts["running"] += 1
        elif state == "failed":
            counts["failed"] += 1
        elif state in {"inactive", "dead"}:
            counts["stopped"] += 1
        else:
            counts["other"] += 1
    return counts


def build_listening_ports_check(listeners: list[dict[str, Any]]) -> dict[str, Any]:
    public = [item for item in listeners if item.get("host") in {"0.0.0.0", "*", "::", "[::]", ""}]
    ports = sorted({item["port"] for item in listeners})
    summary = f"{len(ports)} listening port(s)"
    if public:
        summary += f", {len(public)} on all interfaces"
    details = [f"{item['proto'].upper()} {item['port']} ({item['pids'][0]['name'] if item.get('pids') else 'unknown'})" for item in listeners[:12]]
    if len(listeners) > 12:
        details.append(f"… and {len(listeners) - 12} more (see Performance → Ports)")
    return {
        "id": "listening_ports",
        "title": "Listening ports",
        "status": "ok",
        "summary": summary,
        "details": details or ["No listeners reported"],
        "facts": {"ports": ports, "listeners": listeners[:40]},
        "fixes": [],
    }


def verdict(
    cpu_pct: float,
    iowait_pct: float,
    mem_pct: float,
    swap_used: bool,
    disk_full: bool,
    conn_count: int,
    top_proc: str | None,
) -> str:
    if disk_full:
        return "Disk full"
    if swap_used and mem_pct >= 85:
        return "Memory pressure / swapping"
    if iowait_pct >= 20:
        return "I/O wait"
    if conn_count >= 2000:
        return "Too many connections"
    if cpu_pct >= 85:
        return f"CPU-bound: {top_proc or 'process'} at {cpu_pct:.0f}%"
    return "Healthy"


def build_snapshot(raw: dict[str, str], previous: dict[str, Any] | None = None) -> dict[str, Any]:
    from app.health.checks.monitoring import parse_df, parse_loadavg

    stat_now = parse_proc_stat(raw.get("stat", ""))
    prev_stat = (previous or {}).get("stat") or parse_proc_stat(raw.get("stat_prev", "")) or stat_now
    cpu = cpu_percent(prev_stat, stat_now)
    stat_prev_full = raw.get("stat_prev", raw.get("stat", ""))
    stat_curr_full = raw.get("stat", "")
    cpu["cores"] = parse_cpu_cores(stat_prev_full, stat_curr_full)
    cpu["info"] = {
        **parse_cpuinfo(raw.get("cpuinfo", "")),
        **parse_cpufreq_mhz(raw.get("cpufreq", "")),
        "temp_c": parse_thermal_max_c(raw.get("thermal", "")),
    }

    memory = parse_meminfo_detail(raw.get("meminfo", ""))
    vmstat = parse_vmstat(raw.get("vmstat", ""))
    memory["pgfault"] = vmstat.get("pgfault", 0)
    memory["pgmajfault"] = vmstat.get("pgmajfault", 0)

    nproc = int((raw.get("nproc") or "1").split()[0] or 1)
    load = parse_loadavg(raw.get("loadavg", "0 0 0"), nproc)

    ps_eo = parse_ps_eo(raw.get("ps_eo", ""))
    processes = ps_eo or parse_ps(raw.get("ps", ""))
    counts = process_counts(processes if ps_eo else processes)

    df_raw = raw.get("df", "")
    mounts = parse_df_pb1(df_raw)
    if not mounts and df_raw.strip():
        mounts = parse_df(df_raw)

    connections = parse_ss_connections(raw.get("ss", ""))
    summary = parse_ss_summary(raw.get("ss_s", ""))
    top = max(processes, key=lambda p: p.get("cpu", 0), default=None)
    disk_full = any(m["used_pct"] >= 95 for m in mounts)
    swap_used = memory.get("swap_used_kb", 0) > 0
    text = verdict(
        cpu["cpu_pct"],
        cpu["iowait_pct"],
        memory.get("used_pct", 0),
        swap_used,
        disk_full,
        len(connections),
        (top or {}).get("command") or (top or {}).get("name"),
    )

    block_types = parse_block_types(raw.get("block", ""))
    disk_io = disk_io_rates(raw.get("diskstats_prev", ""), raw.get("diskstats", ""))
    for row in disk_io:
        row["type"] = block_types.get(row["name"], "unknown")

    net_ifaces = net_iface_rates(raw.get("netdev_prev", ""), raw.get("netdev", ""), raw.get("ip_addr", ""))
    host = parse_host_section(raw.get("host", ""))
    host["load1"] = load.get("load1")
    host["load5"] = load.get("load5")
    host["load15"] = load.get("load15")

    listen_ports = parse_tcp_listen_ports(raw.get("tcp4", ""), raw.get("tcp6", ""))

    normalized_processes = []
    for proc in processes[:80]:
        normalized_processes.append(
            {
                "pid": proc["pid"],
                "cpu": proc.get("cpu", 0),
                "mem": proc.get("mem", 0),
                "name": proc.get("name", ""),
                "command": proc.get("command") or proc.get("name", ""),
                "user": proc.get("user", ""),
                "ppid": proc.get("ppid"),
                "threads": proc.get("threads"),
                "stat": proc.get("stat"),
                "elapsed_seconds": proc.get("elapsed_seconds"),
                "rss": proc.get("rss"),
            }
        )

    return {
        "cpu": cpu,
        "memory": memory,
        "load": load,
        "host": host,
        "processes": normalized_processes,
        "process_counts": counts,
        "mounts": mounts,
        "connections": connections[:200],
        "ss_summary": summary,
        "verdict": text,
        "stat": stat_now,
        "diskstats": parse_diskstats(raw.get("diskstats", "")),
        "disk_io": disk_io,
        "netdev": parse_netdev(raw.get("netdev", "")),
        "net_ifaces": net_ifaces,
        "net": {"listen_ports": listen_ports, "gateway": host.get("gateway", ""), "dns": host.get("dns", [])},
    }
