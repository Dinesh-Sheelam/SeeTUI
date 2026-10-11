"""Sudo passwords must be sent as asyncssh input, not a stdin file."""

from __future__ import annotations

from types import SimpleNamespace
from typing import cast

import asyncssh

from app.session_store import Session
from app.ssh_service import run_command, stream_command


class _Conn:
    def __init__(self) -> None:
        self.run_kwargs: dict | None = None
        self.process_kwargs: dict | None = None

    async def run(self, command: str, **kwargs: object) -> SimpleNamespace:
        self.run_kwargs = {"command": command, **kwargs}
        return SimpleNamespace(stdout="ok\n", stderr="", exit_status=0)

    async def create_process(self, command: str, **kwargs: object) -> "_Process":
        self.process_kwargs = {"command": command, **kwargs}
        return _Process()


class _Process:
    def __init__(self) -> None:
        self.stdout = _Lines(["done\n"])
        self.stderr = _Reader("")

    async def wait(self) -> None:
        return None

    def close(self) -> None:
        return None


class _Lines:
    def __init__(self, lines: list[str]) -> None:
        self._lines = lines

    def __aiter__(self) -> "_Lines":
        return self

    async def __anext__(self) -> str:
        if not self._lines:
            raise StopAsyncIteration
        return self._lines.pop(0)


class _Reader:
    def __init__(self, text: str) -> None:
        self._text = text

    async def read(self) -> str:
        return self._text


def _session(conn: _Conn) -> Session:
    return Session(
        session_id="input-test",
        host="10.0.0.9",
        port=22,
        username="cognisee",
        conn=cast(asyncssh.SSHClientConnection, conn),
        sftp=cast(asyncssh.SFTPClient, object()),
        home="/home/cognisee",
        fingerprint="test",
        uname="Linux",
        auth_method="password",
        password="pw",
    )


async def test_run_command_sends_password_as_text_input() -> None:
    conn = _Conn()
    code, stdout, stderr = await run_command(
        _session(conn),
        "sudo -S -p '' -- kill -s TERM 2041013",
        input_data=b"secret\n",
    )
    assert code == 0
    assert stdout == "ok\n"
    assert stderr == ""
    assert conn.run_kwargs is not None
    assert conn.run_kwargs["input"] == "secret\n"
    assert "stdin" not in conn.run_kwargs


async def test_run_command_omits_input_when_unset() -> None:
    conn = _Conn()
    await run_command(_session(conn), "ss -tulnpH")
    assert conn.run_kwargs is not None
    assert conn.run_kwargs["input"] is None


async def test_stream_command_sends_password_as_text_input() -> None:
    conn = _Conn()
    lines = [line async for line in stream_command(_session(conn), "sudo -S -p '' -- true", input_data=b"secret\n")]
    assert lines == ["done\n"]
    assert conn.process_kwargs is not None
    assert conn.process_kwargs["input"] == "secret\n"
    assert conn.process_kwargs["encoding"] == "utf-8"
    assert "stdin" not in conn.process_kwargs
