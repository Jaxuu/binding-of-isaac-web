/**
 * floors.js — 楼层配置中枢（12 层）
 *
 * 设计目标（对应用户需求）：
 *   · 每层有**独立的场景风格与视觉主题**（地板/墙体/环境色/装饰母题/障碍物材质）
 *   · 每层有**专属 Boss**（id 指向 entities/boss.js 的 BOSS_DEFS）
 *   · 每层有**差异化的小怪池**（id 指向 entities/enemy.js 的 ENEMY_DEFS，值为抽取权重）
 *
 * 本模块是「叶子模块」：不 import 任何本项目模块，避免与 draw-room / rooms / game
 * 形成循环依赖（构建器会把 ES Module 打平成单文件，循环依赖会导致符号未定义）。
 *
 * 楼层顺序参照《以撒的结合》章节体系：Basement → Cellar → Caves → Catacombs →
 * Depths → Necropolis → Womb → Utero → Sheol → Cathedral → Chest → Dark Room。
 */

/** @typedef {{
 *   id:string, name:string, nameZh:string,
 *   theme:{floorA:string, floorB:string, wall:string, deco:string, ambient:string, accent:string},
 *   boss:string, enemies:Record<string,number>, obstacle:string[],
 *   hpScale:number, speedScale:number, tint:string
 * }} FloorDef */

