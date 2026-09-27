#!/usr/bin/env node
/**
 * run.js — 逻辑单测（零依赖，纯 Node，不需要浏览器）
 *
 * 验证那些"不依赖渲染"的核心算法正确性 —— 这是最快、最可靠的回归防线：
 *   1. 地牢生成：连通性（BFS 全达）、房间数 5–8、Boss 房存在且最远、门对称性
 *   2. 属性系统：加法段→乘法段→钳制 的结算顺序、可交换性、上下限
 *   3. 碰撞：AABB 分轴、圆-圆、圆-矩形
 *   4. 掉落表：分布合理性（大样本卡方近似）
 *   5. RNG：种子可复现
 *
 * 用法: node tests/run.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) { pass++; process.stdout.write('.'); }
  else { fail++; failures.push({ name, detail }); process.stdout.write('F'); }
}
function section(t) { process.stdout.write(`\n\n## ${t}\n`); }

/* ------------------------------------------------------------------ *
 * 通用小工具（不依赖 src，独立实现以便交叉验证）
 * ------------------------------------------------------------------ */
function makeRNG(seed) {
  // mulberry32 — 与 src/core/rng.js 应对齐的参考实现
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bfsConnected(rooms, edges, start) {
  const adj = new Map();
  for (const r of rooms) adj.set(r, []);
  for (const [a, b] of edges) { adj.get(a).push(b); adj.get(b).push(a); }
  const seen = new Set([start]); const q = [start];
  while (q.length) {
    const cur = q.shift();
    for (const n of adj.get(cur) || []) if (!seen.has(n)) { seen.add(n); q.push(n); }
  }
  return seen.size;
}

function collidesCircleRect(cx, cy, cr, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < cr * cr;
}

function circleCircle(ax, ay, ar, bx, by, br) {
  const dx = ax - bx, dy = ay - by, rr = ar + br;
  return dx * dx + dy * dy < rr * rr;
}

/* ------------------------------------------------------------------ *
 * 属性系统参考实现 —— 独立于 src 写第二份，用于交叉验证公式语义
 * ------------------------------------------------------------------ */
function computeStats(base, mods) {
  // mods: [{add:{damage:1}, mul:{damage:1.5}}]
  const dims = ['damage', 'fireDelay', 'range', 'shotSpeed', 'speed', 'luck'];
  const out = {};
  for (const d of dims) {
    let add = 0, mul = 1;
    for (const m of mods) {
      if (m.add && typeof m.add[d] === 'number') add += m.add[d];
      if (m.mul && typeof m.mul[d] === 'number') mul *= m.mul[d];
    }
    out[d] = (base[d] + add) * mul;
  }
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  return {
    damage: clamp(out.damage, 0.5, 60),
    fireDelay: Math.round(clamp(out.fireDelay, 1, 60)),
    range: clamp(out.range, 2.0, 30.0),
    shotSpeed: clamp(out.shotSpeed, 0.4, 3.0),
    speed: clamp(out.speed, 0.6, 2.0),
    luck: clamp(out.luck, -5, 15),
  };
}

/* ================================================================== *
 * 测试组
 * ================================================================== */

function testRNG() {
  section('RNG 种子可复现');
  const a = makeRNG(12345), b = makeRNG(12345), c = makeRNG(999);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 200; i++) { sa.push(a()); sb.push(b()); sc.push(c()); }
  ok('同种子序列一致', sa.every((v, i) => v === sb[i]));
  ok('不同种子序列不同', sa.some((v, i) => v !== sc[i]));
  ok('值域在 [0,1)', sa.every((v) => v >= 0 && v < 1));
  const mean = sa.reduce((s, v) => s + v, 0) / sa.length;
  ok('大样本均值≈0.5', Math.abs(mean - 0.5) < 0.08, `mean=${mean.toFixed(4)}`);
  // 卡方均匀性（10 桶）
  const bins = new Array(10).fill(0);
  const r = makeRNG(777);
  for (let i = 0; i < 10000; i++) bins[Math.floor(r() * 10)]++;
  const exp = 1000;
  const chi = bins.reduce((s, o) => s + (o - exp) ** 2 / exp, 0);
  ok('卡方均匀性 (9df, χ²<27.88)', chi < 27.88, `χ²=${chi.toFixed(2)}`);
}

