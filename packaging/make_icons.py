#!/usr/bin/env python3
"""Generate SeeTUI app icons (PNG, ICNS, ICO) with the standard library only."""

from __future__ import annotations

import struct
import subprocess
import sys
import tempfile
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ICONS = ROOT / "icons"


def _chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path: Path, size: int, rgba: bytes) -> None:
    raw = b"".join(b"\x00" + rgba[y * size * 4 : (y + 1) * size * 4] for y in range(size))
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", zlib.compress(raw, 9)) + _chunk(b"IEND", b""))


def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def paint(size: int) -> bytes:
    pixels = bytearray(size * size * 4)
    radius = size * 0.22
    cx = cy = size / 2
    for y in range(size):
        for x in range(size):
            # Rounded square mask
            dx = abs(x + 0.5 - cx) - (size / 2 - radius)
            dy = abs(y + 0.5 - cy) - (size / 2 - radius)
            outside = (max(dx, 0.0) ** 2 + max(dy, 0.0) ** 2) ** 0.5 + min(max(dx, dy), 0.0)
            alpha = max(0.0, min(1.0, 1.5 - outside))
            # Blue gradient fill
            t = (y / max(size - 1, 1))
            r = int(_lerp(56, 28, t))
            g = int(_lerp(132, 90, t))
            b = int(_lerp(255, 210, t))
            # Simple "S" mark
            nx = (x + 0.5) / size
            ny = (y + 0.5) / size
            in_s = (
                (0.32 < nx < 0.68 and 0.28 < ny < 0.40)
                or (0.32 < nx < 0.48 and 0.40 < ny < 0.50)
                or (0.32 < nx < 0.68 and 0.50 < ny < 0.58)
                or (0.52 < nx < 0.68 and 0.58 < ny < 0.68)
                or (0.32 < nx < 0.68 and 0.68 < ny < 0.80)
            )
            if in_s:
                r, g, b = 255, 255, 255
            i = (y * size + x) * 4
            pixels[i : i + 4] = bytes((r, g, b, int(255 * alpha)))
    return bytes(pixels)


def write_ico(path: Path, sizes: list[int]) -> None:
    images: list[tuple[int, bytes]] = []
    for size in sizes:
        png = Path(tempfile.mkstemp(suffix=".png")[1])
        write_png(png, size, paint(size))
        data = png.read_bytes()
        png.unlink(missing_ok=True)
        images.append((size, data))
    count = len(images)
    offset = 6 + 16 * count
    out = bytearray(struct.pack("<HHH", 0, 1, count))
    payload = bytearray()
    for size, data in images:
        out += struct.pack("<BBBBHHII", size if size < 256 else 0, size if size < 256 else 0, 0, 0, 1, 32, len(data), offset + len(payload))
        payload += data
    path.write_bytes(bytes(out) + payload)


def write_icns(icns_path: Path) -> None:
    iconset = Path(tempfile.mkdtemp()) / "seetui.iconset"
    iconset.mkdir(parents=True)
    for size, name in [
        (16, "icon_16x16.png"),
        (32, "diana.k@example.org"),
        (32, "icon_32x32.png"),
        (64, "ivan.p@example.net"),
        (128, "icon_128x128.png"),
        (256, "wendy.h@example.net"),
        (256, "icon_256x256.png"),
        (512, "alice.j@example.com"),
        (512, "icon_512x512.png"),
        (1024, "alice.j@example.com"),
    ]:
        write_png(iconset / name, size, paint(size))
    subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(icns_path)], check=True)


def main() -> int:
    ICONS.mkdir(parents=True, exist_ok=True)
    master = ICONS / "seetui-1024.png"
    write_png(master, 1024, paint(1024))
    write_png(ICONS / "seetui-256.png", 256, paint(256))
    write_ico(ICONS / "seetui.ico", [16, 32, 48, 64, 128, 256])
    if sys.platform == "darwin":
        write_icns(ICONS / "seetui.icns")
    print(f"Icons written under {ICONS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
