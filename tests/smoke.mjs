#!/usr/bin/env node
/**
 * smoke.mjs — 启动即检烟雾门控（QA 严守真）
 *
 * ⚠️ 重要修订（v2.0 · 经受控 A/B 实验后改判）：
 *   旧版用系统 Chrome `--virtual-time-budget` 做「加载期快进」，这是**错误的**：
 *   实测该路径下 rAF 被压制到全程仅 5~6 帧（`trans=0.12`），游戏永远停在 FLOOR_INTRO，
 *   截图只是「首帧残留」——**工具伪影，非游戏缺陷**。
 *   同页在**真实墙钟**下 2.0s 即进入 PLAYING（fps=60，见 tests/qa-probe.mjs realtime）。
 *
 *   故 **权威路径 = 真实墙钟**（`--headless=new` 不加 `--virtual-time-budget`；
 *   本脚本用 Playwright 真实等待，等价用户真实浏览器）。
 *
 * 检查项：
 *  1) 无控制台错误（SyntaxError/TypeError/undefined 等）；AudioContext autoplay 警告豁免。
 *  2) canvas 非纯色空白（像素颜色多样性，零依赖 PNG 解码）。
 *  3) 进入 PLAYING（真实墙钟等待后判读 scene + HUD 像素）。
 *  4) FPS 读数存在且合理（≥30）。
 *
 * 用法：node tests/smoke.mjs
 * 退出码：0=PASS, 1=CONCERNS, 2=FAIL
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'tests', 'shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

// ---------- 极简静态服务器 ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png' };
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let u = decodeURIComponent(req.url.split('?')[0]);
      if (u === '/') u = '/index.html';
      const f = path.join(ROOT, u);
      if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(f, (e, d) => {
        if (e) { res.writeHead(404); res.end('404'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
        res.end(d);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// ---------- PNG 像素多样性（零依赖：解 PNG + inflate + 反滤波）----------
function decodePng(file) {
  const buf = fs.readFileSync(file);
  let p = 8; let width = 0, height = 0, bitDepth = 8, colorType = 6; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (!width || !height) return null;
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let ri = 0;
  for (let y = 0; y < height; y++) {
    const ft = raw[ri++];
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[ri++];
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = (x >= bpp && y > 0) ? out[(y - 1) * stride + x - bpp] : 0;
      let v;
      switch (ft) {
        case 0: v = rawByte; break;
        case 1: v = rawByte + a; break;
        case 2: v = rawByte + b; break;
        case 3: v = rawByte + ((a + b) >> 1); break;
        case 4: { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; v = rawByte + pr; break; }
        default: v = rawByte;
      }
      out[y * stride + x] = v & 0xff;
    }
  }
  return { width, height, bpp, stride, data: out };
}

function pngDiversity(file) {
  const img = decodePng(file);
  if (!img) return { ok: false, reason: 'bad png' };
  const { width, height, bpp, stride, data: out } = img;
  const colors = new Set(); let lumSum = 0, lumMin = 255, lumMax = 0, n = 0;
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const i = y * stride + x * bpp;
      const r = out[i], g = out[i + 1], b = out[i + 2];
      colors.add((r >> 3) << 10 | (g >> 3) << 5 | (b >> 3));
      const lum = (r * 299 + g * 587 + b * 114) / 1000;
      lumSum += lum; lumMin = Math.min(lumMin, lum); lumMax = Math.max(lumMax, lum); n++;
    }
  }
  return { ok: true, width, height, uniqueColors: colors.size, avgLum: Math.round(lumSum / n), lumRange: Math.round(lumMax - lumMin) };
}

/** 检测左上角/左下角 HUD：红心（纯红像素）+ 属性条（彩色像素） */
function detectHud(file) {
  const img = decodePng(file);
  if (!img) return { playing: false, reason: 'no png' };
  const { width, height, bpp, stride, data } = img;
  function countRed(x0, y0, x1, y1) {
    let c = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * stride + x * bpp; const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > 150 && g < 90 && b < 90) c++;
      if (c > 60) return c;
    }
    return c;
  }
  // HUD 顶部：左上角红心区（约 x<260, y<50）；左下角属性条区（约 x<130, y 在 480-620）
  const hearts = countRed(Math.round(width * 0.02), Math.round(height * 0.02), Math.round(width * 0.22), Math.round(height * 0.07));
  // FLOOR_INTRO 遮罩判定：中心区域近黑占比高（面板 alpha 0.92）
  let darkCenter = 0, tot = 0;
  const cx0 = Math.round(width * 0.3), cx1 = Math.round(width * 0.7);
  const cy0 = Math.round(height * 0.3), cy1 = Math.round(height * 0.7);
  for (let y = cy0; y < cy1; y += 3) for (let x = cx0; x < cx1; x += 3) {
    const i = y * stride + x * bpp; const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = (r + g + b) / 3; if (lum < 32) darkCenter++; tot++;
  }
  const darkRatio = darkCenter / Math.max(1, tot);
  const playing = hearts > 0 && darkRatio < 0.85;
  return { playing, heartsPx: hearts, darkCenterRatio: +darkRatio.toFixed(2), hint: playing ? '检测到 HUD 红心，已进入 PLAYING' : (hearts === 0 ? '未检测到 HUD 红心 → 可能仍在 FLOOR_INTRO/TITLE' : '中心仍为 FLOOR_INTRO 遮罩') };
}


