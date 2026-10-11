"""In-process asyncssh server with SFTP and a small command set."""

from __future__ import annotations

import asyncio
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import asyncssh

USERNAME = "test"
PASSWORD = "secret"


class _AuthServer(asyncssh.SSHServer):
    def connection_made(self, conn: asyncssh.SSHServerConnection) -> None:
        self._conn = conn

    def begin_auth(self, username: str) -> bool:
        return True

    def password_auth_supported(self) -> bool:
        return True

    def validate_password(self, username: str, password: str) -> bool:
        return username == USERNAME and password == PASSWORD


def _canned(command: str, root: Path) -> str | None:
    if command.startswith("uname"):
        return "Linux 6.8.0 x86_64"
    if command.strip() == "whoami":
        return USERNAME
    if "printf %s" in command and "HOME" in command:
        return "/"
    if command.startswith("nproc"):
        return "2"
    if command.startswith("cat /proc/loadavg"):
        return "0.10 0.20 0.30 1/120 99"
    if command.startswith("cat /proc/meminfo"):
        return "MemTotal:        8000000 kB\nMemAvailable:    4000000 kB\nMemFree:         3000000 kB\nSwapTotal:       0 kB\nSwapFree:        0 kB\n"
    if command.startswith("df -P"):
        return "Filesystem     1024-blocks  Used Available Capacity Mounted on\n/dev/sda1         10000000 4000000   6000000      40% /\n"
    if command.startswith("df -Pi"):
        return "Filesystem      Inodes  IUsed   IFree IUse% Mounted on\n/dev/sda1      1000000 10000  990000    1% /\n"
    if command.startswith("systemctl --failed"):
        return ""
    if command.startswith("ulimit"):
        return "open files                      (-n) 1024\n"
    if command.startswith("ss -tlnp") or command.startswith("ss -tunap"):
        return "State  Recv-Q Send-Q Local Address:Port  Peer Address:PortProcess\nLISTEN 0      128        0.0.0.0:22         0.0.0.0:*    users:((\"sshd\",pid=1,fd=3))\n"
    if command.startswith("ss -s"):
        return "TCP:   3 (estab 1, closed 0, orphaned 0, timewait 0)\n"
    if command.startswith("systemctl is-active nginx"):
        return "inactive"
    if command.startswith("systemctl is-active caddy"):
        return "inactive"
    if command.startswith("ufw status"):
        return "Status: inactive"
    if command.startswith("cat /etc/os-release"):
        return 'NAME="Ubuntu"\nVERSION="24.04"\nID=ubuntu\n'
    if command.startswith("stat -c %Y"):
        return "1710000000"
    if "reboot-required" in command:
        return "no"
    if "unattended" in command:
        return "disabled"
    if command.startswith("cat /etc/server-info.json") or "server-info.json" in command:
        return "missing"
    if command.startswith("ls -1 /etc/letsencrypt"):
        return ""
    if command.startswith("echo | openssl"):
        return ""
    if command.startswith("cat /proc/stat"):
        return "cpu  100 0 50 800 10 0 0 0\n"
    if command.startswith("cat /proc/diskstats"):
        return "   8       0 sda 100 0 2000 10 50 0 800 4 0 0 0\n"
    if command.startswith("cat /proc/net/dev"):
        return "Inter-|   Receive                                                |  Transmit\n eth0: 1000 0 0 0 0 0 0 0 2000 0 0 0 0 0 0 0\n"
    if command.startswith("ps aux"):
        return "USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\nroot         1  0.0  0.1  10000  2000 ?        Ss   00:00   0:00 systemd\n"
    if command.startswith("who"):
        return "test pts/0"
    if command.startswith("hostname"):
        return "127.0.0.1"
    if command.startswith("uptime"):
        return "up 3 days"
    if command.startswith("grep -m1"):
        return "model name : Test CPU\n2"
    if command.startswith("true"):
        return ""
    return None


def _is_shell(command: str) -> bool:
    text = command.strip()
    if not text:
        return True
    name = text.split()[0].rsplit("/", 1)[-1]
    return name in {"bash", "sh", "zsh", "ash", "dash"}


async def _interactive_shell(process: asyncssh.SSHServerProcess) -> None:
    """Keep a tiny PTY open so the browser terminal can type against the demo server."""
    process.stdout.write("$ ")
    try:
        while not process.stdin.at_eof():
            line = await process.stdin.readline()
            if not line:
                break
            text = line.decode() if isinstance(line, bytes) else line
            process.stdout.write(text if text.endswith("\n") else text + "\n")
            process.stdout.write("$ ")
    except Exception:
        pass
    process.exit(0)


def _process_factory(root: Path):
    def factory(process: asyncssh.SSHServerProcess) -> None:
        asyncio.create_task(_run(process, root))

    return factory


async def _run(process: asyncssh.SSHServerProcess, root: Path) -> None:
    command = process.command or ""
    canned = _canned(command, root)
    if canned is not None:
        process.stdout.write(canned)
        process.exit(0)
        return
    if command.startswith("cd ") or command.startswith("zip") or command.startswith("tar") or command.startswith("unzip") or command.startswith("rm "):
        try:
            jailed = re.sub(
                r"(?<![\w])(/[\w./-]+)",
                lambda match: str(root / match.group(1).lstrip("/")),
                command,
            )
            completed = await asyncio.to_thread(
                subprocess.run,
                jailed,
                shell=True,
                cwd=root,
                capture_output=True,
                text=True,
                check=False,
            )
            process.stdout.write(completed.stdout)
            process.stderr.write(completed.stderr)
            process.exit(completed.returncode)
        except Exception as exc:
            process.stderr.write(str(exc))
            process.exit(1)
        return
    if "printf %s" in command:
        process.stdout.write(str(root))
        process.exit(0)
        return
    if _is_shell(command):
        await _interactive_shell(process)
        return
    process.stdout.write("")
    process.exit(0)


class FakeSSH:
    def __init__(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="SeeTUI-ssh-"))
        (self.root / "home" / USERNAME).mkdir(parents=True)
        (self.root / "tmp").mkdir()
        (self.root / "hello.txt").write_text("hello from server\n")
        self.port = 0
        self._listener: asyncssh.SSHAcceptor | None = None

    async def start(self) -> int:
        key = asyncssh.generate_private_key("ssh-ed25519")
        self._listener = await asyncssh.listen(
            "127.0.0.1",
            0,
            server_factory=_AuthServer,
            server_host_keys=[key],
            sftp_factory=lambda conn: asyncssh.SFTPServer(conn, chroot=str(self.root)),
            process_factory=_process_factory(self.root),
        )
        self.port = self._listener.get_port()
        return self.port

    async def stop(self) -> None:
        if self._listener:
            self._listener.close()
            try:
                await asyncio.wait_for(self._listener.wait_closed(), timeout=2)
            except Exception:
                pass
        shutil.rmtree(self.root, ignore_errors=True)
