#!/usr/bin/env node
/**
 * qa-door-independent.mjs — QA-004 独立验收（真实键盘输入 + 真实 rAF 游戏循环）
 *
 * 为什么需要它（与工程的 tests/door-traversal.mjs 的区别）
 * --------------------------------------------------------
 * 工程的回归脚本**直接调用私有方法** `_checkDoors()` / `_clampPlayer()`，并**手工合成
 * 速度**（`p.vx = d.dx * speed`），绕过了：
 *   · Input 层（真实 keydown → 逻辑动作）
 *   · GameState._updatePlaying 的真实每帧顺序
 *   · requestAnimationFrame 驱动的固定步循环
 * 因此它证明不了「玩家真的按键盘能走过去」。
 *
 * 本脚本用 **Playwright 打开 file:// 下的真实产物 dist/isaac-standalone.html**，
 * **只用 page.keyboard.down/up 驱动**，让游戏自己的 rAF 循环跑。
 *
 * 覆盖（对应 Task QA-004）
 * ------------------------
 *   (a) 用户三场景：四方向真实按键穿门 / 往返 / 无「全部门锁死」房间
 *   (b) 端到端连通：纯键盘从起始房走到 Boss 房、击杀 Boss、进下一层
 *   (c) 对抗性：放宽 clamp 是否引入「穿墙」——无门侧 / 偏离门轴 / 斜向角落 / 高速
 *   (d) 速度边界：低/基础/高/极高四档，四方向门 100% 可通行 + 高速不穿墙
 *   (e) 回归：未清房不能穿门（设计意图）
 *
 * 用法：node tests/qa-door-independent.mjs [a b c d e | all]
 * 退出码：0 = PASS，2 = CONCERNS，1 = FAIL
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'dist', 'isaac-standalone.html');
const TARGET_URL = pathToFileURL(TARGET).href;
const RESULT_JSON = path.join(ROOT, 'tests', 'qa-door-independent.result.json');
const SHOT_DIR = path.join(ROOT, 'tests', 'shots');

// ---- 几何常量（镜像 src/systems/rooms.js + player.radius；独立复算，不 import 工程脚本）----
const ROOM_W = 624;
const ROOM_H = 336;
const PLAY_PAD = 22;
const RADIUS = 13;
const PAD = RADIUS + 4; // 17
const BASE_MINX = PLAY_PAD + RADIUS * 0.2; // 24.6（活动区，非清房时严格夹制）
const BASE_MAXX = ROOM_W - PAD; // 607
const BASE_MINY = BASE_MINX; // 24.6
const BASE_MAXY = ROOM_H - PAD; // 319
// 房间内容区（真实边界，0..ROOM_W / 0..ROOM_H）——「虚空」判据用这个，而不是活动区
const ROOM_MINX = 0;
const ROOM_MAXX = ROOM_W;
const ROOM_MINY = 0;
const ROOM_MAXY = ROOM_H;
const EPS = 0.75; // 数值容差（浮点 + 一帧步长）

const DIR_KEY = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const DIR_OFFSET = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIRS = ['up', 'down', 'left', 'right'];

const A_SEEDS = ['1', '7', '42', '777', '12345', '3']; // 场景 (a)
const C_SEEDS = ['1', '42', '777']; // 对抗 (c)
const D_SEEDS = ['42', '777', '12345', '1']; // 速度 (d)
const D_SPEEDS = [70, 168, 380, 700]; // 低 / 基础 / 高 / 极高
const E2E_SEEDS = ['42', '7']; // 端到端 (b)

const argv = process.argv.slice(2);
const ALL_SECTIONS = ['a', 'b', 'c', 'd', 'e', 'm'];
const which = new Set(!argv.length || argv.includes('all') ? ALL_SECTIONS : argv);

// ===========================================================================
// 结果收集
// ===========================================================================
const RESULT = {
  taskId: 'QA-004',
  generatedAt: new Date().toISOString(),
  artifact: { path: 'dist/isaac-standalone.html' },
  pageErrors: [],
  consoleErrors: [],
  sections: {},
};

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, detail });
  return pass;
}

// ===========================================================================
// 工具：页面内注入 __QA__ 辅助对象（浏览器上下文，只读 + 场景搭建）
// ===========================================================================
async function injectQA(page) {
  await page.evaluate(() => {
    const QA = {
      history: [],
      install() {
        const g = window.__ISAAC__.game;
        if (!g.__qaHooked) {
          const proto = Object.getPrototypeOf(g);
          const orig = proto._enterRoom;
          g._enterRoom = function (next, dir) {
            orig.call(this, next, dir);
            window.__QA__.history.push({ key: next.key, dir: dir ? dir.name : null, t: performance.now() });
          };
          g.__qaHooked = true;
        }
      },
      resetHistory() {
        this.history = [];
      },
      snap() {
        const g = window.__ISAAC__.game;
        const p = g.player;
        const room = g.currentRoom;
        const rects = room ? room.doorRects().map((r) => ({ dir: r.dir, x: r.x, y: r.y, w: r.w, h: r.h })) : [];
        return {
          scene: g.scene,
          floor: g.floor,
          roomKey: room ? room.key : null,
          roomKind: room ? room.kind : null,
          cleared: room ? !!room.cleared : null,
          x: p.x,
          y: p.y,
          vx: p.vx,
          vy: p.vy,
          speed: p.stats.speed,
          alive: p.alive,
          doors: room ? { ...room.doors } : null,
          rects,
          hLen: (window.__QA__.history || []).length,
        };
      },
      rooms() {
        return Object.values(window.__ISAAC__.game.roomsByKey).map((r) => ({
          key: r.key,
          kind: r.kind,
          gx: r.gx,
          gy: r.gy,
          doors: { ...r.doors },
        }));
      },
      /** 场景搭建：把玩家放进指定房间（仅用于 (a)(c)(d)(e) 的起点搭建；穿门仍由键盘完成） */
      prep(key, opts = {}) {
        const g = window.__ISAAC__.game;
        const room = g.roomsByKey[key];
        if (!room) return false;
        g.currentRoom = room;
        room.cleared = opts.cleared !== false;
        room.visited = true;
        room.enemies = [];
        room.boss = null;
        room.bossSpawned = true; // 抑制 boss 在非 E2E 场景里刷出
        room.enterGrace = 0;
        room.inGrace = false;
        room.pickups = [];
        room.itemDrops = [];
        room.chests = [];
        if (opts.clearObstacles !== false) room.obstacles = [];
        const p = g.player;
        p.x = opts.x === undefined ? 624 / 2 : opts.x;
        p.y = opts.y === undefined ? 336 / 2 : opts.y;
        p.vx = 0;
        p.vy = 0;
        p.alive = true;
        p.invuln = 999;
        return true;
      },
      /** 返回：清房但**不移动玩家**（用于往返测试的第二程） */
      prepReturn(key) {
        const g = window.__ISAAC__.game;
        const room = g.roomsByKey[key];
        if (!room) return false;
        room.cleared = true;
        room.enemies = [];
        room.boss = null;
        room.bossSpawned = true;
        room.enterGrace = 0;
        room.obstacles = [];
        g.player.invuln = 999;
        g.player.alive = true;
        return true;
      },
      place(x, y) {
        const p = window.__ISAAC__.game.player;
        p.x = x;
        p.y = y;
        p.vx = 0;
        p.vy = 0;
        p.invuln = 999;
        p.alive = true;
      },
      setSpeed(v) {
        window.__ISAAC__.game.player.stats.speed = v;
      },
      setCleared(key, v) {
        const r = window.__ISAAC__.game.roomsByKey[key];
        if (r) r.cleared = !!v;
      },
    };
    window.__QA__ = QA;
    QA.install();
  });
}

