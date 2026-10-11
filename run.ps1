# Start SeeTUI on Windows.
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\run.ps1
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath (Join-Path $PSScriptRoot "engine")

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Error "uv is not installed. Install it from https://docs.astral.sh/uv/ then run this script again."
}

& uv run uvicorn app.main:app --host 127.0.0.1 --port 8765 --reload
exit $LASTEXITCODE
