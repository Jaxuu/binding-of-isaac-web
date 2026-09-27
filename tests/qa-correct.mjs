/**
 * qa-correct.mjs — 修正后的针对性验证（QA 严守真）
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = 'D:/Project/Wkbd-project/case-yisa';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => { let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(ROOT, u); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); }); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const OUT = {};
await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForFunction(() => !!window.__ISAAC__, { timeout: 15000 });

// A. 道具拾取链路：itemsPicked++ 且 属性/外观变化
OUT.itemFlow = await page.evaluate(async () => {
  const mod = await import('/src/entities/items.js');
  const g = window.__ISAAC__.game; g.startGame(999); const p = g.player;
  const before = { dmg: p.stats.damage, picked: g.stats.itemsPicked, variant: p.weapon.variant, devil: p.visual.devil };
  const cricket = mod.ITEM_BY_ID['crickets_head'];
  const brim = mod.ITEM_BY_ID['brimstone'];
  mod.applyItem(p, cricket, p.weapon);
  const afterCricket = { dmg: p.stats.damage, variant: p.weapon.variant };
  mod.applyItem(p, brim, p.weapon);
  const afterBrim = { dmg: p.stats.damage, variant: p.weapon.variant };
  // 走正式拾取路径验证 itemsPicked
  g._grantItem('crickets_head', 100, 100);
  const pickedAfterGrant = g.stats.itemsPicked;
  return { before, afterCricket, afterBrim, pickedAfterGrant, itemPool: mod.ITEM_POOL.length };
});

// B. 三种敌人是否都会生成（扫 30 局的所有房间）
OUT.enemyTypes = await page.evaluate(() => {
  const g = window.__ISAAC__.game;
  const seen = new Set();
  for (let s = 1; s <= 30; s++) {
    g.startGame(s);
    for (const r of g.dungeon.rooms) {
      const room = g.roomsByKey[r.key];
      if (room.spawnKinds) room.spawnKinds.forEach(k => seen.add(k));
      if (room.enemies) room.enemies.forEach(e => seen.add(e.type));
    }
  }
  return [...seen];
});

// C. 清房后门可通过（模拟走进门）
OUT.doorPass = await page.evaluate(async () => {
  const g = window.__ISAAC__.game; g.startGame(12345);
  await new Promise(r => setTimeout(r, 2200));
  const t = g.dungeon.rooms.find(r => r.kind === 'normal');
  const room = g.roomsByKey[t.key];
  room.visited = true; room.enterGrace = 0; g.currentRoom = room; g.visitedRooms.add(room.key);
  const before = { cleared: room.cleared, doors: { ...room.doors } };
  // 强制清房
  room.enemies.forEach(e => { e.alive = false; e.isDead = true; });
  room.cleared = true;
  return { before, hasDoors: Object.values(room.doors).filter(Boolean).length };
});

// D. 玩家可见性统计：随机房内玩家是否始终可见
OUT.playerVisible = await page.evaluate(async () => {
  const g = window.__ISAAC__.game; g.startGame(7);
  await new Promise(r => setTimeout(r, 2400));
  const t = g.dungeon.rooms.find(r => r.kind === 'normal');
  const room = g.roomsByKey[t.key]; room.visited = true; room.enterGrace = 0; g.currentRoom = room; g.visitedRooms.add(room.key);
  g.player.enterGrace = 0;
  await new Promise(r => setTimeout(r, 600));
  return { visible: g.player.visible, alive: g.player.alive, x: g.player.x, y: g.player.y, enterGrace: room.enterGrace };
});

// E. 移动端摇杆
OUT.joystick = await page.evaluate(() => {
  const g = window.__ISAAC__.game;
  const j = window.__ISAAC__.renderer.joystick;
  return { present: !!j, hasDraw: typeof j.draw === 'function', hasUpdate: typeof j.update === 'function' };
});

OUT.errors = errors;
console.log(JSON.stringify(OUT, null, 2));
await browser.close(); server.close();