async function startAndPlay(page, seed) {
  await page.evaluate((s) => {
    const g = window.__ISAAC__.game;
    g.startGame(s);
  }, seed);
  await page.evaluate(() => {
    const g = window.__ISAAC__.game;
    g.sceneT = 999;
    g.transitionT = 999;
  });
  await page.waitForFunction(() => window.__ISAAC__.game.scene === 'playing', null, { timeout: 8000 });
  await page.evaluate(() => window.__QA__.install());
}

// ===========================================================================
// 真实键盘：按住若干键并采样位置
// ===========================================================================
async function holdKeys(page, keys, ms, sampleEvery = 40) {
  for (const k of keys) await page.keyboard.down(k);
  const samples = [];
  const t0 = Date.now();
  try {
    while (Date.now() - t0 < ms) {
      await page.waitForTimeout(sampleEvery);
      samples.push(await page.evaluate(() => window.__QA__.snap()));
    }
  } finally {
    for (const k of keys) await page.keyboard.up(k);
  }
  return samples;
}

/** 按一个方向键直到 _enterRoom 被触发（或超时）；返回是否穿门成功 */
async function pressUntilTraverse(page, dirName, timeoutMs = 3500) {
  const key = DIR_KEY[dirName];
  const fromKey = await page.evaluate(() => window.__ISAAC__.game.currentRoom.key);
  await page.evaluate(() => window.__QA__.resetHistory());
  await page.keyboard.down(key);
  const t0 = Date.now();
  let traversed = false;
  try {
    while (Date.now() - t0 < timeoutMs) {
      await page.waitForTimeout(35);
      const h = await page.evaluate(() => (window.__QA__.history || []).length);
      if (h > 0) {
        traversed = true;
        break;
      }
    }
  } finally {
    await page.keyboard.up(key);
  }
  const snap = await page.evaluate(() => window.__QA__.snap());
  const history = await page.evaluate(() => window.__QA__.history.slice());
  return { traversed, fromKey, snap, history, ms: Date.now() - t0 };
}

// ===========================================================================
// 对抗性：位置不变量
// ===========================================================================
function inAnyRect(x, y, rects, inflate = 0) {
  for (const r of rects) {
    if (x > r.x - inflate && x < r.x + r.w + inflate && y > r.y - inflate && y < r.y + r.h + inflate) return r.dir;
  }
  return null;
}
/** 位置不变量：不得越出「房间内容区 ∪ 门洞」的并集（含 EPS 容差）——这才是「虚空」判据 */
function voidViolation(s, inflate = EPS) {
  const outside =
    s.x < ROOM_MINX - inflate || s.x > ROOM_MAXX + inflate || s.y < ROOM_MINY - inflate || s.y > ROOM_MAXY + inflate;
  if (!outside) return null;
  const inRect = inAnyRect(s.x, s.y, s.rects || [], inflate);
  if (inRect) return null; // 门洞隧道内 —— 合法
  return { x: +s.x.toFixed(2), y: +s.y.toFixed(2) };
}

// ===========================================================================
// 战斗辅助（用于 (b) 端到端；用真实 projectile 走 Combat，超时再兜底）
// ===========================================================================
async function autoAimFire(page, kind, budgetMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < budgetMs) {
    const done = await page.evaluate((k) => {
      const g = window.__ISAAC__.game;
      const p = g.player;
      const room = g.currentRoom;
      p.invuln = 999;
      p.alive = true;
      let targets = [];
      if (k === 'boss') {
        if (room.boss && !room.boss.isDead) targets = [room.boss];
      } else {
        targets = room.enemies.filter((e) => !e.isDead);
      }
      if (targets.length === 0) {
        g.input.setStick('fire', 0, 0, false);
        return true;
      }
      let best = null;
      let bd = Infinity;
      for (const e of targets) {
        const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      const a = Math.atan2(best.y - p.y, best.x - p.x);
      g.input.setStick('fire', Math.cos(a), Math.sin(a), true);
      return false;
    }, kind);
    if (done) {
      await page.evaluate(() => window.__ISAAC__.game.input.setStick('fire', 0, 0, false));
      return true;
    }
    await page.waitForTimeout(110);
  }
  await page.evaluate(() => window.__ISAAC__.game.input.setStick('fire', 0, 0, false));
  return false;
}

