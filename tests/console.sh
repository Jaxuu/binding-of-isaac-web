#!/usr/bin/env bash
# Capture console + page errors from headless Chrome via --enable-logging
BROWSER="/c/Program Files/Google/Chrome/Application/chrome.exe"
[ -f "$BROWSER" ] || BROWSER="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
URL="$1"; WAIT="${2:-3000}"
PROF="$(mktemp -d)"
"$BROWSER" --headless=new --disable-gpu --no-sandbox --user-data-dir="$PROF" \
  --enable-logging=stderr --v=0 --virtual-time-budget="$WAIT" \
  --dump-dom "$URL" 2>&1 | grep -iE "error|exception|uncaught|failed|CONSOLE" | grep -viE "gpu|vulkan|dawn|gl_|sandbox|voice|registration|TensorFlow|DevTools" | head -30
rm -rf "$PROF"
