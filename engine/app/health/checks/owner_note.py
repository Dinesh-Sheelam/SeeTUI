"""Parse server-info note presence."""

from __future__ import annotations

import json
from typing import Any


def parse_server_info(output: str) -> dict[str, Any] | None:
    text = output.strip()
    if not text or text.startswith("missing") or text.startswith("No such"):
        return None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    return data


def build_owner_note_check(note: dict[str, Any] | None, location: str) -> dict[str, Any]:
    if note:
        env = note.get("environment") or "unset"
        name = note.get("name") or "unnamed"
        owner = note.get("owner") or "unknown owner"
        return {
            "id": "owner_note",
            "title": "Owner note",
            "status": "ok",
            "summary": f"{name} · {env} · {owner}",
            "details": [f"Stored at {location}", f"Purpose: {note.get('purpose', '')}"],
            "facts": {"note": note, "location": location},
            "fixes": [],
        }
    return {
        "id": "owner_note",
        "title": "Owner note",
        "status": "warning",
        "summary": "No note of what this server is or who owns it",
        "details": ["Add a name, owner, and environment tag."],
        "facts": {"note": None, "location": location},
        "fixes": [{"id": "add_owner_note", "label": "Add note"}],
    }
