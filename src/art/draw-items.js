/**
 * draw-items.js — 道具图标 / 地面掉落物 / 宝箱 / 拾取物 绘制
 *
 * 「道具改变角色外观」的可视化入口：道具池中每个道具都有独立的 code-drawn 图标，
 * 形状与配色尽量贴近原作记忆点（例如 Brimstone 是红色恶魔头颅喷火）。
 *
 * 每个图标绘制函数以 (0,0) 为中心，半径约 16px（烘焙尺寸 40×40）。
 */

import { PAL } from './palette.js';
import { circle, ellipse, inkShape, roundRectPath, star, blob } from './primitives.js';
import { TAU } from '../core/math.js';

/** 道具图标绘制表。key = 道具 id，与 items.js 的 ITEM_POOL 一致。 */
export const ITEM_ICONS = {
  /** 基础眼泪（起手就有，不算拾取物，但用于图鉴） */
  'tear': (ctx) => {
    const g = ctx.createRadialGradient(-3, -4, 1, 0, 0, 12);
    g.addColorStop(0, PAL.tearHi);
    g.addColorStop(0.6, PAL.tear);
    g.addColorStop(1, '#4a9ec4');
    circle(ctx, 0, 0, 11, { fill: g, stroke: PAL.ink, lineWidth: 2.6 });
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(-3.5, -4, 3.2, 2.2, -0.5, 0, TAU);
    ctx.fill();
  },

  /** Brimstone —— 红色恶魔头颅喷出血光束 */
  'brimstone': (ctx) => {
    // 光束尾迹
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = PAL.brimstoneBeam;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(6, 6);
    ctx.lineTo(16, 16);
    ctx.stroke();
    ctx.restore();
    drawDevilHead(ctx, 0, -1, 13, PAL.brimstoneBeam, '#8a0a0a');
  },

  /** Ipecac —— 绿色呕吐炸弹瓶 */
  'ipecac': (ctx) => {
    // 瓶身
    inkShape(ctx, (c) => {
      c.moveTo(-6, -12);
      c.lineTo(6, -12);
      c.lineTo(5, -6);
      c.bezierCurveTo(12, -2, 12, 10, 0, 12);
      c.bezierCurveTo(-12, 10, -12, -2, -5, -6);
      c.closePath();
    }, { fill: '#c94a4a', lineWidth: 2.6 });
    // 液体
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-6, -12);
    ctx.lineTo(6, -12);
    ctx.lineTo(5, -6);
    ctx.bezierCurveTo(12, -2, 12, 10, 0, 12);
    ctx.bezierCurveTo(-12, 10, -12, -2, -5, -6);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = '#8fc84a';
    ctx.fillRect(-13, 0, 26, 14);
    ctx.restore();
    // 瓶口 + 塞子
    inkShape(ctx, (c) => roundRectPath(c, -7, -16, 14, 5, 2), { fill: '#c8c0b0', lineWidth: 2.2 });
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(-4, 2, 2.4, 4.5, 0.2, 0, TAU);
    ctx.fill();
  },

  /** Mom's Knife —— 飞刀 */
  'moms_knife': (ctx) => {
    ctx.save();
    ctx.rotate(-Math.PI / 4);
    inkShape(ctx, (c) => {
      c.moveTo(14, 0);
      c.lineTo(3, -5);
      c.lineTo(-4, -4.5);
      c.lineTo(-4, 4.5);
      c.lineTo(3, 5);
      c.closePath();
    }, { fill: PAL.knife, lineWidth: 2.6 });
    inkShape(ctx, (c) => roundRectPath(c, -12, -3.5, 9, 7, 2), { fill: '#5a3a24', lineWidth: 2.4 });
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(3, -2.5);
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  },

  /** Technology —— 机械眼 + 红色激光 */
  'technology': (ctx) => {
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = PAL.techGlow;
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.lineTo(18, 0);
    ctx.stroke();
    ctx.strokeStyle = PAL.techBeam;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.lineTo(18, 0);
    ctx.stroke();
    ctx.restore();
    // 机械眼球
    circle(ctx, -3, 0, 11, { fill: '#b8bcc4', stroke: PAL.ink, lineWidth: 2.6 });
    circle(ctx, -3, 0, 7, { fill: '#2a2e34', stroke: PAL.ink, lineWidth: 2 });
    circle(ctx, -3, 0, 3.4, { fill: PAL.techGlow, stroke: null });
    circle(ctx, -5, -2, 1.6, { fill: '#ffdcc0', stroke: null });
  },

  /** The Inner Eye —— 三只眼睛（三连发） */
  'inner_eye': (ctx) => {
    drawEye(ctx, 0, -6, 8.5);
    drawEye(ctx, -7.5, 6, 6.5);
    drawEye(ctx, 7.5, 6, 6.5);
  },

  /** Spoon Bender —— 弯汤匙（追踪） */
  'spoon_bender': (ctx) => {
    ctx.save();
    ctx.rotate(-0.3);
    // 勺柄
    ctx.strokeStyle = PAL.knife;
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-13, 12);
    ctx.quadraticCurveTo(0, 2, 3, -6);
    ctx.stroke();
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-13, 12);
    ctx.quadraticCurveTo(0, 2, 3, -6);
    ctx.stroke();
    // 弯曲的勺头
    inkShape(ctx, (c) => {
      c.ellipse(4, -10, 8, 6.5, -0.5, 0, TAU);
    }, { fill: '#e6e8ec', lineWidth: 2.6 });
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(2, -12, 3, 2, -0.5, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  },

  /** Cricket's Head —— 蟋蟀头颅（伤害 ×1.5） */
  'crickets_head': (ctx) => {
    inkShape(ctx, (c) => c.ellipse(0, 1, 11, 12, 0, 0, TAU), { fill: '#6f9e6b', lineWidth: 2.8 });
    // 触须
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-4, -10);
    ctx.quadraticCurveTo(-9, -18, -13, -14);
    ctx.moveTo(4, -10);
    ctx.quadraticCurveTo(9, -18, 13, -14);
    ctx.stroke();
    // 眼睛
    drawEye(ctx, -4.5, -1, 4.2, '#ffffff', '#c02020');
    drawEye(ctx, 4.5, -1, 4.2, '#ffffff', '#c02020');
    // 大颚
    ctx.fillStyle = '#c9453a';
    ctx.beginPath();
    ctx.moveTo(-4, 8);
    ctx.lineTo(-7, 13);
    ctx.lineTo(-2, 11);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(4, 8);
    ctx.lineTo(7, 13);
    ctx.lineTo(2, 11);
    ctx.closePath();
    ctx.fill();
  },

  /** Polyphemus —— 独眼巨人的巨眼（巨大伤害 + 穿透） */
  'polyphemus': (ctx) => {
    inkShape(ctx, (c) => c.ellipse(0, 0, 14, 12, 0, 0, TAU), { fill: '#f2d3b3', lineWidth: 2.8 });
    circle(ctx, 0, 0, 8.5, { fill: '#ffffff', stroke: PAL.ink, lineWidth: 2.2 });
    circle(ctx, 0, 0, 4.4, { fill: '#3a6a3a', stroke: null });
    circle(ctx, 0, 0, 2, { fill: '#101010', stroke: null });
    circle(ctx, -2.6, -3, 1.8, { fill: '#ffffff', stroke: null });
  },

  /** Number One —— 便便笑脸（射速提升、射程下降） */
  'number_one': (ctx) => {
    inkShape(ctx, (c) => c.ellipse(0, 4, 12, 8, 0, 0, TAU), { fill: PAL.pickupCoin, lineWidth: 2.6 });
    inkShape(ctx, (c) => c.ellipse(0, -4, 8.5, 6.5, 0, 0, TAU), { fill: PAL.pickupCoin, lineWidth: 2.4 });
    // 眼睛 + 笑
    circle(ctx, -3, -4, 1.6, { fill: PAL.ink, stroke: null });
    circle(ctx, 3, -4, 1.6, { fill: PAL.ink, stroke: null });
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  },

  /** 心（回血） */
  'lunch': (ctx) => {
    drawHeart(ctx, 0, 0, 13);
  },

  /** 属性提升通用图标（速度） */
  'speed_up': (ctx) => {
    ctx.strokeStyle = PAL.itemBlue;
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-12 + i * 5, -8 + i * 8);
      ctx.lineTo(2 + i * 5, -8 + i * 8);
      ctx.stroke();
    }
    inkShape(ctx, (c) => {
      c.moveTo(4, -8);
      c.lineTo(15, 0);
      c.lineTo(4, 8);
      c.closePath();
    }, { fill: PAL.itemBlue, lineWidth: 2.4 });
  },

  /** 射程提升 */
  'range_up': (ctx) => {
    for (let i = 0; i < 3; i++) {
      ctx.save();
      circle(ctx, 0, 0, 4 + i * 4.5, { fill: null, stroke: PAL.itemPurple, lineWidth: 2.4 });
      ctx.restore();
    }
    circle(ctx, 0, 0, 3, { fill: PAL.itemPurple, stroke: PAL.ink, lineWidth: 2 });
  },

  /** 伤害提升 */
  'damage_up': (ctx) => {
    inkShape(ctx, (c) => {
      c.moveTo(0, -14);
      c.lineTo(10, -2);
      c.lineTo(5, -2);
      c.lineTo(7, 13);
      c.lineTo(-7, 13);
      c.lineTo(-5, -2);
      c.lineTo(-10, -2);
      c.closePath();
    }, { fill: PAL.itemRed, lineWidth: 2.6 });
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.moveTo(-3, -10);
    ctx.lineTo(-1, 8);
    ctx.lineTo(-4, 8);
    ctx.closePath();
    ctx.fill();
  },
};

