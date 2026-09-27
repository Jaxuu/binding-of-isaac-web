/**
 * draw-enemies.js — 普通敌人绘制
 *
 * 三种敌人（对应原作）：
 *   Gaper   —— 无头追尸：躯干 + 巨大的血盆大口（在胸口），迈步追赶玩家，接触伤害
 *   Pooter  —— 飞行吐弹怪：米白圆身 + 一对小翅膀 + 单只红眼，悬空游荡并发射直线弹
 *   Horf    —— 静止炮台怪：半埋在墙上的肉块，中间一个黑洞，周期吐弹
 *
 * 所有绘制以「实体中心」为原点，函数内部不做 ctx.translate 之外的叠加变换，
 * 由调用方负责 translate 到世界坐标 / 处理精灵表切片。
 */

import { PAL } from './palette.js';
import { circle, ellipse, inkShape, groundShadow, radialHighlight, blob } from './primitives.js';
import { TAU } from '../core/math.js';

// 预生成固定的 jitter 表（确定性，避免每帧形状抖动）
// 用固定数值而非 Rng，保证不同实例外观一致（原作同类敌人外观统一）
const GAPER_JITTER = [0.06, -0.04, 0.03, -0.05, 0.05, -0.03, 0.04, -0.06, 0.02, -0.04, 0.05, -0.02];
const POOTER_JITTER = [0.05, -0.03, 0.04, -0.05, 0.03, -0.04, 0.05, -0.02, 0.04, -0.05, 0.03, -0.03];

/**
 * Gaper —— 无头追尸
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} v {t: 全局时间, phase: 动画相位, facing: 朝向弧度, hurt: 受伤闪白, dead: 死亡进度0..1}
 */
export function drawGaper(ctx, v = {}) {
  const t = v.t || 0;
  const facing = v.facing || Math.PI * 0.5;
  // 走路上下颠簸 + 左右摇摆
  const walk = Math.sin(t * 9 + (v.phase || 0));
  const bob = Math.abs(walk) * 2.6;
  const lean = walk * 0.12;

  if (v.dead) {
    drawGaperDeath(ctx, v.dead, facing);
    return;
  }

  groundShadow(ctx, 0, 16, 14, 6, 0.34);

  ctx.save();
  ctx.translate(0, -bob);
  ctx.rotate(lean * Math.cos(facing));

  // ---- 双腿（两根粗细不均的肉柱 + 圆脚）----
  const legSwing = walk * 3;
  for (const side of [-1, 1]) {
    const lx = side * 5.5;
    const swing = side * legSwing;
    inkShape(ctx, (c) => {
      c.moveTo(lx - 3.4, 2);
      c.quadraticCurveTo(lx - 3.4 + swing * 0.4, 8, lx - 3 + swing * 0.9, 13);
      c.lineTo(lx + 3.4 + swing * 0.9, 13);
      c.quadraticCurveTo(lx + 3.4 + swing * 0.4, 8, lx + 3.4, 2);
      c.closePath();
    }, { fill: PAL.gaperFleshShade, lineWidth: 2.6 });
    ellipse(ctx, lx + swing * 0.9, 13.5, 4.6, 2.8, { fill: PAL.gaperFlesh, lineWidth: 2.6 });
  }

  // ---- 躯干（肉色不规则团）----
  const bodyGrad = radialHighlight(ctx, 0, 0, 15, PAL.gaperFlesh, PAL.gaperFleshShade, -0.35, -0.4);
  blob(ctx, 0, -1, 14.5, GAPER_JITTER, { fill: bodyGrad, lineWidth: 3, squashY: 1.05 });

  // ---- 胸口巨口（原作 Gaper 的标志：无头，嘴长在躯干上）----
  drawGaperMouth(ctx, -1, 0, t, facing);

  // ---- 两只手臂（前伸抓握）----
  const reach = 1 + Math.sin(t * 9 + (v.phase || 0)) * 0.08;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 13 * reach, -2);
    ctx.rotate(side * (0.5 + walk * 0.18));
    inkShape(ctx, (c) => {
      c.moveTo(0, -3);
      c.quadraticCurveTo(side * 6, 2, side * 9, 7);
      c.lineTo(side * 4, 9);
      c.quadraticCurveTo(side * 2, 4, 0, 3);
      c.closePath();
    }, { fill: PAL.gaperFlesh, lineWidth: 2.6 });
    // 手指
    circle(ctx, side * 9.5, 7.5, 2.4, { fill: PAL.gaperFlesh, lineWidth: 2 });
    ctx.restore();
  }

  // ---- 受伤闪白 ----
  if (v.hurt > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = Math.min(0.8, v.hurt);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-26, -26, 52, 46);
    ctx.restore();
  }

  ctx.restore();
}

