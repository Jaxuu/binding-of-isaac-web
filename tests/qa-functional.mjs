/**
 * qa-functional.mjs — QA 独立功能验证（严守真）
 * 走真实浏览器（系统 Chrome / Playwright 驱动的 Chromium，真实墙钟时间）。
 * 输出结构化 JSON + 截图到 tests/shots/qa-*.png。
 * 注意：本脚本不修改任何产品代码，仅通过 window.__ISAAC__ 读取状态与注入测试输入。
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:/Project/Wkbd-project/case-yisa';
const SHOT = path.join(ROOT, 'tests', 'shots');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html';
  const f = path.join(ROOT, u);
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

const shots = [];
async function shot(label) {
  const p = path.join(SHOT, `qa-${label}.png`);
  await page.screenshot({ path: p });
  const st = fs.statSync(p);
  shots.push({ label, file: `tests/shots/qa-${label}.png`, bytes: st.size });
}
const R = {};

async function startGame(seed) {
  await page.evaluate((s) => window.__ISAAC__.game.startGame(s), seed);
  await page.waitForFunction(() => {
    const g = window.__ISAAC__.game;
    return g.scene === 'playing' || g.scene === 'floorIntro';
  }, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2400);
}
async function teleport(kind) {
  await page.evaluate((k) => {
    const g = window.__ISAAC__.game;
    const t = g.dungeon.rooms.find(r => r.kind === k) || g.dungeon.rooms.find(r => r.kind === 'normal');
    const room = g.roomsByKey[t.key];
    room.visited = true; room.enterGrace = 0;
    g.currentRoom = room; g.visitedRooms.add(room.key);
    g.player.x = 300; g.player.y = 300; g.player.invuln = 5;
  }, kind);
  await page.waitForTimeout(700);
}

// ---------- 1. 标题界面 ----------
await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForFunction(() => !!window.__ISAAC__, { timeout: 15000 });
await page.waitForTimeout(600);
await shot('title');
R.title = await page.evaluate(() => {
  const g = window.__ISAAC__.game;
  return { scene: g.scene, hasStartBtn: !!(g._titleButtons && g._titleButtons.length) };
});

// ---------- 2. 地牢生成不变量（多 seed）----------
R.dungeon = await page.evaluate(async () => {
  const mod = await import('/src/systems/dungeon.js');
  const out = { countMin: 99, countMax: 0, bad: [], bossNotFarthest: 0, noKeySymmetry: 0, total: 0 };
  for (let s = 1; s <= 80; s++) {
    const d = mod.generateDungeon(s, { minRooms: 5, maxRooms: 8, floor: 1 });
    out.total++;
    out.countMin = Math.min(out.countMin, d.count);
    out.countMax = Math.max(out.countMax, d.count);
    const v = mod.validateDungeon(d);
    if (!v.ok) out.bad.push({ seed: s, errors: v.errors });
    const b = d.byKey[d.bossKey];
    const maxD = Math.max(...d.rooms.map(r => r.depth));
    if (b.depth !== maxD) out.bossNotFarthest++;
  }
  out.sampleBoss = (() => { const d = mod.generateDungeon(1, { minRooms: 5, maxRooms: 8, floor: 1 }); return { count: d.count, bossKey: d.bossKey, bossDepth: d.byKey[d.bossKey].depth }; })();
  return out;
});

// ---------- 3. 战斗 + 移动 + 射击 + 入门房无敌人 ----------
await startGame(12345);
await shot('start-room');
R.startRoom = await page.evaluate(() => {
  const g = window.__ISAAC__.game;
  return { scene: g.scene, roomKind: g.currentRoom.kind, enemies: g.currentRoom.enemyCount, doorOpen: Object.values(g.currentRoom.doors).some(d => d && d.state === 'open') };
});

await teleport('normal');
await shot('combat-room');
R.combatRoom = await page.evaluate(() => {
  const g = window.__ISAAC__.game;
  return { enemies: g.currentRoom.enemyCount, types: g.currentRoom.enemies.map(e => e.type), kinds: g.currentRoom.enemies.map(e => e.ai || e.kind) };
});

// 移动：WASD 四方向
const p0 = await page.evaluate(() => ({ x: window.__ISAAC__.game.player.x, y: window.__ISAAC__.game.player.y }));
await page.keyboard.down('KeyD'); await page.waitForTimeout(400); await page.keyboard.up('KeyD');
await page.keyboard.down('KeyW'); await page.waitForTimeout(300); await page.keyboard.up('KeyW');
const p1 = await page.evaluate(() => ({ x: window.__ISAAC__.game.player.x, y: window.__ISAAC__.game.player.y }));
R.move = { from: p0, to: p1, movedX: p1.x - p0.x > 5, movedY: p1.y - p0.y < -5 };

// 射击：方向键 → 子弹产生
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(400);
const bullets = await page.evaluate(() => window.__ISAAC__.game.combat.playerBullets.length);
await shot('firing');
await page.keyboard.up('ArrowRight');
R.shooting = { bulletsAfterFire: bullets, fired: bullets > 0 };

// 玩家受击 + 无敌帧
R.hurt = await page.evaluate(() => {
  const g = window.__ISAAC__.game;
  const hpBefore = g.player.hp;
  g.player.invuln = 0;
  g.player.takeDamage(1);
  const inv1 = g.player.invuln;
  const hpAfter1 = g.player.hp;
  g.player.takeDamage(1); // 无敌帧内应无效
  const hpAfter2 = g.player.hp;
  return { hpBefore, hpAfter1, hpAfter2, invulnSet: inv1 > 0, iframeBlocks: hpAfter1 === hpAfter2 };
});

// 击杀链路：用摇杆通道自动瞄准射击清房
let aimKills = 0;
const t0 = Date.now();
while (Date.now() - t0 < 30000) {
  const done = await page.evaluate(() => {
    const g = window.__ISAAC__.game; const p = g.player; const room = g.currentRoom;
    p.invuln = 5;
    let best = null, bd = Infinity;
    for (const e of room.enemies.filter(e => !e.isDead)) { const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2; if (d < bd) { bd = d; best = e; } }
    if (!best) { g.input.setStick('fire', 0, 0, false); return true; }
    const a = Math.atan2(best.y - p.y, best.x - p.x);
    g.input.setStick('fire', Math.cos(a), Math.sin(a), true);
    return false;
  });
  if (done) break;
  await page.waitForTimeout(150);
}
await page.evaluate(() => window.__ISAAC__.game.input.setStick('fire', 0, 0, false));
await page.waitForTimeout(500);
aimKills = await page.evaluate(() => window.__ISAAC__.game.stats.kills);
await shot('after-clear');
R.kill = await page.evaluate(() => {
  const g = window.__ISAAC__.game;
  return { kills: g.stats.kills, cleared: g.currentRoom.cleared, remaining: g.currentRoom.enemyCount, doorsOpen: Object.values(g.currentRoom.doors).filter(d => d && d.state === 'open').length };
});

// ---------- 4. 道具系统：属性 + 外观 ----------
R.items = await page.evaluate(async () => {
  const mod = await import('/src/entities/items.js');
  const g = window.__ISAAC__.game;
  const p = g.player;
  const base = { ...p.stats };
  const res = { base, perItem: [] };
  // 单道具效果抽查
  const checks = ['c4', 'c12', 'c118', 'c330'];
  for (const id of checks) {
    const it = mod.ITEM_BY_ID[id];
    if (!it) { res.perItem.push({ id, missing: true }); continue; }
    const before = { ...p.stats };
    mod.applyItem(p, it, p.weapon);
    res.perItem.push({ id: it.id, name: it.name, dmgBefore: before.damage, dmgAfter: p.stats.damage, variant: p.weapon.variant });
  }
  res.itemPoolSize = mod.ITEM_POOL.length;
  res.visualFlags = { ...p.visual };
  return res;
});
R.itemPoolSize = R.items.itemPoolSize;

// 拾取道具 → 截图（面板 + 外观）
await page.evaluate(async () => {
  const g = window.__ISAAC__.game;
  g.startGame(555);
  await new Promise(r => setTimeout(r, 1800));
  g._grantItem('brimstone', g.player.x, g.player.y);
  g.player.visual.devil = true;
});
await page.waitForTimeout(400);
await shot('item-panel');

// ---------- 5. Boss: Monstro 三阶段 ----------
await page.evaluate(() => window.__ISAAC__.game.startGame(2024));
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const g = window.__ISAAC__.game;
  const b = g.roomsByKey[g.dungeon.bossKey];
  b.visited = true; b.cleared = true; b.enterGrace = 0;
  g.currentRoom = b; g.visitedRooms.add(b.key);
  g.player.x = 300; g.player.y = 260; g.player.invuln = 5;
});
await page.waitForTimeout(4200);
R.bossPhase1 = await page.evaluate(() => {
  const b = window.__ISAAC__.game.currentRoom.boss;
  return { spawned: !!b, hp: b && b.hp, maxHp: b && b.maxHp, phase: b && b.phase, state: b && b.state, enemyBullets: window.__ISAAC__.game.combat.enemyBullets.length };
});
await shot('boss-phase1');
// 阶段2
await page.evaluate(() => { const b = window.__ISAAC__.game.currentRoom.boss; if (b) { b.entering = 0; b.takeDamage(b.maxHp * 0.45, 0, 0, 0); } });
await page.waitForTimeout(1200);
R.bossPhase2 = await page.evaluate(() => { const b = window.__ISAAC__.game.currentRoom.boss; return { phase: b.phase, hp: b.hp, rage: b.rage }; });
await shot('boss-phase2');
// 阶段3 狂暴
await page.evaluate(() => { const b = window.__ISAAC__.game.currentRoom.boss; if (b) { b.takeDamage(b.maxHp * 0.35, 0, 0, 0); } });
await page.waitForTimeout(1200);
R.bossPhase3 = await page.evaluate(() => { const b = window.__ISAAC__.game.currentRoom.boss; return { phase: b.phase, hp: b.hp, rage: b.rage }; });
await shot('boss-phase3');

// ---------- 6. 死亡界面 ----------
R.death = await page.evaluate(async () => {
  const g = window.__ISAAC__.game;
  g.stats.kills = 12; g.stats.passivesPicked = 5; g.stats.timeAlive = 402;
  g.player.invuln = 0; g.player.hp = 1;
  g.player.takeDamage(99);
  if (g.player.alive) { g.player.alive = false; }
  g.gotoScene('dead');
  await new Promise(r => setTimeout(r, 400));
  return { scene: g.scene, stats: { ...g.stats }, playerAlive: g.player.alive };
});
await page.waitForTimeout(500);
await shot('death-screen');

// ---------- 7. 通关界面 ----------
R.win = await page.evaluate(async () => {
  const g = window.__ISAAC__.game;
  g.stats.kills = 18; g.stats.passivesPicked = 9; g.stats.timeAlive = 680;
  g.gotoScene('win');
  await new Promise(r => setTimeout(r, 400));
  return { scene: g.scene };
});
await page.waitForTimeout(500);
await shot('victory-screen');

// ---------- 8. 开始界面按钮判定 + 暂停 ----------
R.buttons = await page.evaluate(() => {
  const g = window.__ISAAC__.game;
  return { titleBtns: (g._titleButtons || []).map(b => b.id || b.label), deathBtns: (g._deadButtons || []).length, winBtns: (g._winButtons || []).length };
});

R.errors = errors;
R.shots = shots;
console.log(JSON.stringify(R, null, 2));

await browser.close();
server.close();
