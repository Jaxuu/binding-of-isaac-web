/**
 * rooms.js — 房间运行时对象与内容生成
 *
 * Room 负责：
 * - 世界坐标（格坐标 → 像素）
 * - 房间边界（内容区 + 墙体厚度）
 * - 门的位置与触发区
 * - 内容生成（敌人/障碍物/宝箱/道具）—— 按房间 kind 与楼层难度
 *
 * 房间尺寸：13×7 格 × TILE(48) = 624×336 内容区，墙体 26px。
 */

import { TILE, ROOM_COLS, ROOM_ROWS, WALL_T } from '../art/draw-room.js';
import { ROOM_KIND } from './dungeon.js';
import { Enemy } from '../entities/enemy.js';
import { rollItem, RARITY_WEIGHTS } from '../entities/items.js';

export const ROOM_W = ROOM_COLS * TILE; // 624
export const ROOM_H = ROOM_ROWS * TILE; // 336

/** 内容区内缩（玩家可活动范围） */
export const PLAY_PAD = 22;

export class Room {
  /**
   * @param {object} meta dungeon.js 产出的房间格数据
   */
  constructor(meta) {
    this.gx = meta.gx;
    this.gy = meta.gy;
    this.key = meta.key;
    this.kind = meta.kind;
    this.depth = meta.depth;
    this.doors = meta.doors;

    // 世界坐标：内容区左上角
    this.x = 0;
    this.y = 0;

    // 状态
    this.visited = false;
    this.cleared = false;
    this.spawned = false; // 内容是否已生成实体
    this.enemies = [];
    this.obstacles = []; // {tx, ty, type} 格坐标，1×1
    this.pickups = []; // {x, y, kind}
    this.itemDrops = []; // {x, y, itemId, taken}
    this.chests = []; // {x, y, opened, itemId}
    this.spikes = []; // {tx, ty, phase}
    this.seed = 0;

    /** boss 房专用 */
    this.boss = null;
    this.bossSpawned = false;
    this.enterGrace = 0; // 进入后的短暂缓冲，防止刚进门就被打
  }

  /** 内容区矩形 */
  get bounds() {
    return { x: 0, y: 0, w: ROOM_W, h: ROOM_H };
  }

  /** 世界中心 */
  get centerX() {
    return ROOM_W / 2;
  }
  get centerY() {
    return ROOM_H / 2;
  }

  /** 玩家可活动范围（含墙体阻挡） */
  get minX() {
    return PLAY_PAD;
  }
  get maxX() {
    return ROOM_W - PLAY_PAD;
  }
  get minY() {
    return PLAY_PAD;
  }
  get maxY() {
    return ROOM_H - PLAY_PAD;
  }

  /** 门的世界触发区（矩形） */
  doorRects() {
    const doorSpan = TILE * 2.2;
    const t = WALL_T + 8; // 触发区厚度（跨过墙体）
    const out = [];
    if (this.doors.up) {
      out.push({ dir: 'up', x: ROOM_W / 2 - doorSpan / 2, y: -t, w: doorSpan, h: t + PLAY_PAD * 0.6 });
    }
    if (this.doors.down) {
      out.push({ dir: 'down', x: ROOM_W / 2 - doorSpan / 2, y: ROOM_H - PLAY_PAD * 0.6, w: doorSpan, h: t + PLAY_PAD * 0.6 });
    }
    if (this.doors.left) {
      out.push({ dir: 'left', x: -t, y: ROOM_H / 2 - doorSpan / 2, w: t + PLAY_PAD * 0.6, h: doorSpan });
    }
    if (this.doors.right) {
      out.push({ dir: 'right', x: ROOM_W - PLAY_PAD * 0.6, y: ROOM_H / 2 - doorSpan / 2, w: t + PLAY_PAD * 0.6, h: doorSpan });
    }
    return out;
  }

  /** 房间内是否还有活的敌人（含 boss） */
  get hasLiveEnemies() {
    for (const e of this.enemies) if (!e.isDead) return true;
    if (this.boss && !this.boss.isDead) return true;
    return false;
  }

  get enemyCount() {
    let n = 0;
    for (const e of this.enemies) if (!e.isDead) n++;
    if (this.boss && !this.boss.isDead) n++;
    return n;
  }

  /**
   * 判断某点是否在障碍物内（用于移动阻挡 / 子弹阻挡）
   * @param {number} x 世界坐标（房间内容区坐标系）
   * @param {number} y
   * @param {number} r 半径
   */
  hitsObstacle(x, y, r) {
    for (const o of this.obstacles) {
      const ox = o.tx * TILE + TILE / 2;
      const oy = o.ty * TILE + TILE / 2;
      const half = TILE * 0.42;
      // 圆 × 矩形
      const nx = Math.max(ox - half, Math.min(x, ox + half));
      const ny = Math.max(oy - half, Math.min(y, oy + half));
      const dx = x - nx;
      const dy = y - ny;
      if (dx * dx + dy * dy < r * r) return o;
    }
    // 尖刺不阻挡移动（是踩上去受伤）
    return null;
  }

