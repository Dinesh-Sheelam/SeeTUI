# SeeTUI

A UI layer for vibe coders — do the usual server work without living in the terminal.

Connect over SSH, then browse files like a Finder window, upload and download, zip archives, open a terminal when you need one, check health and performance, and open folders in your local editor. The app runs only on your machine at `127.0.0.1`. Nothing is hosted in the cloud.

## 🔄 How it works

```
Your computer                    Remote Linux server
┌─────────────────────┐         ┌──────────────────┐
│  SeeTUI UI (React)  │         │  files, services │
│         │           │  SSH    │  certificates…   │
│  FastAPI engine     │ ──────► │                  │
│  (127.0.0.1:8765)   │         └──────────────────┘
└─────────────────────┘
```

1. You start SeeTUI locally with `run.sh` or `run.ps1`.
2. The React UI talks to a FastAPI engine on `127.0.0.1` only.
3. The engine opens an SSH (and SFTP) session to your server and runs the actions you click in the UI.
4. Auth stays on your machine: password, PEM path, or a picked key file. Credentials are not uploaded to a third party.

Vite builds the UI into `engine/static/`. FastAPI serves that static app and the `/api` routes together.

## ✨ What you can do

- 🔑 Connect with password, PEM path, or a picked PEM file
- 📂 Browse the remote filesystem with a Finder-style UI
- 📤 Upload, download, zip / tar.gz, and extract archives
- 💻 Built-in terminal when you still want a shell
- 📝 Open a remote path in VS Code, Cursor, or similar (Remote SSH)
- 🏥 Health: certificates, disk, firewall, packages, reverse proxy, quotas
- 📊 Performance: live CPU, RAM, load, disk, connections, ports, services
- 📌 Server info note stored on the host

## 🛠️ Requirements

| Tool | Notes |
|------|--------|
| [uv](https://docs.astral.sh/uv/) | Python deps for `engine/` (Python 3.13+) |
| Node.js + npm | Build or live-reload the UI in `ui/` |
| A Linux SSH host | Password or PEM access |

## 📁 Project structure

```
seetui/
├── run.sh / run.ps1     # Start the local API
├── engine/              # FastAPI + SSH/SFTP (uv project)
│   ├── app/             # App code, routers, health probes
│   ├── static/          # Built UI (from Vite)
│   └── tests/
└── ui/                  # React 19 + TypeScript + Tailwind 4
    └── src/             # Desktop shell, features, API client
```

| Path | Role |
|------|------|
| `engine/app/main.py` | FastAPI app, serves API + static UI |
| `engine/app/ssh_service.py` | SSH / SFTP helpers |
| `engine/app/routers/` | Session, files, transfers, health, performance, terminal… |
| `ui/src/desktop/` | Dock, windows, Finder-style chrome |
| `ui/src/features/` | Connect, files, transfers, health, performance, terminal… |

## 🚀 Run locally

Install [uv](https://docs.astral.sh/uv/) and [Node.js](https://nodejs.org/) first, then follow these three steps from the repo root.

### 1. 📦 Engine — install Python deps

```bash
cd engine
uv sync
```

### 2. 🎨 UI — install npm deps

```bash
cd ui
npm install
```

If `engine/static/` is missing or you changed the UI, also build it once:

```bash
npm run build
```

### 3. ▶️ Start SeeTUI

Back in the repo root, run the start script for your OS.

**macOS / Linux:**

```bash
chmod +x run.sh
./run.sh
```

**Windows (PowerShell):**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\run.ps1
```

Then open [http://127.0.0.1:8765](http://127.0.0.1:8765). The script starts the API (with reload) on port `8765` and serves the UI from there.

### 🔄 Live UI reload (optional)

Keep `./run.sh` or `.\run.ps1` running, then in another terminal:

```bash
cd ui
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Vite proxies `/api` to port `8765`.

### 🧪 Tests

```bash
cd engine
uv run pytest
```
