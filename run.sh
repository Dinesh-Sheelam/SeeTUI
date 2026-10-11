#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/engine"
exec uv run uvicorn app.main:app --host 127.0.0.1 --port 8765 --reload
