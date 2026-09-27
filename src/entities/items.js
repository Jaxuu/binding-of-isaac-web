/**
 * items.js — 道具池与效果定义
 *
 * 每个道具包含：
 *   id          唯一标识（与 art/draw-items.js 的 ITEM_ICONS key 对应）
 *   name        显示名（英文原名，符合原作，便于玩家辨认）
 *   nameZh      中文名
 *   desc        效果描述（道具拾取面板显示）
 *   rarity      'common' | 'rare' | 'boss' | 'shop'  —— 决定掉落权重
 *   mods        属性修正 {flat, mult}
 *   weapon      武器特性补丁（攻击方式改变）
 *   visual      外观变体补丁（角色外观改变）
 *   onPickup    即时效果（治疗/加魂心/加容器）
 *   hooks       运行时钩子（如击杀回血）—— 本作仅实现少量
 *
 * 参照 reference/_isaacguru_raw.html 中的真实 ID 命名（itemid 前缀 c）。
 */

/** 属性修正工具：伤害倍率 + 射速 + 移速 + 射程 */
export const ITEM_POOL = [
  // ---------------- 攻击方式改变（核心诉求①）----------------
  {
    id: 'brimstone', name: 'Brimstone', nameZh: '硫磺火', rarity: 'boss',
    desc: '蓄力后释放一道穿透性的血腥光束',
    mods: { flat: { damage: 4.5, fireDelay: 0.34 }, mult: { damage: 1.2 } },
    weapon: { kind: 'brimstone', charge: true, pierce: 99, beamWidth: 22, beamDuration: 0.5, shots: 1 },
    visual: { devil: true },
  },
  {
    id: 'ipecac', name: 'Ipecac', nameZh: '吐根糖浆', rarity: 'rare',
    desc: '发射抛物线绿弹，落地爆炸',
    mods: { flat: { damage: 9, fireDelay: 0.34 }, mult: { shotSpeed: 0.7 } },
    weapon: { kind: 'ipecac', ballistic: true, explosive: true, shots: 1, explosionRadius: 74 },
  },
  {
    id: 'moms_knife', name: "Mom's Knife", nameZh: "妈妈的刀", rarity: 'boss',
    desc: '蓄力投掷或持刀突刺，伤害极高',
    mods: { flat: { damage: 6, fireDelay: 0.24 }, mult: { range: 0.55, damage: 1.35 } },
    weapon: { kind: 'knife', shots: 1, pierce: 2, charge: true },
  },
  {
    id: 'technology', name: 'Technology', nameZh: '科技', rarity: 'rare',
    desc: '发射穿透性的激光束',
    mods: { flat: { damage: 2.2 }, mult: { fireDelay: 0.95 } },
    weapon: { kind: 'tech', pierce: 99, shots: 1 },
  },
  {
    id: 'inner_eye', name: 'The Inner Eye', nameZh: '内在之眼', rarity: 'boss',
    desc: '同时发射三颗眼泪，但射速下降',
    mods: { mult: { fireDelay: 1.62, shotSpeed: 0.9 } },
    weapon: { shots: 3, spread: 0.26, offsets: [-1, 0, 1] },
  },
  {
    id: 'spoon_bender', name: 'Spoon Bender', nameZh: '弯汤匙', rarity: 'rare',
    desc: '眼泪会追踪最近的敌人',
    mods: { flat: { damage: 0.6 } },
    weapon: { homing: 300 },
  },
  {
    id: 'my_reflection', name: 'My Reflection', nameZh: '我的倒影', rarity: 'common',
    desc: '眼泪会回旋飞回，射程更远',
    mods: { flat: { range: 90, damage: 1.2 }, mult: { shotSpeed: 0.85 } },
    weapon: { curving: -175, shots: 1 },
  },
  {
    id: 'polyphemus', name: 'Polyphemus', nameZh: '独眼巨人', rarity: 'boss',
    desc: '巨大眼泪，高伤害且穿透',
    mods: { flat: { damage: 9 }, mult: { fireDelay: 1.75, shotSpeed: 0.85 } },
    weapon: { shots: 1, pierce: 2, tearScale: 1.5 },
  },
  {
    id: 'spectral', name: 'Spectral Tear', nameZh: '幽灵之泪', rarity: 'rare',
    desc: '眼泪变为幽灵形态，可穿过障碍物',
    mods: { flat: { damage: 1 } },
    weapon: { spectral: true, tearColor: '#c9a6ff', tearHiColor: '#f0e6ff' },
  },

  // ---------------- 属性数值改变（核心诉求②）----------------
  {
    id: 'crickets_head', name: "Cricket's Head", nameZh: '蟋蟀头颅', rarity: 'boss',
    desc: '攻击力大幅提升',
    mods: { flat: { damage: 1.8 }, mult: { damage: 1.5 } },
  },
  {
    id: 'number_one', name: 'Number One', nameZh: '一号', rarity: 'common',
    desc: '射速提升，但射程下降',
    mods: { mult: { fireDelay: 0.66, range: 0.72 } },
  },
  {
    id: 'speed_up', name: 'The Halo of Speed', nameZh: '速度之环', rarity: 'common',
    desc: '移动速度提升',
    mods: { flat: { speed: 40 }, mult: { speed: 1.12 } },
    visual: { halo: true },
  },
  {
    id: 'range_up', name: 'Odd Mushroom', nameZh: '诡异蘑菇', rarity: 'common',
    desc: '射程与弹速提升',
    mods: { flat: { range: 110, shotSpeed: 60 } },
  },
  {
    id: 'damage_up', name: 'The Sad Onion', nameZh: '悲伤洋葱', rarity: 'common',
    desc: '攻击力提升',
    mods: { flat: { damage: 1.4 } },
  },
  {
    id: 'fire_rate_up', name: 'Sad Bombs', nameZh: '悲伤炸弹', rarity: 'common',
    desc: '射速提升',
    mods: { mult: { fireDelay: 0.78 } },
  },
  {
    id: 'speed_down_damage_up', name: 'Stigmata', nameZh: '圣痕', rarity: 'common',
    desc: '攻击力与射速提升',
    mods: { flat: { damage: 1.1 }, mult: { fireDelay: 0.9 } },
  },
  {
    id: 'blood_of_martyr', name: 'Blood of the Martyr', nameZh: '殉道者之血', rarity: 'rare',
    desc: '攻击力提升，最大生命 +1 心',
    mods: { flat: { damage: 1.5, maxHealth: 2 } },
  },
  {
    id: 'lunch', name: 'Lunch', nameZh: '午餐', rarity: 'common',
    desc: '最大生命 +1 心',
    mods: { flat: { maxHealth: 2 } },
  },
  {
    id: 'breakfast', name: 'Breakfast', nameZh: '早餐', rarity: 'common',
    desc: '最大生命 +1 心并回满',
    mods: { flat: { maxHealth: 2 } },
    onPickup: (player) => player.heal(99),
  },
  {
    id: 'rosary', name: 'Rosary', nameZh: '念珠', rarity: 'common',
    desc: '获得 3 颗灵魂心，攻击力提升',
    mods: { flat: { damage: 1.2 } },
    onPickup: (player) => player.addSoulHearts(6),
  },
  {
    id: 'pentagram', name: 'Pentagram', nameZh: '五芒星', rarity: 'rare',
    desc: '攻击力提升',
    mods: { flat: { damage: 2 } },
    visual: { devil: true },
  },
  {
    id: 'halo', name: 'Halo', nameZh: '光环', rarity: 'rare',
    desc: '全属性小幅提升',
    mods: { flat: { damage: 1.4, speed: 22, range: 45, shotSpeed: 45 }, flatMax: { maxHealth: 2 } },
    visual: { halo: true },
  },
  {
    id: 'crown', name: "Mom's Crown", nameZh: '母亲之冠', rarity: 'rare',
    desc: '攻击力与射程提升',
    mods: { flat: { damage: 1.6, range: 70 } },
    visual: { crown: true },
  },
  {
    id: 'wings', name: 'Lord of the Flies', nameZh: '蝇之王', rarity: 'rare',
    desc: '移动速度提升，背生双翼',
    mods: { flat: { speed: 34 } },
    visual: { wings: true },
  },
];

