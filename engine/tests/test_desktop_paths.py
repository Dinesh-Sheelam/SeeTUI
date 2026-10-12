"""Desktop packaging helpers."""

from __future__ import annotations

from app.launcher import _safe_local_url
from app.paths import static_dir


def test_static_dir_points_at_engine_static() -> None:
    path = static_dir()
    assert path.name == "static"
    assert path.parent.name == "engine"


def test_safe_local_url_accepts_api_paths() -> None:
    base = "http://127.0.0.1:8765/"
    assert _safe_local_url("/api/sessions/abc/download?path=%2Ftmp%2Fa", base) == (
        "http://127.0.0.1:8765/api/sessions/abc/download?path=%2Ftmp%2Fa"
    )


def test_safe_local_url_rejects_external_hosts() -> None:
    assert _safe_local_url("http://evil.example/api/x", "http://127.0.0.1:8765/") is None
    assert _safe_local_url("/static/index.html", "http://127.0.0.1:8765/") is None
