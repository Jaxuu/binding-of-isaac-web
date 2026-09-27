/**
 * palette.js — 全局调色板
 *
 * 风格：暗黑卡通（dark cartoon）
 * - 粗黑描边：3px，颜色 #1a0d0d（近黑带一点暖褐，避免纯黑的塑料感）
 * - 扁平 + 微渐变填充：每个形体先铺主色，再叠一层顶部高光渐变（线性或径向）
 * - 低明度底（地牢地面/墙）+ 高饱和点缀（角色、道具、血、伤害数字）
 *
 * 约定：所有颜色都写成 CSS 颜色字符串，供 Canvas fillStyle/strokeStyle 直接使用。
 */

export const PAL = {
  // ---- 描边与阴影 ----
  ink: '#1a0d0d', // 主描边色（3px）
  inkSoft: '#2b1a1a', // 次级描边
  shadow: 'rgba(0,0,0,0.34)',

  // ---- 地牢结构（低明度）----
  floorA: '#5a4a42', // 地面基色（暖灰褐）
  floorB: '#4e403a', // 棋盘格暗格
  floorCrack: '#3d322d',
  wall: '#7a5f4e', // 墙体外立面
  wallTop: '#96735d', // 墙体顶面（受光）
  wallDark: '#4a372c',
  wallMortar: '#3a2b23',
  rubble: '#8a6f5c',

  // ---- 房间特殊地面 ----
  floorBoss: '#5a4040', // Boss 房偏红
  floorTreasure: '#5b5343', // 宝箱房偏金
  floorStart: '#5a4a42',

  // ---- 玩家（以撒）----
  isaacSkin: '#f2d3b3',
  isaacSkinShade: '#d9b088',
  isaacBody: '#f7e4cd',
  isaacHair: '#3a2418',
  isaacEye: '#2b1b12',
  isaacTear: '#8fd8f0',
  isaacTearHi: '#d8f4ff',
  isaacHurt: '#ff6b6b',
  isaacHead: '#f8dcc0',

  // ---- 眼泪 / 子弹通用 ----
  tear: '#9fe0f5',
  tearHi: '#ffffff',
  tearTrail: 'rgba(159,224,245,0.55)',
  bloodShot: '#d93b3b',
  brimstoneBeam: '#e8332f',
  brimstoneGlow: '#ff8a3d',
  techBeam: '#e6e6e6',
  techGlow: '#ff3b3b',
  knife: '#d7d7dc',
  knifeEdge: '#ffffff',

  // ---- 敌人 ----
  gaperFlesh: '#e8c9a0',
  gaperFleshShade: '#c9a276',
  gaperBlood: '#a01818',
  gaperEye: '#ffffff',
  gaperPupil: '#1a1010',
  gaperMouth: '#6b1010',

  pooterBody: '#e6e0c8',
  pooterShade: '#c4bda0',
  pooterEye: '#c02020',
  pooterWing: '#f2ecd6',
  pooterInner: '#7a6f55',

  horfBody: '#c8a67a',
  horfShade: '#a5835a',
  horfHole: '#3a2418',
  horfMouth: '#8a1f1f',

  // ---- Boss / Monstro ----
  monstroBody: '#6f9e6b',
  monstroBodyShade: '#4f7a4d',
  monstroBelly: '#cdb98f',
  monstroBellyShade: '#b0a074',
  monstroEye: '#ffffff',
  monstroPupil: '#111111',
  monstroMouth: '#5c0f0f',
  monstroGum: '#c94a4a',

  // ---- 道具 / 拾取物 ----
  itemGold: '#f3c73f',
  itemGoldDark: '#b98e1e',
  itemPurple: '#9b6bd6',
  itemRed: '#d63b3b',
  itemBlue: '#4aa3e0',
  pickupHeart: '#e04a4a',
  pickupHeartHi: '#ff9a9a',
  pickupCoin: '#f0c944',
  pickupCoinHi: '#ffe9a3',
  pickupKey: '#e0b64a',
  pickupBomb: '#3a3a42',
  pickupBombFuse: '#d0a040',

  // ---- 宝箱 ----
  chestWood: '#8a5a2b',
  chestWoodHi: '#a97440',
  chestGold: '#d9a441',
  chestGoldHi: '#f3d27a',

  // ---- 门 ----
  doorFrame: '#8a6a52',
  doorClosed: '#6b4c38',
  doorOpen: '#1c1210',
  doorArch: '#96673f',

  // ---- UI ----
  uiBg: '#120f12',
  uiPanel: '#231b1e',
  uiPanelHi: '#2f2429',
  uiText: '#f0e6d2',
  uiTextDim: '#a89a86',
  uiAccent: '#c9302c',
  uiGold: '#f3c73f',
  uiHeartFull: '#e04a4a',
  uiHeartEmpty: '#3a2424',
  uiSoulFull: '#a8d0e6',
  uiBlackFull: '#2a2226',
  uiBarBg: '#2b2124',
  uiBarFill: '#c94a4a',
  uiKey: '#e0b64a',
  uiCoin: '#f0c944',
  uiBomb: '#4a4a52',

  // ---- 小地图 ----
  mapBg: 'rgba(18,15,18,0.86)',
  mapRoom: '#4a3f44',
  mapRoomCur: '#e0d3b8',
  mapRoomClear: '#8a7f74',
  mapRoomBoss: '#c9302c',
  mapRoomTreasure: '#d9a441',
  mapDoor: '#6b4c38',

  // ---- 特效 ----
  damageFlash: 'rgba(180,20,20,0.5)',
  white: '#ffffff',
  black: '#000000',
};
