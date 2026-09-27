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

// ---------------- 可复用图标基元 ----------------

/** 通用眼球 */
function drawEye(ctx, x, y, r, white = '#ffffff', iris = '#3a6a3a') {
  circle(ctx, x, y, r, { fill: white, stroke: PAL.ink, lineWidth: 2.2 });
  circle(ctx, x, y, r * 0.55, { fill: iris, stroke: null });
  circle(ctx, x, y, r * 0.26, { fill: '#101010', stroke: null });
  circle(ctx, x - r * 0.3, y - r * 0.35, r * 0.18, { fill: '#ffffff', stroke: null });
}

/** 恶魔头颅（Brimstone 图标与发射口） */
function drawDevilHead(ctx, x, y, r, skin, shade) {
  inkShape(ctx, (c) => c.arc(x, y, r, Math.PI * 0.06, Math.PI * 0.94, false), { fill: skin, lineWidth: 2.6 });
  inkShape(ctx, (c) => c.arc(x, y, r, Math.PI * 1.06, Math.PI * 1.94, false), { fill: skin, lineWidth: 2.6 });
  inkShape(ctx, (c) => {
    c.moveTo(x - r * 0.8, y - r * 0.55); c.lineTo(x - r * 1.25, y - r * 1.5); c.lineTo(x - r * 0.42, y - r * 0.88); c.closePath();
  }, { fill: shade, lineWidth: 2 });
  inkShape(ctx, (c) => {
    c.moveTo(x + r * 0.8, y - r * 0.55); c.lineTo(x + r * 1.25, y - r * 1.5); c.lineTo(x + r * 0.42, y - r * 0.88); c.closePath();
  }, { fill: shade, lineWidth: 2 });
  ctx.save();
  ctx.shadowColor = '#ffd0a0';
  ctx.shadowBlur = 6;
  circle(ctx, x - r * 0.38, y - r * 0.15, r * 0.2, { fill: '#fff0c0', stroke: null });
  circle(ctx, x + r * 0.38, y - r * 0.15, r * 0.2, { fill: '#fff0c0', stroke: null });
  ctx.restore();
  ctx.fillStyle = '#fff2e0';
  for (const sx of [-0.5, -0.15, 0.15, 0.5]) {
    ctx.beginPath();
    ctx.moveTo(x + sx * r - 1.6, y + r * 0.45); ctx.lineTo(x + sx * r + 1.6, y + r * 0.45); ctx.lineTo(x + sx * r, y + r * 0.85); ctx.closePath();
    ctx.fill();
  }
}