  /** 某格是否被障碍占用 */
  isCellBlocked(tx, ty) {
    return this.obstacles.some((o) => o.tx === tx && o.ty === ty);
  }
}

/**
 * 生成房间内容。
 * @param {Room} room
 * @param {import('../core/rng.js').Rng} rng
 * @param {object} opts
 * @param {number} opts.floor 楼层（难度）
 * @param {string} opts.roomKind
 * @param {Set<string>} opts.ownedItems 已拥有道具 id
 */
export function populateRoom(room, rng, opts) {
  const floor = Math.max(1, opts.floor || 1);
  const kind = room.kind;
  room.seed = rng ? (rng.int(1, 0x7fffffff) >>> 0) : 1;
  room.visited = false;
  room.spawned = true;
  room.cleared = false;
  room.enemies.length = 0;
  room.obstacles.length = 0;
  room.pickups.length = 0;
  room.itemDrops.length = 0;
  room.chests.length = 0;
  room.spikes.length = 0;
  room.bossSpawned = false;
  room.boss = null;

  if (kind === ROOM_KIND.START || kind === ROOM_KIND.SHOP || kind === ROOM_KIND.TREASURE) {
    // 起始/商店/宝箱房无敌人
    room.cleared = true;
  }

  if (kind === ROOM_KIND.TREASURE) {
    // 宝箱房：中央偏上放宝箱
    placeChest(room, rng, opts, ROOM_W / 2, ROOM_H * 0.42);
    // 少量碎石装饰
    scatterObstacles(room, rng, 2, 3, /*avoidCenter*/ true);
    return room;
  }

  if (kind === ROOM_KIND.START) {
    scatterObstacles(room, rng, 0, 1, false);
    return room;
  }

  if (kind === ROOM_KIND.BOSS) {
    // Boss 房：四角可放少量障碍，Boss 由 BossSystem 在玩家进入时生成
    scatterObstacles(room, rng, 0, 0, false);
    return room;
  }

  // ---- 普通房：障碍 + 敌人 ----
  // 障碍数量随深度略增，但保证有足够的活动空间
  const obstacleCount = rng.int(0, Math.min(4, 1 + Math.floor(floor / 2)));
  scatterObstacles(room, rng, obstacleCount, obstacleCount + 2, false);

  // 尖刺（从第 2 层开始）
  if (floor >= 2 && rng.chance(0.28)) {
    placeSpikes(room, rng, floor);
  }

  // 敌人组成
  const rollEnemy = (type) => new Enemy(type, 0, 0, rng);
  const enemyCount = computeEnemyCount(floor, rng);
  const typeWeights = availableEnemyTypes(floor);
  const spots = enemySpawnSpots(room, rng);

  for (let i = 0; i < enemyCount && i < spots.length; i++) {
    // 按楼层权重选类型（首层即开放全部 3 种，但 horf 权重更低）
    const type = rng.weighted(typeWeights);
    const e = rollEnemy(type);
    // 难度缩放：每层 +18% HP、+6% 速度（上限保护）
    const hpMul = 1 + (floor - 1) * 0.18;
    const spdMul = Math.min(1.45, 1 + (floor - 1) * 0.06);
    e.applyScaling(hpMul, spdMul);
    e.x = spots[i].x;
    e.y = spots[i].y;
    room.enemies.push(e);
  }

  if (room.enemies.length === 0) room.cleared = true;
  return room;
}

/** 根据楼层决定敌人数量 */
function computeEnemyCount(floor, rng) {
  const base = 2 + Math.floor(floor * 0.7); // 3,4,4,5,...
  const jitter = rng.int(-1, 1);
  return Math.max(1, Math.min(7, base + jitter));
}

/** 根据楼层返回敌人种类及其权重（渐进解锁 + 首层即可见全部 3 种）
 *
 * BUG-004 修复（方案 A）：用户硬需求是「至少 3 种普通敌人」，而玩家对
 * 「这游戏有几种敌人」的判断主要来自首层。因此 horf 从 floor 1 就进入候选，
 * 但首层给低权重（1:3:3）保留渐进难度；第 2 层起拉平为 1:1:1，第 3 层起
 * horf 略升（更耐打的远程站桩在中后期更有压迫感）。
 */
function availableEnemyTypes(floor) {
  if (floor <= 1) return { gaper: 3, pooter: 3, horf: 1 };
  if (floor === 2) return { gaper: 1, pooter: 1, horf: 1 };
  return { gaper: 1, pooter: 1, horf: 1.3 };
}

