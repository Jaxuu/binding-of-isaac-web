/**
 * debug-boot.mjs — 快速诊断：加载页面并打印所有控制台/页面错误
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}\n${e.stack}`));
page.on('requestfailed', (r) => logs.push(`[REQFAIL] ${r.url()} :: ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) logs.push(`[HTTP ${r.status()}] ${r.url()}`); });

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.waitForTimeout(4000);
const state = await page.evaluate(() => ({
  hasIsaac: !!window.__ISAAC__,
  scene: window.__ISAAC__?.game?.scene,
  canvasSize: (() => { const c = document.getElementById('game'); return c ? `${c.width}x${c.height}` : 'none'; })(),
  fps: window.__ISAAC__?.loop?.fps,
}));
console.log('--- 页面状态 ---');
console.log(JSON.stringify(state, null, 2));
console.log('--- 日志 ---');
console.log(logs.join('\n') || '(无日志)');

await browser.close();
server.close();
