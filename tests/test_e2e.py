"""End-to-end API tests against an in-process SSH server."""

from __future__ import annotations

import asyncio
import json

import asyncssh
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.routers.terminal_routes import write_stdin
from app.session_store import store
from tests.fake_ssh_server import PASSWORD, USERNAME, FakeSSH


@pytest.fixture
async def ssh_server():
    server = FakeSSH()
    await server.start()
    yield server
    await server.stop()


@pytest.fixture
async def client():
    await store.start()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        yield http
    await store.stop()


async def connect(client: AsyncClient, port: int) -> str:
    res = await client.post(
        "/api/sessions",
        json={
            "host": "127.0.0.1",
            "port": port,
            "username": USERNAME,
            "auth_method": "password",
            "password": PASSWORD,
        },
    )
    assert res.status_code == 200
    session_id = None
    for line in res.text.splitlines():
        event = json.loads(line)
        if event.get("step") == "ready":
            session_id = event["session_id"]
    assert session_id
    return session_id


@pytest.mark.asyncio
async def test_connect_list_upload_download_archive_delete(client, ssh_server):
    session_id = await connect(client, ssh_server.port)
    listed = await client.get(f"/api/sessions/{session_id}/files", params={"path": "/"})
    assert listed.status_code == 200
    names = {item["name"] for item in listed.json()["entries"]}
    assert "hello.txt" in names

    made = await client.post(f"/api/sessions/{session_id}/mkdir", json={"path": "/tmp/docs"})
    assert made.status_code == 200

    uploaded = await client.put(
        f"/api/sessions/{session_id}/upload",
        params={"path": "/tmp/docs/note.txt"},
        content=b"payload-bytes",
    )
    assert uploaded.status_code == 200

    downloaded = await client.get(
        f"/api/sessions/{session_id}/download",
        params={"path": "/tmp/docs/note.txt"},
    )
    assert downloaded.content == b"payload-bytes"

    preview = await client.get(
        f"/api/sessions/{session_id}/preview",
        params={"path": "/tmp/docs/note.txt"},
    )
    assert "payload-bytes" in preview.json()["text"]

    zipped = await client.post(
        f"/api/sessions/{session_id}/archive",
        json={"paths": ["/tmp/docs/note.txt"], "format": "tar.gz", "archive_name": "bundle"},
    )
    assert zipped.status_code == 200, zipped.text
    extracted = await client.post(
        f"/api/sessions/{session_id}/extract",
        json={"path": "/tmp/docs/bundle.tar.gz"},
    )
    assert extracted.status_code == 200, extracted.text

    renamed = await client.post(
        f"/api/sessions/{session_id}/rename",
        json={"src": "/tmp/docs/note.txt", "dest": "/tmp/docs/renamed.txt"},
    )
    assert renamed.status_code == 200

    deleted = await client.post(
        f"/api/sessions/{session_id}/delete",
        json={"path": "/tmp/docs/renamed.txt"},
    )
    assert deleted.status_code == 200

    many = ssh_server.root / "many"
    many.mkdir()
    for i in range(5000):
        (many / f"f{i}.txt").write_text("x")
    listed_many = await client.get(f"/api/sessions/{session_id}/files", params={"path": "/many"})
    assert listed_many.status_code == 200
    assert len(listed_many.json()["entries"]) == 5000

    gone = await store_remove(client, session_id)
    assert gone.status_code == 200


@pytest.mark.asyncio
async def test_create_file_write_and_test_connect(client, ssh_server):
    session_id = await connect(client, ssh_server.port)

    created = await client.post(
        f"/api/sessions/{session_id}/create-file",
        json={"path": "/tmp/new-note.txt"},
    )
    assert created.status_code == 200

    written = await client.put(
        f"/api/sessions/{session_id}/write",
        json={"path": "/tmp/new-note.txt", "content": "edited remotely\n"},
    )
    assert written.status_code == 200

    preview = await client.get(
        f"/api/sessions/{session_id}/preview",
        params={"path": "/tmp/new-note.txt"},
    )
    assert "edited remotely" in preview.json()["text"]

    tested = await client.post(
        "/api/test-connect",
        json={
            "host": "127.0.0.1",
            "port": ssh_server.port,
            "username": USERNAME,
            "auth_method": "password",
            "password": PASSWORD,
        },
    )
    assert tested.status_code == 200
    assert tested.json()["ok"] is True

    await store_remove(client, session_id)


@pytest.mark.asyncio
async def test_demo_shell_echoes_input(ssh_server):
    async with asyncssh.connect(
        "127.0.0.1",
        port=ssh_server.port,
        username=USERNAME,
        password=PASSWORD,
        known_hosts=None,
    ) as conn:
        process = await conn.create_process(
            term_type="xterm-256color",
            term_size=(80, 24),
            encoding=None,
            stderr=asyncssh.STDOUT,
        )
        await write_stdin(process, b"hello\n")
        chunks = b""
        while b"hello" not in chunks:
            piece = await asyncio.wait_for(process.stdout.read(4096), timeout=3)
            assert piece
            chunks += piece
        process.terminate()
        await process.wait()


async def store_remove(client: AsyncClient, session_id: str):
    return await client.delete(f"/api/sessions/{session_id}")
