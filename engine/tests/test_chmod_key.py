"""Local PEM chmod helper and API."""

from __future__ import annotations

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.ssh_service import apply_key_chmod, key_is_group_or_world_accessible


def test_open_key_is_detected_and_chmod_fixes(tmp_path: Path):
    key = tmp_path / "id_ed25519"
    key.write_text("-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----\n")
    key.chmod(0o644)
    assert key_is_group_or_world_accessible(key)
    result = apply_key_chmod(str(key))
    assert result["mode"] == "0o600"
    assert not key_is_group_or_world_accessible(key)
    assert "chmod 600" in result["command"]


def test_rejects_non_key_file(tmp_path: Path):
    notes = tmp_path / "notes.txt"
    notes.write_text("hello")
    notes.chmod(0o644)
    with pytest.raises(ValueError, match="private key"):
        apply_key_chmod(str(notes))


@pytest.mark.asyncio
async def test_chmod_key_endpoint(tmp_path: Path):
    key = tmp_path / "server.pem"
    key.write_text("-----BEGIN RSA PRIVATE KEY-----\nMII\n-----END RSA PRIVATE KEY-----\n")
    key.chmod(0o666)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/api/local/chmod-key", json={"path": str(key)})
    assert res.status_code == 200, res.text
    assert key.stat().st_mode & 0o777 == 0o600
