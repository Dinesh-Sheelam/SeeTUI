"""Fix registry validation and command quoting."""

from __future__ import annotations

import pytest

from app.health.fixes import FixValidationError, preview_fix, render_fix


def test_rejects_command_injection_in_domain():
    with pytest.raises(FixValidationError):
        render_fix("issue_cert", {"domain": "example.com; rm -rf /", "email": "a@b.co"})


def test_rejects_bad_unit_and_port():
    with pytest.raises(FixValidationError):
        render_fix("restart_service", {"unit": "nginx; reboot"})
    with pytest.raises(FixValidationError):
        render_fix("ufw_deny_port", {"port": "22; ufw disable"})
    with pytest.raises(FixValidationError):
        render_fix("install_caddy_proxy", {"domain": "ok.com", "port": "99999"})


def test_quotes_safe_inputs():
    commands = render_fix("issue_cert", {"domain": "app.example.com", "email": "ops@example.com"})
    assert "app.example.com" in commands[0]
    assert "rm -rf" not in commands[0]
    mem = render_fix("set_memory_max", {"unit": "caddy.service", "memory_max": "2G"})
    assert "MemoryMax=2G" in mem[0] or "MemoryMax='2G'" in mem[0]


def test_enable_ufw_schedules_dead_man_switch():
    commands = render_fix("enable_ufw", {}, {"ssh_port": 22, "has_web": True})
    assert "systemd-run --collect --unit=SeeTUI-ufw-undo.timer" in commands[0]
    assert "--on-active=90s" in commands[0]
    assert "--timer-property=AccuracySec=1us" in commands[0]
    assert commands[0].endswith("/usr/sbin/ufw disable")
    assert "ufw allow 22/tcp" in commands
    assert commands[-1] == "ufw --force enable"


def test_unknown_fix():
    with pytest.raises(FixValidationError):
        preview_fix("drop_table", {})
