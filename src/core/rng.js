/**
 * rng.js — 可种子化随机数生成器（mulberry32）
 *
 * 为什么需要可种子化？
 * - 地牢生成必须可复现：同一个种子每次生成完全相同的关卡布局，便于测试与调试。
 * - 战斗中的随机（掉落、暴击）用独立流，避免消耗地牢流导致复现性被破坏。
 *
 * 设计决策：不使用 Math.random()。见 ADR-003。
 */

/**
 * mulberry32：32 位种子 PRNG。周期 ~2^32，速度极快，分布良好。
 * @param {number} seed 32 位无符号整数种子
 * @returns {() => number} 返回 [0, 1) 的随机数生成函数
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 把任意字符串散列成 32 位种子（FNV-1a 变体）。
 * 允许 `?seed=anything` 这种人类可读种子。
 * @param {string} str
 * @returns {number} 32 位无符号整数
 */
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // 混入长度，减少短字符串碰撞
  h ^= str.length;
  h = Math.imul(h, 16777619) >>> 0;
  return h >>> 0;
}

/** 便捷：把任意（数字或字符串）种子归一化为 uint32 */
export function normalizeSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  if (typeof seed === 'string' && seed.length > 0) {
    // 纯数字字符串按数字处理，否则散列
    if (/^\d+$/.test(seed)) return parseInt(seed, 10) >>> 0;
    return hashSeed(seed);
  }
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}

/**
 * Rng：带便捷方法的随机数流。
 * 每个子系统持有一个独立实例，保证流之间互不干扰。
 */
export class Rng {
  /** @param {number|string} [seed] */
  constructor(seed) {
    this.seed = normalizeSeed(seed);
    this._next = mulberry32(this.seed);
  }

  /** [0, 1) */
  float() {
    return this._next();
  }

  /** [min, max) 浮点 */
  range(min, max) {
    return min + this._next() * (max - min);
  }

  /** [min, max] 整数（含两端） */
  int(min, max) {
    return Math.floor(min + this._next() * (max - min + 1));
  }

  /** 概率 p 为真 */
  chance(p) {
    return this._next() < p;
  }

  /** 从数组中等概率取一个 */
  pick(arr) {
    if (!arr || arr.length === 0) return undefined;
    return arr[Math.floor(this._next() * arr.length)];
  }

  /**
   * 从 {key: weight} 中按权重取一个 key（权重 > 0）。
   * @param {Record<string, number>} weights
   * @returns {string|undefined}
   */
  weighted(weights) {
    const keys = Object.keys(weights).filter((k) => weights[k] > 0);
    if (keys.length === 0) return undefined;
    let total = 0;
    for (const k of keys) total += weights[k];
    let r = this._next() * total;
    for (const k of keys) {
      r -= weights[k];
      if (r <= 0) return k;
    }
    return keys[keys.length - 1];
  }

  /** 原地洗牌（Fisher–Yates），返回同一数组 */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this._next() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /** 单位圆内均匀采样 */
  insideUnitCircle() {
    const a = this._next() * Math.PI * 2;
    const r = Math.sqrt(this._next());
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }

  /** 派生一个子流（用于分层生成，避免互相消耗） */
  fork(salt = 0) {
    return new Rng((this.seed ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0);
  }
}