/** 通用眼球绘制 */
function drawEye(ctx, x, y, r, white = '#ffffff', iris = '#3a6a3a') {
  circle(ctx, x, y, r, { fill: white, stroke: PAL.ink, lineWidth: 2.2 });
  circle(ctx, x, y, r * 0.55, { fill: iris, stroke: null });
  circle(ctx, x, y, r * 0.26, { fill: '#101010', stroke: null });
  circle(ctx, x - r * 0.3, y - r * 0.35, r * 0.18, { fill: '#ffffff', stroke: null });
}

/** 恶魔头颅（Brimstone 图标与发射口） */
function drawDevilHead(ctx, x, y, r, skin, shade) {
  inkShape(ctx, (c) => {
    c.arc(x, y, r, Math.PI * 0.06, Math.PI * 0.94, false); // 下半圆（下巴）
  }, { fill: skin, lineWidth: 2.6 });
  inkShape(ctx, (c) => {
    c.arc(x, y, r, Math.PI * 1.06, Math.PI * 1.94, false); // 上半圆（头盖）
  }, { fill: skin, lineWidth: 2.6 });
  // 角
  inkShape(ctx, (c) => {
    c.moveTo(x - r * 0.8, y - r * 0.55);
    c.lineTo(x - r * 1.25, y - r * 1.5);
    c.lineTo(x - r * 0.42, y - r * 0.88);
    c.closePath();
  }, { fill: shade, lineWidth: 2 });
  inkShape(ctx, (c) => {
    c.moveTo(x + r * 0.8, y - r * 0.55);
    c.lineTo(x + r * 1.25, y - r * 1.5);
    c.lineTo(x + r * 0.42, y - r * 0.88);
    c.closePath();
  }, { fill: shade, lineWidth: 2 });
  // 发光眼
  ctx.save();
  ctx.shadowColor = '#ffd0a0';
  ctx.shadowBlur = 6;
  circle(ctx, x - r * 0.38, y - r * 0.15, r * 0.2, { fill: '#fff0c0', stroke: null });
  circle(ctx, x + r * 0.38, y - r * 0.15, r * 0.2, { fill: '#fff0c0', stroke: null });
  ctx.restore();
  // 獠牙
  ctx.fillStyle = '#fff2e0';
  for (const sx of [-0.5, -0.15, 0.15, 0.5]) {
    ctx.beginPath();
    ctx.moveTo(x + sx * r - 1.6, y + r * 0.45);
    ctx.lineTo(x + sx * r + 1.6, y + r * 0.45);
    ctx.lineTo(x + sx * r, y + r * 0.85);
    ctx.closePath();
    ctx.fill();
  }
}