/** boss 房必掉、宝箱房必掉的道具池（品质更高） */
export const RARITY_WEIGHTS = {
  bossRoom: { boss: 6, rare: 3, common: 1 },
  treasureRoom: { boss: 3, rare: 4, common: 3 },
  normalDrop: { boss: 0.6, rare: 2, common: 7 },
};

/** 便捷 id 索引 */
export const ITEM_BY_ID = Object.fromEntries(ITEM_POOL.map((it) => [it.id, it]));

/**
 * 从池中按权重抽一个道具，排除已拥有（可选）。
 * @param {import('../core/rng.js').Rng} rng
 * @param {object} weights
 * @param {Set<string>} [owned] 已拥有的 id（默认允许重复，因为原作可以叠）
 */
export function rollItem(rng, weights, owned = null) {
  let candidates = ITEM_POOL;
  if (owned && owned.size > 0) {
    // 70% 概率避免重复；若池已空则允许重复
    const nonOwned = ITEM_POOL.filter((it) => !owned.has(it.id));
    if (nonOwned.length >= 3 && rng.chance(0.7)) candidates = nonOwned;
  }
  // 先按 rarity 抽稀有度，再从该稀有度中均匀抽
  const byRarity = {};
  for (const it of candidates) {
    (byRarity[it.rarity] ||= []).push(it);
  }
  const keys = Object.keys(weights).filter((k) => weights[k] > 0 && byRarity[k] && byRarity[k].length);
  if (keys.length === 0) return rng.pick(candidates);
  let chosen = null;
  let guard = 0;
  while (!chosen && guard++ < 8) {
    const r = rng.weighted(weights);
    if (byRarity[r] && byRarity[r].length) chosen = rng.pick(byRarity[r]);
  }
  return chosen || rng.pick(candidates);
}

/**
 * 把道具效果应用到玩家身上。
 * 注意：属性修正 push 到 player.modifiers 后统一 recalcStats()，
 * 保证「重算而非累加」的模型（见 stats.js 注释）。
 *
 * @param {import('./player.js').Player} player
 * @param {object} item ITEM_POOL 中的条目
 * @param {object} [weaponState] 武器状态容器（GameState.weapon），用于需要合并的武器特性
 */
export function applyItem(player, item, weaponState = null) {
  // 1) 属性修正
  if (item.mods) {
    player.modifiers.push({ flat: item.mods.flat || null, mult: item.mods.mult || null });
  }
  if (item.flatMax) {
    player.modifiers.push({ flat: item.flatMax });
  }
  player.recalcStats();

  // 2) 武器特性（攻击方式）
  if (item.weapon && weaponState) {
    Object.assign(weaponState, item.weapon);
    weaponState.weaponId++;
  }

  // 3) 外观变体
  if (item.visual) {
    Object.assign(player.visual, item.visual);
  }

  // 4) 即时效果
  if (item.onPickup) {
    try {
      item.onPickup(player);
    } catch (err) {
      console.error(`[items] onPickup failed for ${item.id}:`, err);
    }
  }

  // 5) 记录
  player.items.push(item);
  return item;
}