/** 上升箭头（属性提升通用） */
function upArrow(ctx, color, x = 0, y = 0, s = 1) {
  inkShape(ctx, (c) => {
    c.moveTo(x, y - 13 * s);
    c.lineTo(x + 10 * s, y - 2 * s);
    c.lineTo(x + 5 * s, y - 2 * s);
    c.lineTo(x + 7 * s, y + 13 * s);
    c.lineTo(x - 7 * s, y + 13 * s);
    c.lineTo(x - 5 * s, y - 2 * s);
    c.lineTo(x - 10 * s, y - 2 * s);
    c.closePath();
  }, { fill: color, lineWidth: 2.6 });
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x - 3 * s, y - 9 * s); ctx.lineTo(x - 1 * s, y + 8 * s); ctx.lineTo(x - 4 * s, y + 8 * s); ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 泪滴 */
function drop(ctx, x, y, r, color, hi) {
  inkShape(ctx, (c) => {
    c.moveTo(x, y - r * 1.6);
    c.bezierCurveTo(x + r * 1.3, y - r * 0.2, x + r * 1.1, y + r, x, y + r);
    c.bezierCurveTo(x - r * 1.1, y + r, x - r * 1.3, y - r * 0.2, x, y - r * 1.6);
    c.closePath();
  }, { fill: color, lineWidth: 2.4 });
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = hi;
  ctx.beginPath();
  ctx.ellipse(x - r * 0.34, y + r * 0.1, r * 0.26, r * 0.4, -0.3, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** 肉块（食物类通用） */
function meatBlob(ctx, color, shade, w = 13, h = 11) {
  inkShape(ctx, (c) => c.ellipse(0, 1, w, h, 0, 0, TAU), { fill: color, lineWidth: 2.6 });
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.ellipse(0, 4, w * 0.7, h * 0.4, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-w * 0.32, -h * 0.4, w * 0.26, h * 0.2, -0.4, 0, TAU);
  ctx.fill();
  ctx.restore();
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
  ctx.strokeStyle = PAL.pickupBombFuse;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + r * 0.4, y - r * 0.75);
  ctx.quadraticCurveTo(x + r * 0.9, y - r * 1.3, x + r * 0.4, y - r * 1.5);
  ctx.stroke();
  ctx.fillStyle = '#ffcf5a';
  ctx.beginPath();
  ctx.arc(x + r * 0.4, y - r * 1.55, 2.4, 0, TAU);
  ctx.fill();
}

// ============================================================
// 道具图标表（key = 道具 id）
// ============================================================
export const ITEM_ICONS = {
  /** 基础眼泪（起手就有） */
  tear: (ctx) => {
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

  // ---- 攻击方式类 ----
  brimstone: (ctx) => {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = PAL.brimstoneBeam;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(6, 6); ctx.lineTo(16, 16);
    ctx.stroke();
    ctx.restore();
    drawDevilHead(ctx, 0, -1, 13, PAL.brimstoneBeam, '#8a0a0a');
  },
  ipecac: (ctx) => {
    inkShape(ctx, (c) => {
      c.moveTo(-6, -12); c.lineTo(6, -12); c.lineTo(5, -6);
      c.bezierCurveTo(12, -2, 12, 10, 0, 12);
      c.bezierCurveTo(-12, 10, -12, -2, -5, -6);
      c.closePath();
    }, { fill: '#c94a4a', lineWidth: 2.6 });
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-6, -12); ctx.lineTo(6, -12); ctx.lineTo(5, -6);
    ctx.bezierCurveTo(12, -2, 12, 10, 0, 12);
    ctx.bezierCurveTo(-12, 10, -12, -2, -5, -6);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = '#8fc84a';
    ctx.fillRect(-13, 0, 26, 14);
    ctx.restore();
    inkShape(ctx, (c) => roundRectPath(c, -7, -16, 14, 5, 2), { fill: '#c8c0b0', lineWidth: 2.2 });
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(-4, 2, 2.4, 4.5, 0.2, 0, TAU);
    ctx.fill();
  },
  moms_knife: (ctx) => {
    ctx.save();
    ctx.rotate(-Math.PI / 4);
    inkShape(ctx, (c) => {
      c.moveTo(14, 0); c.lineTo(3, -5); c.lineTo(-4, -4.5); c.lineTo(-4, 4.5); c.lineTo(3, 5); c.closePath();
    }, { fill: PAL.knife, lineWidth: 2.6 });
    inkShape(ctx, (c) => roundRectPath(c, -12, -3.5, 9, 7, 2), { fill: '#5a3a24', lineWidth: 2.4 });
    ctx.restore();
  },
  technology: (ctx) => {
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = PAL.techGlow;
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(2, 0); ctx.lineTo(18, 0);
    ctx.stroke();
    ctx.strokeStyle = PAL.techBeam;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(2, 0); ctx.lineTo(18, 0);
    ctx.stroke();
    ctx.restore();
    circle(ctx, -3, 0, 11, { fill: '#b8bcc4', stroke: PAL.ink, lineWidth: 2.6 });
    circle(ctx, -3, 0, 7, { fill: '#2a2e34', stroke: PAL.ink, lineWidth: 2 });
    circle(ctx, -3, 0, 3.4, { fill: PAL.techGlow, stroke: null });
    circle(ctx, -5, -2, 1.6, { fill: '#ffdcc0', stroke: null });
  },
  inner_eye: (ctx) => {
    drawEye(ctx, 0, -6, 8.5);
    drawEye(ctx, -7.5, 6, 6.5);
    drawEye(ctx, 7.5, 6, 6.5);
  },
  mutant_spider: (ctx) => {
    // 蜘蛛身 + 4 眼
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(side * 14, -10 + i * 9);
        ctx.stroke();
      }
    }
    inkShape(ctx, (c) => c.ellipse(0, 0, 10, 8, 0, 0, TAU), { fill: '#3a2a2a', lineWidth: 2.6 });
    drawEye(ctx, -4, -2, 3.2, '#ffffff', '#c02020');
    drawEye(ctx, 4, -2, 3.2, '#ffffff', '#c02020');
    drawEye(ctx, -2, 3, 2.4, '#ffffff', '#c02020');
    drawEye(ctx, 2, 3, 2.4, '#ffffff', '#c02020');
  },
  loki_horns: (ctx) => {
    inkShape(ctx, (c) => {
      c.moveTo(-12, 6); c.quadraticCurveTo(-16, -8, -6, -12); c.quadraticCurveTo(-12, -4, -4, 2); c.closePath();
    }, { fill: '#d8b06a', lineWidth: 2.4 });
    inkShape(ctx, (c) => {
      c.moveTo(12, 6); c.quadraticCurveTo(16, -8, 6, -12); c.quadraticCurveTo(12, -4, 4, 2); c.closePath();
    }, { fill: '#d8b06a', lineWidth: 2.4 });
    circle(ctx, 0, 4, 9, { fill: '#c8a26a', stroke: PAL.ink, lineWidth: 2.6 });
    drawEye(ctx, -3.4, 3, 3, '#ffffff', '#3a6a3a');
    drawEye(ctx, 3.4, 3, 3, '#ffffff', '#3a6a3a');
  },
  spoon_bender: (ctx) => {
    ctx.save();
    ctx.rotate(-0.3);
    ctx.strokeStyle = PAL.knife;
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-13, 12); ctx.quadraticCurveTo(0, 2, 3, -6);
    ctx.stroke();
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-13, 12); ctx.quadraticCurveTo(0, 2, 3, -6);
    ctx.stroke();
    inkShape(ctx, (c) => c.ellipse(4, -10, 8, 6.5, -0.5, 0, TAU), { fill: '#e6e8ec', lineWidth: 2.6 });
    ctx.restore();
  },
  my_reflection: (ctx) => {
    // 回旋的泪滴（弧形箭头）
    ctx.strokeStyle = PAL.tear;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, 10, -0.4, Math.PI * 1.2);
    ctx.stroke();
    inkShape(ctx, (c) => {
      c.moveTo(9, -7); c.lineTo(14, 1); c.lineTo(5, -1); c.closePath();
    }, { fill: PAL.tear, lineWidth: 1.8 });
    drop(ctx, 0, 1, 5, PAL.tear, PAL.tearHi);
  },
  polyphemus: (ctx) => {
    inkShape(ctx, (c) => c.ellipse(0, 0, 14, 12, 0, 0, TAU), { fill: '#f2d3b3', lineWidth: 2.8 });
    circle(ctx, 0, 0, 8.5, { fill: '#ffffff', stroke: PAL.ink, lineWidth: 2.2 });
    circle(ctx, 0, 0, 4.4, { fill: '#3a6a3a', stroke: null });
    circle(ctx, 0, 0, 2, { fill: '#101010', stroke: null });
    circle(ctx, -2.6, -3, 1.8, { fill: '#ffffff', stroke: null });
  },
  spectral: (ctx) => {
    ctx.save();
    ctx.globalAlpha = 0.8;
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 13);
    g.addColorStop(0, '#f0e6ff');
    g.addColorStop(1, '#8a6ad0');
    blob(ctx, 0, 0, 11, [0.05, -0.04, 0.04, -0.05, 0.03, -0.04, 0.05, -0.03], { fill: g, lineWidth: 2.4 });
    ctx.restore();
    drawEye(ctx, -3, -1, 3, '#ffffff', '#6a4ac0');
    drawEye(ctx, 3, -1, 3, '#ffffff', '#6a4ac0');
  },
  cupids_arrow: (ctx) => {
    ctx.save();
    ctx.rotate(-Math.PI / 4);
    ctx.strokeStyle = '#d8b06a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-14, 0); ctx.lineTo(10, 0);
    ctx.stroke();
    inkShape(ctx, (c) => { c.moveTo(15, 0); c.lineTo(7, -5); c.lineTo(7, 5); c.closePath(); }, { fill: '#c0c8d0', lineWidth: 1.8 });
    ctx.strokeStyle = '#e06a8a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-14, 0); ctx.lineTo(-9, -5); ctx.moveTo(-14, 0); ctx.lineTo(-9, 5);
    ctx.stroke();
    ctx.restore();
    drawHeart(ctx, 0, 8, 11, '#e06a8a', '#ffb0c8');
  },
  dead_onion: (ctx) => {
    inkShape(ctx, (c) => c.ellipse(0, 1, 12, 13, 0, 0, TAU), { fill: '#9a8f7a', lineWidth: 2.8 });
    ctx.strokeStyle = '#6a6050';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 1, 4 + i * 3, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    }
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -12); ctx.quadraticCurveTo(4, -18, 8, -16);
    ctx.stroke();
    // 死眼
    ctx.strokeStyle = '#3a3020';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-6, -1); ctx.lineTo(-2, 3); ctx.moveTo(-2, -1); ctx.lineTo(-6, 3);
    ctx.moveTo(2, -1); ctx.lineTo(6, 3); ctx.moveTo(6, -1); ctx.lineTo(2, 3);
    ctx.stroke();
  },
  sagittarius: (ctx) => {
    ctx.strokeStyle = '#d8b06a';
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(-2, 0, 12, -Math.PI * 0.75, Math.PI * 0.75);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-2 - 12 * Math.cos(Math.PI * 0.75), -12 * Math.sin(Math.PI * 0.75));
    ctx.lineTo(-2 - 12 * Math.cos(Math.PI * 0.75), 12 * Math.sin(Math.PI * 0.75));
    ctx.stroke();
    ctx.strokeStyle = '#c0c8d0';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-13, 0); ctx.lineTo(14, 0);
    ctx.stroke();
    inkShape(ctx, (c) => { c.moveTo(16, 0); c.lineTo(9, -4); c.lineTo(9, 4); c.closePath(); }, { fill: '#c0c8d0', lineWidth: 1.6 });
  },
  the_wafer: (ctx) => {
    circle(ctx, 0, 0, 12, { fill: '#f4ecd8', stroke: PAL.ink, lineWidth: 2.8 });
    ctx.strokeStyle = '#c8b890';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, TAU);
    ctx.stroke();
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = '#e0d0a0';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 12, Math.sin(a) * 12);
      ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16);
      ctx.stroke();
    }
    ctx.restore();
  },

  // ---- 攻击力类 ----
  crickets_head: (ctx) => {
    inkShape(ctx, (c) => c.ellipse(0, 1, 11, 12, 0, 0, TAU), { fill: '#6f9e6b', lineWidth: 2.8 });
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-4, -10); ctx.quadraticCurveTo(-9, -18, -13, -14);
    ctx.moveTo(4, -10); ctx.quadraticCurveTo(9, -18, 13, -14);
    ctx.stroke();
    drawEye(ctx, -4.5, -1, 4.2, '#ffffff', '#c02020');
    drawEye(ctx, 4.5, -1, 4.2, '#ffffff', '#c02020');
    ctx.fillStyle = '#c9453a';
    ctx.beginPath();
    ctx.moveTo(-4, 8); ctx.lineTo(-7, 13); ctx.lineTo(-2, 11); ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(4, 8); ctx.lineTo(7, 13); ctx.lineTo(2, 11); ctx.closePath();
    ctx.fill();
  },
  damage_up: (ctx) => upArrow(ctx, PAL.itemRed),
  stigmata: (ctx) => {
    upArrow(ctx, PAL.itemRed, -3, 1, 0.75);
    // 血滴
    drop(ctx, 8, 6, 5, '#d63b3b', '#ff9a9a');
  },
  blood_of_martyr: (ctx) => {
    drawHeart(ctx, 0, 0, 22, '#b01818', '#e06060');
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = '#ffd0d0';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-6, -6); ctx.lineTo(6, 8);
    ctx.moveTo(6, -6); ctx.lineTo(-6, 8);
    ctx.stroke();
    ctx.restore();
  },
  pentagram: (ctx) => {
    circle(ctx, 0, 0, 12, { fill: '#3a1a2a', stroke: '#8a2a4a', lineWidth: 2.6 });
    ctx.save();
    ctx.strokeStyle = '#ff4a6a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + ((i * 2) % 5) / 5 * TAU;
      const x = Math.cos(a) * 9;
      const y = Math.sin(a) * 9;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  },
  halo: (ctx) => {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = PAL.itemGold;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, -4, 14, 5, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
    upArrow(ctx, PAL.itemGold, 0, 3, 0.8);
  },
  crown: (ctx) => {
    inkShape(ctx, (c) => {
      c.moveTo(-14, 8); c.lineTo(-14, -6); c.lineTo(-7, 0); c.lineTo(0, -12);
      c.lineTo(7, 0); c.lineTo(14, -6); c.lineTo(14, 8); c.closePath();
    }, { fill: PAL.itemGold, lineWidth: 2.8 });
    circle(ctx, -7, -1, 1.6, { fill: '#c02020', stroke: null });
    circle(ctx, 0, -6, 1.8, { fill: '#c02020', stroke: null });
    circle(ctx, 7, -1, 1.6, { fill: '#c02020', stroke: null });
  },
  magic_mushroom: (ctx) => {
    inkShape(ctx, (c) => c.ellipse(0, 6, 8, 9, 0, 0, TAU), { fill: '#f0e0c8', lineWidth: 2.6 });
    inkShape(ctx, (c) => {
      c.moveTo(-15, 0); c.arc(0, 0, 15, Math.PI, 0, false); c.closePath();
    }, { fill: '#d04040', lineWidth: 2.8 });
    circle(ctx, -7, -5, 3.4, { fill: '#ffffff', stroke: null });
    circle(ctx, 6, -6, 3, { fill: '#ffffff', stroke: null });
    circle(ctx, 0, -10, 2.4, { fill: '#ffffff', stroke: null });
  },
  steven: (ctx) => {
    circle(ctx, 0, 0, 12, { fill: '#8ab06a', stroke: PAL.ink, lineWidth: 2.8 });
    drawEye(ctx, -4.5, -2, 3.6, '#ffffff', '#3a5a20');
    drawEye(ctx, 4.5, -2, 3.6, '#ffffff', '#3a5a20');
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 5, 5, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  },
  deaths_touch: (ctx) => {
    ctx.save();
    ctx.rotate(0.4);
    ctx.strokeStyle = '#8a8a96';
    ctx.lineWidth = 3.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-10, 12); ctx.lineTo(8, -12);
    ctx.stroke();
    // 镰刃
    inkShape(ctx, (c) => {
      c.moveTo(4, -8);
      c.quadraticCurveTo(18, -12, 16, 4);
      c.quadraticCurveTo(12, -4, 4, -8);
      c.closePath();
    }, { fill: '#d8d8e0', lineWidth: 2.2 });
    ctx.restore();
  },
  lord_of_the_pit: (ctx) => {
    for (const side of [-1, 1]) {
      inkShape(ctx, (c) => {
        c.moveTo(side * 2, 0);
        c.quadraticCurveTo(side * 14, -12, side * 18, -2);
        c.quadraticCurveTo(side * 12, 0, side * 10, 6);
        c.quadraticCurveTo(side * 8, -2, side * 2, 0);
        c.closePath();
      }, { fill: '#4a2a4a', lineWidth: 2.4 });
    }
    circle(ctx, 0, 2, 7, { fill: '#6a2a3a', stroke: PAL.ink, lineWidth: 2.6 });
  },
  sacred_heart: (ctx) => {
    ctx.save();
    ctx.globalAlpha = 0.5;
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 20);
    g.addColorStop(0, 'rgba(255,240,200,0.9)');
    g.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, TAU);
    ctx.fill();
    ctx.restore();
    drawHeart(ctx, 0, 0, 26, '#ffd0e8', '#ffffff');
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#ffb0d8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -22); ctx.lineTo(0, -14);
    ctx.moveTo(-5, -18); ctx.lineTo(5, -18);
    ctx.stroke();
    ctx.restore();
  },
  the_mark: (ctx) => {
    circle(ctx, 0, 0, 12, { fill: '#2a1a22', stroke: '#8a2a4a', lineWidth: 2.6 });
    ctx.strokeStyle = '#ff3a4a';
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-7, -7); ctx.lineTo(7, 7);
    ctx.moveTo(7, -7); ctx.lineTo(-7, 7);
    ctx.stroke();
  },

  // ---- 射速类 ----
  number_one: (ctx) => {
    inkShape(ctx, (c) => c.ellipse(0, 4, 12, 8, 0, 0, TAU), { fill: PAL.pickupCoin, lineWidth: 2.6 });
    inkShape(ctx, (c) => c.ellipse(0, -4, 8.5, 6.5, 0, 0, TAU), { fill: PAL.pickupCoin, lineWidth: 2.4 });
    circle(ctx, -3, -4, 1.6, { fill: PAL.ink, stroke: null });
    circle(ctx, 3, -4, 1.6, { fill: PAL.ink, stroke: null });
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  },
  fire_rate_up: (ctx) => {
    // 三连泪滴 + 加速线
    for (let i = 0; i < 3; i++) drop(ctx, -8 + i * 8, 2, 4.2, PAL.tear, PAL.tearHi);
    ctx.strokeStyle = '#ffb03a';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-14, -8); ctx.lineTo(-4, -8);
    ctx.moveTo(-16, -3); ctx.lineTo(-8, -3);
    ctx.stroke();
  },
  squeezy: (ctx) => {
    // 眼药水瓶
    inkShape(ctx, (c) => roundRectPath(c, -7, -4, 14, 16, 3), { fill: '#e0e4ea', lineWidth: 2.6 });
    inkShape(ctx, (c) => roundRectPath(c, -4, -12, 8, 9, 2), { fill: '#b8c0cc', lineWidth: 2.2 });
    drop(ctx, 0, 6, 4, PAL.tear, PAL.tearHi);
  },
  soy_milk: (ctx) => {
    inkShape(ctx, (c) => {
      c.moveTo(-8, -10); c.lineTo(8, -10); c.lineTo(8, 12); c.lineTo(-8, 12); c.closePath();
    }, { fill: '#f4f0e0', lineWidth: 2.6 });
    inkShape(ctx, (c) => {
      c.moveTo(-8, -10); c.lineTo(0, -18); c.lineTo(8, -10); c.closePath();
    }, { fill: '#d8d0b8', lineWidth: 2.4 });
    drop(ctx, 0, 4, 4.5, '#c8d8f0', '#ffffff');
  },
  bloody_lust: (ctx) => {
    drop(ctx, -2, 0, 9, '#b01818', '#ff7a7a');
    ctx.strokeStyle = '#ffb03a';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(10, -6); ctx.lineTo(16, -6);
    ctx.moveTo(9, 0); ctx.lineTo(16, 0);
    ctx.stroke();
  },
  tough_love: (ctx) => {
    // 牙齿
    inkShape(ctx, (c) => {
      c.moveTo(-9, -10); c.lineTo(9, -10);
      c.quadraticCurveTo(11, 4, 0, 14);
      c.quadraticCurveTo(-11, 4, -9, -10);
      c.closePath();
    }, { fill: '#f4eeda', lineWidth: 2.8 });
    ctx.strokeStyle = '#c8c0a8';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.lineTo(0, 10);
    ctx.stroke();
  },
  jesus_juice: (ctx) => {
    inkShape(ctx, (c) => {
      c.moveTo(-8, -8); c.lineTo(8, -8); c.lineTo(6, 12); c.lineTo(-6, 12); c.closePath();
    }, { fill: '#e8d8b0', lineWidth: 2.6 });
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-8, -8); ctx.lineTo(8, -8); ctx.lineTo(6, 12); ctx.lineTo(-6, 12);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = '#c04a6a';
    ctx.fillRect(-9, -2, 18, 16);
    ctx.restore();
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -14); ctx.lineTo(0, -8);
    ctx.stroke();
  },

  // ---- 生命类 ----
  lunch: (ctx) => meatBlob(ctx, '#d08a5a', '#a0603a'),
  breakfast: (ctx) => {
    // 煎蛋 + 培根
    inkShape(ctx, (c) => c.ellipse(-2, 0, 12, 9, 0, 0, TAU), { fill: '#f4f0e0', lineWidth: 2.6 });
    circle(ctx, -2, 0, 4.6, { fill: '#f0b03a', stroke: PAL.ink, lineWidth: 2 });
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#a05030';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(8, -8); ctx.quadraticCurveTo(14, 0, 8, 8);
    ctx.stroke();
    ctx.restore();
  },
  dinner: (ctx) => {
    // 鸡腿
    inkShape(ctx, (c) => c.ellipse(2, 0, 10, 9, 0, 0, TAU), { fill: '#c07840', lineWidth: 2.6 });
    ctx.strokeStyle = '#f0e8d0';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-6, 2); ctx.lineTo(-14, 8);
    ctx.stroke();
    circle(ctx, -14, 8, 3.4, { fill: '#f0e8d0', stroke: PAL.ink, lineWidth: 2 });
  },
  dessert: (ctx) => {
    // 蛋糕
    inkShape(ctx, (c) => roundRectPath(c, -11, -2, 22, 12, 2), { fill: '#e0a0c0', lineWidth: 2.6 });
    inkShape(ctx, (c) => roundRectPath(c, -11, -10, 22, 8, 2), { fill: '#f4d0e0', lineWidth: 2.4 });
    circle(ctx, 0, -13, 2.6, { fill: '#d04040', stroke: PAL.ink, lineWidth: 1.6 });
  },
  blood_bag: (ctx) => {
    inkShape(ctx, (c) => {
      c.moveTo(-8, -10); c.quadraticCurveTo(-12, 6, -6, 12);
      c.lineTo(6, 12); c.quadraticCurveTo(12, 6, 8, -10);
      c.closePath();
    }, { fill: '#c8d0d8', lineWidth: 2.6 });
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-8, -10); ctx.quadraticCurveTo(-12, 6, -6, 12);
    ctx.lineTo(6, 12); ctx.quadraticCurveTo(12, 6, 8, -10);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = '#b01818';
    ctx.fillRect(-14, -2, 28, 16);
    ctx.restore();
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.lineTo(0, -16);
    ctx.stroke();
  },
  less_than_three: (ctx) => {
    drawHeart(ctx, 0, 0, 28, '#d0405a', '#ff9ab0');
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px "Trebuchet MS",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('3', 0, 3);
    ctx.restore();
  },
  moms_pearls: (ctx) => {
    ctx.strokeStyle = '#c8b090';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, -2, 10, Math.PI * 0.1, Math.PI * 0.9, false);
    ctx.stroke();
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI * 0.1 + (i / 6) * Math.PI * 0.8;
      circle(ctx, Math.cos(a) * 10, -2 + Math.sin(a) * 10, 2.6, { fill: '#f0ecf4', stroke: '#b0a8c0', lineWidth: 1.2 });
    }
  },
  old_bandage: (ctx) => {
    inkShape(ctx, (c) => roundRectPath(c, -12, -5, 24, 10, 4), { fill: '#e8dcc0', lineWidth: 2.6 });
    ctx.strokeStyle = '#c8b898';
    ctx.lineWidth = 1.4;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 5, -5); ctx.lineTo(i * 5, 5);
      ctx.stroke();
    }
    ctx.fillStyle = '#b01818';
    ctx.beginPath();
    ctx.ellipse(-3, 0, 3, 2.4, 0, 0, TAU);
    ctx.fill();
  },
  raw_liver: (ctx) => {
    inkShape(ctx, (c) => {
      c.moveTo(-12, -4);
      c.bezierCurveTo(-6, -14, 10, -12, 12, -2);
      c.bezierCurveTo(14, 8, 0, 12, -8, 8);
      c.bezierCurveTo(-14, 5, -14, 0, -12, -4);
      c.closePath();
    }, { fill: '#8a3020', lineWidth: 2.8 });
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#c06050';
    ctx.beginPath();
    ctx.ellipse(-3, -4, 5, 3, -0.3, 0, TAU);
    ctx.fill();
    ctx.restore();
  },
  bucket_of_lard: (ctx) => {
    inkShape(ctx, (c) => {
      c.moveTo(-10, -8); c.lineTo(10, -8); c.lineTo(8, 12); c.lineTo(-8, 12); c.closePath();
    }, { fill: '#c8c0a8', lineWidth: 2.6 });
    ctx.strokeStyle = '#a09880';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-10, -2); ctx.lineTo(10, -2);
    ctx.stroke();
    inkShape(ctx, (c) => c.ellipse(0, -8, 10, 3.4, 0, 0, TAU), { fill: '#f0ecd8', lineWidth: 2.2 });
  },
  rosary: (ctx) => {
    ctx.strokeStyle = '#c8b090';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, -3, 10, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      circle(ctx, Math.cos(a) * 10, -3 + Math.sin(a) * 10, 1.8, { fill: '#8a6a3a', stroke: null });
    }
    ctx.strokeStyle = '#e0c890';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(0, 7); ctx.lineTo(0, 15);
    ctx.moveTo(-4, 10); ctx.lineTo(4, 10);
    ctx.stroke();
  },
  cube_of_meat: (ctx) => {
    inkShape(ctx, (c) => roundRectPath(c, -10, -10, 20, 20, 3), { fill: '#c06a6a', lineWidth: 2.8 });
    ctx.strokeStyle = '#8a3a3a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-10, 0); ctx.lineTo(10, 0);
    ctx.moveTo(0, -10); ctx.lineTo(0, 10);
    ctx.stroke();
    circle(ctx, -4, -4, 2.4, { fill: '#f0d0d0', stroke: null });
  },

  // ---- 移速类 ----
  speed_up: (ctx) => {
    ctx.strokeStyle = PAL.itemBlue;
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-12 + i * 5, -8 + i * 8);
      ctx.lineTo(2 + i * 5, -8 + i * 8);
      ctx.stroke();
    }
    inkShape(ctx, (c) => { c.moveTo(4, -8); c.lineTo(15, 0); c.lineTo(4, 8); c.closePath(); }, { fill: PAL.itemBlue, lineWidth: 2.4 });
  },
  wings: (ctx) => {
    for (const side of [-1, 1]) {
      inkShape(ctx, (c) => {
        c.moveTo(side * 2, 0);
        c.quadraticCurveTo(side * 14, -12, side * 18, -2);
        c.quadraticCurveTo(side * 12, 0, side * 10, 6);
        c.quadraticCurveTo(side * 8, -2, side * 2, 0);
        c.closePath();
      }, { fill: '#f2ecd6', lineWidth: 2.4 });
    }
    circle(ctx, 0, 1, 5.4, { fill: '#e8c9a0', stroke: PAL.ink, lineWidth: 2.2 });
  },
  the_belt: (ctx) => {
    inkShape(ctx, (c) => roundRectPath(c, -14, -5, 28, 10, 2), { fill: '#5a3a24', lineWidth: 2.6 });
    inkShape(ctx, (c) => roundRectPath(c, -5, -7, 10, 14, 2), { fill: PAL.itemGold, lineWidth: 2.4 });
    circle(ctx, 0, 0, 2, { fill: PAL.ink, stroke: null });
  },
  speed_ball: (ctx) => {
    circle(ctx, 0, 0, 11, { fill: PAL.itemBlue, stroke: PAL.ink, lineWidth: 2.6 });
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-3.4, -4, 3, 2, -0.5, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#c8e8ff';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-16, -6); ctx.lineTo(-12, -6);
    ctx.moveTo(-18, 0); ctx.lineTo(-13, 0);
    ctx.stroke();
  },
  thunder_thighs: (ctx) => {
    inkShape(ctx, (c) => {
      c.moveTo(-6, -12); c.lineTo(6, -12); c.lineTo(4, 4); c.lineTo(8, 4); c.lineTo(2, 14); c.lineTo(-4, 14); c.lineTo(-2, 2); c.lineTo(-6, 2); c.closePath();
    }, { fill: '#f0d040', lineWidth: 2.6 });
  },

  // ---- 射程 / 弹速类 ----
  range_up: (ctx) => {
    for (let i = 0; i < 3; i++) circle(ctx, 0, 0, 4 + i * 4.5, { fill: null, stroke: PAL.itemPurple, lineWidth: 2.4 });
    circle(ctx, 0, 0, 3, { fill: PAL.itemPurple, stroke: PAL.ink, lineWidth: 2 });
  },
  moms_underwear: (ctx) => {
    inkShape(ctx, (c) => {
      c.moveTo(-12, -6); c.lineTo(12, -6); c.lineTo(10, 6);
      c.quadraticCurveTo(0, 12, -10, 6); c.closePath();
    }, { fill: '#f0e0d0', lineWidth: 2.6 });
    ctx.strokeStyle = '#d0b8a0';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-12, -6); ctx.lineTo(12, -6);
    ctx.stroke();
  },
  the_peeper: (ctx) => {
    inkShape(ctx, (c) => {
      c.moveTo(-10, 10); c.lineTo(-10, -2); c.lineTo(10, -2); c.lineTo(10, 10); c.closePath();
    }, { fill: '#a8b8c0', lineWidth: 2.6 });
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#8ab0c0';
    ctx.fillRect(-9, 0, 18, 10);
    ctx.restore();
    drawEye(ctx, 0, -2, 7, '#ffffff', '#3a6a3a');
  },
  growth_hormones: (ctx) => {
    ctx.save();
    ctx.rotate(-Math.PI / 4);
    inkShape(ctx, (c) => roundRectPath(c, -3, -12, 6, 16, 1), { fill: '#e0e4ea', lineWidth: 2.2 });
    inkShape(ctx, (c) => roundRectPath(c, -2, 4, 4, 10, 1), { fill: '#b8c0cc', lineWidth: 2 });
    ctx.fillStyle = '#8ad040';
    ctx.fillRect(-2.4, -10, 4.8, 10);
    ctx.restore();
  },
  lard: (ctx) => {
    inkShape(ctx, (c) => roundRectPath(c, -12, -8, 24, 16, 3), { fill: '#f0ecd8', lineWidth: 2.6 });
    ctx.strokeStyle = '#c8c0a8';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-12, 0); ctx.lineTo(12, 0);
    ctx.stroke();
    ctx.fillStyle = '#a09880';
    ctx.font = 'bold 8px "Trebuchet MS",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LARD', 0, 5);
  },
  lil_gurdy: (ctx) => {
    inkShape(ctx, (c) => c.ellipse(0, 3, 12, 9, 0, 0, TAU), { fill: '#c8a860', lineWidth: 2.6 });
    inkShape(ctx, (c) => c.ellipse(0, -7, 7, 6, 0, 0, TAU), { fill: '#d8b878', lineWidth: 2.2 });
    drawEye(ctx, -3, -8, 2.4, '#ffffff', '#3a2a10');
    drawEye(ctx, 3, -8, 2.4, '#ffffff', '#3a2a10');
    circle(ctx, 0, 5, 2.6, { fill: '#3a2410', stroke: null });
  },
};

