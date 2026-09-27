#!/usr/bin/env node
/**
 * verify-standalone.mjs — 「双击即玩」单文件产物验证（Playwright · 真实 file:// 路径）
 *
 * 目的
 * ----
 * 用户的实际操作是「双击 dist/isaac-standalone.html」。本脚本用**真实 file:// 协议**
 * 打开该产物，断言它在无 HTTP 服务、无网络的情况下可玩，并逐条打印实际数值。
 *
 * 断言
 * ----
 *  1) 控制台错误数 === 0（AudioContext autoplay 类警告单独统计并豁免）
 *  2) window.__ISAAC__ 存在
 *  3) 等待约 3.5s 后 __ISAAC__.game.scene === 'playing'（FLOOR_INTRO 过场约 2.1s）
 *  4) canvas 采样 uniqueColors > 3 且 avgLum > 5（证明不是纯黑）
 *  5) __ISAAC__.loop.fps >= 30
 *  6) 截图存 tests/shots/standalone-file-protocol.png
 *
 * 用法：node tests/verify-standalone.mjs
 * 退出码：0 = 全部 PASS，1 = 有失败
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'dist', 'isaac-standalone.html');
const SHOT_DIR = path.join(ROOT, 'tests', 'shots');
const SHOT = path.join(SHOT_DIR, 'standalone-file-protocol.png');
const SEED = '12345';

fs.mkdirSync(SHOT_DIR, { recursive: true });

if (!fs.existsSync(TARGET)) {
  console.error(`[verify-standalone] 产物不存在: ${TARGET}`);
  console.error('[verify-standalone] 请先运行: node tools/build-standalone.mjs');
  process.exit(1);
}

const fileUrl = 'file:///' + TARGET.replace(/\\/g, '/') + `?seed=${SEED}`;

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
}

const allConsole = [];
let browser = null;
let hasIsaac = false;
let scene = 'n/a';
let fpsVal = null;
let px = null;
let locationSearch = 'n/a';
let canvasSize = 'n/a';

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => allConsole.push({ type: m.type(), text: m.text() }));
  page.on('pageerror', (e) => allConsole.push({ type: 'pageerror', text: 'PAGEERROR: ' + e.message }));

  // 走真实 file:// 协议（用户双击的路径）
  await page.goto(fileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // __ISAAC__ 出现（真实墙钟）
  await page.waitForFunction(() => !!window.__ISAAC__, { timeout: 15000 }).catch(() => {});
  hasIsaac = await page.evaluate(() => typeof window.__ISAAC__ !== 'undefined');
  locationSearch = await page.evaluate(() => location.search);

  // 真实墙钟推进：等待 FLOOR_INTRO 自然走完（实测 ~2.1s），留足 3.5s
  await page.waitForFunction(() => {
    const g = window.__ISAAC__ && window.__ISAAC__.game;
    return g && g.scene === 'playing';
  }, { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(3500 - 2100); // 稳定 PLAYING 首帧（HUD/敌人）

  const st = await page.evaluate(() => {
    const I = window.__ISAAC__;
    if (!I) return { scene: 'n/a', fps: null };
    const c = document.getElementById('game');
    return {
      scene: I.game.scene,
      fps: I.loop.fps,
      canvasW: c ? c.width : null,
      canvasH: c ? c.height : null,
    };
  });
  scene = st.scene;
  fpsVal = st.fps;
  canvasSize = st.canvasW ? `${st.canvasW} x ${st.canvasH}` : 'n/a';

  // canvas 像素采样（直接读回放缓冲，非截图文件）
  px = await page.evaluate(() => {
    const c = document.getElementById('game');
    if (!c) return null;
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const set = new Set();
    let lum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 397) {
      set.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
      lum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      n++;
    }
    return { uniqueColors: set.size, avgLum: +(lum / Math.max(1, n)).toFixed(1) };
  });

  await page.screenshot({ path: SHOT });
} catch (e) {
  allConsole.push({ type: 'pageerror', text: 'HARNESS: ' + e.message });
} finally {
  if (browser) await browser.close();
}

// ---------- 断言 ----------
const EXEMPT = /AudioContext|autoplay|user gesture|Web Audio|DevTools|GPU|gpu|vulkan|dawn|gl_|sandbox/i;
const hardErrors = allConsole.filter((m) => (m.type === 'error' || m.type === 'pageerror'));
const exemptErrors = hardErrors.filter((m) => EXEMPT.test(m.text));
const realErrors = hardErrors.filter((m) => !EXEMPT.test(m.text));

check('1) 控制台错误数 === 0', realErrors.length === 0,
  `hard=${hardErrors.length}, exempt(AudioContext 等)=${exemptErrors.length}, 未豁免=${realErrors.length}` +
  (realErrors.length ? ` | ${realErrors.slice(0, 3).map((e) => e.text.slice(0, 120)).join(' || ')}` : ''));

check('2) window.__ISAAC__ 存在', hasIsaac, `typeof __ISAAC__ !== 'undefined' → ${hasIsaac}`);

check("3) 进入 PLAYING（scene === 'playing'）", scene === 'playing',
  `scene=${scene}（location.search=${JSON.stringify(locationSearch)}, canvas=${canvasSize}）`);

check('4) canvas 非纯黑（uniqueColors > 3 且 avgLum > 5）',
  !!px && px.uniqueColors > 3 && px.avgLum > 5,
  px ? `uniqueColors=${px.uniqueColors}, avgLum=${px.avgLum}` : 'canvas 采样失败');

check('5) FPS >= 30', fpsVal !== null && fpsVal >= 30,
  fpsVal !== null ? `${fpsVal} fps` : 'n/a');

check('6) 截图落盘', fs.existsSync(SHOT),
  `${path.relative(ROOT, SHOT).replace(/\\/g, '/')} (${fs.existsSync(SHOT) ? fs.statSync(SHOT).size : 0} bytes)`);

// ---------- 汇总 ----------
const fails = results.filter((r) => !r.pass);
console.log('\n=== STANDALONE VERIFY（file:// 真实路径）===');
console.log(`目标: ${fileUrl}`);
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  —  ${r.detail}`);
}
console.log(`\n判定: ${fails.length === 0 ? 'PASS' : 'FAIL'}  (${results.length - fails.length}/${results.length})`);
process.exit(fails.length === 0 ? 0 : 1);