async function clearCurrentRoom(page, budgetMs = 11000) {
  // 隔离「门连通性」变量：清掉本房障碍（障碍避让是正交问题，且生成器已避开门前通道）
  await page.evaluate(() => {
    window.__ISAAC__.game.currentRoom.obstacles = [];
  });
  const n = await page.evaluate(() => window.__ISAAC__.game.currentRoom.enemies.filter((e) => !e.isDead).length);
  if (n === 0) {
    await page.evaluate(() => {
      const r = window.__ISAAC__.game.currentRoom;
      if (r.enemies.filter((e) => !e.isDead).length === 0) r.cleared = true;
    });
    return 'already';
  }
  const ok = await autoAimFire(page, 'enemies', budgetMs);
  if (ok) {
    // 等 _clearRoom 落账
    await page.waitForTimeout(500);
    const cleared = await page.evaluate(() => window.__ISAAC__.game.currentRoom.cleared);
    if (cleared) return 'combat';
  }
  await page.evaluate(() => {
    const r = window.__ISAAC__.game.currentRoom;
    r.enemies.length = 0;
    r.cleared = true;
  });
  return 'forced';
}

async function killBoss(page, budgetMs = 30000) {
  const ok = await autoAimFire(page, 'boss', budgetMs);
  if (ok) return 'combat';
  await page.evaluate(() => {
    const b = window.__ISAAC__.game.currentRoom.boss;
    if (b) {
      b.entering = 0;
      b.invuln = 0;
      b.takeDamage(99999, 0, 0, 0);
    }
  });
  return 'forced';
}

// ===========================================================================
// 端到端自动走位（导航只用真实键盘）
// ===========================================================================
async function driveToDoor(page, dirName, timeoutMs = 14000) {
  const target = await page.evaluate((d) => {
    const g = window.__ISAAC__.game;
    const room = g.currentRoom;
    const r = room.doorRects().find((rr) => rr.dir === d);
    if (!r) return null;
    return { tx: r.x + r.w / 2, ty: r.y + r.h / 2, roomKey: room.key };
  }, dirName);
  if (!target) return { ok: false, reason: 'no-door-rect', ms: 0 };

  await page.evaluate(() => window.__QA__.resetHistory());
  const held = { x: null, y: null };
  const setKey = async (prev, next) => {
    if (prev === next) return prev;
    if (prev) await page.keyboard.up(prev);
    if (next) await page.keyboard.down(next);
    return next;
  };
  const t0 = Date.now();
  let ok = false;
  let lastPos = null;
  let lastMoveT = Date.now();
  try {
    while (Date.now() - t0 < timeoutMs) {
      const s = await page.evaluate(() => {
        const g = window.__ISAAC__.game;
        return { x: g.player.x, y: g.player.y, roomKey: g.currentRoom.key, h: window.__QA__.history.length };
      });
      if (s.h > 0 || s.roomKey !== target.roomKey) {
        ok = true;
        break;
      }
      const dx = target.tx - s.x;
      const dy = target.ty - s.y;
      const wantX = dx > 6 ? 'KeyD' : dx < -6 ? 'KeyA' : null;
      const wantY = dy > 6 ? 'KeyS' : dy < -6 ? 'KeyW' : null;
      held.x = await setKey(held.x, wantX);
      held.y = await setKey(held.y, wantY);

      if (lastPos && Math.abs(s.x - lastPos.x) < 0.6 && Math.abs(s.y - lastPos.y) < 0.6) {
        if (Date.now() - lastMoveT > 1100) {
          // 疑似被障碍/墙卡住：短暂松开再重试（对抗卡死）
          if (held.x) {
            await page.keyboard.up(held.x);
            held.x = null;
          }
          if (held.y) {
            await page.keyboard.up(held.y);
            held.y = null;
          }
          await page.waitForTimeout(120);
          lastMoveT = Date.now();
        }
      } else {
        lastMoveT = Date.now();
      }
      lastPos = s;
      await page.waitForTimeout(40);
    }
  } finally {
    if (held.x) await page.keyboard.up(held.x);
    if (held.y) await page.keyboard.up(held.y);
  }
  const snap = await page.evaluate(() => window.__QA__.snap());
  return { ok, ms: Date.now() - t0, snap };
}

function bfsToBoss(page) {
  return page.evaluate(() => {
    const g = window.__ISAAC__.game;
    const d = g.dungeon;
    const startKey = g.currentRoom.key;
    const goal = d.bossKey;
    const off = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const q = [startKey];
    const prev = { [startKey]: null };
    const seen = new Set([startKey]);
    let found = false;
    while (q.length) {
      const k = q.shift();
      if (k === goal) {
        found = true;
        break;
      }
      const room = g.roomsByKey[k];
      for (const dir of ['up', 'down', 'left', 'right']) {
        if (!room.doors[dir]) continue;
        const [ox, oy] = off[dir];
        const nk = `${room.gx + ox},${room.gy + oy}`;
        if (!g.roomsByKey[nk] || seen.has(nk)) continue;
        seen.add(nk);
        prev[nk] = { from: k, dir };
        q.push(nk);
      }
    }
    if (!found) return { ok: false, start: startKey, goal };
    const steps = [];
    let cur = goal;
    while (prev[cur]) {
      steps.unshift({ room: cur, from: prev[cur].from, dir: prev[cur].dir });
      cur = prev[cur].from;
    }
    return { ok: true, start: startKey, goal, steps };
  });
}