/**
 * 宝箱（关闭 / 打开 / 已使用）
 * @param {number} state 0=关闭 1=打开中 2=已空
 */
export function drawChest(ctx, x, y, state = 0, t = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, 20, 24, 8, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  const bodyGrad = ctx.createLinearGradient(0, 0, 0, 20);
  bodyGrad.addColorStop(0, PAL.chestWoodHi);
  bodyGrad.addColorStop(1, PAL.chestWood);
  inkShape(ctx, (c) => roundRectPath(c, -22, -2, 44, 22, 4), { fill: bodyGrad, lineWidth: 3 });
  ctx.strokeStyle = 'rgba(60,30,10,0.5)';
  ctx.lineWidth = 1.6;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 13, 0);
    ctx.lineTo(i * 13, 19);
    ctx.stroke();
  }

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
  ctx.strokeStyle = PAL.chestGold;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-22, -5);
  ctx.quadraticCurveTo(0, -16, 22, -5);
  ctx.stroke();
  ctx.restore();

  inkShape(ctx, (c) => roundRectPath(c, -6, -1, 12, 11, 2), { fill: PAL.chestGold, lineWidth: 2.4 });
  circle(ctx, 0, 4, 2, { fill: PAL.ink, stroke: null });

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

  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = PAL.itemGold;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.ellipse(0, 18 - bob, 15, 5.5, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();

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
