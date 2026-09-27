/**
 * dungeon.js — 地牢生成
 *
 * 算法（见 ADR-003）：
 *   1. 房间数量：每层 5–8 个（含 Boss 房）
 *   2. 从起点房向随机方向「随机游走」扩展出生房间格（类似 Isaac 的邻居生长）
 *   3. 用「临界路径」确定 Boss 房：距离起点房最远的房间
 *   4. 其余房间中挑 1 个作宝箱房（有宝箱房的层必然含 1 个道具）
 *   5. 保证连通性：每新增房间都通过一个门与已有房间相连 → 天然连通
 *   6. 门是双向的、且位置必须在房间四边中点（与美术一致）
 *
 * 坐标：房间用整数格坐标 (gx, gy)，起点为 (0, 0)。世界坐标由 Room 负责。
 * 可复现：只用传入的 seedRng，不读 Math.random。
 *
 * 关键不变量（可测试，见 tests/test-dungeon.js）：
 *   I1  房间数在 [5, 8]
 *   I2  所有房间从起点可达（BFS 校验）
 *   I3  恰有 1 个 Boss 房
 *   I4  Boss 房是距离起点最远的房间之一
 *   I5  任何房间的门都指向存在的邻居（无悬空门）
 *   I6  门的邻居关系双向一致
 */

export const DIRS = [
  { name: 'up', dx: 0, dy: -1, opposite: 'down' },
  { name: 'down', dx: 0, dy: 1, opposite: 'up' },
  { name: 'left', dx: -1, dy: 0, opposite: 'right' },
  { name: 'right', dx: 1, dy: 0, opposite: 'left' },
];

import { Rng } from '../core/rng.js';
export const ROOM_KIND = Object.freeze({
  START: 'start',
  NORMAL: 'normal',
  BOSS: 'boss',
  TREASURE: 'treasure',
  SHOP: 'shop',
});

/** 格坐标 → 字符串 key */
export function roomKey(gx, gy) {
  return `${gx},${gy}`;
}

/**
 * 生成一层地牢。
 * @param {number|import('../core/rng.js').Rng} seedOrRng 种子或 Rng 实例
 * @param {object} [opts]
 * @param {number} [opts.minRooms=5]
 * @param {number} [opts.maxRooms=8]
 * @param {number} [opts.floor=1] 用于难度与特殊房出现概率
 * @param {boolean} [opts.wantTreasure=true]
 * @returns {{
 *   rooms: Array<{gx:number,gy:number,kind:string,doors:Record<string,boolean>,key:string,depth:number}>,
 *   byKey: Record<string, any>,
 *   startKey: string,
 *   bossKey: string,
 *   treasureKey: string|null,
 *   count: number,
 * }}
 */
