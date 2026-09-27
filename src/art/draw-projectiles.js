/**
 * draw-projectiles.js — 子弹 / 激光 / 飞刀 / 爆炸 的绘制
 *
 * 「攻击方式改变外观」的核心：每种泪弹变体（tear kind）有独立绘制函数。
 *   tear      普通眼泪（半透明蓝水滴 + 高光）
 *   brimstone 血腥光束（粗红射线 + 白色核心 + 粒子）
 *   ipecac    绿色抛物爆弹（带拖尾，落地爆炸）
 *   knife     飞刀（旋转金属刀身）
 *   tech      科技激光（细白射线 + 红点）
 *   spectral  幽灵泪（紫白 + 拖尾）
 */

import { PAL } from './palette.js';
import { circle, ellipse, inkShape, roundRectPath } from './primitives.js';
import { TAU } from '../core/math.js';

/**
 * 普通眼泪
 * @param {object} v {r, hue 用于染色变体, t}
 */
export function drawTear(ctx, v = {}) {
  const r = v.r || 6;
  const base = v.color || PAL.tear;
  const hi = v.hiColor || PAL.tearHi;
  const t = v.t || 0;
  // 水滴形：圆 + 上方尖尾（拉伸感）
  const stretch = v.stretch || 0;
  ctx.save();
  ctx.rotate(v.angle || 0);
  // 拖尾
  if (stretch > 0.05) {
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.ellipse(-r * (1 + stretch * 2.4), 0, r * (1 + stretch * 1.6), r * 0.72, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  // 主体（带描边的半透明泪滴）
  ctx.save();
  ctx.shadowColor = base;
  ctx.shadowBlur = 7;
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.1);
  g.addColorStop(0, hi);
  g.addColorStop(0.55, base);
  g.addColorStop(1, shadeHex(base, -0.25));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.9, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  // 描边
  ctx.strokeStyle = 'rgba(26,13,13,0.72)';
  ctx.lineWidth = Math.max(1.2, r * 0.28);
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.9, 0, 0, TAU);
  ctx.stroke();
  // 高光
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.32, -r * 0.34, r * 0.3, r * 0.22, -0.5, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * Brimstone 血腥光束：从起始点到终点的一条粗射线。
 * @param {object} v {x1,y1,x2,y2, width, t, life}
 */
export function drawBeam(ctx, v) {
  const w = v.width || 16;
  const t = v.t || 0;
  const flick = 0.88 + Math.sin(t * 42) * 0.12;
  const ww = w * flick;
  const ang = Math.atan2(v.y2 - v.y1, v.x2 - v.x1);

  ctx.save();
  // 外层光晕
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = PAL.brimstoneGlow;
  ctx.lineWidth = ww * 2.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(v.x1, v.y1);
  ctx.lineTo(v.x2, v.y2);
  ctx.stroke();

  // 主束
  ctx.globalAlpha = 0.92;
  const g = ctx.createLinearGradient(v.x1, v.y1, v.x2, v.y2);
  g.addColorStop(0, '#ff5a3d');
  g.addColorStop(0.25, PAL.brimstoneBeam);
  g.addColorStop(1, '#8a0a0a');
  ctx.strokeStyle = g;
  ctx.lineWidth = ww;
  ctx.beginPath();
  ctx.moveTo(v.x1, v.y1);
  ctx.lineTo(v.x2, v.y2);
  ctx.stroke();

  // 白色核心
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = '#fff0e6';
  ctx.lineWidth = ww * 0.34;
  ctx.beginPath();
  ctx.moveTo(v.x1, v.y1);
  ctx.lineTo(v.x2, v.y2);
  ctx.stroke();

  // 枪口闪光 + 溅射
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = PAL.brimstoneGlow;
  for (let i = 0; i < 4; i++) {
    const p = i / 4;
    const px = v.x1 + (v.x2 - v.x1) * (0.15 + p * 0.85);
    const py = v.y1 + (v.y2 - v.y1) * (0.15 + p * 0.85);
    const off = (Math.sin(t * 30 + i * 2.3) * ww * 0.6);
    ctx.beginPath();
    ctx.arc(px + Math.cos(ang + Math.PI / 2) * off, py + Math.sin(ang + Math.PI / 2) * off, ww * 0.18, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Tech 科技激光：细白射线 + 红色光点 */
export function drawTechBeam(ctx, v) {
  const w = v.width || 7;
  const t = v.t || 0;
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = PAL.techGlow;
  ctx.lineWidth = w * 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(v.x1, v.y1);
  ctx.lineTo(v.x2, v.y2);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.strokeStyle = PAL.techBeam;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(v.x1, v.y1);
  ctx.lineTo(v.x2, v.y2);
  ctx.stroke();

  ctx.strokeStyle = PAL.techGlow;
  ctx.lineWidth = w * 0.36;
  ctx.beginPath();
  ctx.moveTo(v.x1, v.y1);
  ctx.lineTo(v.x2, v.y2);
  ctx.stroke();

  // 沿途红点（能量节点）
  ctx.fillStyle = PAL.techGlow;
  for (let i = 1; i <= 5; i++) {
    const p = i / 5;
    const px = v.x1 + (v.x2 - v.x1) * p;
    const py = v.y1 + (v.y2 - v.y1) * p;
    const rr = 2.2 + Math.sin(t * 20 + i) * 0.8;
    ctx.beginPath();
    ctx.arc(px, py, rr, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Ipecac 抛物爆弹（绿色粘液球） */
export function drawIpecac(ctx, v = {}) {
  const r = v.r || 8;
  const t = v.t || 0;
  ctx.save();
  ctx.rotate((v.spin || 0));
  // 拖尾
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#7ac04a';
  ctx.beginPath();
  ctx.ellipse(-r * 2, 0, r * 1.8, r * 0.7, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  // 主体
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.15, 0, 0, r * 1.1);
  g.addColorStop(0, '#d4f09a');
  g.addColorStop(0.5, '#8fc84a');
  g.addColorStop(1, '#4a7a1e');
  circle(ctx, 0, 0, r, { fill: g, stroke: PAL.ink, lineWidth: 2.6 });
  // 粘液高光 + 气泡
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.35, r * 0.28, r * 0.2, -0.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,230,120,0.8)';
  ctx.beginPath();
  ctx.arc(r * 0.35, r * 0.3, r * 0.16, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Mom's Knife 飞刀 */
export function drawKnife(ctx, v = {}) {
  const len = v.len || 26;
  ctx.save();
  ctx.rotate(v.angle || 0);
  // 拖尾
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#d7d7dc';
  ctx.beginPath();
  ctx.moveTo(-len * 0.6, -3);
  ctx.lineTo(-len * 1.15, 0);
  ctx.lineTo(-len * 0.6, 3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 刀身（带描边的菱形）
  inkShape(ctx, (c) => {
    c.moveTo(len, 0);
    c.lineTo(len * 0.18, -6);
    c.lineTo(-len * 0.42, -5);
    c.lineTo(-len * 0.42, 5);
    c.lineTo(len * 0.18, 6);
    c.closePath();
  }, { fill: PAL.knife, lineWidth: 2.6 });
  // 刀锋高光
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = PAL.knifeEdge;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(len * 0.92, 0);
  ctx.lineTo(len * 0.18, -3.4);
  ctx.stroke();
  ctx.restore();
  // 护手
  inkShape(ctx, (c) => roundRectPath(c, -len * 0.52, -8, 5, 16, 2), { fill: '#8a8172', lineWidth: 2.2 });
  // 握柄
  inkShape(ctx, (c) => roundRectPath(c, -len * 0.68, -3.4, 7, 6.8, 2), { fill: '#5a3a24', lineWidth: 2.2 });
  ctx.restore();
}

/** 爆炸（橙黄火焰 + 白核 + 冲击环） */
export function drawExplosion(ctx, v = {}) {
  const p = v.p === undefined ? 0 : v.p; // 0..1
  const R = v.r || 40;
  const e = 1 - p;
  ctx.save();
  ctx.globalAlpha = Math.min(1, e * 1.4);
  const g = ctx.createRadialGradient(0, 0, 1, 0, 0, R * (0.35 + p * 0.75));
  g.addColorStop(0, '#fffbe6');
  g.addColorStop(0.3, '#ffd24a');
  g.addColorStop(0.62, '#ff7a1e');
  g.addColorStop(1, 'rgba(180,40,10,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, R * (0.35 + p * 0.75), 0, TAU);
  ctx.fill();

  // 冲击环
  ctx.globalAlpha = e * 0.8;
  ctx.strokeStyle = '#ffe9a3';
  ctx.lineWidth = 4 * e + 1;
  ctx.beginPath();
  ctx.arc(0, 0, R * (0.3 + p * 0.9), 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** 通用粒子（血/火花/骨屑） */
export function drawParticle(ctx, v = {}) {
  const r = v.r || 3;
  ctx.save();
  ctx.globalAlpha = Math.max(0, v.alpha === undefined ? 1 : v.alpha);
  ctx.fillStyle = v.color || PAL.gaperBlood;
  if (v.spark) {
    ctx.shadowColor = v.color;
    ctx.shadowBlur = 6;
  }
  ctx.beginPath();
  if (v.square) {
    ctx.rect(-r, -r, r * 2, r * 2);
  } else {
    ctx.ellipse(0, 0, r, r * (v.squash || 1), 0, 0, TAU);
  }
  ctx.fill();
  ctx.restore();
}

/** 泪弹的染色变体表 */
export const TEAR_VARIANTS = {
  tear: { color: PAL.tear, hiColor: PAL.tearHi },
  blood: { color: PAL.bloodShot, hiColor: '#ffb0b0' },
  spectral: { color: '#c9a6ff', hiColor: '#f0e6ff' },
  poison: { color: '#8fc84a', hiColor: '#dcf5a0' },
};

function shadeHex(hex, amount) {
  if (!hex.startsWith('#')) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + amount))));
  return `#${((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1)}`;
}
