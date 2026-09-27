/**
 * qa-player-probe.mjs — BUG-003 角色被水平切掉：隔离测试（QA 严守真）
 * 1) 直接调用 drawPlayer 到一个干净 canvas，看是否本身绘制完整
 * 2) 看真实游戏中玩家周围的渲染，确认是 clip/覆盖还是绘制问题
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:/Project/Wkbd-project/case-yisa';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
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
await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForFunction(() => !!window.__ISAAC__, { timeout: 15000 });

// (1) 独立绘制 drawPlayer 到干净 canvas
const iso = await page.evaluate(async () => {
  const mod = await import('/src/art/draw-player.js');
  const c = document.createElement('canvas'); c.width = 200; c.height = 200;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2b2320'; ctx.fillRect(0, 0, 200, 200);
  mod.drawPlayer(ctx, 100, 110, { facing: 0, bob: 0, flash: 0 });
  const data = ctx.getImageData(0, 0, 200, 200).data;
  // 统计每行非背景像素，找到最下方的绘制行
  let lastRow = -1, rows = [];
  for (let y = 0; y < 200; y++) {
    let n = 0;
    for (let x = 0; x < 200; x++) {
      const i = (y * 200 + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (!(Math.abs(r - 43) < 6 && Math.abs(g - 35) < 6 && Math.abs(b - 32) < 6)) n++;
    }
    rows.push(n);
    if (n > 2) lastRow = y;
  }
  return { lastRow, rowsSample: rows.filter((_, i) => i % 10 === 0), png: c.toDataURL('image/png') };
});
console.log('=== ISOLATED drawPlayer ===');
console.log('lastDrawnRow:', iso.lastRow, '(canvas 高 200；玩家中心 y=110，正常应绘到 ~y=145)');
console.log('rowCounts(every10):', JSON.stringify(iso.rowsSample));

// (2) 进入游戏，抓玩家世界坐标与渲染变换
await page.evaluate(() => window.__ISAAC__.game.startGame(12345));
await page.waitForTimeout(2600);
const world = await page.evaluate(() => {
  const I = window.__ISAAC__;
  const g = I.game, r = I.renderer;
  return {
    scene: g.scene,
    playerX: g.player.x, playerY: g.player.y, playerVisible: g.player.visible, playerAlive: g.player.alive,
    scale: r.scale, offsetX: r.offsetX, offsetY: r.offsetY, worldW: r.worldW, worldH: r.worldH,
    dpr: r.dpr, viewW: r.viewW, viewH: r.viewH,
    baked: r._bakedRoom ? { w: r._bakedRoom.width, h: r._bakedRoom.height } : null,
  };
});
console.log('=== WORLD STATE ===');
console.log(JSON.stringify(world, null, 2));

await page.screenshot({ path: path.join(ROOT, 'tests/shots/qa-player-full.png') });
console.log('saved qa-player-full.png');
await browser.close();
server.close();