export function generateDungeon(seedOrRng, opts = {}) {
  const rng = seedOrRng && typeof seedOrRng.int === 'function' ? seedOrRng : new Rng(seedOrRng);

  const minRooms = opts.minRooms === undefined ? 5 : opts.minRooms;
  const maxRooms = opts.maxRooms === undefined ? 8 : opts.maxRooms;
  const wantTreasure = opts.wantTreasure !== false;

  // 房间总数：5..8（含 Boss 房）
  // 生成的「目标」留 1 个名额余量，给 ensureStartConnections 兜底用；
  // 若起点房天然就有 ≥2 门，则最终房间数会少于 target，仍在 [minRooms, maxRooms] 内。
  const target = rng.int(minRooms, maxRooms);

  /** @type {Map<string, any>} */
  const byKey = new Map();
  const start = makeRoom(0, 0, ROOM_KIND.START, 0);
  byKey.set(start.key, start);

  /** 用于扩展的「前沿」房间列表 */
  const frontier = [start];

  let guard = 0;
  while (byKey.size < target && guard++ < 500) {
    // 优先从离起点较远的前沿扩张，形成更自然的枝干（而不是一坨）
    const source = pickFrontier(rng, frontier, byKey);
    const { room, door } = tryExtend(rng, source, byKey);
    if (!room) {
      // 该房间四周都被占了：从 frontier 移除
      const i = frontier.indexOf(source);
      if (i >= 0) frontier.splice(i, 1);
      if (frontier.length === 0) frontier.push(rng.pick(Array.from(byKey.values())));
      continue;
    }
    byKey.set(room.key, room);
    source.doors[door] = true;
    room.doors[DIRS.find((d) => d.name === door).opposite] = true;
    frontier.push(room);
  }



  // ---- 保证起点房至少有 2 个门（否则玩家一开局就是死路，体验差）----
  ensureStartConnections(start, byKey, rng, target, maxRooms);

  // ---- 若房间数仍不足 minRooms（极端种子），继续从任意有空位的房间扩张 ----
  let topUpGuard = 0;
  while (byKey.size < minRooms && topUpGuard++ < 60) {
    const candidates = Array.from(byKey.values()).filter((r) => hasOpenNeighbor(r, byKey));
    if (candidates.length === 0) break;
    const src = rng.pick(candidates);
    const { room, door } = tryExtend(rng, src, byKey);
    if (!room) break;
    byKey.set(room.key, room);
    src.doors[door] = true;
    room.doors[DIRS.find((d) => d.name === door).opposite] = true;
  }

  // 注意：上述步骤可能新增房间，必须在此之后重新取 rooms 快照
  const rooms = Array.from(byKey.values());

  // ---- 计算到起点的 BFS 距离 ----
  computeDepths(byKey, start);

  // ---- Boss 房：最远者（同深度取一个） ----
  const nonStart = rooms.filter((r) => r !== start);
  let boss = nonStart[0];
  for (const r of nonStart) {
    if (!boss || r.depth > boss.depth) boss = r;
  }
  // 若最远房间只有一个邻居且是死路 —— 正是我们想要的
  boss.kind = ROOM_KIND.BOSS;

  // ---- 宝箱房：除去 start/boss 后，优先挑「死路」房间；否则挑距起点中等的 ----
  let treasureKey = null;
  if (wantTreasure) {
    const rest = rooms.filter((r) => r !== start && r !== boss);
    if (rest.length >= 1) {
      const deadEnds = rest.filter((r) => countDoors(r) === 1);
      const pool = deadEnds.length > 0 ? deadEnds : rest;
      const tr = rng.pick(pool);
      tr.kind = ROOM_KIND.TREASURE;
      treasureKey = tr.key;
    }
  }

  // ---- 其余标记为普通房 ----
  for (const r of rooms) {
    if (r.kind === ROOM_KIND.START) continue;
    if (r.kind === ROOM_KIND.BOSS || r.kind === ROOM_KIND.TREASURE) continue;
    r.kind = ROOM_KIND.NORMAL;
  }

  // 保证每层至少有一条「死路」留给玩家探索（可选，非强制）

  const byKeyObj = {};
  for (const r of rooms) byKeyObj[r.key] = r;

  return {
    rooms,
    byKey: byKeyObj,
    startKey: start.key,
    bossKey: boss.key,
    treasureKey,
    count: rooms.length,
  };
}

function makeRoom(gx, gy, kind, depth) {
  return {
    gx,
    gy,
    kind,
    depth,
    key: roomKey(gx, gy),
    doors: { up: false, down: false, left: false, right: false },
    /** 房间内容（由 RoomSystem 填充） */
    content: null,
  };
}

/**
 * 保证起点房至少与 2 个房间相连。
 * 做法：若起点门数 < 2，则从空闲邻格硬塞一个新房间并连接。
 * 硬约束：房间总数绝不超过 maxRooms（I1 不变量）；若会超限则不新增。
 */
function ensureStartConnections(start, byKey, rng, target, maxRooms = 8) {
  let guard = 0;
  while (countDoors(start) < 2 && byKey.size < maxRooms && guard++ < 4) {
    const options = DIRS.filter((d) => !byKey.has(roomKey(start.gx + d.dx, start.gy + d.dy)));
    if (options.length === 0) break;
    // 若再加房会超过 maxRooms，则停止（宁可起点只有 1 门，也不破坏 I1）
    if (byKey.size + 1 > maxRooms) break;
    rng.shuffle(options);
    const d = options[0];
    const nb = makeRoom(start.gx + d.dx, start.gy + d.dy, ROOM_KIND.NORMAL, 1);
    byKey.set(nb.key, nb);
    start.doors[d.name] = true;
    nb.doors[d.opposite] = true;
  }
}

/** 从前沿中随机挑一个「还有空位」的房间，偏向较深的（让枝叶伸展） */
function pickFrontier(rng, frontier, byKey) {
  // 过滤出仍有空邻格的
  const open = frontier.filter((r) => hasOpenNeighbor(r, byKey));
  const pool = open.length > 0 ? open : frontier;
  if (pool.length === 0) return null;
  // 60% 选最深的几个之一（形成走廊感），40% 纯随机（形成分支）
  if (rng.chance(0.6)) {
    const sorted = pool.slice().sort((a, b) => b.depth - a.depth);
    const top = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.4)));
    return rng.pick(top);
  }
  return rng.pick(pool);
}