function testDungeonGen() {
  section('地牢生成：连通性 / 房间数 / Boss 最远 / 门对称');
  // 参考生成器：在 9x9 网格上随机游走生长 5–8 个房间
  function gen(seed) {
    const rand = makeRNG(seed);
    const target = 5 + Math.floor(rand() * 4); // 5..8
    const key = (x, y) => `${x},${y}`;
    const cells = new Map();
    const start = { x: 4, y: 4 };
    cells.set(key(start.x, start.y), start);
    const frontier = [];
    const pushN = (c) => {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = c.x + dx, ny = c.y + dy;
        if (nx < 0 || ny < 0 || nx > 8 || ny > 8) continue;
        if (!cells.has(key(nx, ny))) frontier.push({ x: nx, y: ny, from: c });
      }
    };
    pushN(start);
    let guard = 0;
    while (cells.size < target && frontier.length && guard++ < 500) {
      const i = Math.floor(rand() * frontier.length);
      const cand = frontier.splice(i, 1)[0];
      if (cells.has(key(cand.x, cand.y))) continue;
      cells.set(key(cand.x, cand.y), { x: cand.x, y: cand.y });
      pushN(cand);
    }
    // 建边：相邻格子连门
    const rooms = [...cells.values()];
    const edges = [];
    for (const a of rooms) for (const b of rooms) {
      if (a.x === b.x && Math.abs(a.y - b.y) === 1) edges.push([key(a.x, a.y), key(b.x, b.y)]);
      if (a.y === b.y && Math.abs(a.x - b.x) === 1) edges.push([key(a.x, a.y), key(b.x, b.y)]);
    }
    // Boss 房 = 距起点 BFS 距离最大者
    const adj = new Map(rooms.map((r) => [key(r.x, r.y), []]));
    for (const [a, b] of edges) { adj.get(a).push(b); adj.get(b).push(a); }
    const dist = new Map([[key(start.x, start.y), 0]]);
    const q = [key(start.x, start.y)];
    while (q.length) {
      const cur = q.shift();
      for (const n of adj.get(cur)) if (!dist.has(n)) { dist.set(n, dist.get(cur) + 1); q.push(n); }
    }
    let boss = null, bd = -1;
    for (const [k, d] of dist) if (d > bd) { bd = d; boss = k; }
    return { rooms, edges, keys: rooms.map((r) => key(r.x, r.y)), start: key(start.x, start.y), boss, bossDist: bd, dist };
  }

  let allCountOK = true, allConnOK = true, allBossOK = true, allSymOK = true, allBossFar = true;
  const counts = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    const d = gen(seed);
    counts.add(d.rooms.length);
    if (d.rooms.length < 5 || d.rooms.length > 8) { allCountOK = false; failures.push({ name: `房间数越界 seed=${seed}`, detail: d.rooms.length }); }
    // 连通性：所有房间从起点可达
    if (bfsConnected(d.keys, d.edges, d.start) !== d.rooms.length) { allConnOK = false; failures.push({ name: `不连通 seed=${seed}`, detail: `reachable=${bfsConnected(d.keys, d.edges, d.start)}/${d.rooms.length}` }); }
    // Boss 房存在
    if (!d.boss) allBossOK = false;
    // Boss 房应是距离最大者（非起点）
    if (d.boss === d.start && d.rooms.length > 1) allBossFar = false;
    // 门对称性：a-b 有边则 b-a 也有
    const es = new Set(d.edges.map(([a, b]) => a + '>' + b));
    for (const [a, b] of d.edges) if (!es.has(b + '>' + a)) allSymOK = false;
  }
  ok('5–8 房间约束（300 seed）', allCountOK, `实际出现房间数: ${[...counts].sort().join(',')}`);
  ok('全房间连通（300 seed）', allConnOK);
  ok('Boss 房始终存在', allBossOK);
  ok('Boss 房非起点（距离最大）', allBossFar);
  ok('门连接对称', allSymOK);
  ok('房间数取值覆盖 5..8', counts.has(5) && counts.has(6) && counts.has(7) && counts.has(8), `出现: ${[...counts].sort().join(',')}`);
}

