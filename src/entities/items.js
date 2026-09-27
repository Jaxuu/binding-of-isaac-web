/**
 * items.js — 道具池与效果定义（60 件）
 *
 * 每个道具包含：
 *   id          唯一标识（与 art/draw-items.js 的 ITEM_ICONS key 对应）
 *   name        显示名（英文原名，符合原作，便于玩家辨认）
 *   nameZh      中文名
 *   desc        效果描述（道具拾取面板显示）
 *   rarity      'common' | 'rare' | 'boss' | 'shop'  —— 决定掉落权重
 *   mods        属性修正 {flat, mult}
 *   flatMax     生命容器修正（顶层字段，见 applyItem）
 *   weapon      武器特性补丁（攻击方式改变）
 *   visual      外观变体补丁（角色外观改变）
 *   onPickup    即时效果（治疗/加魂心/加容器）
 *
 * 属性覆盖：攻击力 damage / 射速 fireDelay / 移速 speed / 射程 range /
 *           弹速 shotSpeed / 生命 maxHealth —— 对应「攻速、攻击力、血量、移动速度等多种类型」。
 */

/** 属性修正工具：伤害倍率 + 射速 + 移速 + 射程 */
export const ITEM_POOL = [
  // ================= 一、攻击方式改变（核心诉求①）=================
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
    id: 'moms_knife', name: "Mom's Knife", nameZh: '妈妈的刀', rarity: 'boss',
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
    weapon: { shots: 3, spread: 0.26 },
  },
  {
    id: 'mutant_spider', name: 'Mutant Spider', nameZh: '变异蜘蛛', rarity: 'boss',
    desc: '一次发射四颗眼泪，射速大幅下降',
    mods: { mult: { fireDelay: 2.1, shotSpeed: 0.9 } },
    weapon: { shots: 4, spread: 0.42 },
  },
  {
    id: 'loki_horns', name: "Loki's Horns", nameZh: '洛基之角', rarity: 'rare',
    desc: '向四个方向同时发射眼泪',
    mods: { flat: { damage: 0.4 }, mult: { fireDelay: 1.4 } },
    weapon: { shots: 4, spread: Math.PI * 1.5 },
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
  {
    id: 'cupids_arrow', name: "Cupid's Arrow", nameZh: '丘比特之箭', rarity: 'rare',
    desc: '眼泪获得穿透，射程提升',
    mods: { flat: { damage: 0.8, range: 70 } },
    weapon: { pierce: 2 },
  },
  {
    id: 'dead_onion', name: 'Dead Onion', nameZh: '死洋葱', rarity: 'rare',
    desc: '眼泪穿透障碍物并获得穿透，弹速下降',
    mods: { flat: { damage: 1.2 }, mult: { shotSpeed: 0.8 } },
    weapon: { spectral: true, pierce: 1, tearScale: 1.15 },
  },
  {
    id: 'sagittarius', name: 'Sagittarius', nameZh: '射手座', rarity: 'rare',
    desc: '眼泪获得穿透，弹速与伤害提升',
    mods: { flat: { damage: 1.2 }, mult: { shotSpeed: 1.25 } },
    weapon: { pierce: 1 },
  },
  {
    id: 'the_wafer', name: 'The Wafer', nameZh: '圣饼', rarity: 'rare',
    desc: '所有伤害降为半颗心，并强化弹速',
    mods: { flat: { damage: 0.6, shotSpeed: 40 } },
  },

  // ================= 二、攻击力提升 =================
  {
    id: 'crickets_head', name: "Cricket's Head", nameZh: '蟋蟀头颅', rarity: 'boss',
    desc: '攻击力大幅提升',
    mods: { flat: { damage: 1.8 }, mult: { damage: 1.5 } },
  },
  {
    id: 'damage_up', name: 'The Sad Onion', nameZh: '悲伤洋葱', rarity: 'common',
    desc: '攻击力提升',
    mods: { flat: { damage: 1.4 } },
  },
  {
    id: 'stigmata', name: 'Stigmata', nameZh: '圣痕', rarity: 'common',
    desc: '攻击力与射速提升',
    mods: { flat: { damage: 1.1 }, mult: { fireDelay: 0.9 } },
  },
  {
    id: 'blood_of_martyr', name: 'Blood of the Martyr', nameZh: '殉道者之血', rarity: 'rare',
    desc: '攻击力提升，最大生命 +1 心',
    mods: { flat: { damage: 1.5 } },
    flatMax: { maxHealth: 2 },
  },
  {
    id: 'pentagram', name: 'Pentagram', nameZh: '五芒星', rarity: 'rare',
    desc: '攻击力提升',
    mods: { flat: { damage: 2 } },
    visual: { devil: true },
  },
  {
    id: 'halo', name: 'Halo', nameZh: '光环', rarity: 'rare',
    desc: '全属性小幅提升，最大生命 +1 心',
    mods: { flat: { damage: 1.4, speed: 22, range: 45, shotSpeed: 45 } },
    flatMax: { maxHealth: 2 },
    visual: { halo: true },
  },
  {
    id: 'crown', name: "Mom's Crown", nameZh: '母亲之冠', rarity: 'rare',
    desc: '攻击力与射程提升',
    mods: { flat: { damage: 1.6, range: 70 } },
    visual: { crown: true },
  },
  {
    id: 'magic_mushroom', name: 'Magic Mushroom', nameZh: '魔法蘑菇', rarity: 'boss',
    desc: '全属性提升，最大生命 +1 心并回满',
    mods: { flat: { damage: 1, speed: 26, range: 60, shotSpeed: 30 } },
    flatMax: { maxHealth: 2 },
    onPickup: (player) => player.heal(99),
  },
  {
    id: 'steven', name: 'Steven', nameZh: '史蒂文', rarity: 'rare',
    desc: '攻击力提升',
    mods: { flat: { damage: 1.6 } },
  },
  {
    id: 'deaths_touch', name: "Death's Touch", nameZh: '死亡之触', rarity: 'boss',
    desc: '巨大镰刀眼泪：高伤害且穿透',
    mods: { flat: { damage: 2.2 }, mult: { fireDelay: 1.3, shotSpeed: 0.9 } },
    weapon: { pierce: 2, tearScale: 1.35, tearColor: '#8a8a96', tearHiColor: '#d8d8e0' },
  },
  {
    id: 'lord_of_the_pit', name: 'Lord of the Pit', nameZh: '深渊之主', rarity: 'rare',
    desc: '攻击力与移速提升，背生双翼',
    mods: { flat: { damage: 1.4, speed: 30 } },
    visual: { wings: true },
  },
  {
    id: 'sacred_heart', name: 'Sacred Heart', nameZh: '神圣之心', rarity: 'boss',
    desc: '巨幅攻击力提升，眼泪追踪敌人',
    mods: { flat: { damage: 3, range: 40 }, mult: { damage: 1.4, fireDelay: 1.4, shotSpeed: 0.85 } },
    weapon: { homing: 220, tearColor: '#ffd0e8', tearHiColor: '#ffffff' },
  },
  {
    id: 'the_mark', name: 'The Mark', nameZh: '恶魔印记', rarity: 'rare',
    desc: '攻击力与移速提升',
    mods: { flat: { damage: 1.5, speed: 24 } },
    visual: { devil: true },
  },

  // ================= 三、射速提升（攻速）=================
  {
    id: 'number_one', name: 'Number One', nameZh: '一号', rarity: 'common',
    desc: '射速提升，但射程下降',
    mods: { mult: { fireDelay: 0.66, range: 0.72 } },
  },
  {
    id: 'fire_rate_up', name: 'Sad Bombs', nameZh: '悲伤炸弹', rarity: 'common',
    desc: '射速提升',
    mods: { mult: { fireDelay: 0.78 } },
  },
  {
    id: 'squeezy', name: 'Squeezy', nameZh: '挤压', rarity: 'rare',
    desc: '射速大幅提升',
    mods: { mult: { fireDelay: 0.72 }, flat: { damage: 0.6 } },
  },
  {
    id: 'soy_milk', name: 'Soy Milk', nameZh: '豆奶', rarity: 'boss',
    desc: '射速极快，但单发伤害大幅下降',
    mods: { mult: { fireDelay: 0.34, damage: 0.3, range: 0.8 } },
  },
  {
    id: 'bloody_lust', name: 'Bloody Lust', nameZh: '浴血', rarity: 'rare',
    desc: '射速与移速提升',
    mods: { mult: { fireDelay: 0.8 }, flat: { speed: 20, damage: 0.8 } },
  },
  {
    id: 'tough_love', name: 'Tough Love', nameZh: '严厉的爱', rarity: 'rare',
    desc: '伤害与弹速提升',
    mods: { flat: { damage: 1.2, shotSpeed: 50 } },
  },
  {
    id: 'jesus_juice', name: 'Jesus Juice', nameZh: '圣果汁', rarity: 'rare',
    desc: '伤害与射速提升',
    mods: { flat: { damage: 1 }, mult: { fireDelay: 0.86 } },
  },

  // ================= 四、生命提升（血量）=================
  {
    id: 'lunch', name: 'Lunch', nameZh: '午餐', rarity: 'common',
    desc: '最大生命 +1 心',
    flatMax: { maxHealth: 2 },
  },
  {
    id: 'breakfast', name: 'Breakfast', nameZh: '早餐', rarity: 'common',
    desc: '最大生命 +1 心并回满',
    flatMax: { maxHealth: 2 },
    onPickup: (player) => player.heal(99),
  },
  {
    id: 'dinner', name: 'Dinner', nameZh: '晚餐', rarity: 'common',
    desc: '最大生命 +1 心',
    flatMax: { maxHealth: 2 },
  },
  {
    id: 'dessert', name: 'Dessert', nameZh: '甜点', rarity: 'common',
    desc: '最大生命 +1 心',
    flatMax: { maxHealth: 2 },
  },
  {
    id: 'blood_bag', name: 'Blood Bag', nameZh: '血袋', rarity: 'rare',
    desc: '最大生命 +1 心，移速提升',
    flatMax: { maxHealth: 2 },
    mods: { flat: { speed: 18 } },
    onPickup: (player) => player.heal(2),
  },
  {
    id: 'less_than_three', name: '<3', nameZh: '心之容器', rarity: 'boss',
    desc: '最大生命 +2 心（容器）',
    flatMax: { maxHealth: 4 },
  },
  {
    id: 'moms_pearls', name: "Mom's Pearls", nameZh: '母亲之珠', rarity: 'common',
    desc: '最大生命 +1 心，射程提升',
    flatMax: { maxHealth: 2 },
    mods: { flat: { range: 40 } },
  },
  {
    id: 'old_bandage', name: 'Old Bandage', nameZh: '旧绷带', rarity: 'common',
    desc: '最大生命 +1 心',
    flatMax: { maxHealth: 2 },
  },
  {
    id: 'raw_liver', name: 'Raw Liver', nameZh: '生肝', rarity: 'rare',
    desc: '最大生命 +2 心并回满',
    flatMax: { maxHealth: 4 },
    onPickup: (player) => player.heal(99),
  },
  {
    id: 'bucket_of_lard', name: 'Bucket of Lard', nameZh: '一桶猪油', rarity: 'rare',
    desc: '最大生命 +2 心，但移速下降',
    flatMax: { maxHealth: 4 },
    mods: { flat: { speed: -20 } },
    onPickup: (player) => player.heal(4),
  },
  {
    id: 'rosary', name: 'Rosary', nameZh: '念珠', rarity: 'common',
    desc: '获得 3 颗灵魂心，攻击力提升',
    mods: { flat: { damage: 1.2 } },
    onPickup: (player) => player.addSoulHearts(6),
  },
  {
    id: 'cube_of_meat', name: 'Cube of Meat', nameZh: '肉块立方', rarity: 'boss',
    desc: '生命、伤害、射速、移速全面提升',
    mods: { flat: { damage: 1, speed: 16 }, mult: { fireDelay: 0.9 } },
    flatMax: { maxHealth: 2 },
  },

  // ================= 五、移速提升 =================
  {
    id: 'speed_up', name: 'The Halo of Speed', nameZh: '速度之环', rarity: 'common',
    desc: '移动速度提升',
    mods: { flat: { speed: 40 }, mult: { speed: 1.12 } },
    visual: { halo: true },
  },
  {
    id: 'wings', name: 'Lord of the Flies', nameZh: '蝇之王', rarity: 'rare',
    desc: '移动速度提升，背生双翼',
    mods: { flat: { speed: 34 } },
    visual: { wings: true },
  },
  {
    id: 'the_belt', name: 'The Belt', nameZh: '腰带', rarity: 'common',
    desc: '移动速度提升',
    mods: { flat: { speed: 34 } },
  },
  {
    id: 'speed_ball', name: 'Speed Ball', nameZh: '速度球', rarity: 'rare',
    desc: '移动速度与弹速提升',
    mods: { flat: { speed: 30, shotSpeed: 60 } },
  },
  {
    id: 'thunder_thighs', name: 'Thunder Thighs', nameZh: '雷霆大腿', rarity: 'rare',
    desc: '移动速度提升，最大生命 +1 心',
    mods: { flat: { speed: 26 } },
    flatMax: { maxHealth: 2 },
  },

  // ================= 六、射程 / 弹速 =================
  {
    id: 'range_up', name: 'Odd Mushroom', nameZh: '诡异蘑菇', rarity: 'common',
    desc: '射程与弹速提升',
    mods: { flat: { range: 110, shotSpeed: 60 } },
  },
  {
    id: 'moms_underwear', name: "Mom's Underwear", nameZh: '母亲的内衣', rarity: 'common',
    desc: '射程提升',
    mods: { flat: { range: 90 } },
  },
  {
    id: 'the_peeper', name: 'The Peeper', nameZh: '窥视者', rarity: 'rare',
    desc: '射程与攻击力提升',
    mods: { flat: { range: 80, damage: 1.2 } },
  },
  {
    id: 'growth_hormones', name: 'Growth Hormones', nameZh: '生长激素', rarity: 'rare',
    desc: '伤害、移速、射程全面提升',
    mods: { flat: { damage: 1, speed: 20, range: 50 } },
  },
  {
    id: 'lard', name: 'Lard', nameZh: '猪油', rarity: 'common',
    desc: '攻击力与射程提升，移速下降',
    mods: { flat: { damage: 1.2, range: 60, speed: -14 } },
  },
  {
    id: 'lil_gurdy', name: 'Little Gurdy', nameZh: '小格蒂', rarity: 'rare',
    desc: '射程与弹速提升',
    mods: { flat: { range: 70, shotSpeed: 50 } },
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
  // 生命容器（顶层 flatMax）
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