async function runE2E(page, seed) {
  await startAndPlay(page, seed);
  const plan = await bfsToBoss(page);
  const rec = { seed, plan, steps: [], reachedBoss: false, floorBefore: null, floorAfter: null, combatModes: [], ok: false };
  if (!plan.ok) {
    rec.reason = 'bfs-failed';
    return rec;
  }
  rec.floorBefore = await page.evaluate(() => window.__ISAAC__.game.floor);
  const t0 = Date.now();
  for (const step of plan.steps) {
    const mode = await clearCurrentRoom(page);
    rec.combatModes.push({ room: step.from, mode });
    const drive = await driveToDoor(page, step.dir);
    const nowKey = await page.evaluate(() => window.__ISAAC__.game.currentRoom.key);
    rec.steps.push({ from: step.from, to: step.room, dir: step.dir, ok: drive.ok, actual: nowKey, ms: drive.ms });
    if (!drive.ok) {
      rec.reason = `drive-failed@${step.from}->${step.dir}`;
      rec.elapsedMs = Date.now() - t0;
      return rec;
    }
  }
  rec.elapsedMs = Date.now() - t0;
  // 到达 Boss 房
  const atBoss = await page.evaluate(() => window.__ISAAC__.game.currentRoom.key === window.__ISAAC__.game.dungeon.bossKey);
  rec.reachedBoss = atBoss;
  if (!atBoss) {
    rec.reason = 'not-at-boss';
    return rec;
  }
  await page.evaluate(() => {
    const g = window.__ISAAC__.game;
    const r = g.currentRoom;
    r.visited = true;
    r.enterGrace = 0;
    g.player.invuln = 999;
    g.player.alive = true;
  });
  await page.waitForTimeout(1800); // 等 Boss 生成 + 出场
  const bossMode = await killBoss(page);
  rec.combatModes.push({ room: 'BOSS', mode: bossMode });
  await page.waitForTimeout(4200); // 死亡动画(1.2s) + 切层延迟(1.6s) + 过渡
  const after = await page.evaluate(() => ({ floor: window.__ISAAC__.game.floor, scene: window.__ISAAC__.game.scene }));
  rec.floorAfter = after.floor;
  rec.sceneAfter = after.scene;
  rec.ok = after.floor > rec.floorBefore;
  try {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, `qa-door-e2e-seed${seed}-after-boss.png`) });
  } catch {}
  return rec;
}

