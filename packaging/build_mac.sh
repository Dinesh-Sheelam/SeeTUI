#!/usr/bin/env bash
# Build SeeTUI.app and a distributable .dmg on macOS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(python3 -c "import tomllib; print(tomllib.load(open('${ROOT}/engine/pyproject.toml','rb'))['project']['version'])")"
DIST="${ROOT}/dist"
APP="${DIST}/SeeTUI.app"
DMG="${DIST}/SeeTUI-${VERSION}.dmg"

cd "${ROOT}/ui"
npm install
npm run build

cd "${ROOT}"
python3 packaging/make_icons.py

cd "${ROOT}/engine"
uv sync --group packaging --group dev
rm -rf "${ROOT}/build" "${DIST}/SeeTUI" "${APP}" "${DMG}"
uv run pyinstaller --noconfirm --clean --distpath "${DIST}" --workpath "${ROOT}/build" "${ROOT}/packaging/seetui.spec"

if [[ ! -d "${APP}" ]]; then
  echo "Expected ${APP} after PyInstaller" >&2
  exit 1
fi

export SEETUI_APP="${APP}"
export SEETUI_VOLUME="SeeTUI ${VERSION}"
export SEETUI_ICON="${ROOT}/packaging/icons/seetui.icns"
uv run dmgbuild -s "${ROOT}/packaging/dmg_settings.py" "SeeTUI ${VERSION}" "${DMG}"

echo "Built ${DMG}"