/** 生成互不重叠的敌人出生点（避开障碍与门） */
function enemySpawnSpots(room, rng) {
  const spots = [];
  const margin = TILE * 1.1;
  const doorSpan = TILE * 2.4;
  let attempts = 0;
  const want = 8;
  while (spots.length < want && attempts++ < 200) {
    const x = rng.range(margin, ROOM_W - margin);
    const y = rng.range(margin, ROOM_H - margin);
    // 避开房间中心（玩家进门位置附近）
    if (Math.hypot(x - ROOM_W / 2, y - ROOM_H / 2) < 70) continue;
    // 避开门洞区域
    if (room.doors.up && Math.abs(x - ROOM_W / 2) < doorSpan && y < margin * 1.7) continue;
    if (room.doors.down && Math.abs(x - ROOM_W / 2) < doorSpan && y > ROOM_H - margin * 1.7) continue;
    if (room.doors.left && Math.abs(y - ROOM_H / 2) < doorSpan && x < margin * 1.7) continue;
    if (room.doors.right && Math.abs(y - ROOM_H / 2) < doorSpan && x > ROOM_W - margin * 1.7) continue;
    // 避开障碍
    if (room.hitsObstacle(x, y, 20)) continue;
    // 避开彼此
    if (spots.some((s) => Math.hypot(s.x - x, s.y - y) < 44)) continue;
    spots.push({ x, y });
  }
  // 保底：中心周围环形摆放
  while (spots.length < want) {
    const a = (spots.length / want) * Math.PI * 2;
    spots.push({
      x: ROOM_W / 2 + Math.cos(a) * ROOM_W * 0.34,
      y: ROOM_H / 2 + Math.sin(a) * ROOM_H * 0.34,
    });
  }
  // 打乱顺序，让敌人类型分配更随机
  return rng.shuffle(spots);
}

/** 随机散布障碍物（岩石/粪便） */
function scatterObstacles(room, rng, min, max, avoidCenter) {
  if (max <= 0) return;
  const want = rng.int(min, max);
  let placed = 0;
  let attempts = 0;
  while (placed < want && attempts++ < 120) {
    // 只放在内部格（避开最外圈，否则贴着墙很难看且影响走路）
    const tx = rng.int(1, ROOM_COLS - 2);
    const ty = rng.int(1, ROOM_ROWS - 2);
    // 避开门的正前方（保证开门后有路）
    if (isInFrontOfDoor(room, tx, ty)) continue;
    // 避免堵住中心
    if (avoidCenter && Math.abs(tx * TILE - ROOM_W / 2) < TILE * 1.2 && Math.abs(ty * TILE - ROOM_H / 2) < TILE * 1.2) continue;
    if (room.isCellBlocked(tx, ty)) continue;
    // 避免相邻格形成死墙
    if (room.isCellBlocked(tx - 1, ty) && room.isCellBlocked(tx + 1, ty)) continue;
    if (room.isCellBlocked(tx, ty - 1) && room.isCellBlocked(tx, ty + 1)) continue;
    const type = rng.chance(0.55) ? 'rock' : 'poop';
    room.obstacles.push({ tx, ty, type, seed: rng.int(1, 99999) });
    placed++;
  }
}

/** 某格是否位于某个门洞的中轴线上（门前进出的通道） */
function isInFrontOfDoor(room, tx, ty) {
  const cx = Math.floor(ROOM_COLS / 2);
  const cy = Math.floor(ROOM_ROWS / 2);
  if (room.doors.up && tx === cx && ty <= 1) return true;
  if (room.doors.down && tx === cx && ty >= ROOM_ROWS - 2) return true;
  if (room.doors.left && ty === cy && tx <= 1) return true;
  if (room.doors.right && ty === cy && tx >= ROOM_COLS - 2) return true;
  return false;
}

/** 尖刺陷阱（2×1 或 1×2 的成对格） */
function placeSpikes(room, rng, floor) {
  const groups = 1 + (floor >= 4 ? 1 : 0);
  for (let g = 0; g < groups; g++) {
    const horizontal = rng.chance(0.5);
    const len = rng.int(2, 3);
    const tx = rng.int(2, ROOM_COLS - 3);
    const ty = rng.int(2, ROOM_ROWS - 3);
    for (let i = 0; i < len; i++) {
      const sx = horizontal ? tx + i : tx;
      const sy = horizontal ? ty : ty + i;
      if (sx >= ROOM_COLS - 1 || sy >= ROOM_ROWS - 1) break;
      if (room.isCellBlocked(sx, sy)) continue;
      room.spikes.push({ tx: sx, ty: sy, phase: rng.range(0, Math.PI * 2) });
    }
  }
}

/** 放置宝箱（宝箱房用） */
function placeChest(room, rng, opts, x, y) {
  const item = rollItem(rng, RARITY_WEIGHTS.treasureRoom, opts.ownedItems);
  room.chests.push({
    x,
    y,
    opened: false,
    itemId: item ? item.id : 'damage_up',
    item,
  });
}

export { ROOM_KIND, TILE, ROOM_COLS, ROOM_ROWS, WALL_T };