// ===========================================================================
// main
// ===========================================================================
async function main() {
  if (!fs.existsSync(TARGET)) {
    console.error(`[qa-door-independent] 产物不存在: ${TARGET}`);
    process.exit(1);
  }
  // 记录被测产物指纹（不采信工程自报）
  const buf = fs.readFileSync(TARGET);
  const { createHash } = await import('node:crypto');
  const sha256 = createHash('sha256').update(buf).digest('hex');
  RESULT.artifact.sha256 = sha256;
  RESULT.artifact.bytes = buf.length;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => RESULT.pageErrors.push(String(e.message || e)));
  page.on('console', (m) => {
    if (m.type() === 'error') RESULT.consoleErrors.push(m.text());
  });

  await page.goto(TARGET_URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__ISAAC__ !== 'undefined', null, { timeout: 20000 });
  await page.waitForTimeout(600);
  await injectQA(page);

  // ================= (a) 用户三场景 =================
  if (which.has('a')) {
    const tally = { up: { ok: 0, bad: 0 }, down: { ok: 0, bad: 0 }, left: { ok: 0, bad: 0 }, right: { ok: 0, bad: 0 } };
    const stuckRooms = [];
    const doorFailures = [];
    const roundTrips = [];
    const dangling = [];
    let roomCount = 0;
    let doorTotal = 0;
    let memoOk = 0;
    let rectLenOk = 0;

    for (const seed of A_SEEDS) {
      await startAndPlay(page, seed);
      const rooms = await page.evaluate(() => window.__QA__.rooms());
      for (const room of rooms) {
        roomCount++;
        let allBad = true;
        let doorN = 0;
        for (const d of DIRS) {
          if (!room.doors[d]) continue;
          const [ox, oy] = DIR_OFFSET[d];
          const neighborKey = `${room.gx + ox},${room.gy + oy}`;
          const hasNb = await page.evaluate((k) => !!window.__ISAAC__.game.roomsByKey[k], neighborKey);
          if (!hasNb) {
            dangling.push(`${seed}:${room.key}(${d})`);
            continue;
          }
          doorN++;
          doorTotal++;
          // 搭建：把玩家放本房中心（几何隔离：清障碍，聚焦 clamp 几何）
          await page.evaluate((k) => window.__QA__.prep(k, { clearObstacles: true }), room.key);
          await page.waitForTimeout(30);
          const r = await pressUntilTraverse(page, d, 3500);
          if (r.traversed) {
            tally[d].ok++;
            allBad = false;
          } else {
            tally[d].bad++;
            doorFailures.push({
              seed,
              room: room.key,
              dir: d,
              x: +r.snap.x.toFixed(1),
              y: +r.snap.y.toFixed(1),
              rects: r.snap.rects,
            });
          }
          // 往返：进入邻房后，立刻用对侧键走回
          if (r.traversed) {
            const backKey = OPP[d];
            await page.evaluate((k) => window.__QA__.prepReturn(k), neighborKey);
            await page.waitForTimeout(30);
            const rt = await pressUntilTraverse(page, backKey, 3500);
            const backToA = rt.snap.roomKey === room.key;
            roundTrips.push({ seed, dir: d, backKey, ok: backToA, actual: rt.snap.roomKey, expected: room.key });
          }
        }
        // FIX-005 独立核查：doorRects() 记忆化（同一引用）且矩形数 === 门数
        const memo = await page.evaluate((k) => {
          const r = window.__ISAAC__.game.roomsByKey[k];
          const a = r.doorRects();
          const b = r.doorRects();
          const n = Object.values(r.doors).filter(Boolean).length;
          return { same: a === b, len: a.length, doors: n };
        }, room.key);
        if (memo.same) memoOk++;
        if (memo.len === memo.doors) rectLenOk++;
        if (doorN > 0 && allBad) stuckRooms.push(`${seed}:${room.key}(${room.kind})`);
      }
    }

    RESULT.sections.a = { tally, doorTotal, roomCount, stuckRooms, doorFailures, roundTrips, dangling, memoOk, rectLenOk };
    const perDirOk = DIRS.every((d) => tally[d].ok + tally[d].bad >= 10 && tally[d].bad === 0);
    const covOk = DIRS.every((d) => tally[d].ok + tally[d].bad >= 10);
    check('a1. 四方向真实键盘穿门 100%（每方向≥10 门）', perDirOk && covOk,
      DIRS.map((d) => `${d} ${tally[d].ok}/${tally[d].ok + tally[d].bad}`).join('  '));
    check('a2. 无「全部门锁死」房间', stuckRooms.length === 0, `锁死 ${stuckRooms.length}/${roomCount}`);
    const rtFail = roundTrips.filter((r) => !r.ok);
    check('a3. 往返可回（穿门后立即走回）', rtFail.length === 0, `往返 ${roundTrips.length - rtFail.length}/${roundTrips.length} 成功`);
    const rdFail = roundTrips.filter((r) => !r.ok && (r.dir === 'right' || r.dir === 'down'));
    check('a4. 从 right/down 门进入后能走回', rdFail.length === 0,
      `right/down 往返 ${roundTrips.filter((r) => r.dir === 'right' || r.dir === 'down').length - rdFail.length}/${roundTrips.filter((r) => r.dir === 'right' || r.dir === 'down').length}`);
    check('a5. 无悬空门（门标志 ↔ 邻居一致）', dangling.length === 0, `悬空 ${dangling.length}`);
    check('a6. FIX-005 记忆化：doorRects() 同一引用且矩形数=门数', memoOk === roomCount && rectLenOk === roomCount,
      `记忆化 ${memoOk}/${roomCount}，矩形数一致 ${rectLenOk}/${roomCount}`);
  }

  // ================= (c) 对抗性 =================
  if (which.has('c')) {
    const violations = [];
    const boundsFails = [];
    const cornerFinals = [];
    let extreme = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    let samples = 0;
    const cases = [];

    const sideStart = {
      right: [520, 168],
      left: [104, 168],
      up: [312, 100],
      down: [312, 236],
    };
    const offAxisStart = {
      right: [312, 60],
      left: [312, 276],
      up: [80, 168],
      down: [560, 168],
    };
    const cornerStart = {
      'up-right': [[500, 100], ['KeyD', 'KeyW'], ['maxX', 'minY']],
      'down-left': [[124, 236], ['KeyA', 'KeyS'], ['minX', 'maxY']],
      'up-left': [[124, 100], ['KeyA', 'KeyW'], ['minX', 'minY']],
      'down-right': [[500, 236], ['KeyD', 'KeyS'], ['maxX', 'maxY']],
    };

    const recordSamples = (ss, label, roomKey, seed, expect) => {
      for (const s of ss) {
        samples++;
        extreme.minX = Math.min(extreme.minX, s.x);
        extreme.maxX = Math.max(extreme.maxX, s.x);
        extreme.minY = Math.min(extreme.minY, s.y);
        extreme.maxY = Math.max(extreme.maxY, s.y);
        const v = voidViolation(s);
        if (v) violations.push({ seed, room: roomKey, label, ...v, rects: s.rects.map((r) => r.dir) });
        if (expect) {
          for (const e of expect) {
            if (e === 'maxX' && s.x > BASE_MAXX + EPS) boundsFails.push({ seed, room: roomKey, label, field: 'x', value: +s.x.toFixed(2), limit: BASE_MAXX });
            if (e === 'minX' && s.x < BASE_MINX - EPS) boundsFails.push({ seed, room: roomKey, label, field: 'x', value: +s.x.toFixed(2), limit: BASE_MINX });
            if (e === 'maxY' && s.y > BASE_MAXY + EPS) boundsFails.push({ seed, room: roomKey, label, field: 'y', value: +s.y.toFixed(2), limit: BASE_MAXY });
            if (e === 'minY' && s.y < BASE_MINY - EPS) boundsFails.push({ seed, room: roomKey, label, field: 'y', value: +s.y.toFixed(2), limit: BASE_MINY });
          }
        }
      }
    };

    for (const seed of C_SEEDS) {
      await startAndPlay(page, seed);
      const rooms = await page.evaluate(() => window.__QA__.rooms());
      for (const room of rooms) {
        for (const side of DIRS) {
          if (!room.doors[side]) {
            // 无门侧：朝墙推挤 → 必须留在活动区内
            const [sx, sy] = sideStart[side];
            await page.evaluate(({ k, x, y }) => window.__QA__.prep(k, { x, y, clearObstacles: true }), { k: room.key, x: sx, y: sy });
            await page.waitForTimeout(30);
            const ss = await holdKeys(page, [DIR_KEY[side]], 1600, 40);
            const expect = side === 'right' ? ['maxX'] : side === 'left' ? ['minX'] : side === 'up' ? ['minY'] : ['maxY'];
            recordSamples(ss, `doorless-${side}`, room.key, seed, expect);
            cases.push({ seed, room: room.key, kind: 'doorless', side });
          } else {
            // 有门侧但偏离门轴：必须仍在活动区内（不得沿整面墙穿出）
            const [sx, sy] = offAxisStart[side];
            await page.evaluate(({ k, x, y }) => window.__QA__.prep(k, { x, y, clearObstacles: true }), { k: room.key, x: sx, y: sy });
            await page.waitForTimeout(30);
            const ss = await holdKeys(page, [DIR_KEY[side]], 1600, 40);
            const expect = side === 'right' ? ['maxX'] : side === 'left' ? ['minX'] : side === 'up' ? ['minY'] : ['maxY'];
            recordSamples(ss, `offaxis-${side}`, room.key, seed, expect);
            cases.push({ seed, room: room.key, kind: 'offaxis', side });
          }
        }
        // 斜向角落（两侧都无门）
        for (const [corner, [pos, keys, expect]] of Object.entries(cornerStart)) {
          const [a, b] = corner.split('-');
          if (room.doors[a] || room.doors[b]) continue;
          await page.evaluate(({ k, x, y }) => window.__QA__.prep(k, { x, y, clearObstacles: true }), { k: room.key, x: pos[0], y: pos[1] });
          await page.waitForTimeout(30);
          const ss = await holdKeys(page, keys, 1600, 40);
          recordSamples(ss, `corner-${corner}`, room.key, seed, expect);
          const fin = ss[ss.length - 1];
          if (fin) cornerFinals.push({ seed, room: room.key, corner, x: +fin.x.toFixed(2), y: +fin.y.toFixed(2) });
          cases.push({ seed, room: room.key, kind: 'corner', side: corner });
        }
      }
    }
    // c5：隧道上界探测 —— 临时禁用 _checkDoors（传送），把玩家沿门轴推入门洞隧道，
    //     断言其不得越过 doorRects() 的「外沿」（即放宽后的 clamp 上界），也不得进入并集之外。
    const tunnel = [];
    for (const seed of ['1', '42']) {
      await startAndPlay(page, seed);
      const rooms = await page.evaluate(() => window.__QA__.rooms());
      for (const room of rooms) {
        for (const side of DIRS) {
          if (!room.doors[side]) continue;
          const rect = await page.evaluate(
            ({ k, d }) => {
              const r = window.__ISAAC__.game.roomsByKey[k];
              const rr = r.doorRects().find((x) => x.dir === d);
              return rr ? { ...rr } : null;
            },
            { k: room.key, d: side }
          );
          if (!rect) continue;
          let sx;
          let sy;
          if (side === 'left') {
            sx = 200;
            sy = rect.y + rect.h / 2;
          } else if (side === 'right') {
            sx = 424;
            sy = rect.y + rect.h / 2;
          } else if (side === 'up') {
            sx = rect.x + rect.w / 2;
            sy = 136;
          } else {
            sx = rect.x + rect.w / 2;
            sy = 200;
          }
          await page.evaluate(
            ({ k, x, y }) => {
              window.__QA__.prep(k, { x, y, clearObstacles: true });
              const g = window.__ISAAC__.game;
              g.__qaSavedCheckDoors = g._checkDoors;
              g._checkDoors = function () {};
            },
            { k: room.key, x: sx, y: sy }
          );
          await page.waitForTimeout(30);
          const ss = await holdKeys(page, [DIR_KEY[side]], 1800, 40);
          await page.evaluate(() => {
            const g = window.__ISAAC__.game;
            if (g.__qaSavedCheckDoors) {
              g._checkDoors = g.__qaSavedCheckDoors;
              delete g.__qaSavedCheckDoors;
            }
          });
          const outer =
            side === 'right' ? rect.x + rect.w : side === 'left' ? rect.x : side === 'up' ? rect.y : rect.y + rect.h;
          let bad = false;
          let maxExcursion = side === 'right' || side === 'down' ? -Infinity : Infinity;
          for (const s of ss) {
            if (side === 'right') {
              if (s.x > outer + EPS) bad = true;
              maxExcursion = Math.max(maxExcursion, s.x);
            } else if (side === 'left') {
              if (s.x < outer - EPS) bad = true;
              maxExcursion = Math.min(maxExcursion, s.x);
            } else if (side === 'up') {
              if (s.y < outer - EPS) bad = true;
              maxExcursion = Math.min(maxExcursion, s.y);
            } else {
              if (s.y > outer + EPS) bad = true;
              maxExcursion = Math.max(maxExcursion, s.y);
            }
            // 隧道探测中玩家沿门轴进入门洞、越出「活动区」属预期（本用例已禁用传送）；
            // 因此此处只校验两件事：① 不越过门洞外沿（上方判定）；② 横向不脱离门洞。
            if (side === 'right' || side === 'left') {
              if (s.y < rect.y - EPS || s.y > rect.y + rect.h + EPS) bad = true;
            } else if (s.x < rect.x - EPS || s.x > rect.x + rect.w + EPS) {
              bad = true;
            }
          }
          tunnel.push({ seed, room: room.key, side, outer: +outer.toFixed(2), maxExcursion: +maxExcursion.toFixed(2), bad });
        }
      }
    }

    RESULT.sections.c = { violations, boundsFails, extreme, samples, cases: cases.length, cornerFinals, tunnel };
    check('c1. 无门侧推挤不越界（无穿墙）', boundsFails.filter((b) => b.label.startsWith('doorless')).length === 0,
      `doorless 越界 ${boundsFails.filter((b) => b.label.startsWith('doorless')).length}`);
    check('c2. 偏离门轴推挤不越界（未沿整墙穿出）', boundsFails.filter((b) => b.label.startsWith('offaxis')).length === 0,
      `offaxis 越界 ${boundsFails.filter((b) => b.label.startsWith('offaxis')).length}`);
    check('c3. 斜向角落推挤不越界 / 不卡墙', boundsFails.filter((b) => b.label.startsWith('corner')).length === 0,
      `corner 越界 ${boundsFails.filter((b) => b.label.startsWith('corner')).length}`);
    check('c4. 无「虚空」位置（越界且不在门洞内）', violations.length === 0, `虚空 ${violations.length}`);
    check('c5. 门洞隧道不越过 doorRects() 外沿（禁用传送后探测 clamp 上界）', tunnel.length > 0 && tunnel.every((t) => !t.bad),
      `${tunnel.filter((t) => !t.bad).length}/${tunnel.length} 通过`);
  }

  // ================= (d) 速度边界 =================
  if (which.has('d')) {
    const speedRes = {};
    const highSpeedBounds = [];
    const TOP = D_SPEEDS[D_SPEEDS.length - 1];
    for (const spd of D_SPEEDS) {
      const tally = { up: { ok: 0, bad: 0 }, down: { ok: 0, bad: 0 }, left: { ok: 0, bad: 0 }, right: { ok: 0, bad: 0 } };
      for (const seed of D_SEEDS) {
        await startAndPlay(page, seed);
        await page.evaluate((v) => window.__QA__.setSpeed(v), spd);
        const rooms = await page.evaluate(() => window.__QA__.rooms());
        for (const room of rooms) {
          for (const d of DIRS) {
            if (!room.doors[d]) continue;
            const [ox, oy] = DIR_OFFSET[d];
            const hasNb = await page.evaluate((k) => !!window.__ISAAC__.game.roomsByKey[k], `${room.gx + ox},${room.gy + oy}`);
            if (!hasNb) continue;
            // 靠近门轴起点（缩短低速度档的行程，聚焦「速度是否影响可通行」）
            const near = { right: [440, 168], left: [184, 168], up: [312, 116], down: [312, 220] }[d];
            await page.evaluate(({ k, x, y }) => window.__QA__.prep(k, { x, y, clearObstacles: true }), { k: room.key, x: near[0], y: near[1] });
            await page.evaluate((v) => window.__QA__.setSpeed(v), spd);
            await page.waitForTimeout(30);
            const r = await pressUntilTraverse(page, d, 5000);
            if (r.traversed) tally[d].ok++;
            else tally[d].bad++;
          }
        }
        // 最高速档：无门侧推挤不得越界（步长最大，最容易穿墙）
        if (spd === TOP) {
          for (const room of rooms) {
            for (const side of DIRS) {
              if (room.doors[side]) continue;
              const [sx, sy] = side === 'right' ? [520, 168] : side === 'left' ? [104, 168] : side === 'up' ? [312, 100] : [312, 236];
              await page.evaluate(({ k, x, y }) => window.__QA__.prep(k, { x, y, clearObstacles: true }), { k: room.key, x: sx, y: sy });
              await page.evaluate((v) => window.__QA__.setSpeed(v), spd);
              await page.waitForTimeout(30);
              const ss = await holdKeys(page, [DIR_KEY[side]], 1400, 40);
              for (const s of ss) {
                const bad =
                  s.x > BASE_MAXX + EPS || s.x < BASE_MINX - EPS || s.y > BASE_MAXY + EPS || s.y < BASE_MINY - EPS;
                if (bad && !inAnyRect(s.x, s.y, s.rects)) {
                  highSpeedBounds.push({ speed: spd, seed, room: room.key, side, x: +s.x.toFixed(2), y: +s.y.toFixed(2) });
                }
              }
            }
          }
        }
      }
      speedRes[spd] = tally;
    }
    RESULT.sections.d = { speedRes, highSpeedBounds, topSpeed: TOP };
    const allOk = Object.values(speedRes).every((t) => DIRS.every((d) => t[d].bad === 0 && t[d].ok + t[d].bad >= 10));
    check('d1. 所有速度档四方向门 100% 可通行', allOk,
      D_SPEEDS.map((s) => `${s}px/s:${DIRS.map((d) => `${d}=${speedRes[s][d].ok}`).join(',')}`).join(' | '));
    check('d2. 最高速下无门侧不穿墙', highSpeedBounds.length === 0, `高速越界 ${highSpeedBounds.length}`);
  }

  // ================= (e) 回归：未清房不能穿门 =================
  if (which.has('e')) {
    const results = [];
    for (const seed of ['42', '777']) {
      await startAndPlay(page, seed);
      const rooms = await page.evaluate(() => window.__QA__.rooms());
      const normal = rooms.find((r) => r.kind === 'normal');
      if (!normal) continue;
      for (const d of DIRS) {
        if (!normal.doors[d]) continue;
        const [ox, oy] = DIR_OFFSET[d];
        const hasNb = await page.evaluate((k) => !!window.__ISAAC__.game.roomsByKey[k], `${normal.gx + ox},${normal.gy + oy}`);
        if (!hasNb) continue;
        // 合成「未清房」：spawned=false 阻止自动清房；无敌人；cleared=false
        await page.evaluate((k) => {
          const g = window.__ISAAC__.game;
          const room = g.roomsByKey[k];
          g.currentRoom = room;
          room.cleared = false;
          room.spawned = false;
          room.enemies = [];
          room.boss = null;
          room.bossSpawned = true;
          room.enterGrace = 0;
          room.obstacles = [];
          const p = g.player;
          p.x = 624 / 2;
          p.y = 336 / 2;
          p.vx = 0;
          p.vy = 0;
          p.invuln = 999;
          p.alive = true;
        }, normal.key);
        await page.waitForTimeout(30);
        const r = await pressUntilTraverse(page, d, 2200);
        results.push({ seed, room: normal.key, dir: d, traversed: r.traversed, x: +r.snap.x.toFixed(1), y: +r.snap.y.toFixed(1) });
      }
    }
    RESULT.sections.e = { results };
    const leaked = results.filter((r) => r.traversed);
    check('e1. 未清房不能穿门（门禁设计意图）', leaked.length === 0, `穿门泄漏 ${leaked.length}/${results.length}`);
    const outOfBounds = results.filter(
      (r) => r.x > BASE_MAXX + EPS || r.x < BASE_MINX - EPS || r.y > BASE_MAXY + EPS || r.y < BASE_MINY - EPS
    );
    check('e2. 未清房活动区严格受限', outOfBounds.length === 0, `越界 ${outOfBounds.length}`);
  }

  // ================= (m) 负控：注入旧缺陷 _clampPlayer，验证本测试非空洞 =================
  if (which.has('m')) {
    await page.evaluate(() => {
      const g = window.__ISAAC__.game;
      const TILE = 48;
      const ROOM_W = 624;
      const ROOM_H = 336;
      const PLAY_PAD = 22;
      const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
      // 旧（缺陷）实现：逐句顺序 clamp（取自 git HEAD，仅在页面内存注入，不改任何文件）
      g._clampPlayer = function (p, room) {
        const pad = p.radius + 4;
        if (room.cleared) {
          const doorSpan = TILE * 1.1;
          const nearDoorX = Math.abs(p.x - ROOM_W / 2) < doorSpan;
          const nearDoorY = Math.abs(p.y - ROOM_H / 2) < doorSpan;
          if (room.doors.up && nearDoorX) p.y = clamp(p.y, -20, ROOM_H - pad);
          else p.y = clamp(p.y, PLAY_PAD + p.radius * 0.2, ROOM_H - pad);
          if (room.doors.down && nearDoorX) p.y = clamp(p.y, pad, ROOM_H + 20);
          if (room.doors.left && nearDoorY) p.x = clamp(p.x, -20, ROOM_W - pad);
          else p.x = clamp(p.x, PLAY_PAD + p.radius * 0.2, ROOM_W - pad);
          if (room.doors.right && nearDoorY) p.x = clamp(p.x, pad, ROOM_W + 20);
          p.x = clamp(p.x, -20, ROOM_W + 20);
          p.y = clamp(p.y, -20, ROOM_H + 20);
        } else {
          p.x = clamp(p.x, PLAY_PAD + p.radius * 0.2, ROOM_W - pad);
          p.y = clamp(p.y, PLAY_PAD + p.radius * 0.2, ROOM_H - pad);
        }
      };
    });
    const tally = { up: { ok: 0, bad: 0 }, down: { ok: 0, bad: 0 }, left: { ok: 0, bad: 0 }, right: { ok: 0, bad: 0 } };
    const stuck = [];
    for (const seed of ['1', '7', '42']) {
      await startAndPlay(page, seed);
      const rooms = await page.evaluate(() => window.__QA__.rooms());
      for (const room of rooms) {
        let doorN = 0;
        let allBad = true;
        for (const d of DIRS) {
          if (!room.doors[d]) continue;
          const [ox, oy] = DIR_OFFSET[d];
          const hasNb = await page.evaluate((k) => !!window.__ISAAC__.game.roomsByKey[k], `${room.gx + ox},${room.gy + oy}`);
          if (!hasNb) continue;
          doorN++;
          await page.evaluate((k) => window.__QA__.prep(k, { clearObstacles: true }), room.key);
          await page.waitForTimeout(30);
          const r = await pressUntilTraverse(page, d, 3000);
          if (r.traversed) {
            tally[d].ok++;
            allBad = false;
          } else {
            tally[d].bad++;
          }
        }
        if (doorN > 0 && allBad) stuck.push(`${seed}:${room.key}`);
      }
    }
    await page.evaluate(() => {
      delete window.__ISAAC__.game._clampPlayer;
    });
    RESULT.sections.m = { mutationTally: tally, stuckRooms: stuck };
    const totalBad = DIRS.reduce((a, d) => a + tally[d].bad, 0);
    const rdBad = tally.right.bad + tally.down.bad;
    check('m1. 负控：注入旧缺陷 _clampPlayer 时本测试能检出失败（非空洞）', totalBad > 0,
      `旧缺陷下失败门 ${totalBad}（up ${tally.up.bad} / down ${tally.down.bad} / left ${tally.left.bad} / right ${tally.right.bad}）`);
    check('m2. 负控：旧缺陷下 right/down 大量失败（复现用户报告）', rdBad > 0, `right/down 失败 ${rdBad}，锁死房间 ${stuck.length}`);
  }

  // ================= (b) 端到端 =================
  if (which.has('b')) {
    const e2e = [];
    for (const seed of E2E_SEEDS) {
      const rec = await runE2E(page, seed);
      e2e.push(rec);
    }
    RESULT.sections.b = { e2e };
    const allReached = e2e.every((r) => r.reachedBoss);
    const allAdvanced = e2e.every((r) => r.floorAfter > r.floorBefore);
    check('b1. 纯键盘可达 Boss 房', allReached, e2e.map((r) => `seed${r.seed}:${r.reachedBoss ? 'OK' : r.reason || 'NO'}`).join('  '));
    check('b2. 击杀 Boss 后进入下一层（floor 递增）', allAdvanced,
      e2e.map((r) => `seed${r.seed}:${r.floorBefore}->${r.floorAfter}`).join('  '));
  }

  await browser.close();

  // ================= 汇总 =================
  RESULT.checks = checks;
  const failed = checks.filter((c) => !c.pass);
  const CORE = ['a1', 'a2', 'a3', 'a4', 'a5', 'b1', 'b2', 'c1', 'c4', 'd1', 'e1'];
  RESULT.verdict =
    failed.length === 0 ? 'PASS' : failed.some((c) => CORE.some((p) => c.name.startsWith(p))) ? 'FAIL' : 'CONCERNS';
  fs.writeFileSync(RESULT_JSON, JSON.stringify(RESULT, null, 2), 'utf8');

  console.log('\n================ QA-004 独立验收结果 ================');
  console.log(`产物 SHA256: ${sha256}  (${buf.length} bytes)`);
  for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}  (${c.detail})`);
  if (RESULT.pageErrors.length || RESULT.consoleErrors.length) {
    console.log(`  页面错误: ${RESULT.pageErrors.length}  console.error: ${RESULT.consoleErrors.length}`);
    RESULT.pageErrors.slice(0, 5).forEach((e) => console.log('    ' + String(e).slice(0, 200)));
    RESULT.consoleErrors.slice(0, 5).forEach((e) => console.log('    ' + String(e).slice(0, 200)));
  }
  console.log(`\n判定: ${RESULT.verdict}`);
  console.log(`明细: tests/qa-door-independent.result.json`);

  process.exit(RESULT.verdict === 'PASS' ? 0 : RESULT.verdict === 'CONCERNS' ? 2 : 1);
}

main().catch((err) => {
  console.error('[qa-door-independent] 致命错误:', err);
  process.exit(1);
});