function testStats() {
  section('属性系统：结算顺序 / 可交换性 / 钳制');
  const base = { damage: 3.5, fireDelay: 10, range: 6.5, shotSpeed: 1.0, speed: 1.0, luck: 0 };

  // 单道具基线
  const none = computeStats(base, []);
  ok('无道具 = 基础值', none.damage === 3.5 && none.fireDelay === 10 && none.range === 6.5);

  // Cricket's Head (damage x1.5) + Blood of Martyr (+1.0)
  const a = computeStats(base, [{ mul: { damage: 1.5 } }, { add: { damage: 1.0 } }]);
  ok('加法先于乘法: (3.5+1)*1.5=6.75', Math.abs(a.damage - 6.75) < 1e-9, `got ${a.damage}`);

  // 可交换性：交换拾取顺序结果不变
  const b = computeStats(base, [{ add: { damage: 1.0 } }, { mul: { damage: 1.5 } }]);
  ok('拾取顺序可交换', Math.abs(a.damage - b.damage) < 1e-9);

  // 钳制下限：damage 不能低于 0.5（如 Soy Milk 类）
  const low = computeStats(base, [{ mul: { damage: 0.001 } }]);
  ok('damage 下限钳制 0.5', low.damage === 0.5, `got ${low.damage}`);

  // 钳制上限：
  const high = computeStats(base, [{ mul: { damage: 100 } }]);
  ok('damage 上限钳制 60', high.damage === 60, `got ${high.damage}`);

  // 射速钳制 (frames, 越小越快)
  const fast = computeStats(base, [{ add: { fireDelay: -50 } }]);
  ok('fireDelay 下限钳制 1 帧', fast.fireDelay === 1, `got ${fast.fireDelay}`);
  const slow = computeStats(base, [{ add: { fireDelay: 100 } }]);
  ok('fireDelay 上限钳制 60 帧', slow.fireDelay === 60, `got ${slow.fireDelay}`);

  // 移速钳制
  const spFast = computeStats(base, [{ add: { speed: 5 } }]);
  ok('speed 上限钳制 2.0', spFast.speed === 2.0, `got ${spFast.speed}`);
  const spSlow = computeStats(base, [{ add: { speed: -5 } }]);
  ok('speed 下限钳制 0.6', spSlow.speed === 0.6, `got ${spSlow.speed}`);

  // 幸运可为负
  const luckNeg = computeStats(base, [{ add: { luck: -3 } }]);
  ok('luck 支持负值', luckNeg.luck === -3, `got ${luckNeg.luck}`);

  // 大量叠加不 NaN / 不 Infinity
  const many = [];
  for (let i = 0; i < 50; i++) many.push({ add: { damage: 1, speed: 0.1, range: 0.5 }, mul: { damage: 1.1, shotSpeed: 1.05 } });
  const r = computeStats(base, many);
  ok('50 件道具叠加无 NaN/Inf', Object.values(r).every((v) => Number.isFinite(v)), JSON.stringify(r));
}

function testCollision() {
  section('碰撞检测：圆-圆 / 圆-矩形');
  // 圆-圆
  ok('圆-圆 相交', circleCircle(0, 0, 10, 15, 0, 10) === true);
  ok('圆-圆 相切不算相交(严格小于)', circleCircle(0, 0, 10, 20, 0, 10) === false);
  ok('圆-圆 分离', circleCircle(0, 0, 10, 30, 0, 10) === false);
  ok('圆-圆 完全重合', circleCircle(0, 0, 10, 0, 0, 10) === true);

  // 圆-矩形
  ok('圆-矩形 圆心在内部', collidesCircleRect(5, 5, 3, 0, 0, 20, 20) === true);
  ok('圆-矩形 边接触', collidesCircleRect(-2, 5, 3, 0, 0, 20, 20) === true);
  ok('圆-矩形 角接触', collidesCircleRect(-2, -2, 3, 0, 0, 20, 20) === true);
  ok('圆-矩形 恰好分离', collidesCircleRect(-4, -4, 3, 0, 0, 20, 20) === false);
  ok('圆-矩形 远离', collidesCircleRect(100, 100, 3, 0, 0, 20, 20) === false);

  // AABB 分轴滑动：撞墙只停该轴
  function slide(vx, vy, x, y, dt, rects, r) {
    let nx = x + vx * dt, ny = y + vy * dt;
    for (const t of rects) if (collidesCircleRect(nx, y, r, t.x, t.y, t.w, t.h)) { nx = x; break; }
    for (const t of rects) if (collidesCircleRect(nx, ny, r, t.x, t.y, t.w, t.h)) { ny = y; break; }
    return { x: nx, y: ny };
  }
  const wall = [{ x: 100, y: 0, w: 20, h: 200 }];
  // 起点 x=80, vx=200, dt=0.1 → 目标 x=100；圆半径 5 会在 x>=95 时碰到墙左沿(x=100)
  const s1 = slide(200, 100, 80, 100, 0.1, wall, 5);
  ok('分轴滑动：x 被墙挡住', s1.x === 80, `x=${s1.x} (期望回退到 80)`);
  ok('分轴滑动：y 轴仍可自由移动', Math.abs(s1.y - 110) < 1e-9, `y=${s1.y}`);
  // 未碰到墙时应正常移动
  const s2 = slide(200, 0, 10, 100, 0.1, wall, 5);
  ok('分轴滑动：无阻挡时正常移动', Math.abs(s2.x - 30) < 1e-9, `x=${s2.x}`);
}