/** 心形（回血/血量 UI 共用） */
export function drawHeart(ctx, x, y, size, fill = PAL.pickupHeart, hi = PAL.pickupHeartHi, stroke = PAL.ink) {
  const s = size / 13;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  inkShape(ctx, (c) => {
    c.moveTo(0, 4);
    c.bezierCurveTo(-13, -3, -9, -13, -3.5, -8.5);
    c.bezierCurveTo(-2.4, -7.6, -1, -6.4, 0, -5);
    c.bezierCurveTo(1, -6.4, 2.4, -7.6, 3.5, -8.5);
    c.bezierCurveTo(9, -13, 13, -3, 0, 4);
    c.closePath();
  }, { fill, lineWidth: stroke ? 2.4 : 0, stroke });
  ctx.fillStyle = hi;
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.ellipse(-3.6, -5.4, 2.2, 1.5, -0.5, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** 灵魂心（半颗心的另一色） */
export function drawSoulHeart(ctx, x, y, size) {
  drawHeart(ctx, x, y, size, PAL.uiSoulFull, '#e6f4ff');
}

/** 黑心 */
export function drawBlackHeart(ctx, x, y, size) {
  drawHeart(ctx, x, y, size, PAL.uiBlackFull, '#6a5a5e');
}

/** 金币 */
export function drawCoin(ctx, x, y, r = 8) {
  circle(ctx, x, y, r, { fill: PAL.pickupCoin, stroke: PAL.ink, lineWidth: 2.4 });
  circle(ctx, x, y, r * 0.62, { fill: null, stroke: PAL.itemGoldDark, lineWidth: 2 });
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = PAL.pickupCoinHi;
  ctx.beginPath();
  ctx.ellipse(x - r * 0.3, y - r * 0.34, r * 0.28, r * 0.4, -0.4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** 钥匙 */
export function drawKey(ctx, x, y, s = 9) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.4);
  inkShape(ctx, (c) => c.arc(0, -s * 0.55, s * 0.5, 0, TAU), { fill: PAL.pickupKey, lineWidth: 2.4 });
  ctx.fillStyle = PAL.pickupKey;
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-s * 0.2, -s * 0.1);
  ctx.lineTo(-s * 0.2, s * 0.9);
  ctx.moveTo(-s * 0.2, s * 0.45);
  ctx.lineTo(s * 0.3, s * 0.45);
  ctx.moveTo(-s * 0.2, s * 0.75);
  ctx.lineTo(s * 0.2, s * 0.75);
  ctx.stroke();
  ctx.restore();
}

/** 炸弹 */
export function drawBomb(ctx, x, y, r = 9) {
  circle(ctx, x, y + 1, r, { fill: PAL.pickupBomb, stroke: PAL.ink, lineWidth: 2.4 });
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#8a8a98';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.34, y - r * 0.2, r * 0.3, r * 0.4, -0.4, 0, TAU);
  ctx.fill();
  ctx.restore();
  // 引线
  ctx.strokeStyle = PAL.pickupBombFuse;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + r * 0.4, y - r * 0.75);
  ctx.quadraticCurveTo(x + r * 0.9, y - r * 1.3, x + r * 0.4, y - r * 1.5);
  ctx.stroke();
  // 火花
  ctx.fillStyle = '#ffcf5a';
  ctx.beginPath();
  ctx.arc(x + r * 0.4, y - r * 1.55, 2.4, 0, TAU);
  ctx.fill();
}