/** @type {FloorDef[]} */
export const FLOORS = [
  {
    id: 'basement',
    name: 'Basement',
    nameZh: '地下室',
    tint: '#6a5344',
    theme: { floorA: '#5a4a42', floorB: '#4e403a', wall: '#7a5f4e', deco: 'rock', ambient: 'rgba(0,0,0,0.42)', accent: '#8a6f5c' },
    boss: 'monstro',
    // 首层保持 3 种经典敌人 + 1 种新苍蝇（低权重），保证「一开局就能看到多种敌人」
    enemies: { gaper: 3, pooter: 3, horf: 1, attackFly: 1.2 },
    obstacle: ['rock', 'poop'],
    hpScale: 1.0,
    speedScale: 1.0,
  },
  {
    id: 'cellar',
    name: 'Cellar',
    nameZh: '地窖',
    tint: '#57493c',
    theme: { floorA: '#4a4038', floorB: '#3f3630', wall: '#63503f', deco: 'rock', ambient: 'rgba(0,0,0,0.5)', accent: '#7a6550' },
    boss: 'larry',
    enemies: { gaper: 2, pooter: 2, attackFly: 2, trite: 2, charger: 1.2 },
    obstacle: ['rock', 'poop'],
    hpScale: 1.18,
    speedScale: 1.05,
  },
  {
    id: 'caves',
    name: 'Caves',
    nameZh: '洞穴',
    tint: '#7a6448',
    theme: { floorA: '#6b5a45', floorB: '#5d4d3b', wall: '#8a6f4f', deco: 'rock', ambient: 'rgba(0,0,0,0.38)', accent: '#a98a5e' },
    boss: 'chub',
    enemies: { charger: 2, clotty: 2, hopper: 1.6, boomFly: 1.4, maggot: 2 },
    obstacle: ['rock', 'bone'],
    hpScale: 1.36,
    speedScale: 1.08,
  },
  {
    id: 'catacombs',
    name: 'Catacombs',
    nameZh: '地下墓穴',
    tint: '#5e5e68',
    theme: { floorA: '#4e4e56', floorB: '#44444b', wall: '#6a6a72', deco: 'skull', ambient: 'rgba(0,0,0,0.5)', accent: '#8c8c96' },
    boss: 'gurdy',
    enemies: { horf: 2, clotty: 2, mulligan: 1.6, boomFly: 1.6, spitty: 1.6, bone: 1.4 },
    obstacle: ['bone', 'rock'],
    hpScale: 1.54,
    speedScale: 1.1,
  },
  {
    id: 'depths',
    name: 'Depths',
    nameZh: '深处',
    tint: '#4a5560',
    theme: { floorA: '#3f4a55', floorB: '#37414b', wall: '#55606b', deco: 'rock', ambient: 'rgba(0,0,0,0.55)', accent: '#6e7d8a' },
    boss: 'duke',
    enemies: { attackFly: 3, mulligan: 2, maw: 1.6, host: 1.4, globin: 1.6, bone: 1.2 },
    obstacle: ['bone', 'rock'],
    hpScale: 1.72,
    speedScale: 1.12,
  },
  {
    id: 'necropolis',
    name: 'Necropolis',
    nameZh: '大墓地',
    tint: '#5c4a6e',
    theme: { floorA: '#4a3f58', floorB: '#403650', wall: '#62507a', deco: 'skull', ambient: 'rgba(20,0,30,0.5)', accent: '#8a6ea8' },
    boss: 'fistula',
    enemies: { charger: 2.2, hopper: 2, maw: 2, vis: 1.4, boomFly: 1.8, bone: 1.6 },
    obstacle: ['bone', 'rock'],
    hpScale: 1.9,
    speedScale: 1.14,
  },
  {
    id: 'womb',
    name: 'Womb',
    nameZh: '子宫',
    tint: '#7a3036',
    theme: { floorA: '#6a2a2e', floorB: '#5a2427', wall: '#8a3a3a', deco: 'flesh', ambient: 'rgba(40,0,0,0.5)', accent: '#b05050' },
    boss: 'mom',
    enemies: { maggot: 3, globin: 2, mulligan: 2, sucker: 1.8, trite: 2 },
    obstacle: ['flesh', 'rock'],
    hpScale: 2.08,
    speedScale: 1.16,
  },
  {
    id: 'utero',
    name: 'Utero',
    nameZh: '子宫内',
    tint: '#8a2328',
    theme: { floorA: '#7a1f26', floorB: '#671a20', wall: '#9a2a2e', deco: 'flesh', ambient: 'rgba(50,0,0,0.55)', accent: '#c05858' },
    boss: 'momsHeart',
    enemies: { globin: 2.4, maw: 2, trite: 2.4, vis: 1.8, sucker: 2.2 },
    obstacle: ['flesh', 'rock'],
    hpScale: 2.26,
    speedScale: 1.18,
  },
  {
    id: 'sheol',
    name: 'Sheol',
    nameZh: '阴间',
    tint: '#5a1c20',
    theme: { floorA: '#3a1418', floorB: '#2e1013', wall: '#5a1a1e', deco: 'fire', ambient: 'rgba(60,0,0,0.55)', accent: '#c23a1a' },
    boss: 'satan',
    enemies: { mulliboom: 2.4, sucker: 2.4, vis: 2, charger: 2, globin: 2.2, bone: 1.6 },
    obstacle: ['bone', 'rock'],
    hpScale: 2.44,
    speedScale: 1.2,
  },
  {
    id: 'cathedral',
    name: 'Cathedral',
    nameZh: '大教堂',
    tint: '#9a9aa4',
    theme: { floorA: '#8a8a92', floorB: '#7c7c85', wall: '#b0b0b8', deco: 'gold', ambient: 'rgba(255,240,200,0.12)', accent: '#e0d090' },
    boss: 'isaac',
    enemies: { host: 2.4, maw: 2.4, vis: 2.2, spitty: 2.2, attackFly: 2.4, bone: 1.4 },
    obstacle: ['bone', 'rock'],
    hpScale: 2.62,
    speedScale: 1.22,
  },
  {
    id: 'chest',
    name: 'Chest',
    nameZh: '宝箱',
    tint: '#8a7430',
    theme: { floorA: '#6a5a2a', floorB: '#5c4e24', wall: '#a08030', deco: 'gold', ambient: 'rgba(60,40,0,0.4)', accent: '#e8c860' },
    boss: 'blueBaby',
    enemies: { gaper: 3, attackFly: 3, mulliboom: 2.4, vis: 2.2, maw: 2.4, sucker: 2.4, globin: 2.2 },
    obstacle: ['rock', 'poop'],
    hpScale: 2.8,
    speedScale: 1.24,
  },
  {
    id: 'darkroom',
    name: 'Dark Room',
    nameZh: '黑暗房间',
    tint: '#332a38',
    theme: { floorA: '#201a22', floorB: '#191419', wall: '#382c38', deco: 'skull', ambient: 'rgba(0,0,0,0.66)', accent: '#6a4a72' },
    boss: 'lamb',
    enemies: { charger: 3, mulliboom: 3, vis: 2.6, globin: 2.6, sucker: 2.6, trite: 2.6, bone: 2 },
    obstacle: ['bone', 'rock'],
    hpScale: 3.0,
    speedScale: 1.26,
  },
];

/** 取楼层定义（1 基；越界钳制到首/末层，保证永不返回 undefined） */
export function floorDef(n) {
  const i = Math.max(0, Math.min(FLOORS.length - 1, (Math.floor(n) || 1) - 1));
  return FLOORS[i];
}

/** 楼层总数（= 通关所需击败的 Boss 数） */
export function floorCount() {
  return FLOORS.length;
}

/** 某层的敌人权重表（返回副本，调用方可安全修改） */
export function floorEnemies(n) {
  return Object.assign({}, floorDef(n).enemies);
}

/** 某层的障碍物材质表 */
export function floorObstacles(n) {
  return floorDef(n).obstacle.slice();
}