function hasOpenNeighbor(room, byKey) {
  for (const d of DIRS) {
    if (byKey.has(roomKey(room.gx + d.dx, room.gy + d.dy))) continue;
    return true;
  }
  return false;
}

/** 尝试从 source 房间向一个未占用方向扩展 */
function tryExtend(rng, source, byKey) {
  const options = DIRS.filter((d) => !byKey.has(roomKey(source.gx + d.dx, source.gy + d.dy)));
  if (options.length === 0) return { room: null, door: null };
  // 避免扩展到超出合理范围（限制 |gx|<=6, |gy|<=4，保证小地图可读）
  const bounded = options.filter((d) => {
    const nx = source.gx + d.dx;
    const ny = source.gy + d.dy;
    return Math.abs(nx) <= 6 && Math.abs(ny) <= 4;
  });
  const finalOptions = bounded.length > 0 ? bounded : options;
  rng.shuffle(finalOptions);
  const d = finalOptions[0];
  const room = makeRoom(source.gx + d.dx, source.gy + d.dy, ROOM_KIND.NORMAL, source.depth + 1);
  return { room, door: d.name };
}

/** BFS 计算每个房间到起点的距离 */
export function computeDepths(byKey, start) {
  const depths = new Map();
  const queue = [start];
  depths.set(start.key, 0);
  start.depth = 0;
  while (queue.length > 0) {
    const cur = queue.shift();
    const d = depths.get(cur.key);
    for (const dir of DIRS) {
      if (!cur.doors[dir.name]) continue;
      const nk = roomKey(cur.gx + dir.dx, cur.gy + dir.dy);
      const nb = byKey.get(nk);
      if (!nb || depths.has(nk)) continue;
      depths.set(nk, d + 1);
      nb.depth = d + 1;
      queue.push(nb);
    }
  }
  return depths;
}

export function countDoors(room) {
  let n = 0;
  for (const d of DIRS) if (room.doors[d.name]) n++;
  return n;
}

/**
 * 校验地牢不变量（测试与运行时断言共用）
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateDungeon(dungeon) {
  const errors = [];
  const { rooms, byKey, startKey, bossKey, count } = dungeon;

  // I1 房间数
  if (count < 5 || count > 8) errors.push(`I1 房间数 ${count} 不在 [5,8]`);

  // I3 恰有 1 个 boss
  const bosses = rooms.filter((r) => r.kind === ROOM_KIND.BOSS);
  if (bosses.length !== 1) errors.push(`I3 Boss 房数量为 ${bosses.length}，应为 1`);

  // I5 / I6 门的一致性
  for (const r of rooms) {
    for (const d of DIRS) {
      if (!r.doors[d.name]) continue;
      const nk = roomKey(r.gx + d.dx, r.gy + d.dy);
      const nb = byKey[nk];
      if (!nb) {
        errors.push(`I5 ${r.key} 的 ${d.name} 门指向不存在的房间 ${nk}`);
        continue;
      }
      if (!nb.doors[d.opposite]) {
        errors.push(`I6 ${r.key}.${d.name} ↔ ${nk}.${d.opposite} 不一致`);
      }
    }
  }

  // I2 可达性（从起点 BFS）
  const start = byKey[startKey];
  if (!start) {
    errors.push('I2 起点房不存在');
  } else {
    const seen = new Set([startKey]);
    const q = [start];
    while (q.length) {
      const cur = q.shift();
      for (const d of DIRS) {
        if (!cur.doors[d.name]) continue;
        const nk = roomKey(cur.gx + d.dx, cur.gy + d.dy);
        if (!byKey[nk] || seen.has(nk)) continue;
        seen.add(nk);
        q.push(byKey[nk]);
      }
    }
    if (seen.size !== rooms.length) {
      errors.push(`I2 有 ${rooms.length - seen.size} 个房间从起点不可达`);
    }
  }

  // I4 Boss 是最深之一
  if (bosses.length === 1) {
    const maxDepth = Math.max(...rooms.map((r) => r.depth));
    if (bosses[0].depth !== maxDepth) {
      errors.push(`I4 Boss 深度 ${bosses[0].depth} != 最大深度 ${maxDepth}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
