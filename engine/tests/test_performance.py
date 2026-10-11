"""CPU sampling and system monitor parsers."""

from __future__ import annotations

from typing import cast

import asyncssh
from httpx import ASGITransport, AsyncClient

from app.health.performance import (
    build_snapshot,
    cpu_percent,
    disk_io_rates,
    net_iface_rates,
    parse_cpu_cores,
    parse_host_section,
    parse_ps_eo,
    parse_ss_listeners,
    parse_systemctl_units,
    parse_tcp_listen_ports,
    parse_proc_stat,
)
from app.main import app
from app.routers.performance_routes import _split_combined
from app.session_store import Session, store

STAT_A = "cpu  1000 0 500 8000 100 0 0 0 0 0\ncpu0 1000 0 500 8000 100 0 0 0 0 0\n"
STAT_B = "cpu  1100 0 550 8300 150 0 0 0 0 0\ncpu0 1100 0 550 8300 150 0 0 0 0 0\n"


def test_cpu_percent_from_two_samples():
    cpu = cpu_percent(parse_proc_stat(STAT_A), parse_proc_stat(STAT_B))
    assert cpu["cpu_pct"] == 30.0
    assert cpu["iowait_pct"] == 10.0
    assert cpu["user_pct"] == 20.0


def test_identical_samples_are_idle_not_full():
    stat = parse_proc_stat(STAT_A)
    assert cpu_percent(stat, stat)["cpu_pct"] == 0.0


def test_steal_counts_as_busy():
    prev = parse_proc_stat("cpu  0 0 0 0 0 0 0 0\n")
    curr = parse_proc_stat("cpu  0 0 0 50 0 0 0 50\n")
    assert cpu_percent(prev, curr)["cpu_pct"] == 50.0


def test_snapshot_uses_in_command_previous_sample():
    output = f"---STAT0---\n{STAT_A}---STAT---\n{STAT_B}---NPROC---\n1\n"
    snap = build_snapshot(_split_combined(output))
    assert snap["cpu"]["cpu_pct"] == 30.0
    assert snap["cpu"]["cores"][0]["usage_pct"] == 30.0


def test_parse_cpu_cores():
    cores = parse_cpu_cores(STAT_A, STAT_B)
    assert len(cores) == 1
    assert cores[0]["id"] == "cpu0"
    assert cores[0]["usage_pct"] == 30.0


def test_parse_ps_eo():
    raw = (
        "  PID  PPID NLWP USER   %CPU %MEM   RSS ELAPSED STAT COMMAND         ARGS\n"
        " 1234     1    4 root   12.0  1.0 1024     100 S    nginx           nginx: worker\n"
    )
    rows = parse_ps_eo(raw)
    assert len(rows) == 1
    assert rows[0]["pid"] == 1234
    assert rows[0]["command"] == "nginx: worker"


def test_parse_systemctl_units():
    raw = "nginx.service loaded active running A high performance web server\n"
    units = parse_systemctl_units(raw)
    assert units[0]["name"] == "nginx.service"
    assert units[0]["state"] == "active"


def test_parse_ss_listeners_and_tcp_ports():
    ss = 'tcp   LISTEN 0 128 *:8080 *:* users:(("nginx",pid=99,fd=3))'
    listeners = parse_ss_listeners(ss)
    assert listeners[0]["port"] == 8080
    assert listeners[0]["pids"][0]["pid"] == 99
    tcp4 = "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n   0: 00000000:1F90 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 123 1 0000000000000000 100 0 0 10 0\n"
    assert 8080 in parse_tcp_listen_ports(tcp4, "")


def test_disk_and_net_rates():
    disk_prev = "   8       0 sda 100 0 200 0 50 0 300 0 0 0 0 0 0 0 0 0 0 0"
    disk_curr = "   8       0 sda 110 0 240 0 55 0 360 0 0 0 0 0 0 0 0 0 0 0"
    io = disk_io_rates(disk_prev, disk_curr, elapsed=1.0)
    assert io[0]["read_bps"] == 40 * 512
    net_line = "  eth0: {rx}    10    0    0    0     0          0         0 {tx}       20    0    0    0     0       0          0\n"
    net_prev = "Inter-|   Receive                                                |  Transmit\n face |bytes    packets\n" + net_line.format(rx=1000, tx=500)
    net_curr = "Inter-|   Receive                                                |  Transmit\n face |bytes    packets\n" + net_line.format(rx=2000, tx=800)
    ifaces = net_iface_rates(net_prev, net_curr, elapsed=1.0)
    assert ifaces[0]["rx_bps"] == 1000


def test_parse_host_section():
    host = parse_host_section("hostname=demo\nuptime=3600.5\nos=Ubuntu\ngateway=10.0.0.1\ndns=8.8.8.8,1.1.1.1\n")
    assert host["hostname"] == "demo"
    assert host["uptime_seconds"] == 3600
    assert host["dns"] == ["8.8.8.8", "1.1.1.1"]


def _session() -> Session:
    return Session(
        session_id="perf-route-test",
        host="10.0.0.9",
        port=22,
        username="cognisee",
        conn=cast(asyncssh.SSHClientConnection, object()),
        sftp=cast(asyncssh.SFTPClient, object()),
        home="/home/cognisee",
        fingerprint="test",
        uname="Linux",
        auth_method="password",
        password="pw",
    )


async def test_kill_port_refuses_ssh_without_force(monkeypatch) -> None:
    ss_out = 'tcp   LISTEN 0 128 *:22 *:* users:(("sshd",pid=42,fd=3))'

    async def fake_run(_session, command, **_kwargs):
        return 0, ss_out, ""

    monkeypatch.setattr("app.routers.performance_routes.run_command", fake_run)
    session = _session()
    await store.add(session)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                f"/api/sessions/{session.session_id}/performance/ports/kill",
                json={"port": 22, "proto": "tcp", "signal": "TERM", "use_ssh_password": True},
            )
        assert res.status_code == 400
        assert "force" in res.json()["detail"].lower()
    finally:
        await store.remove(session.session_id)


async def test_kill_port_skips_pid_one(monkeypatch) -> None:
    ss_out = 'tcp   LISTEN 0 128 *:8080 *:* users:(("systemd",pid=1,fd=3))'

    async def fake_run(_session, command, **_kwargs):
        return 0, ss_out, ""

    monkeypatch.setattr("app.routers.performance_routes.run_command", fake_run)
    session = _session()
    await store.add(session)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                f"/api/sessions/{session.session_id}/performance/ports/kill",
                json={"port": 8080, "proto": "tcp", "signal": "TERM", "use_ssh_password": True},
            )
        assert res.status_code == 404
    finally:
        await store.remove(session.session_id)