/**
 * 宝箱（关闭 / 打开 / 已使用）
 * @param {number} state 0=关闭 1=打开中 2=已空
 */
export function drawChest(ctx, x, y, state = 0, t = 0) {
  const s = 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  // 阴影
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, 20, 24, 8, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // 箱体
  const bodyGrad = ctx.createLinearGradient(0, 0, 0, 20);
  bodyGrad.addColorStop(0, PAL.chestWoodHi);
  bodyGrad.addColorStop(1, PAL.chestWood);
  inkShape(ctx, (c) => roundRectPath(c, -22, -2, 44, 22, 4), { fill: bodyGrad, lineWidth: 3 });
  // 木板纹
  ctx.strokeStyle = 'rgba(60,30,10,0.5)';
  ctx.lineWidth = 1.6;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 13, 0);
    ctx.lineTo(i * 13, 19);
    ctx.stroke();
  }

  // 箱盖（打开时旋转上扬）
  const lidAngle = state === 0 ? 0 : -0.85;
  ctx.save();
  ctx.translate(0, -2);
  ctx.rotate(lidAngle);
  const lidGrad = ctx.createLinearGradient(0, -16, 0, 4);
  lidGrad.addColorStop(0, PAL.chestWoodHi);
  lidGrad.addColorStop(1, PAL.chestWood);
  inkShape(ctx, (c) => {
    c.moveTo(-22, 2);
    c.lineTo(-22, -10);
    c.quadraticCurveTo(0, -22, 22, -10);
    c.lineTo(22, 2);
    c.closePath();
  }, { fill: lidGrad, lineWidth: 3 });
  // 金属包边
  ctx.strokeStyle = PAL.chestGold;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-22, -5);
  ctx.quadraticCurveTo(0, -16, 22, -5);
  ctx.stroke();
  ctx.restore();

  // 锁扣
  inkShape(ctx, (c) => roundRectPath(c, -6, -1, 12, 11, 2), { fill: PAL.chestGold, lineWidth: 2.4 });
  circle(ctx, 0, 4, 2, { fill: PAL.ink, stroke: null });

  // 打开时内部金光
  if (state >= 1) {
    ctx.save();
    ctx.globalAlpha = 0.7 + Math.sin(t * 5) * 0.15;
    const g = ctx.createRadialGradient(0, -2, 2, 0, -2, 30);
    g.addColorStop(0, 'rgba(255,240,180,0.95)');
    g.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -4, 26, 20, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** 地面道具（悬浮的图标 + 光柱 + 上下浮动） */
export function drawItemPickup(ctx, x, y, itemId, t = 0) {
  const bob = Math.sin(t * 2.6) * 3;
  ctx.save();
  ctx.translate(x, y + bob);

  // 光柱
  ctx.save();
  ctx.globalAlpha = 0.32 + Math.sin(t * 3) * 0.08;
  const g = ctx.createLinearGradient(0, -50, 0, 20);
  g.addColorStop(0, 'rgba(255,235,160,0)');
  g.addColorStop(0.6, 'rgba(255,225,140,0.75)');
  g.addColorStop(1, 'rgba(255,210,100,0.15)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-14, 18);
  ctx.lineTo(-8, -46);
  ctx.lineTo(8, -46);
  ctx.lineTo(14, 18);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 地面光环
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = PAL.itemGold;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.ellipse(0, 18 - bob, 15, 5.5, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();

  // 图标底座（圆形徽章）
  circle(ctx, 0, 0, 17, { fill: 'rgba(35,27,30,0.9)', stroke: PAL.itemGold, lineWidth: 2.6 });
  ctx.save();
  ctx.globalAlpha = 0.28;
  const bg = ctx.createRadialGradient(0, 0, 2, 0, 0, 18);
  bg.addColorStop(0, '#ffe9a3');
  bg.addColorStop(1, 'rgba(255,200,80,0)');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, TAU);
  ctx.fill();
  ctx.restore();

  // 图标本体（缩小到徽章内）
  ctx.save();
  ctx.scale(0.82, 0.82);
  const fn = ITEM_ICONS[itemId] || ITEM_ICONS['tear'];
  fn(ctx);
  ctx.restore();

  ctx.restore();
}

/** 掉落的拾取物（心/金币/钥匙/炸弹），地面小图标 */
export function drawPickup(ctx, x, y, kind, t = 0) {
  const bob = Math.sin(t * 3 + x * 0.1) * 1.6;
  ctx.save();
  ctx.translate(x, y + bob);
  // 软阴影
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, 11 - bob, 9, 3.4, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  switch (kind) {
    case 'heart': drawHeart(ctx, 0, 0, 17); break;
    case 'soulHeart': drawSoulHeart(ctx, 0, 0, 17); break;
    case 'blackHeart': drawBlackHeart(ctx, 0, 0, 17); break;
    case 'coin': drawCoin(ctx, 0, 0, 8.5); break;
    case 'key': drawKey(ctx, 0, 0, 9.5); break;
    case 'bomb': drawBomb(ctx, 0, 0, 9); break;
    default: drawCoin(ctx, 0, 0, 8);
  }
  ctx.restore();
}

/** 敌人生成前的提示（一团血色裂纹，警示玩家） */
export function drawSpawnMark(ctx, x, y, p) {
  ctx.save();
  ctx.globalAlpha = 0.5 + p * 0.4;
  ctx.strokeStyle = '#7a1010';
  ctx.lineWidth = 2.4;
  const r = 6 + p * 14;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(140,20,20,0.5)';
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.5, r * 0.3, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}
