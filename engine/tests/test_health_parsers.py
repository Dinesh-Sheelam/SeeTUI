"""Unit tests for health check parsers using captured Ubuntu output."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from app.health.checks.certificates import build_certificate_check, parse_openssl_dates, parse_renew_status
from app.health.checks.firewall import build_firewall_check, parse_firewalld, parse_ufw, select_firewall, ufw_allows_port
from app.health.checks.monitoring import build_monitoring_check, parse_df, parse_loadavg, parse_meminfo
from app.health.checks.owner_note import build_owner_note_check, parse_server_info
from app.health.checks.packages import build_packages_check, parse_apt_history, parse_apt_stamp, parse_upgrade_counts
from app.health.checks.quotas import build_quotas_check, parse_service_limits, parse_ulimit
from app.health.checks.web import build_web_check, parse_ss_listen

FIXTURES = Path(__file__).parent / "fixtures"


def test_df_warning_and_problem():
    mounts = parse_df((FIXTURES / "df.txt").read_text())
    by_mount = {item["mount"]: item for item in mounts}
    assert by_mount["/"]["status"] == "warning"
    assert by_mount["/var"]["status"] == "problem"
    assert "/dev/shm" not in by_mount


def test_meminfo_problem():
    memory = parse_meminfo((FIXTURES / "meminfo.txt").read_text())
    assert memory["used_pct"] >= 80
    assert memory["status"] in {"warning", "problem"}


def test_load_ok_and_problem():
    ok = parse_loadavg("0.20 0.20 0.20 1/100 1", 4)
    bad = parse_loadavg("9.00 8.00 7.00 1/100 1", 2)
    assert ok["status"] == "ok"
    assert bad["status"] == "problem"


def test_monitoring_assembles():
    mounts = parse_df((FIXTURES / "df.txt").read_text())
    memory = parse_meminfo((FIXTURES / "meminfo.txt").read_text())
    load = parse_loadavg("0.2 0.2 0.2", 2)
    check = build_monitoring_check(mounts, memory, load, ["nginx.service"])
    assert check["status"] == "problem"
    assert check["fixes"]


def test_certificates_expiry_problem():
    now = datetime(2024, 3, 12, tzinfo=UTC)
    parsed = parse_openssl_dates((FIXTURES / "openssl_dates.txt").read_text(), now=now)
    assert parsed["days_remaining"] == 3
    assert parsed["status"] == "problem"
    renew = parse_renew_status("disabled", "", "")
    check = build_certificate_check([{"name": "example.com", "output": (FIXTURES / "openssl_dates.txt").read_text()}], renew)
    assert check["status"] in {"problem", "warning"}


def test_firewall_inactive_and_unused_port():
    inactive = parse_ufw((FIXTURES / "ufw_inactive.txt").read_text())
    assert inactive["status"] == "inactive"
    listeners = parse_ss_listen((FIXTURES / "ss_listen.txt").read_text())
    check = build_firewall_check(parse_ufw((FIXTURES / "ufw_active.txt").read_text()), listeners, 22, True)
    assert 9100 in check["facts"]["unused_ports"]


def test_ufw_status_line_ignores_not_enabled_elsewhere():
    output = "Status: active\nIPv6 support not enabled\n22/tcp ALLOW IN Anywhere\n"
    parsed = parse_ufw(output)
    assert parsed["status"] == "active"
    assert ufw_allows_port(output, 22)


def test_firewalld_not_running_is_inactive():
    assert parse_firewalld("not running")["status"] == "inactive"
    assert parse_firewalld("running")["status"] == "active"


def test_failed_probe_does_not_hide_an_enabled_ufw():
    conf = "# comment\nENABLED=yes\nLOGLEVEL=low\n"
    firewall = select_firewall("", "open failed", "", conf)
    assert firewall["engine"] == "ufw"
    assert firewall["status"] == "active"
    check = build_firewall_check(firewall, [], 22, False)
    assert check["status"] == "ok"
    assert check["summary"] == "Firewall is on and matches listeners"


def test_unit_active_does_not_match_inactive():
    from app.health.checks.web import parse_unit_active

    assert parse_unit_active("inactive") is False
    assert parse_unit_active("active") is True


def test_web_public_app_port():
    listeners = parse_ss_listen((FIXTURES / "ss_listen.txt").read_text())
    check = build_web_check(True, False, listeners)
    assert check["status"] == "problem"
    assert any(item["port"] == 3000 for item in check["facts"]["public_apps"])


def test_quotas_unlimited_memory():
    services = parse_service_limits([{"name": "app.service", "output": (FIXTURES / "systemctl_show.txt").read_text()}])
    check = build_quotas_check(parse_ulimit("open files                      (-n) 1024\n"), services, 8000000)
    assert check["status"] == "warning"
    assert check["fixes"]


def test_packages_stamp_and_history():
    last = parse_apt_stamp("1710000000", now=datetime(2024, 3, 20, tzinfo=UTC))
    assert last["age_days"] is not None
    history = parse_apt_history((FIXTURES / "apt_history.txt").read_text())
    assert history and "2024-03-10" in history
    counts = parse_upgrade_counts("4 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.")
    check = build_packages_check(last, counts, True, False, "apt")
    assert check["status"] in {"warning", "problem", "unknown"}
    assert any(fix["id"] == "apt_upgrade" for fix in check["fixes"])


def test_owner_note_missing_and_present():
    assert parse_server_info("missing") is None
    missing = build_owner_note_check(None, "/etc/server-info.json")
    assert missing["status"] == "warning"
    present = build_owner_note_check({"name": "web-1", "owner": "ops", "environment": "prod"}, "/etc/server-info.json")
    assert present["status"] == "ok"
