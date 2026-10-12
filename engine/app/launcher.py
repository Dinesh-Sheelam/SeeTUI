"""Desktop launcher: local API plus a native SeeTUI window."""

from __future__ import annotations

import json
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import uvicorn
import webview

from app.main import activate_event, app

HOST = "127.0.0.1"
PORT_START = 8765
PORT_END = 8775
WINDOW_WIDTH = 1280
WINDOW_HEIGHT = 800
_CHUNK = 64 * 1024


def _is_seetui(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://{HOST}:{port}/api/healthz", timeout=0.5) as res:
            payload = json.loads(res.read().decode())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return False
    return payload.get("app") == "SeeTUI" and payload.get("ok") == "true"


def _activate_existing(port: int) -> bool:
    req = urllib.request.Request(
        f"http://{HOST}:{port}/api/desktop/activate",
        data=b"",
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=1.0) as res:
            return res.status == 200
    except (urllib.error.URLError, TimeoutError):
        return False


def _port_is_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((HOST, port))
        except OSError:
            return False
    return True


def _pick_port() -> int | None:
    for port in range(PORT_START, PORT_END + 1):
        if _is_seetui(port):
            if _activate_existing(port):
                return None
            continue
        if _port_is_free(port):
            return port
    return -1


def _wait_ready(port: int, timeout: float = 30.0) -> bool:
    deadline = time.monotonic() + timeout
    url = f"http://{HOST}:{port}/api/healthz"
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=0.5) as res:
                if res.status == 200:
                    return True
        except (urllib.error.URLError, TimeoutError):
            time.sleep(0.05)
    return False


def _safe_local_url(url: str, base: str) -> str | None:
    absolute = urljoin(base, url)
    parsed = urlparse(absolute)
    if parsed.scheme != "http" or parsed.hostname not in {HOST, "localhost"}:
        return None
    if not parsed.path.startswith("/api/"):
        return None
    return absolute


class DesktopApi:
    def __init__(self, base_url: str) -> None:
        self._base = base_url.rstrip("/") + "/"

    def save_download(self, url: str, name: str) -> bool:
        absolute = _safe_local_url(url, self._base)
        if absolute is None:
            return False
        suggested = Path(name).name or "download"
        destination = webview.windows[0].create_file_dialog(
            webview.SAVE_DIALOG,
            save_filename=suggested,
        )
        if not destination:
            return False
        path = destination if isinstance(destination, str) else destination[0]
        try:
            with urllib.request.urlopen(absolute, timeout=600) as res, open(path, "wb") as out:
                while True:
                    chunk = res.read(_CHUNK)
                    if not chunk:
                        break
                    out.write(chunk)
        except (urllib.error.URLError, TimeoutError, OSError):
            return False
        return True


def _focus_window(window: Any) -> None:
    try:
        window.restore()
    except Exception:
        pass
    try:
        window.show()
    except Exception:
        pass
    if sys.platform == "darwin":
        try:
            from AppKit import NSApp, NSApplicationActivateIgnoringOtherApps

            NSApp.activateIgnoringOtherApps_(True)
        except Exception:
            pass


def _watch_activate(window: Any, stop: threading.Event) -> None:
    while not stop.wait(0.25):
        if activate_event.is_set():
            activate_event.clear()
            _focus_window(window)


def _show_error(message: str) -> None:
    try:
        webview.create_window("SeeTUI", html=f"<h3 style='font-family:sans-serif;padding:24px'>{message}</h3>", width=480, height=200)
        webview.start()
    except Exception:
        print(message, file=sys.stderr)


def main() -> int:
    port = _pick_port()
    if port is None:
        return 0
    if port == -1:
        _show_error("SeeTUI could not find a free local port (8765–8775).")
        return 1

    config = uvicorn.Config(
        app,
        host=HOST,
        port=port,
        log_level="warning",
        access_log=False,
    )
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, name="seetui-uvicorn", daemon=True)
    thread.start()

    if not _wait_ready(port):
        server.should_exit = True
        _show_error("SeeTUI failed to start its local server.")
        return 1

    base = f"http://{HOST}:{port}"
    api = DesktopApi(base)
    window = webview.create_window(
        "SeeTUI",
        url=base,
        width=WINDOW_WIDTH,
        height=WINDOW_HEIGHT,
        min_size=(900, 600),
        js_api=api,
    )
    stop = threading.Event()
    watcher = threading.Thread(target=_watch_activate, args=(window, stop), name="seetui-activate", daemon=True)
    watcher.start()

    try:
        webview.start()
    except Exception as exc:
        message = str(exc)
        if sys.platform.startswith("win") and "WebView2" in message:
            _show_error(
                "SeeTUI needs the Microsoft Edge WebView2 runtime. "
                "Install it from https://developer.microsoft.com/microsoft-edge/webview2/ then try again."
            )
        else:
            _show_error(f"SeeTUI could not open its window: {exc}")
        return 1
    finally:
        stop.set()
        server.should_exit = True
        thread.join(timeout=5)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
