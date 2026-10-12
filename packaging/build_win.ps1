# Build SeeTUI-<version>.exe on Windows.
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\packaging\build_win.ps1
$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Engine = Join-Path $Root "engine"
$Ui = Join-Path $Root "ui"
$Dist = Join-Path $Root "dist"

Set-Location -LiteralPath $Engine
$Version = (& uv run python -c "import tomllib; print(tomllib.load(open('pyproject.toml','rb'))['project']['version'])").Trim()
if (-not $Version) { throw "Could not read project version" }

$ExeOut = Join-Path $Dist "SeeTUI-$Version.exe"

Set-Location -LiteralPath $Ui
npm install
npm run build

Set-Location -LiteralPath $Engine
uv sync --group packaging --group dev
uv run python (Join-Path $Root "packaging\make_icons.py")

$BuildDir = Join-Path $Root "build"
if (Test-Path $BuildDir) { Remove-Item -Recurse -Force $BuildDir }
if (Test-Path (Join-Path $Dist "SeeTUI.exe")) { Remove-Item -Force (Join-Path $Dist "SeeTUI.exe") }
if (Test-Path $ExeOut) { Remove-Item -Force $ExeOut }

uv run pyinstaller --noconfirm --clean --distpath $Dist --workpath $BuildDir (Join-Path $Root "packaging\seetui.spec")

$Built = Join-Path $Dist "SeeTUI.exe"
if (-not (Test-Path $Built)) { throw "Expected $Built after PyInstaller" }
Move-Item -Force $Built $ExeOut

Write-Host "Built $ExeOut"
