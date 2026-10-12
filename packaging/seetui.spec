# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for SeeTUI desktop builds."""

from __future__ import annotations

import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_submodules

# SPECPATH is the directory that contains this .spec file.
PACKAGING = Path(SPECPATH).resolve()
ROOT = PACKAGING.parent
ENGINE = ROOT / "engine"
STATIC = ENGINE / "static"
ICONS = PACKAGING / "icons"

datas = [(str(STATIC), "static")]
binaries: list = []
hiddenimports = [
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
]

for package in ("webview", "uvicorn", "asyncssh", "cryptography", "httpx", "anyio", "httpcore", "h11", "certifi"):
    try:
        pkg_datas, pkg_binaries, pkg_hidden = collect_all(package)
        datas += pkg_datas
        binaries += pkg_binaries
        hiddenimports += pkg_hidden
    except Exception:
        hiddenimports.append(package)

hiddenimports += collect_submodules("app")

if sys.platform == "darwin":
    for package in ("objc", "AppKit", "Foundation", "WebKit", "Quartz", "CoreFoundation"):
        try:
            pkg_datas, pkg_binaries, pkg_hidden = collect_all(package)
            datas += pkg_datas
            binaries += pkg_binaries
            hiddenimports += pkg_hidden
        except Exception:
            hiddenimports += collect_submodules(package)

icon = None
if sys.platform == "darwin" and (ICONS / "seetui.icns").is_file():
    icon = str(ICONS / "seetui.icns")
elif sys.platform.startswith("win") and (ICONS / "seetui.ico").is_file():
    icon = str(ICONS / "seetui.ico")

a = Analysis(
    [str(ENGINE / "app" / "launcher.py")],
    pathex=[str(ENGINE)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest", "pytest_asyncio"],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data)

if sys.platform == "darwin":
    exe = EXE(
        pyz,
        a.scripts,
        [],
        exclude_binaries=True,
        name="SeeTUI",
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=False,
        console=False,
        disable_windowed_traceback=False,
        argv_emulation=False,
        target_arch=None,
        codesign_identity=None,
        entitlements_file=None,
        icon=icon,
    )
    coll = COLLECT(
        exe,
        a.binaries,
        a.zipfiles,
        a.datas,
        strip=False,
        upx=False,
        upx_exclude=[],
        name="SeeTUI",
    )
    app = BUNDLE(
        coll,
        name="SeeTUI.app",
        icon=icon,
        bundle_identifier="com.seetui.app",
        info_plist={
            "CFBundleName": "SeeTUI",
            "CFBundleDisplayName": "SeeTUI",
            "CFBundleShortVersionString": "0.1.0",
            "CFBundleVersion": "0.1.0",
            "NSHighResolutionCapable": True,
            "LSMinimumSystemVersion": "12.0",
        },
    )
else:
    exe = EXE(
        pyz,
        a.scripts,
        a.binaries,
        a.zipfiles,
        a.datas,
        [],
        name="SeeTUI",
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=False,
        upx_exclude=[],
        runtime_tmpdir=None,
        console=False,
        disable_windowed_traceback=False,
        argv_emulation=False,
        target_arch=None,
        codesign_identity=None,
        entitlements_file=None,
        icon=icon,
    )