/** Gaper 的血盆大口（含牙龈、牙齿、深喉） */
function drawGaperMouth(ctx, x, y, t, facing) {
  const open = 0.5 + Math.abs(Math.sin(t * 6)) * 0.5; // 0.5..1 呼吸般张合
  const rx = 9.5;
  const ry = 7.2 * open;

  // 喉腔（深色）
  inkShape(ctx, (c) => c.ellipse(x, y + 1, rx, ry, 0, 0, TAU), {
    fill: PAL.gaperMouth, lineWidth: 3,
  });

  // 牙龈（上下的暗红弧）
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y + 1, rx, ry, 0, 0, TAU);
  ctx.clip();
  ctx.fillStyle = PAL.gaperBlood;
  ctx.fillRect(x - rx, y - ry - 2, rx * 2, 3.2);
  ctx.fillRect(x - rx, y + ry - 1.2, rx * 2, 3.2);
  ctx.restore();

  // 牙齿（上下交错的小三角）
  ctx.save();
  ctx.fillStyle = '#f2ecd8';
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 5; i++) {
    const px = x - rx + 1.6 + i * ((rx * 2 - 3.2) / 4);
    ctx.beginPath();
    ctx.moveTo(px - 1.7, y + 1 - ry + 0.5);
    ctx.lineTo(px + 1.7, y + 1 - ry + 0.5);
    ctx.lineTo(px, y + 1 - ry + 3.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px - 1.7, y + 1 + ry - 0.5);
    ctx.lineTo(px + 1.7, y + 1 + ry - 0.5);
    ctx.lineTo(px, y + 1 + ry - 3.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // 口水（偶尔滴落）
  ctx.save();
  ctx.globalAlpha = 0.65;
  ctx.strokeStyle = '#e06060';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x + rx * 0.4, y + ry + 1);
  ctx.lineTo(x + rx * 0.4, y + ry + 3 + Math.sin(t * 2) * 1.5);
  ctx.stroke();
  ctx.restore();
}

/** Gaper 死亡：躯体塌陷 + 血花上涌 */
function drawGaperDeath(ctx, p, facing) {
  const e = 1 - p; // 1 → 0
  const rise = p * 6;
  groundShadow(ctx, 0, 16, 14 * e + 4, (6 * e + 2), 0.3 * e);
  ctx.save();
  ctx.globalAlpha = Math.min(1, e * 1.6);
  ctx.translate(0, -rise);
  ctx.scale(1 + (1 - e) * 0.35, Math.max(0.06, e));
  blob(ctx, 0, 0, 14, GAPER_JITTER, { fill: PAL.gaperFleshShade, lineWidth: 3, squashY: 1.05 });
  ctx.restore();

  // 血花
  ctx.save();
  ctx.globalAlpha = Math.min(0.9, e);
  ctx.fillStyle = PAL.gaperBlood;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.6;
    const d = 6 + p * 20;
    const r = (2.6 + i % 3) * e;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d * 0.6 - p * 8, Math.max(0.5, r), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Pooter —— 飞行吐弹怪
 * @param {object} v {t, phase, hurt, dead, shotFlash}
 */
export function drawPooter(ctx, v = {}) {
  const t = v.t || 0;
  if (v.dead) {
    drawPopDeath(ctx, v.dead, PAL.pooterBody);
    return;
  }
  const hover = Math.sin(t * 3.4 + (v.phase || 0)) * 2.6;
  groundShadow(ctx, 0, 15 - hover, 12, 5, 0.24);

  ctx.save();
  ctx.translate(0, hover);

  // ---- 翅膀（快速振翅）----
  const flap = Math.sin(t * 26 + (v.phase || 0));
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 10, -4);
    ctx.rotate(side * (0.35 + flap * 0.5));
    inkShape(ctx, (c) => {
      c.moveTo(0, 0);
      c.quadraticCurveTo(side * 12, -9, side * 15, -1);
      c.quadraticCurveTo(side * 9, 2, side * 4, 5);
      c.closePath();
    }, { fill: PAL.pooterWing, lineWidth: 2.4 });
    ctx.restore();
  }

  // ---- 身体（米白不规则圆）----
  const bodyGrad = radialHighlight(ctx, 0, 0, 13, PAL.pooterBody, PAL.pooterShade, -0.34, -0.4);
  blob(ctx, 0, 0, 12.5, POOTER_JITTER, { fill: bodyGrad, lineWidth: 3 });

  // 下腹的小褶皱（阴影弧）
  ctx.save();
  ctx.strokeStyle = 'rgba(120,105,80,0.55)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 1, 8, 0.35 * Math.PI, 0.65 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 2, 5, 0.4 * Math.PI, 0.6 * Math.PI);
  ctx.stroke();
  ctx.restore();

  // ---- 单只大红眼 ----
  const eyeR = 5.2;
  circle(ctx, 0.5, -1.5, eyeR, { fill: '#ffffff', stroke: PAL.ink, lineWidth: 2.4 });
  circle(ctx, 0.5, -1.5, eyeR * 0.72, { fill: PAL.pooterEye, stroke: null });
  circle(ctx, 0.5, -1.5, eyeR * 0.4, { fill: '#5a0a0a', stroke: null });
  circle(ctx, -0.9, -3, 1.5, { fill: '#ffdede', stroke: null });

  // ---- 嘴（下方小洞，吐弹前发光）----
  const mouthOpen = v.shotFlash ? 4.6 : 2.6;
  inkShape(ctx, (c) => c.ellipse(0, 7.5, 3.4, mouthOpen * 0.7, 0, 0, TAU), {
    fill: PAL.pooterInner, lineWidth: 2.2,
  });
  if (v.shotFlash > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.9, v.shotFlash);
    ctx.shadowColor = PAL.tear;
    ctx.shadowBlur = 10;
    circle(ctx, 0, 7.5, 3, { fill: PAL.tear, stroke: null });
    ctx.restore();
  }

  if (v.hurt > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = Math.min(0.85, v.hurt);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-24, -24, 48, 44);
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Horf —— 静止炮台怪
 * @param {object} v {t, phase, hurt, dead, charge}  charge: 0..1 吐弹前摇
 */
