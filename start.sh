#!/usr/bin/env sh
# ==========================================================================
#  start.sh - one-click local HTTP server for the MODULAR version (index.html)
#
#  Why a server at all?
#    index.html uses native ES Modules (<script type="module">). Browsers
#    BLOCK module scripts loaded over file:// (CORS, origin 'null'), so the
#    modular build only works over http(s). This script starts a tiny static
#    server and opens the browser for you.
#
#  Do you even need this?
#    No - for "double-click and play" just open:
#        dist/isaac-standalone.html
#    That single file is fully self-contained (no server, no network).
# ==========================================================================

set -e

PORT=8080
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

open_url() {
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$1" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then
    open "$1" >/dev/null 2>&1 &
  fi
}

if command -v python3 >/dev/null 2>&1; then
  SRV="python3 -m http.server $PORT"
elif command -v python >/dev/null 2>&1; then
  SRV="python -m http.server $PORT"
elif command -v node >/dev/null 2>&1; then
  SRV="npx --yes serve -l $PORT ."
else
  echo "[start] ERROR: neither Python nor Node was found on this machine."
  echo "[start] TIP  : just open dist/isaac-standalone.html - no server needed."
  exit 1
fi

echo "[start] Serving $DIR on http://127.0.0.1:$PORT"
echo "[start] Press Ctrl+C to stop."

# Open the browser shortly after the server starts, then run the server.
( sleep 1; open_url "http://127.0.0.1:$PORT/" ) &
exec $SRV
