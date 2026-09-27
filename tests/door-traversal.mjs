#!/usr/bin/env node
/**
 * door-traversal.mjs — 门可通行性回归测试（常驻门控）
 *
 * 背景（FIX-004）
 * --------------
 * 用户报告「有的门能进有的不能进、有时回不去、甚至整间房门全锁死导致流程硬卡」。
 * 根因是 `src/systems/game.js` 的 `_clampPlayer()` 采用「顺序 clamp」——
 * 后一句 clamp 会把前一句放宽的边界重新收紧，导致右门 / 下门 0% 可达、
 * 同房间存在对侧门时上门 / 左门也被顶出触发区。
 *
 * 本测试的价值
 * ------------
 * 既有的 89 项单测 + 14 项需求验收 + 8 个端到端场景**全都没覆盖「门是否真的能走过去」**，
 * 所以这个阻塞级缺陷才漏到用户手里。本脚本专门盯住这条不变量：
 *   存在门的可通行率必须 = 100%，且不存在「所有门都锁死」的房间。
 *
 * 方法（走真实代码路径，不重写几何）
 * --------------------------------
 *   1) 打开真实产物 dist/isaac-standalone.html（file://，自包含，无需起服务）
 *   2) 对每个 seed 生成地牢，遍历其全部房间
 *   3) 逐帧调用真实的 `_checkDoors` + `_clampPlayer`，把玩家从房间中心朝门推进
 *   4) 以「currentRoom 是否改变」作为门是否可通行的判据
 *   5) 额外核查 room.doors 的每个方向标志是否都有对应邻居（无悬空门）
 *
 * 断言
 * ----
 *   A) 每个「存在且邻居有效」的门方向，可通行率 === 100%
 *   B) 不存在「所有门都锁死」的房间（当前缺陷下为 18/36）
 *   C) room.doors 的每个方向标志都有对应邻居房间（一致性，无悬空门）
 *
 * 用法：node tests/door-traversal.mjs
 * 退出码：0 = 全部 PASS，1 = 任一失败
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'dist', 'isaac-standalone.html');
const TARGET_URL = pathToFileURL(TARGET).href;

// 与 _diag-doors.mjs 保持同一组 seed，便于对照
const SEEDS = ['1', '7', '42', '777', '12345'];
const DIRS = [
  { name: 'up', dx: 0, dy: -1 },
  { name: 'down', dx: 0, dy: 1 },
  { name: 'left', dx: -1, dy: 0 },
  { name: 'right', dx: 1, dy: 0 },
];
// 方向 → 邻居格偏移（与 dungeon.js 的 DIRS 一致）
const DIR_OFFSET = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

if (!fs.existsSync(TARGET)) {
  console.error(`[door-traversal] 产物不存在: ${TARGET}`);
  console.error('[door-traversal] 请先运行: node tools/build-standalone.mjs');
  process.exit(1);
}

let browser = null;
let report = null;
let pageErrors = [];

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => pageErrors.push(String(e.message)));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });

  await page.goto(TARGET_URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__ISAAC__ !== 'undefined', null, { timeout: 20000 });
  await page.waitForTimeout(2500);

  report = await page.evaluate(({ seeds, dirs, dirOffset }) => {
    const g = window.__ISAAC__.game;
    const rk = (gx, gy) => `${gx},${gy}`; // 与 dungeon.js roomKey 同格式
    const out = [];

    for (const seed of seeds) {
      g.startGame(seed);
      g.gotoScene(window.__ISAAC__.SCENE.PLAYING);

      const rooms = Object.values(g.roomsByKey || {});
      const perRoom = [];

      for (const room of rooms) {
        // 隔离「门机制」本身：强制清房，排除战斗门禁的干扰（门禁本身另有验收）
        room.cleared = true;
        room.enemies = [];
        room.boss = null;
        room.inGrace = false;
        room.enterGrace = 0;

        const W = room.bounds.w;
        const H = room.bounds.h;
        const p = g.player;
        const speed = p.stats.speed;
        const dt = 1 / 60;

        const res = {};
        let dangling = [];
        let traversableDoors = 0;
        let passedCount = 0;

        for (const d of dirs) {
          if (!room.doors[d.name]) { res[d.name] = 'no-door'; continue; }

          // 一致性：门标志是否指向存在的邻居
          const [ox, oy] = dirOffset[d.name];
          const neighbor = g.roomsByKey[rk(room.gx + ox, room.gy + oy)];
          if (!neighbor) {
            res[d.name] = 'dangling';
            dangling.push(d.name);
            continue;
          }

          traversableDoors++;

          // 复位：玩家放回房间中心，并把当前房间指回本房间
          g.currentRoom = room;
          p.x = W / 2;
          p.y = H / 2;
          p.vx = 0;
          p.vy = 0;

          let passed = false;
          let lastX = p.x;
          let lastY = p.y;
          for (let i = 0; i < 400; i++) {
            p.vx = d.dx * speed;
            p.vy = d.dy * speed;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            g._checkDoors(dt, g.currentRoom, p);
            if (g.currentRoom !== room) { passed = true; break; }
            g._clampPlayer(p, g.currentRoom);
            lastX = p.x;
            lastY = p.y;
          }
          if (passed) { passedCount++; res[d.name] = 'OK'; }
          else res[d.name] = `BLOCKED(@${lastX.toFixed(1)},${lastY.toFixed(1)})`;
        }

        // 记忆化断言：doors 生成后不可变，doorRects() 应返回同一对象引用（缓存生效）
        const memoSame = room.doorRects() === room.doorRects();

        perRoom.push({
          key: room.key,
          kind: room.kind,
          doors: { ...room.doors },
          res,
          dangling,
          traversableDoors,
          passedCount,
          memoSame,
        });
      }

      out.push({ seed, speed: g.player.stats.speed, rooms: perRoom });
    }
    return out;
  }, { seeds: SEEDS, dirs: DIRS, dirOffset: DIR_OFFSET });
} catch (err) {
  console.error('[door-traversal] 运行异常:', err && err.message ? err.message : err);
  if (browser) await browser.close();
  process.exit(1);
} finally {
  if (browser) await browser.close();
}

// ---------- 汇总 & 断言 ----------
const tally = { up: { ok: 0, bad: 0 }, down: { ok: 0, bad: 0 }, left: { ok: 0, bad: 0 }, right: { ok: 0, bad: 0 } };
let totalDoors = 0;
let totalPassed = 0;
let stuckRooms = [];
let danglingDoors = [];
let roomCount = 0;
let memoRooms = 0;
let memoOk = 0;

console.log('=== 门可通行性回归测试（真实 _checkDoors + _clampPlayer 路径）===\n');

for (const s of report) {
  console.log(`--- seed=${s.seed}  speed=${s.speed.toFixed(1)} px/s ---`);
  for (const r of s.rooms) {
    roomCount++;
    if (r.memoSame) memoOk++;
    const parts = [];
    let allBad = true;
    let doorCount = 0;

    for (const d of DIRS) {
      const v = r.res[d.name];
      if (v === 'no-door') continue;
      if (v === 'dangling') {
        danglingDoors.push(`${s.seed}:${r.key}(${d.name})`);
        parts.push(`${d.name}=悬空`);
        allBad = false; // 悬空门不参与「锁死」判定，单独由一致性断言负责
        continue;
      }
      doorCount++;
      totalDoors++;
      const ok = v === 'OK';
      if (ok) { tally[d.name].ok++; totalPassed++; allBad = false; }
      else { tally[d.name].bad++; }
      parts.push(`${d.name}=${ok ? '✓' : '✗'}`);
    }

    const flag = allBad && doorCount > 0 ? '  [全部锁死 / 流程硬卡]' : '';
    if (flag) stuckRooms.push(`${s.seed}:${r.key}(${r.kind})`);
    console.log(`  ${r.key.padEnd(8)} ${String(r.kind).padEnd(8)} ${parts.join(' ').padEnd(34)}${flag}`);
  }
  console.log('');
}

console.log('=== 各方向通过率 ===');
for (const d of DIRS) {
  const t = tally[d.name];
  const total = t.ok + t.bad;
  const pct = total ? ((t.ok / total) * 100).toFixed(0) : 'n/a';
  console.log(`  ${d.name.padEnd(6)} 通过 ${String(t.ok).padStart(3)} / 失败 ${String(t.bad).padStart(3)}   (${pct}%)`);
}

console.log('');
console.log(`房间总数: ${roomCount}  门总数: ${totalDoors}  通过: ${totalPassed}`);
console.log(`全部锁死的房间数: ${stuckRooms.length}`);
stuckRooms.slice(0, 20).forEach((k) => console.log(`    ${k}`));
console.log(`悬空门（有门标志但无邻居）: ${danglingDoors.length}`);
danglingDoors.slice(0, 20).forEach((k) => console.log(`    ${k}`));
console.log(`doorRects() 记忆化生效（同一引用）: ${memoOk}/${roomCount}`);
console.log(`页面错误: ${pageErrors.length}`);
pageErrors.slice(0, 5).forEach((e) => console.log('  ' + String(e).slice(0, 160)));

// ---------- 判定 ----------
const checks = [];
checks.push(['A. 门可通行率 100%', totalDoors > 0 && totalPassed === totalDoors,
  `${totalPassed}/${totalDoors}`]);
checks.push(['B. 无「全部门锁死」房间', stuckRooms.length === 0, `锁死 ${stuckRooms.length} 间`]);
checks.push(['C. 无悬空门（doors 标志 ↔ 邻居一致）', danglingDoors.length === 0, `悬空 ${danglingDoors.length}`]);
checks.push(['D. 无页面错误', pageErrors.length === 0, `${pageErrors.length}`]);
checks.push(['E. doorRects() 记忆化（同一引用）', roomCount > 0 && memoOk === roomCount, `${memoOk}/${roomCount}`]);

console.log('\n=== 判定 ===');
let failed = 0;
for (const [name, pass, detail] of checks) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
  if (!pass) failed++;
}

console.log('');
console.log(`${totalPassed} 通过, ${totalDoors - totalPassed} 失败`);
console.log(failed === 0 ? '[door-traversal] PASS' : `[door-traversal] FAIL (${failed} 项断言未通过)`);

process.exit(failed === 0 ? 0 : 1);