export function drawHorf(ctx, v = {}) {
  const t = v.t || 0;
  if (v.dead) {
    drawPopDeath(ctx, v.dead, PAL.horfBody);
    return;
  }
  // 半埋在地里：底部不画投影，而是画一圈「泥土覆盖」
  ctx.save();
  const breathe = 1 + Math.sin(t * 2.6 + (v.phase || 0)) * 0.025;
  ctx.scale(breathe, breathe);

  // ---- 主体：上宽下窄的肉块（像从地里长出来）----
  const grad = radialHighlight(ctx, 2, -4, 18, PAL.horfBody, PAL.horfShade, -0.3, -0.38);
  inkShape(ctx, (c) => {
    c.moveTo(-16, 6);
    c.quadraticCurveTo(-17, -8, -8, -14);
    c.quadraticCurveTo(0, -17.5, 8, -14);
    c.quadraticCurveTo(17, -8, 16, 6);
    c.quadraticCurveTo(8, 11, 0, 11);
    c.quadraticCurveTo(-8, 11, -16, 6);
    c.closePath();
  }, { fill: grad, lineWidth: 3 });

  // 表面肉褶
  ctx.save();
  ctx.strokeStyle = 'rgba(110,80,50,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-10, -8);
  ctx.quadraticCurveTo(-6, -3, -9, 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(10, -9);
  ctx.quadraticCurveTo(7, -3, 10, 3);
  ctx.stroke();
  ctx.restore();

  // ---- 中央黑洞（炮口）----
  const charge = v.charge || 0;
  const holeR = 7 + charge * 1.8;
  const holeGrad = ctx.createRadialGradient(0, -3, 1, 0, -3, holeR + 2);
  holeGrad.addColorStop(0, '#000000');
  holeGrad.addColorStop(0.7, PAL.horfHole);
  holeGrad.addColorStop(1, '#5a3a24');
  inkShape(ctx, (c) => c.ellipse(0, -3, holeR, holeR * 0.86, 0, 0, TAU), {
    fill: holeGrad, lineWidth: 3,
  });
  // 洞内缘的牙龈色
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, -3, holeR, holeR * 0.86, 0, 0, TAU);
  ctx.strokeStyle = PAL.horfMouth;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // 前摇发光
  if (charge > 0.01) {
    ctx.save();
    ctx.globalAlpha = charge * 0.9;
    ctx.shadowColor = PAL.tear;
    ctx.shadowBlur = 14 * charge;
    circle(ctx, 0, -3, 3.2 * charge + 1, { fill: PAL.tearHi, stroke: null });
    ctx.restore();
  }

  // ---- 底部被泥土/地面遮住的分界 ----
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = PAL.floorCrack;
  ctx.beginPath();
  ctx.ellipse(0, 8, 17, 4, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  if (v.hurt > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = Math.min(0.85, v.hurt);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-22, -22, 44, 38);
    ctx.restore();
  }

  ctx.restore();
}

/** 通用「爆浆」死亡：收缩 + 血肉四溅 */
function drawPopDeath(ctx, p, baseColor) {
  const e = 1 - p;
  ctx.save();
  ctx.globalAlpha = Math.min(1, e * 1.7);
  ctx.scale(e * 1.15 + 0.05, e * 1.15 + 0.05);
  blob(ctx, 0, 0, 12, POOTER_JITTER, { fill: baseColor, lineWidth: 3 });
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = Math.min(0.95, e);
  ctx.fillStyle = PAL.gaperBlood;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.3;
    const d = 4 + p * 26;
    const r = Math.max(0.4, (3 - (i % 3)) * e);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}
