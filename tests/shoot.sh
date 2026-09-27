#!/usr/bin/env bash
# shoot.sh — Headless screenshot harness (Chrome/Edge, zero dependencies)
#
# usage: bash tests/shoot.sh <url> <out.png> [width] [height] [waitMs] [real|vt]
#
#   real (默认) 真实墙钟 + --timeout。rAF 正常推进，用于验证游戏行为。
#   vt          虚拟时间 --virtual-time-budget。仅用于静态/起始画面。
#
# ⚠️ 血泪教训：--virtual-time-budget 会让 Chrome 把 requestAnimationFrame
#    折叠成极稀疏的大步长回调（实测 ~400ms/帧 ≈ 2.5FPS）。
#    实测：4005ms 墙钟 → rAF 仅回调 10 次 → 游戏时间仅推进 ~0.22s。
#    因此 **绝不能** 用它验证任何依赖累计时间的逻辑（过场推进、动画、AI 计时），
#    否则游戏看起来会「卡死」，而那是测量伪影，不是代码缺陷。
#    验证游戏行为一律用 real。
#
# ⚠️ 另一坑：ES Module 在 file:// 下被 CORS 拦截 → 必须用 http:// 服务。

BROWSER="/c/Program Files/Google/Chrome/Application/chrome.exe"
[ -f "$BROWSER" ] || BROWSER="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"

URL="$1"
[ -z "$URL" ] && { echo "usage: bash tests/shoot.sh <url> <out.png> [w] [h] [waitMs] [real|vt]"; exit 2; }
[ -z "$2" ] && { echo "error: missing output path"; exit 2; }

OUTDIR="$(cd "$(dirname "$2")" && pwd)"
OUT="$OUTDIR/$(basename "$2")"
case "$OUT" in /*) OUT="$(cygpath -w "$OUT")";; esac

W="${3:-1280}"; H="${4:-860}"; WAIT="${5:-4000}"; MODE="${6:-real}"
rm -f "$OUTDIR/$(basename "$2")"

if [ "$MODE" = "vt" ]; then
  "$BROWSER" --headless=new --disable-gpu --hide-scrollbars --no-sandbox \
    --window-size="${W},${H}" --screenshot="$OUT" \
    --virtual-time-budget="$WAIT" --run-all-compositor-stages-before-draw \
    "$URL" 2>&1 | grep -viE "devtools|tensorflow|voice_trans|registration|GCM|gpu|vulkan|dawn|sandbox" | head -3
else
  "$BROWSER" --headless=new --disable-gpu --hide-scrollbars --no-sandbox \
    --window-size="${W},${H}" --screenshot="$OUT" \
    --timeout="$WAIT" \
    "$URL" 2>&1 | grep -viE "devtools|tensorflow|voice_trans|registration|GCM|gpu|vulkan|dawn|sandbox" | head -3
fi

if [ -f "$OUTDIR/$(basename "$2")" ]; then
  echo "OK[$MODE]: $OUTDIR/$(basename "$2") ($(stat -c%s "$OUTDIR/$(basename "$2")") bytes)"
else
  echo "FAIL[$MODE]: $OUTDIR/$(basename "$2")"
  exit 1
fi
