/**
 * qa-vt-probe.mjs — 虚拟时间下的时间压缩量化（QA 严守真）
 * 用法: node tests/qa-vt-probe.mjs
 * 说明: 用 CDP Emulation.setVirtualTimePolicy 模拟 Chrome --virtual-time-budget 行为，
 *       测量「游戏内 sceneT/transitionT 推进」vs「虚拟时间推进」的比值。
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
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

// 在页面里埋点：拦截 rAF，统计虚拟时间增量
await page.addInitScript(() => {
  window.__vtStats = { rafCount: 0, sumFrameDt: 0, maxFrameDt: 0, realStart: performance.now(), virtStart: null };
  const origRaf = window.requestAnimationFrame.bind(window);
  let last = null;
  window.requestAnimationFrame = (cb) => origRaf((t) => {
    if (window.__vtStats.virtStart === null) window.__vtStats.virtStart = t;
    if (last !== null) { const dt = t - last; window.__vtStats.sumFrameDt += dt; if (dt > window.__vtStats.maxFrameDt) window.__vtStats.maxFrameDt = dt; }
    last = t;
    window.__vtStats.rafCount++;
    return cb(t);
  });
});

await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForFunction(() => !!window.__ISAAC__, { timeout: 15000 });
await page.evaluate(() => window.__ISAAC__.game.startGame(12345));

// 用 CDP 设置虚拟时间策略：每次预算 3000ms
const client = await page.context().newCDPSession(page);
await client.send('Emulation.setVirtualTimePolicy', { policy: 'pauseIfNetworkFetchesPending', budget: 3000 });
await new Promise(r => setTimeout(r, 1500)); // 给虚拟时间跑完的时间

const stats = await page.evaluate(() => {
  const g = window.__ISAAC__.game;
  const s = window.__vtStats;
  return {
    rafCount: s.rafCount,
    sumFrameDtMs: Math.round(s.sumFrameDt),
    maxFrameDtMs: Math.round(s.maxFrameDt),
    gameSceneT: +(g.sceneT || 0).toFixed(2),
    gameTransitionT: +(g.transitionT || 0).toFixed(2),
    scene: g.scene,
  };
});
console.log('=== VIRTUAL-TIME (CDP budget=3000ms) ===');
console.log(JSON.stringify(stats, null, 2));
console.log('解释: rafCount 少 + maxFrameDtMs 大 = rAF 被压缩成大跳；游戏时间被 MAX_STEPS 截断。');
await browser.close();
server.close();
