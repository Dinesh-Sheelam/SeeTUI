# SeeTUI — SSH Finder UI

A local Finder-style layer over SSH. Browse a Linux server like a desktop, drag files across, compress archives, and run health checks — all from `127.0.0.1`.

## Run

macOS and Linux:

```bash
chmod +x run.sh
./run.sh
```

Windows (PowerShell):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\run.ps1
```

Then open [http://127.0.0.1:8765](http://127.0.0.1:8765).

The UI is a React 19 + TypeScript + Tailwind 4 app in `ui/`. The Python API lives in `engine/`. After UI changes:

```bash
cd ui && npm install && npm run build
```

Vite writes into `engine/static/`, which FastAPI serves. For live reload: `cd ui && npm run dev` (proxies `/api` to port 8765).

Dock and folder icons live in `ui/src/desktop/AppIcons.tsx` and `FolderIcon.tsx`. With `npm run dev` running, open [http://127.0.0.1:5173/icons.html](http://127.0.0.1:5173/icons.html) to see every icon in all four appearances (dev only, not part of the build).

Dependencies for the engine are managed with **uv only**:

```bash
cd engine
uv sync --all-groups
uv run uvicorn app.main:app --host 127.0.0.1 --port 8765
uv run pytest
```

## Features

- Connect with password, PEM path, or a picked PEM file, with a visible handshake
- Finder-style file browser, drag-and-drop upload, download, zip / tar.gz
- Health tab: certificates, disk, firewall, packages, reverse proxy, quotas
- Performance tab: live CPU / RAM / load / disk / connections
- Server info note stored on the host
