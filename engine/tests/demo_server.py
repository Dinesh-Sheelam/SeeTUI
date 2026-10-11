"""Start a local fake SSH server for UI demos. Prints host/port/user/password."""

from __future__ import annotations

import asyncio

from tests.fake_ssh_server import PASSWORD, USERNAME, FakeSSH


async def main() -> None:
    server = FakeSSH()
    port = await server.start()
    print(f"ssh {USERNAME}@127.0.0.1 -p {port}", flush=True)
    print(f"password: {PASSWORD}", flush=True)
    print(f"root: {server.root}", flush=True)
    try:
        while True:
            await asyncio.sleep(3600)
    finally:
        await server.stop()


if __name__ == "__main__":
    asyncio.run(main())
