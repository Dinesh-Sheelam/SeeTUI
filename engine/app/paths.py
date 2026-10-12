"""Resolve bundled static assets in development and frozen builds."""

from __future__ import annotations

import sys
from pathlib import Path


def static_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "static"  # type: ignore[attr-defined]
    return Path(__file__).resolve().parent.parent / "static"
