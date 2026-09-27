/**
 * debug-combat.mjs — 深挖 combat 场景「remaining:1」问题
 *
 * 目的：在无头浏览器里跑「自动瞄准 + 开火」的完整击杀链路，
 * 每 500ms 打印一次房间敌人状态（类型/血量/位置/是否 isDead/alive/entering），
 * 判断最后一个敌人为何长时间不消失。
 *
 * 用法：node tests/debug-combat.mjs [seed]
 */

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

function startServer(port = 0) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const filePath = path.join(ROOT, urlPath);
      if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('404'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const seed = Number(process.argv[2] || 12345);

const { server, port } = await startServer(0);
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.stack || e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__ISAAC__, { timeout: 15000 });
await page.waitForTimeout(300);

await page.evaluate((s) => window.__ISAAC__.game.startGame(s), seed);
await page.waitForTimeout(2400);

// 传送到普通战斗房
const roomInfo = await page.evaluate(() => {
  const g = window.__ISAAC__.game;
  const meta = g.dungeon.rooms.find((r) => r.kind === 'normal');
  if (!meta) return { error: 'no normal room' };
  const room = g.roomsByKey[meta.key];
  room.visited = true;
  room.enterGrace = 0;
  g.currentRoom = room;
  g.visitedRooms.add(room.key);
  g.player.x = 624 / 2;
  g.player.y = 336 / 2;
  g.player.invuln = 999;
  return {
    key: room.key,
    kind: room.kind,
    enemies: room.enemies.map((e) => ({ t: e.type, hp: e.hp, maxHp: e.maxHp, x: Math.round(e.x), y: Math.round(e.y) })),
    obstacles: room.obstacles.length,
  };
});
console.log('房间初始:', JSON.stringify(roomInfo, null, 2));

const snap = () => page.evaluate(() => {
  const g = window.__ISAAC__.game;
  const room = g.currentRoom;
  return {
    t: Math.round(g.stats.timeAlive * 100) / 100,
    kills: g.stats.kills,
    enemyCount: room.enemyCount,
    cleared: room.cleared,
    bullets: g.combat.playerBullets.length,
    enemies: room.enemies.map((e) => ({
      type: e.type,
      hp: Math.round(e.hp * 10) / 10,
      isDead: e.isDead,
      alive: e.alive,
      dead: Math.round(e.dead * 100) / 100,
      entering: Math.round(e.entering * 100) / 100,
      hitStun: Math.round(e.hitStun * 100) / 100,
      x: Math.round(e.x),
      y: Math.round(e.y),
      vx: Math.round(e.vx),
      vy: Math.round(e.vy),
    })),
  };
});

// 玩家静止在中心，只自动瞄准开火（模拟 harness 的做法，但更持久）
const t0 = Date.now();
let last = null;
while (Date.now() - t0 < 20000) {
  await page.evaluate(() => {
    const g = window.__ISAAC__.game;
    const p = g.player;
    const room = g.currentRoom;
    p.invuln = 999;
    let best = null, bd = Infinity;
    for (const e of room.enemies) {
      if (e.isDead) continue;
      const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      const a = Math.atan2(best.y - p.y, best.x - p.x);
      g.input.fireX = Math.cos(a);
      g.input.fireY = Math.sin(a);
      g.input.firing = true;
    } else {
      g.input.firing = false;
    }
  });
  await page.waitForTimeout(500);
  last = await snap();
  console.log(JSON.stringify(last));
  if (last.enemyCount === 0) break;
}

console.log('\n最终:', JSON.stringify(last, null, 2));
console.log('错误数:', errs.length);
errs.slice(0, 5).forEach((e) => console.log('  ', e.split('\n')[0]));

await browser.close();
server.close();
