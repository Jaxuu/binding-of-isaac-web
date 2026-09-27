/**
 * qa-probe.mjs — 独立 QA 探针（严守真）
 * 目的：对比「真实浏览器时间（Playwright real-time）」与「虚拟时间（shoot.sh --virtual-time-budget）」
 *      下 FLOOR_INTRO → PLAYING 的推进情况，验证 BUG-002 是否仍存在。
 * 仅用于 QA 调查，不属于产品代码。
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:/Project/Wkbd-project/case-yisa';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') u = '/index.html';
  const f = path.join(ROOT, u);
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(d);
  });
});

function snapshot() {
  const g = window.__ISAAC__.game;
  const L = window.__ISAAC__.loop;
  const room = g.currentRoom || {};
  return {
    scene: g.scene,
    transitionT: +(g.transitionT || 0).toFixed(2),
    sceneT: +(g.sceneT || 0).toFixed(2),
    enemiesAlive: (room.enemies || []).filter(e => e.alive).length,
    pickups: (room.pickups || []).length,
    loopAcc: +(L._acc || 0).toFixed(3),
    fps: L.fps,
    steps: L._lastSteps ?? null,
  };
}

const mode = process.argv[2] || 'realtime';

await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForFunction(() => !!window.__ISAAC__, { timeout: 15000 });
await page.evaluate(() => window.__ISAAC__.game.startGame(12345));

if (mode === 'realtime') {
  const samples = [];
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(400);
    samples.push({ ms: (i + 1) * 400, ...(await page.evaluate(snapshot)) });
  }
  console.log('=== REALTIME (Playwright waitForTimeout) ===');
  samples.forEach(s => console.log(JSON.stringify(s)));
} else if (mode === 'freeze') {
  // Simulate a long main-thread stall (like a hidden tab / heavy GC): busy-wait ~1.5s
  await page.evaluate(() => {
    const t0 = performance.now();
    while (performance.now() - t0 < 1500) { /* block */ }
  });
  await page.waitForTimeout(2500);
  console.log('=== AFTER 1.5s MAIN-THREAD FREEZE + 2.5s REAL ===');
  console.log(JSON.stringify(await page.evaluate(snapshot)));
  console.log('errors:', JSON.stringify(errs));
} else if (mode === 'virtualaware') {
  // Report how much the accumulator discards: log steps per tick
  await page.evaluate(() => {
    const L = window.__ISAAC__.loop;
    window.__stepLog = [];
    const orig = L._tick;
    L._tick = function (now) {
      const before = this._acc;
      orig.call(this, now);
      window.__stepLog.push({ acc: +this._acc.toFixed(3), frameMs: +this.frameMs.toFixed(1) });
      if (window.__stepLog.length > 60) window.__stepLog.shift();
    };
  });
  await page.waitForTimeout(2000);
  const log = await page.evaluate(() => window.__stepLog.slice(-20));
  console.log('=== STEP LOG (last 20 ticks) ===');
  log.forEach(l => console.log(JSON.stringify(l)));
}

console.log('errors:', JSON.stringify(errs));
await browser.close();
server.close();