// ---------- 主流程（真实墙钟 · 权威路径）----------
const results = [];
const { server, port } = await startServer();
const base = `http://127.0.0.1:${port}`;
const shotPath = path.join(SHOT_DIR, 'qa-smoke.png');
// 注：截图由 Playwright 直接覆盖写入，无需先删。
// 早期版本在此调用 fs.rmSync(shotPath)，会在受限沙箱中触发批量删除保护导致门控误失败。
// 已移除——「覆盖写」是本路径唯一需要的行为。

const consoleErrors = [];
let browser = null;
let enteredPlaying = false;
let fpsVal = null;
let hudData = null;
let sceneSeen = 'n/a';

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));

  // 走 HTTP（file:// 会被 CORS 拦截 → 必白屏）
  await page.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !!window.__ISAAC__, { timeout: 15000 });

  // 真实墙钟推进：启动 → 等待 FLOOR_INTRO 自然走完（实测 ~2.0s）
  await page.evaluate(() => window.__ISAAC__.game.startGame(12345));
  await page.waitForFunction(() => {
    const g = window.__ISAAC__ && window.__ISAAC__.game;
    return g && g.scene === 'playing';
  }, { timeout: 12000 }).catch(() => { });
  await page.waitForTimeout(800); // 让 PLAYING 首帧（HUD/敌人）稳定

  const st = await page.evaluate(() => {
    const I = window.__ISAAC__;
    return { scene: I.game.scene, fps: I.loop.fps, enemies: (I.game.currentRoom?.enemies || []).filter(e => e.alive).length };
  });
  sceneSeen = st.scene;
  fpsVal = st.fps;
  enteredPlaying = st.scene === 'playing';

  await page.screenshot({ path: shotPath });
} catch (e) {
  consoleErrors.push('HARNESS: ' + e.message);
} finally {
  if (browser) await browser.close();
  server.close();
}

// 1) 控制台错误
const errLines = consoleErrors.filter(l => /error|exception|uncaught|SyntaxError|TypeError|is not a function|is not defined|undefined/i.test(l))
  .filter(l => !/AudioContext|autoplay|user gesture|DevTools|TensorFlow|registration|GCM|gpu|vulkan|dawn|gl_|sandbox|voice_trans|GPU/i.test(l));
const hasConsoleError = errLines.length > 0;
results.push({ name: '无控制台错误', pass: !hasConsoleError, detail: hasConsoleError ? errLines.slice(0, 5) : '仅 AudioContext autoplay 警告（豁免）' });

// 2) canvas 内容（零依赖 PNG 像素分析）
let div = { ok: false, reason: 'no shot' };
if (fs.existsSync(shotPath)) div = pngDiversity(shotPath);
const hasContent = div.ok && div.uniqueColors >= 24 && div.lumRange >= 30;
results.push({ name: 'canvas 有实际内容', pass: hasContent, detail: div });

// 3) 进入 PLAYING（真实墙钟读 scene）
results.push({ name: '进入 PLAYING（真实墙钟路径）', pass: enteredPlaying, detail: { scene: sceneSeen, ...(div.ok ? detectHud(shotPath) : {}) } });

// 4) FPS
const fpsOk = enteredPlaying && fpsVal >= 30;
results.push({ name: 'FPS 存在且合理(≥30)', pass: fpsOk, detail: fpsVal !== null ? `${fpsVal} fps` : 'n/a' });

// ---------- 汇总 ----------
const fails = results.filter(r => !r.pass);
let verdict = 'PASS';
if (fails.some(f => f.name.startsWith('无控制台错误') || f.name.startsWith('canvas 有实际内容') || f.name.startsWith('进入 PLAYING'))) verdict = 'FAIL';
else if (fails.length) verdict = 'CONCERNS';

console.log('\n=== SMOKE GATE（真实墙钟路径）===');
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  —  ${typeof r.detail === 'object' ? JSON.stringify(r.detail) : r.detail}`);
console.log(`\n判定: ${verdict}`);
if (verdict === 'FAIL') console.log('阻塞项: ' + fails.map(f => f.name).join(', '));
process.exit(verdict === 'PASS' ? 0 : verdict === 'CONCERNS' ? 1 : 2);
