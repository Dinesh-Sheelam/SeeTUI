"""Terminal input parsing and demo-shell echo."""

from __future__ import annotations

from app.routers.terminal_routes import control_message


def test_control_message_ignores_keystrokes() -> None:
    assert control_message("{") is None
    assert control_message("ls\n") is None
    assert control_message('{"type":"resize","cols":80,"rows":24}') == {
        "type": "resize",
        "cols": 80,
        "rows": 24,
    }
