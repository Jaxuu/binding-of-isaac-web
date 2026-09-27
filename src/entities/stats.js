/**
 * stats.js — 属性系统
 *
 * 属性（对应用户需求的 5 项 + 弹速）：
 *   damage      攻击力（每颗子弹伤害）
 *   fireDelay   射击间隔（秒）→ UI 显示为「射速」
 *   speed       移动速度（像素/秒）
 *   range       射程（子弹存活距离，像素）
 *   shotSpeed   弹速（像素/秒）
 *   maxHealth   最大红心数（半心为单位：2 = 1 颗心）
 *
 * 计算模型（模仿原作）：
 *   最终属性 = clamp(base × multipliers + flatBonus, min, max)
 *   道具通过 { flat: {...}, mult: {...} } 影响属性。
 *   base 是角色基础值，每层由「已拾取道具列表」重算 —— 这是关键：
 *   重算而非累加，避免顺序依赖与浮点漂移，也让「重置」变得简单。
 *
 * 边界：所有属性都有 MIN/MAX 硬限制，UI 与手感不会被非法值破坏。
 */

export const STAT_KEYS = ['damage', 'fireDelay', 'speed', 'range', 'shotSpeed', 'maxHealth'];

/** 基础值（未拾取任何道具） */
export const BASE_STATS = Object.freeze({
  damage: 3.5,
  fireDelay: 0.38, // 约 2.6 发/秒
  speed: 168, // 像素/秒
  range: 340,
  shotSpeed: 320,
  maxHealth: 6, // 3 颗红心
});

/** 硬边界 */
export const STAT_LIMITS = Object.freeze({
  damage: [0.5, 60],
  fireDelay: [0.075, 0.9], // 越大越慢；下限防止无限射速
  speed: [70, 380],
  range: [110, 1000],
  shotSpeed: [180, 900],
  maxHealth: [2, 24],
});

/**
 * 从「基础值 + 已拾取道具的修正列表」重算最终属性。
 * @param {Array<{flat?: object, mult?: object}>} modifiers 按拾取顺序排列
 * @param {object} [base]
 * @returns {{damage:number, fireDelay:number, speed:number, range:number, shotSpeed:number, maxHealth:number}}
 */
export function computeStats(modifiers = [], base = BASE_STATS) {
  const out = {};
  for (const key of STAT_KEYS) {
    let flat = 0;
    let mult = 1;
    for (const m of modifiers) {
      if (!m) continue;
      if (m.flat && typeof m.flat[key] === 'number') flat += m.flat[key];
      if (m.mult && typeof m.mult[key] === 'number') mult *= m.mult[key];
    }
    let v = base[key] * mult + flat;
    const [lo, hi] = STAT_LIMITS[key];
    out[key] = Math.max(lo, Math.min(hi, v));
  }
  return out;
}

/** 射速（发/秒），用于 UI 显示 */
export function shotsPerSecond(fireDelay) {
  return 1 / Math.max(0.001, fireDelay);
}

/** 红心数（半心 → 心）：返回 {full, half} 便于 UI */
export function heartsFromHalves(halves) {
  const safe = Math.max(0, Math.floor(halves));
  return { full: Math.floor(safe / 2), half: safe % 2 === 1 };
}

/** 属性条归一化（把当前值映射到 0..1，用于 UI 小条） */
export function statBar(key, value) {
  const [lo, hi] = STAT_LIMITS[key];
  // 用对数标度让低段更敏感（伤害提升在早期更明显）
  if (key === 'damage' || key === 'speed' || key === 'shotSpeed') {
    const lv = Math.log(Math.max(0.01, value) / lo) / Math.log(hi / lo);
    return Math.max(0, Math.min(1, lv));
  }
  // fireDelay 是「越小越好」，反转
  if (key === 'fireDelay') {
    return 1 - (value - lo) / (hi - lo);
  }
  return (value - lo) / (hi - lo);
}
