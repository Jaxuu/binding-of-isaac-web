#!/usr/bin/env node
/**
 * _verify-expansion.mjs — 扩展内容浏览器端综合验证（Playwright，零额外依赖）
 *
 * 覆盖（真跑 Chromium）：
 *   1) 启动无控制台/页面错误
 *   2) 真实进入 PLAYING
 *   3) 把 19 种小怪 / 12 个 Boss / 58 件道具全部绘制一遍（捕捉绘制期异常）
 *   4) 逐层 generateFloor(1..12) 并强制进 Boss 房，核对 Boss 与楼层配置一致
 *   5) 给玩家应用全部道具，核对属性合法（无 NaN/越界）
 *   6) 输出多张截图作为视觉证据
 *
 * 用法：node tests/_verify-expansion.mjs
 * 退出码：0=PASS, 1=FAIL
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHOT = path.join(ROOT, 'tests', 'shots-expansion');
fs.mkdirSync(SHOT, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
};

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

const fail = [];
function check(cond, msg) {
  if (cond) console.log(`  ✅ ${msg}`);
  else { console.log(`  ❌ ${msg}`); fail.push(msg); }
}

async function main() {
  const { server, port } = await startServer();
  const url = `http://127.0.0.1:${port}/index.html`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });

  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text();
      if (/AudioContext|autoplay|user gesture/i.test(t)) return; // 浏览器策略豁免
      errors.push(t);
    }
  });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  console.log('\n[1] 启动与加载');
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ISAAC__, null, { timeout: 15000 });
  await page.waitForTimeout(1200);
  check(true, '页面加载并创建 __ISAAC__');

  console.log('\n[2] 开始游戏并进入 PLAYING');
  await page.evaluate(() => window.__ISAAC__.game.startGame(20260927));
  await page.waitForTimeout(2600);
  const boot = await page.evaluate(() => {
    const g = window.__ISAAC__.game;
    return { scene: g.scene, floor: g.floor, biome: g.biomeName, rooms: g.dungeon ? g.dungeon.count : 0, fps: g.fps };
  });
  console.log('    ', JSON.stringify(boot));
  check(boot.scene === 'playing', `进入 PLAYING（scene=${boot.scene}）`);
  check(boot.rooms >= 5, `首层房间数 ${boot.rooms} ≥ 5`);
  await page.screenshot({ path: path.join(SHOT, '01-basement.png') });

  console.log('\n[3] 全量绘制：19 小怪 / 12 Boss / 58 道具');
  const drawReport = await page.evaluate(async () => {
    const enemyMod = await import('/src/entities/enemy.js');
    const bossMod = await import('/src/entities/boss.js');
    const itemsMod = await import('/src/entities/items.js');
    const de = await import('/src/art/draw-enemies.js');
    const db = await import('/src/art/draw-boss.js');
    const di = await import('/src/art/draw-items.js');
    const floors = await import('/src/systems/floors.js');

    const cv = document.createElement('canvas');
    cv.width = 160; cv.height = 160;
    const cx = cv.getContext('2d');
    const errs = [];
    const variants = [
      { t: 1.0, phase: 0.3, facing: 0.5, hurt: 0, dead: 0, shotFlash: 0.5, charge: 0.6, charging: true, risen: true, hopZ: 6, laserCharging: true, reviving: false },
      { t: 2.3, phase: 1.1, facing: 2.0, hurt: 0.6, dead: 0, shotFlash: 0, charge: 0, charging: false, risen: false, hopZ: 0, laserCharging: false, reviving: true },
      { t: 0.4, dead: 0.5, risen: false, hopZ: 0 },
    ];
    for (const type of enemyMod.ENEMY_TYPES) {
      for (const v of variants) {
        try { cx.clearRect(0, 0, 160, 160); cx.save(); cx.translate(80, 80); de.drawEnemy(cx, type, v); cx.restore(); }
        catch (e) { errs.push(`enemy ${type}: ${e.message}`); }
      }
    }
    for (const id of Object.keys(bossMod.BOSS_DEFS)) {
      for (const v of variants) {
        try { cx.clearRect(0, 0, 160, 160); cx.save(); cx.translate(80, 80); db.drawBoss(cx, id, v); cx.restore(); }
        catch (e) { errs.push(`boss ${id}: ${e.message}`); }
      }
    }
    for (const it of itemsMod.ITEM_POOL) {
      try {
        cx.clearRect(0, 0, 160, 160); cx.save(); cx.translate(80, 80);
        const fn = di.ITEM_ICONS[it.id];
        if (!fn) throw new Error('缺图标');
        fn(cx);
        cx.restore();
      } catch (e) { errs.push(`item ${it.id}: ${e.message}`); }
    }
    return {
      enemies: enemyMod.ENEMY_TYPES.length,
      bosses: Object.keys(bossMod.BOSS_DEFS).length,
      items: itemsMod.ITEM_POOL.length,
      floors: floors.floorCount(),
      errs,
    };
  });
  console.log('    ', JSON.stringify({ ...drawReport, errs: drawReport.errs.length }));
  check(drawReport.errs.length === 0, `全部绘制无异常（${drawReport.errs.length} 个错误）`);
  if (drawReport.errs.length) console.log('      ', drawReport.errs.slice(0, 8).join(' | '));
  check(drawReport.enemies >= 15, `小怪 ${drawReport.enemies} 种 ≥ 15`);
  check(drawReport.bosses >= 10, `Boss ${drawReport.bosses} 个 ≥ 10`);
  check(drawReport.items >= 50, `道具 ${drawReport.items} 件 ≥ 50`);
  check(drawReport.floors >= 10, `楼层 ${drawReport.floors} 层 ≥ 10`);

  console.log('\n[4] 逐层生成 + 强制进 Boss 房');
  const floorReport = await page.evaluate(async () => {
    const g = window.__ISAAC__.game;
    const { floorDef } = await import('/src/systems/floors.js');
    window.__ISAAC__.loop.stop();
    const out = [];
    for (let f = 1; f <= 12; f++) {
      try {
        g.generateFloor(f);
        const bossRoom = Object.values(g.roomsByKey).find((r) => r.kind === 'boss');
        if (!bossRoom) { out.push({ floor: f, error: 'no boss room' }); continue; }
        g.scene = 'playing';
        g.currentRoom = bossRoom;
        bossRoom.visited = true;
        bossRoom.enterGrace = 0;
        bossRoom.bossSpawned = false;
        for (let i = 0; i < 90; i++) g.update(1 / 60);
        const b = bossRoom.boss;
        out.push({
          floor: f,
          biome: g.biomeName,
          bossId: b ? b.defId : null,
          expected: floorDef(f).boss,
          bossHp: b ? b.maxHp : 0,
          bullets: g.combat.enemyBullets.length,
        });
      } catch (e) {
        out.push({ floor: f, error: e.message });
      }
    }
    return out;
  });
  let floorOk = true;
  for (const r of floorReport) {
    const ok = !r.error && r.bossId === r.expected;
    if (!ok) floorOk = false;
    console.log(`     B${String(r.floor).padStart(2)} ${r.error ? 'ERR ' + r.error : `${(r.biome || '').padEnd(11)} boss=${r.bossId} (期望 ${r.expected}) hp=${r.bossHp}`}`);
  }
  check(floorOk, '12 层均生成正确专属 Boss');

  console.log('\n[5] 应用全部道具 → 属性合法性');
  const itemReport = await page.evaluate(async () => {
    const g = window.__ISAAC__.game;
    const { Player } = await import('/src/entities/player.js');
    const { ITEM_POOL, applyItem } = await import('/src/entities/items.js');
    const { STAT_KEYS, STAT_LIMITS } = await import('/src/entities/stats.js');
    const p = new Player(300, 160);
    const errs = [];
    for (const it of ITEM_POOL) {
      try { applyItem(p, it, p.weapon); } catch (e) { errs.push(`${it.id}: ${e.message}`); }
    }
    const bad = [];
    for (const k of STAT_KEYS) {
      const v = p.stats[k];
      const [lo, hi] = STAT_LIMITS[k];
      if (!Number.isFinite(v) || v < lo || v > hi) bad.push(`${k}=${v}`);
    }
    return { items: ITEM_POOL.length, errs, bad, weaponKind: p.weapon.kind, items_picked: p.items.length };
  });
  console.log('    ', JSON.stringify(itemReport));
  check(itemReport.errs.length === 0, '全部道具 applyItem 无异常');
  check(itemReport.bad.length === 0, '全部道具应用后属性在合法范围内');

  console.log('\n[6] 视觉证据截图');
  await page.evaluate(async () => {
    const g = window.__ISAAC__.game;
    window.__ISAAC__.loop.stop();
    // 逐个展示若干层的 Boss 房
    const shots = [1, 3, 5, 7, 9, 10, 12];
    window.__shotFloors = shots;
    g.__shotQueue = shots.slice();
  });
  const shots = await page.evaluate(() => window.__ISAAC__.game.__shotQueue);
  for (const f of shots) {
    await page.evaluate((floor) => {
      const g = window.__ISAAC__.game;
      g.generateFloor(floor);
      const bossRoom = Object.values(g.roomsByKey).find((r) => r.kind === 'boss');
      g.scene = 'playing';
      g.currentRoom = bossRoom;
      bossRoom.visited = true;
      bossRoom.enterGrace = 0;
      bossRoom.bossSpawned = false;
      // 观察用：让玩家无敌且远离 Boss，避免在截图期间被击杀导致切到死亡界面
      g.player.health = 999;
      g.player.maxHealth = 999;
      g.player.x = 120;
      g.player.y = 300;
      for (let i = 0; i < 150; i++) {
        g.player.invuln = 999;
        g.player.health = 999;
        g.update(1 / 60);
        g.scene = 'playing';
      }
      g.player.invuln = 999;
      window.__ISAAC__.renderer.render(0);
    }, f);
    await page.screenshot({ path: path.join(SHOT, `boss-B${f}.png`) });
    console.log(`     已截图 boss-B${f}.png`);
  }
  // 普通房（含新敌人）截图
  await page.evaluate(() => {
    const g = window.__ISAAC__.game;
    g.generateFloor(8);
    const normal = Object.values(g.roomsByKey).find((r) => r.kind === 'normal' && r.enemies.length > 0);
    g.scene = 'playing';
    g.currentRoom = normal || g.currentRoom;
    g.player.health = 999; g.player.maxHealth = 999;
    for (let i = 0; i < 90; i++) { g.player.invuln = 999; g.player.health = 999; g.update(1 / 60); g.scene = 'playing'; }
    window.__ISAAC__.renderer.render(0);
  });
  await page.screenshot({ path: path.join(SHOT, 'room-B8-enemies.png') });

  console.log('\n[7] 控制台错误汇总');
  check(errors.length === 0, `无控制台/页面错误（${errors.length} 个）`);
  if (errors.length) console.log('      ', errors.slice(0, 10).join('\n       '));

  await browser.close();
  server.close();

  console.log('\n' + '='.repeat(56));
  if (fail.length === 0) {
    console.log('✅ 扩展内容验证全部通过');
    process.exitCode = 0;
  } else {
    console.log(`❌ ${fail.length} 项未通过：`);
    for (const f of fail) console.log('   - ' + f);
    process.exitCode = 1;
  }
  console.log('='.repeat(56));
}

main().catch((e) => {
  console.error('验证脚本异常：', e);
  process.exitCode = 1;
});
