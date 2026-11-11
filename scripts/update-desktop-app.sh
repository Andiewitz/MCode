#!/usr/bin/env sh
# Update the installed MCode desktop app:
#   1. build the binary (release by default, MCODE_PROFILE=debug for a quick one)
#   2. point the launcher (~/.local/share/applications/mcode.desktop) at it
#
# Run it from any terminal after pulling new code:
#   sh scripts/update-desktop-app.sh
set -e

cd "$(dirname "$0")/.."

# rustup installs cargo into ~/.cargo/bin which some terminals don't have on PATH.
PATH="$HOME/.cargo/bin:$PATH"
export PATH

PROFILE="${MCODE_PROFILE:-release}"
if [ "$PROFILE" = "debug" ]; then
  echo "==> cargo build -p mcode (debug — faster build, slower app)"
  cargo build -p mcode
  BIN="$PWD/target/debug/mcode"
else
  echo "==> cargo build --release -p mcode (first run takes a few minutes)"
  cargo build --release -p mcode
  BIN="$PWD/target/release/mcode"
fi

test -x "$BIN" || { echo "error: $BIN was not produced" >&2; exit 1; }

DESKTOP_DIR="$HOME/.local/share/applications"
DESKTOP="$DESKTOP_DIR/mcode.desktop"
mkdir -p "$DESKTOP_DIR"

if [ -f "$DESKTOP" ]; then
  # Refresh Exec/Path/Icon in the existing entry.
  sed -i "s|^Exec=.*|Exec=$BIN|; s|^Path=.*|Path=$PWD|; s|^Icon=.*|Icon=$PWD/src-tauri/icons/icon.png|" "$DESKTOP"
else
  cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=MCode
Comment=Lightweight IDE (Tauri)
Exec=$BIN
Path=$PWD
Icon=$PWD/src-tauri/icons/icon.png
Terminal=false
Categories=Development;IDE;TextEditor;
StartupNotify=true
EOF
fi

command -v update-desktop-database >/dev/null 2>&1 &&
  update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true

echo "==> launcher updated: $DESKTOP"
echo "    Exec -> $BIN"
echo "==> quit MCode if it is running, then start it again from your app menu."