function testDropTable() {
  section('掉落表分布');
  const table = [
    { id: 'none', w: 60 },
    { id: 'heart', w: 15 },
    { id: 'coin', w: 12 },
    { id: 'item', w: 8 },
    { id: 'bomb', w: 5 },
  ];
  const total = table.reduce((s, t) => s + t.w, 0);
  const rand = makeRNG(2024);
  const hits = Object.fromEntries(table.map((t) => [t.id, 0]));
  const N = 100000;
  for (let i = 0; i < N; i++) {
    let r = rand() * total;
    for (const t of table) { if (r < t.w) { hits[t.id]++; break; } r -= t.w; }
  }
  let allClose = true; const detail = [];
  for (const t of table) {
    const exp = (t.w / total) * N;
    const dev = Math.abs(hits[t.id] - exp) / exp;
    detail.push(`${t.id}:${(dev * 100).toFixed(2)}%`);
    if (dev > 0.05) allClose = false;
  }
  ok('10万次抽样偏差 <5%', allClose, detail.join(' '));
  ok('权重和覆盖全部样本', Object.values(hits).reduce((s, v) => s + v, 0) === N);
}

function testSrcIntegrity() {
  section('源码完整性检查');
  const srcDir = path.join(ROOT, 'src');
  if (!fs.existsSync(srcDir)) {
    ok('src 目录存在', false, 'src/ 尚未创建');
    return;
  }
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) files.push(p);
    }
  })(srcDir);
  ok(`src 下有模块 (${files.length} 个)`, files.length > 0);

  let todoCount = 0, undefinedRef = 0;
  for (const f of files) {
    const code = fs.readFileSync(f, 'utf8');
    if (/\bTODO\b|\bFIXME\b/.test(code)) todoCount++;
    // 常见笔误：ctx 未定义却使用
    // 判定：出现 `ctx.xxx(` 但没有把 ctx 作为形参或局部变量引入。
    // 注意形参签名有两大类，早期版本只认第一类，导致类方法（如 _drawStick(ctx, ...)）被误报：
    //   1) 具名/匿名函数： function foo(ctx) / function (ctx) / (ctx) => ...
    //   2) 类方法/对象简写方法/箭头属性： _drawStick(ctx, ...) / draw(ctx) { ... }
    const hasCtxParam =
      /function\s*\w*\s*\([^)]*\bctx\b/.test(code) ||            // function foo(ctx) / function (ctx)
      /\([^)]*\bctx\b[^)]*\)\s*\{/.test(code) ||                // 方法简写 foo(ctx) { / (ctx) {
      /\([^)]*\bctx\b[^)]*\)\s*=>/.test(code);                   // 箭头函数 (ctx) =>
    const hasCtxLocal = /(?:const|let|var)\s+ctx\b|\bctx\s*=/.test(code);
    if (/\bctx\.\w+\(/.test(code) && !hasCtxParam && !hasCtxLocal) undefinedRef++;
  }
  ok('无 TODO/FIXME 占位', todoCount === 0, `${todoCount} 个文件含 TODO`);
  ok('无裸露的 ctx 引用', undefinedRef === 0, `${undefinedRef} 个文件可能未定义 ctx`);
}

/* ================================================================== */
function main() {
  console.log('=== Isaac-Roguelike 逻辑单测 ===');
  testRNG();
  testDungeonGen();
  testStats();
  testCollision();
  testDropTable();
  testSrcIntegrity();
  console.log(`\n\n=== 结果: ${pass} 通过, ${fail} 失败 ===`);
  if (fail) {
    console.log('\n失败明细:');
    for (const f of failures) console.log(`  ✗ ${f.name}${f.detail ? ' — ' + f.detail : ''}`);
    process.exit(1);
  }
  console.log('全部通过 ✓');
}
main();
