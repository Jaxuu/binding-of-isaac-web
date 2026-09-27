/**
 * draw-enemies.js — 普通敌人绘制（19 种）
 *
 * 统一入口：drawEnemy(ctx, type, v)
 *   v = { t, phase, facing, hurt, dead, shotFlash, charge, risen, hopZ }
 *
 * 每个敌人以「实体中心」为原点绘制；由调用方 translate 到世界坐标。
 * 所有形状走 art/primitives.js 的「先描边后填充」笔法，保持暗黑卡通统一风格。
 */

import { PAL } from './palette.js';
import { circle, ellipse, inkShape, groundShadow, radialHighlight, blob } from './primitives.js';
import { TAU } from '../core/math.js';

// 预生成固定的 jitter 表（确定性，避免每帧形状抖动）
const GAPER_JITTER = [0.06, -0.04, 0.03, -0.05, 0.05, -0.03, 0.04, -0.06, 0.02, -0.04, 0.05, -0.02];
const POOTER_JITTER = [0.05, -0.03, 0.04, -0.05, 0.03, -0.04, 0.05, -0.02, 0.04, -0.05, 0.03, -0.03];
const BLOB_JITTER = [0.08, -0.05, 0.06, -0.07, 0.05, -0.06, 0.07, -0.04, 0.06, -0.07, 0.04, -0.05];

/** 统一分派 */
export function drawEnemy(ctx, type, v = {}) {
  switch (type) {
    case 'pooter': return drawPooter(ctx, v);
    case 'horf': return drawHorf(ctx, v);
    case 'attackFly': return drawAttackFly(ctx, v);
    case 'boomFly': return drawBoomFly(ctx, v);
    case 'charger': return drawCharger(ctx, v);
    case 'clotty': return drawClotty(ctx, v);
    case 'mulligan': return drawMulligan(ctx, v);
    case 'hopper': return drawHopper(ctx, v);
    case 'trite': return drawTrite(ctx, v);
    case 'host': return drawHost(ctx, v);
    case 'vis': return drawVis(ctx, v);
    case 'maw': return drawMaw(ctx, v);
    case 'globin': return drawGlobin(ctx, v);
    case 'mulliboom': return drawMulliboom(ctx, v);
    case 'maggot': return drawMaggot(ctx, v);
    case 'spitty': return drawSpitty(ctx, v);
    case 'sucker': return drawSucker(ctx, v);
    case 'bone': return drawBone(ctx, v);
    case 'gaper':
    default: return drawGaper(ctx, v);
  }
}

/** 受伤闪白（统一尺寸） */
function flash(ctx, v, w, h) {
  if (!(v.hurt > 0.01)) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = Math.min(0.85, v.hurt);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-w, -h, w * 2, h * 2);
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

/** 通用小眼球 */
function miniEye(ctx, x, y, r, iris, pupil) {
  circle(ctx, x, y, r, { fill: '#ffffff', stroke: PAL.ink, lineWidth: 2 });
  circle(ctx, x, y, r * 0.6, { fill: iris, stroke: null });
  circle(ctx, x, y, r * 0.3, { fill: pupil || '#101010', stroke: null });
  circle(ctx, x - r * 0.3, y - r * 0.34, r * 0.16, { fill: '#ffffff', stroke: null });
}

/** 通用小嘴（含牙） */
function miniMouth(ctx, x, y, rx, ry, color) {
  inkShape(ctx, (c) => c.ellipse(x, y, rx, ry, 0, 0, TAU), { fill: color || PAL.gaperMouth, lineWidth: 2.4 });
  ctx.save();
  ctx.fillStyle = '#f2ecd8';
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) {
    const px = x - rx + 1.6 + i * ((rx * 2 - 3.2) / 3);
    ctx.beginPath();
    ctx.moveTo(px - 1.5, y - ry + 0.5); ctx.lineTo(px + 1.5, y - ry + 0.5); ctx.lineTo(px, y - ry + 3); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px - 1.5, y + ry - 0.5); ctx.lineTo(px + 1.5, y + ry - 0.5); ctx.lineTo(px, y + ry - 3); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

/** 小苍蝇身体（可复用） */
function flyBody(ctx, r, bodyColor, shade, eyeColor) {
  const flap = Math.sin(performance.now() / 40) * 0.5;
  ctx.save();
  ctx.fillStyle = 'rgba(220,228,240,0.6)';
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.rotate(side * (0.4 + flap));
    ctx.beginPath();
    ctx.ellipse(side * r, -r * 0.6, r * 1.1, r * 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  blob(ctx, 0, 0, r, BLOB_JITTER, { fill: bodyColor, lineWidth: 2.4 });
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.35, r * 0.7, r * 0.4, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  circle(ctx, -r * 0.34, -r * 0.1, r * 0.32, { fill: eyeColor, stroke: PAL.ink, lineWidth: 1.4 });
  circle(ctx, r * 0.34, -r * 0.1, r * 0.32, { fill: eyeColor, stroke: PAL.ink, lineWidth: 1.4 });
}

// ============================================================
// Gaper —— 无头追尸
// ============================================================
export function drawGaper(ctx, v = {}) {
  const t = v.t || 0;
  const facing = v.facing || Math.PI * 0.5;
  const walk = Math.sin(t * 9 + (v.phase || 0));
  const bob = Math.abs(walk) * 2.6;
  const lean = walk * 0.12;
  if (v.dead) { drawGaperDeath(ctx, v.dead); return; }

  groundShadow(ctx, 0, 16, 14, 6, 0.34);
  ctx.save();
  ctx.translate(0, -bob);
  ctx.rotate(lean * Math.cos(facing));

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

  const bodyGrad = radialHighlight(ctx, 0, 0, 15, PAL.gaperFlesh, PAL.gaperFleshShade, -0.35, -0.4);
  blob(ctx, 0, -1, 14.5, GAPER_JITTER, { fill: bodyGrad, lineWidth: 3, squashY: 1.05 });
  drawGaperMouth(ctx, -1, 0, t);

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
    circle(ctx, side * 9.5, 7.5, 2.4, { fill: PAL.gaperFlesh, lineWidth: 2 });
    ctx.restore();
  }
  flash(ctx, v, 26, 26);
  ctx.restore();
}

function drawGaperMouth(ctx, x, y, t) {
  const open = 0.5 + Math.abs(Math.sin(t * 6)) * 0.5;
  const rx = 9.5;
  const ry = 7.2 * open;
  inkShape(ctx, (c) => c.ellipse(x, y + 1, rx, ry, 0, 0, TAU), { fill: PAL.gaperMouth, lineWidth: 3 });
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y + 1, rx, ry, 0, 0, TAU);
  ctx.clip();
  ctx.fillStyle = PAL.gaperBlood;
  ctx.fillRect(x - rx, y - ry - 2, rx * 2, 3.2);
  ctx.fillRect(x - rx, y + ry - 1.2, rx * 2, 3.2);
  ctx.restore();
  ctx.save();
  ctx.fillStyle = '#f2ecd8';
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 5; i++) {
    const px = x - rx + 1.6 + i * ((rx * 2 - 3.2) / 4);
    ctx.beginPath();
    ctx.moveTo(px - 1.7, y + 1 - ry + 0.5); ctx.lineTo(px + 1.7, y + 1 - ry + 0.5); ctx.lineTo(px, y + 1 - ry + 3.6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px - 1.7, y + 1 + ry - 0.5); ctx.lineTo(px + 1.7, y + 1 + ry - 0.5); ctx.lineTo(px, y + 1 + ry - 3.6); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function drawGaperDeath(ctx, p) {
  const e = 1 - p;
  groundShadow(ctx, 0, 16, 14 * e + 4, 6 * e + 2, 0.3 * e);
  ctx.save();
  ctx.globalAlpha = Math.min(1, e * 1.6);
  ctx.translate(0, -p * 6);
  ctx.scale(1 + (1 - e) * 0.35, Math.max(0.06, e));
  blob(ctx, 0, 0, 14, GAPER_JITTER, { fill: PAL.gaperFleshShade, lineWidth: 3, squashY: 1.05 });
  ctx.restore();
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

// ============================================================
// Pooter —— 飞行吐弹怪
// ============================================================
export function drawPooter(ctx, v = {}) {
  const t = v.t || 0;
  if (v.dead) { drawPopDeath(ctx, v.dead, PAL.pooterBody); return; }
  const hover = Math.sin(t * 3.4 + (v.phase || 0)) * 2.6;
  groundShadow(ctx, 0, 15 - hover, 12, 5, 0.24);
  ctx.save();
  ctx.translate(0, hover);
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
  const bodyGrad = radialHighlight(ctx, 0, 0, 13, PAL.pooterBody, PAL.pooterShade, -0.34, -0.4);
  blob(ctx, 0, 0, 12.5, POOTER_JITTER, { fill: bodyGrad, lineWidth: 3 });
  const eyeR = 5.2;
  circle(ctx, 0.5, -1.5, eyeR, { fill: '#ffffff', stroke: PAL.ink, lineWidth: 2.4 });
  circle(ctx, 0.5, -1.5, eyeR * 0.72, { fill: PAL.pooterEye, stroke: null });
  circle(ctx, 0.5, -1.5, eyeR * 0.4, { fill: '#5a0a0a', stroke: null });
  circle(ctx, -0.9, -3, 1.5, { fill: '#ffdede', stroke: null });
  const mouthOpen = v.shotFlash ? 4.6 : 2.6;
  inkShape(ctx, (c) => c.ellipse(0, 7.5, 3.4, mouthOpen * 0.7, 0, 0, TAU), { fill: PAL.pooterInner, lineWidth: 2.2 });
  flash(ctx, v, 24, 24);
  ctx.restore();
}

// ============================================================
// Horf —— 静止炮台怪
// ============================================================
export function drawHorf(ctx, v = {}) {
  const t = v.t || 0;
  if (v.dead) { drawPopDeath(ctx, v.dead, PAL.horfBody); return; }
  ctx.save();
  const breathe = 1 + Math.sin(t * 2.6 + (v.phase || 0)) * 0.025;
  ctx.scale(breathe, breathe);
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
  const charge = v.charge || 0;
  const holeR = 7 + charge * 1.8;
  const holeGrad = ctx.createRadialGradient(0, -3, 1, 0, -3, holeR + 2);
  holeGrad.addColorStop(0, '#000000');
  holeGrad.addColorStop(0.7, PAL.horfHole);
  holeGrad.addColorStop(1, '#5a3a24');
  inkShape(ctx, (c) => c.ellipse(0, -3, holeR, holeR * 0.86, 0, 0, TAU), { fill: holeGrad, lineWidth: 3 });
  if (charge > 0.01) {
    ctx.save();
    ctx.globalAlpha = charge * 0.9;
    ctx.shadowColor = PAL.tear;
    ctx.shadowBlur = 14 * charge;
    circle(ctx, 0, -3, 3.2 * charge + 1, { fill: PAL.tearHi, stroke: null });
    ctx.restore();
  }
  flash(ctx, v, 22, 22);
  ctx.restore();
}

// ============================================================
// Attack Fly —— 攻击苍蝇（快速飞行追击）
// ============================================================
export function drawAttackFly(ctx, v = {}) {
  if (v.dead) { drawPopDeath(ctx, v.dead, PAL.flyBody); return; }
  const t = v.t || 0;
  const hover = Math.sin(t * 9 + (v.phase || 0)) * 1.6;
  groundShadow(ctx, 0, 11 - hover, 8, 3.4, 0.24);
  ctx.save();
  ctx.translate(0, hover);
  flyBody(ctx, 8, PAL.flyBody, PAL.flyBodyShade, PAL.flyEye);
  flash(ctx, v, 16, 16);
  ctx.restore();
}

// ============================================================
// Boom Fly —— 轰炸蝇（对角飞行，死亡爆炸）
// ============================================================
export function drawBoomFly(ctx, v = {}) {
  if (v.dead) { drawPopDeath(ctx, v.dead, PAL.boomFlyBody); return; }
  const t = v.t || 0;
  const hover = Math.sin(t * 7 + (v.phase || 0)) * 2;
  groundShadow(ctx, 0, 13 - hover, 11, 4.4, 0.26);
  ctx.save();
  ctx.translate(0, hover);
  flyBody(ctx, 12, PAL.boomFlyBody, PAL.boomFlyBodyShade, '#ffd24a');
  // 引信（爆炸预示）
  ctx.save();
  ctx.globalAlpha = 0.6 + Math.sin(t * 12) * 0.3;
  ctx.fillStyle = '#ffcf5a';
  circle(ctx, 0, -13, 3, { fill: '#ffcf5a', stroke: PAL.ink, lineWidth: 1.6 });
  ctx.restore();
  flash(ctx, v, 20, 20);
  ctx.restore();
}

// ============================================================
// Charger —— 冲撞者（游走→冲刺）
// ============================================================
export function drawCharger(ctx, v = {}) {
  if (v.dead) { drawPopDeath(ctx, v.dead, PAL.fleshEnemyShade); return; }
  const t = v.t || 0;
  const dashing = v.charging;
  const lean = dashing ? 0.28 : Math.sin(t * 4 + (v.phase || 0)) * 0.06;
  groundShadow(ctx, 0, 15, 16, 6, 0.34);
  ctx.save();
  ctx.rotate(lean);
  // 身体（前倾的肉牛）
  const g = radialHighlight(ctx, -2, -4, 18, PAL.fleshEnemy, PAL.fleshEnemyShade, -0.3, -0.36);
  inkShape(ctx, (c) => {
    c.moveTo(-16, 8);
    c.bezierCurveTo(-18, -8, -8, -16, 2, -14);
    c.bezierCurveTo(14, -12, 18, 0, 14, 10);
    c.bezierCurveTo(8, 16, -10, 16, -16, 8);
    c.closePath();
  }, { fill: g, lineWidth: 3 });
  // 角
  for (const side of [-1, 1]) {
    inkShape(ctx, (c) => {
      c.moveTo(side * 8, -12);
      c.lineTo(side * 16, -18);
      c.lineTo(side * 10, -8);
      c.closePath();
    }, { fill: PAL.bone, lineWidth: 2.2 });
  }
  miniEye(ctx, -5, -6, 4, '#c02020');
  miniEye(ctx, 6, -6, 4, '#c02020');
  // 冲刺时前冲的尘土线
  if (dashing) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-18 - i * 4, -4 + i * 5);
      ctx.lineTo(-26 - i * 5, -4 + i * 5);
      ctx.stroke();
    }
    ctx.restore();
  }
  flash(ctx, v, 22, 20);
  ctx.restore();
}

// ============================================================
// Clotty —— 血块（游走 + 十字弹幕）
// ============================================================
export function drawClotty(ctx, v = {}) {
  if (v.dead) { drawPopDeath(ctx, v.dead, PAL.fleshEnemyShade); return; }
  const t = v.t || 0;
  const bob = Math.abs(Math.sin(t * 6 + (v.phase || 0))) * 1.8;
  groundShadow(ctx, 0, 14, 14, 5.5, 0.32);
  ctx.save();
  ctx.translate(0, -bob);
  const g = radialHighlight(ctx, -2, -3, 15, PAL.fleshEnemy, PAL.fleshEnemyShade, -0.32, -0.38);
  blob(ctx, 0, 0, 14, BLOB_JITTER, { fill: g, lineWidth: 3 });
  // 四只小脚
  for (const side of [-1, 1]) {
    inkShape(ctx, (c) => {
      c.moveTo(side * 8, 10); c.lineTo(side * 13, 15); c.lineTo(side * 7, 15); c.closePath();
    }, { fill: PAL.fleshEnemyShade, lineWidth: 2 });
  }
  miniEye(ctx, -4, -3, 4, '#8a1f1f');
  miniEye(ctx, 5, -3, 4, '#8a1f1f');
  miniMouth(ctx, 0, 5, 6, 3.4 + (v.charge || 0) * 2.4, '#5a0a0a');
  flash(ctx, v, 20, 18);
  ctx.restore();
}

// ============================================================
// Mulligan —— 呆瓜（逃避 + 死亡召唤苍蝇）
// ============================================================
export function drawMulligan(ctx, v = {}) {
  if (v.dead) { drawPopDeath(ctx, v.dead, PAL.gaperFleshShade); return; }
  const t = v.t || 0;
  const wob = Math.sin(t * 3 + (v.phase || 0)) * 2;
  groundShadow(ctx, 0, 15, 16, 6, 0.34);
  ctx.save();
  ctx.translate(wob * 0.4, 0);
  const g = radialHighlight(ctx, -3, -4, 18, PAL.gaperFlesh, PAL.gaperFleshShade, -0.32, -0.38);
  blob(ctx, 0, 0, 16, GAPER_JITTER, { fill: g, lineWidth: 3 });
  // 脓包
  for (const [px, py, pr] of [[-8, -6, 3.4], [7, -8, 3], [10, 4, 3.2], [-10, 5, 3]]) {
    circle(ctx, px, py, pr, { fill: '#a8c070', stroke: PAL.ink, lineWidth: 1.8 });
  }
  miniEye(ctx, -5, -2, 4.4, '#8a1f1f');
  miniEye(ctx, 5, -2, 4.4, '#8a1f1f');
  miniMouth(ctx, 0, 7, 7, 4, '#4a1010');
  flash(ctx, v, 22, 20);
  ctx.restore();
}

// ============================================================
// Hopper —— 跳蚤（连续小跳）
// ============================================================
export function drawHopper(ctx, v = {}) {
  if (v.dead) { drawPopDeath(ctx, v.dead, PAL.fleshEnemyShade); return; }
  const t = v.t || 0;
  const z = v.hopZ || 0;
  const squash = z > 1 ? 1.12 : 0.88;
  groundShadow(ctx, 0, 15, 13 * (1 - Math.min(0.5, z / 60)), 5, 0.3 * (1 - Math.min(0.6, z / 80)));
  ctx.save();
  ctx.translate(0, -z);
  ctx.scale(1 / Math.sqrt(squash), squash);
  // 大脚
  for (const side of [-1, 1]) {
    ellipse(ctx, side * 8, 10, 7, 4, { fill: PAL.fleshEnemyShade, lineWidth: 2.4 });
  }
  const g = radialHighlight(ctx, -2, -4, 14, PAL.fleshEnemy, PAL.fleshEnemyShade, -0.3, -0.36);
  blob(ctx, 0, -1, 13, BLOB_JITTER, { fill: g, lineWidth: 3 });
  miniEye(ctx, -4, -4, 4, '#c02020');
  miniEye(ctx, 5, -4, 4, '#c02020');
  miniMouth(ctx, 0, 5, 5, 3, '#5a0a0a');
  flash(ctx, v, 18, 18);
  ctx.restore();
}

// ============================================================
// Trite —— 蜘蛛怪（跳跃飞行）
// ============================================================
export function drawTrite(ctx, v = {}) {
  if (v.dead) { drawPopDeath(ctx, v.dead, PAL.spiderBodyShade); return; }
  const t = v.t || 0;
  const z = v.hopZ || 0;
  groundShadow(ctx, 0, 12, 11 * (1 - Math.min(0.5, z / 60)), 4, 0.28 * (1 - Math.min(0.6, z / 80)));
  ctx.save();
  ctx.translate(0, -z);
  // 8 条腿
  ctx.strokeStyle = PAL.spiderLeg;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  const legPhase = t * 10 + (v.phase || 0);
  for (let i = 0; i < 4; i++) {
    for (const side of [-1, 1]) {
      const a = side * (0.5 + i * 0.5);
      const jig = Math.sin(legPhase + i) * 2;
      ctx.beginPath();
      ctx.moveTo(side * 4, 0);
      ctx.lineTo(side * (10 + i * 1.5), -4 + i * 4 + jig);
      ctx.lineTo(side * (16 + i * 2), 2 + i * 4 + jig);
      ctx.stroke();
    }
  }
  // 身体
  const g = radialHighlight(ctx, -2, -3, 12, PAL.spiderBody, PAL.spiderBodyShade, -0.3, -0.36);
  blob(ctx, 0, 0, 11, BLOB_JITTER, { fill: g, lineWidth: 2.8 });
  // 红眼（4 只）
  miniEye(ctx, -4, -3, 2.8, '#c02020');
  miniEye(ctx, 4, -3, 2.8, '#c02020');
  circle(ctx, -1.6, 1.5, 1.6, { fill: '#c02020', stroke: null });
  circle(ctx, 1.6, 1.5, 1.6, { fill: '#c02020', stroke: null });
  flash(ctx, v, 16, 16);
  ctx.restore();
}

// ============================================================
// Host —— 宿主（潜伏无敌，靠近后抬头射击）
// ============================================================
export function drawHost(ctx, v = {}) {
  const t = v.t || 0;
  if (v.dead) { drawPopDeath(ctx, v.dead, PAL.hostShellShade); return; }
  const risen = v.risen;
  ctx.save();
  if (!risen) {
    // 潜伏态：一个贴地的壳
    groundShadow(ctx, 0, 12, 16, 6, 0.34);
    const g = radialHighlight(ctx, -2, -4, 16, PAL.hostShell, PAL.hostShellShade, -0.3, -0.36);
    inkShape(ctx, (c) => {
      c.moveTo(-15, 10);
      c.quadraticCurveTo(-16, -6, -8, -10);
      c.quadraticCurveTo(0, -12, 8, -10);
      c.quadraticCurveTo(16, -6, 15, 10);
      c.quadraticCurveTo(0, 14, -15, 10);
      c.closePath();
    }, { fill: g, lineWidth: 3 });
    // 缝隙
    ctx.strokeStyle = 'rgba(60,40,20,0.6)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-10, 0); ctx.quadraticCurveTo(0, 4, 10, 0);
    ctx.stroke();
  } else {
    // 抬头态：肉茎 + 头
    groundShadow(ctx, 0, 14, 14, 5.5, 0.32);
    inkShape(ctx, (c) => {
      c.moveTo(-7, 12); c.lineTo(7, 12); c.lineTo(5, -2); c.lineTo(-5, -2); c.closePath();
    }, { fill: PAL.hostMeat, lineWidth: 2.6 });
    const g = radialHighlight(ctx, -2, -10, 15, PAL.hostMeat, PAL.hostShellShade, -0.3, -0.36);
    circle(ctx, 0, -10, 12, { fill: g, stroke: PAL.ink, lineWidth: 3 });
    miniEye(ctx, -4, -12, 3.6, '#c02020');
    miniEye(ctx, 4, -12, 3.6, '#c02020');
    miniMouth(ctx, 0, -5, 6, 3.4 + (v.charge || 0) * 2.4, '#5a0a0a');
  }
  flash(ctx, v, 20, 18);
  ctx.restore();
}

// ============================================================
// Vis —— 激光眼（蓄力后发射光束）
// ============================================================
export function drawVis(ctx, v = {}) {
  if (v.dead) { drawPopDeath(ctx, v.dead, PAL.visBodyShade); return; }
  const t = v.t || 0;
  const charging = v.laserCharging;
  const bob = Math.sin(t * 3 + (v.phase || 0)) * 2;
  groundShadow(ctx, 0, 14, 14, 5.5, 0.3);
  ctx.save();
  ctx.translate(0, -bob);
  // 躯体（机械肉块）
  const g = radialHighlight(ctx, -2, -3, 15, PAL.visBody, PAL.visBodyShade, -0.3, -0.36);
  inkShape(ctx, (c) => {
    c.moveTo(-13, 8);
    c.quadraticCurveTo(-15, -8, 0, -12);
    c.quadraticCurveTo(15, -8, 13, 8);
    c.quadraticCurveTo(0, 13, -13, 8);
    c.closePath();
  }, { fill: g, lineWidth: 3 });
  // 金属板
  ctx.strokeStyle = '#9aa0aa';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-9, -4); ctx.lineTo(9, -4);
  ctx.stroke();
  // 大镜头眼
  const lensGlow = charging ? 1 : 0.5 + Math.sin(t * 4) * 0.2;
  ctx.save();
  ctx.shadowColor = PAL.visLens;
  ctx.shadowBlur = 8 * lensGlow;
  circle(ctx, 0, -3, 6.4, { fill: '#2a2e34', stroke: PAL.ink, lineWidth: 2.4 });
  circle(ctx, 0, -3, 3.8 * (charging ? 1.15 : 1), { fill: PAL.visLens, stroke: null });
  ctx.restore();
  circle(ctx, -1.4, -4.6, 1.4, { fill: '#ffdcc0', stroke: null });
  flash(ctx, v, 18, 18);
  ctx.restore();
}

// ============================================================
// Maw —— 巨口（漂浮追踪弹）
// ============================================================
export function drawMaw(ctx, v = {}) {
  if (v.dead) { drawPopDeath(ctx, v.dead, PAL.mawShade); return; }
  const t = v.t || 0;
  const hover = Math.sin(t * 2.8 + (v.phase || 0)) * 3;
  groundShadow(ctx, 0, 15 - hover, 13, 5, 0.26);
  ctx.save();
  ctx.translate(0, hover);
  const g = radialHighlight(ctx, -2, -3, 16, PAL.mawBody, PAL.mawShade, -0.3, -0.36);
  blob(ctx, 0, -2, 14, BLOB_JITTER, { fill: g, lineWidth: 3 });
  // 大嘴（占满下半）
  const open = 0.5 + (v.charge || 0) * 0.5;
  inkShape(ctx, (c) => c.ellipse(0, 4, 11, 5 + open * 5, 0, 0, TAU), { fill: PAL.mawInner, lineWidth: 2.8 });
  ctx.save();
  ctx.fillStyle = '#f2ecd8';
  for (let i = 0; i < 5; i++) {
    const px = -9 + i * 4.5;
    ctx.beginPath();
    ctx.moveTo(px - 1.6, 4 - (5 + open * 5)); ctx.lineTo(px + 1.6, 4 - (5 + open * 5)); ctx.lineTo(px, 4 - (5 + open * 5) + 3.4); ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  miniEye(ctx, -5, -8, 3.6, '#8a1f5f');
  miniEye(ctx, 5, -8, 3.6, '#8a1f5f');
  flash(ctx, v, 20, 20);
  ctx.restore();
}

// ============================================================
// Globin —— 血球蛋白（死亡后复活一次）
// ============================================================
export function drawGlobin(ctx, v = {}) {
  if (v.dead) { drawPopDeath(ctx, v.dead, PAL.globinShade); return; }
  const t = v.t || 0;
  const reviving = v.reviving;
  const bob = Math.abs(Math.sin(t * 5 + (v.phase || 0))) * 2;
  groundShadow(ctx, 0, 15, 14, 5.5, 0.32);
  ctx.save();
  ctx.translate(0, -bob);
  ctx.save();
  if (reviving) ctx.globalAlpha = 0.7; // 复活僵直期半透明
  const g = radialHighlight(ctx, -2, -3, 15, PAL.globinBody, PAL.globinShade, -0.3, -0.36);
  blob(ctx, 0, 0, 14, BLOB_JITTER, { fill: g, lineWidth: 3 });
  // 内核
  circle(ctx, 0, 0, 6, { fill: PAL.globinCore, stroke: PAL.ink, lineWidth: 2 });
  miniEye(ctx, -3, -2, 3, '#3a5a20');
  miniEye(ctx, 4, -2, 3, '#3a5a20');
  ctx.restore();
  flash(ctx, v, 18, 18);
  ctx.restore();
}

// ============================================================
// Mulliboom —— 自爆呆瓜（接触爆炸）
// ============================================================
export function drawMulliboom(ctx, v = {}) {
  if (v.dead) { drawPopDeath(ctx, v.dead, PAL.mulliboomShade); return; }
  const t = v.t || 0;
  const wob = Math.sin(t * 8 + (v.phase || 0)) * 2;
  groundShadow(ctx, 0, 14, 14, 5.5, 0.32);
  ctx.save();
  ctx.translate(wob * 0.3, 0);
  // 引信闪烁越接近玩家越快（用 t 近似）
  const g = radialHighlight(ctx, -2, -3, 15, PAL.mulliboomBody, PAL.mulliboomShade, -0.3, -0.36);
  blob(ctx, 0, 0, 14, GAPER_JITTER, { fill: g, lineWidth: 3 });
  miniEye(ctx, -4, -3, 4, '#c02020');
  miniEye(ctx, 5, -3, 4, '#c02020');
  miniMouth(ctx, 0, 6, 6, 3.6, '#4a1010');
  // 顶部引信火花
  ctx.save();
  ctx.globalAlpha = 0.7 + Math.sin(t * 16) * 0.3;
  circle(ctx, 0, -16, 3.4, { fill: '#ffcf5a', stroke: PAL.ink, lineWidth: 1.6 });
  ctx.restore();
  flash(ctx, v, 20, 18);
  ctx.restore();
}

// ============================================================
// Maggot —— 蛆虫（缓慢追击）
// ============================================================
export function drawMaggot(ctx, v = {}) {
  if (v.dead) { drawPopDeath(ctx, v.dead, PAL.gaperFleshShade); return; }
  const t = v.t || 0;
  groundShadow(ctx, 0, 12, 15, 5, 0.3);
  ctx.save();
  const segs = 4;
  for (let i = segs - 1; i >= 0; i--) {
    const off = i * 8;
    const wob = Math.sin(t * 6 + i * 0.9 + (v.phase || 0)) * 2.4;
    const r = 10 - i * 1.4;
    const col = i === 0 ? PAL.gaperFlesh : PAL.gaperFleshShade;
    ellipse(ctx, -off, wob, r, r * 0.86, { fill: col, lineWidth: 2.6 });
  }
  miniEye(ctx, -3, -2, 2.6, '#8a5f1f');
  miniEye(ctx, 4, -2, 2.6, '#8a5f1f');
  miniMouth(ctx, 0, 5, 4.4, 2.4, '#5a1a10');
  flash(ctx, v, 20, 16);
  ctx.restore();
}

// ============================================================
// Spitty —— 吐痰者（缓慢游走单发）
// ============================================================
export function drawSpitty(ctx, v = {}) {
  if (v.dead) { drawPopDeath(ctx, v.dead, PAL.gaperFleshShade); return; }
  const t = v.t || 0;
  const bob = Math.abs(Math.sin(t * 3 + (v.phase || 0))) * 1.4;
  groundShadow(ctx, 0, 13, 13, 5, 0.3);
  ctx.save();
  ctx.translate(0, -bob);
  const g = radialHighlight(ctx, -2, -3, 14, PAL.gaperFlesh, PAL.gaperFleshShade, -0.3, -0.36);
  blob(ctx, 0, 0, 13, GAPER_JITTER, { fill: g, lineWidth: 2.8 });
  // 大口（吐痰）
  miniMouth(ctx, 0, 4, 7, 3.6 + (v.charge || 0) * 3, '#5a1a10');
  miniEye(ctx, -4, -5, 3, '#3a2a10');
  miniEye(ctx, 5, -5, 3, '#3a2a10');
  flash(ctx, v, 18, 18);
  ctx.restore();
}

// ============================================================
// Sucker —— 吸盘怪（缓慢飞行，死亡爆炸）
// ============================================================
export function drawSucker(ctx, v = {}) {
  if (v.dead) { drawPopDeath(ctx, v.dead, PAL.suckerShade); return; }
  const t = v.t || 0;
  const hover = Math.sin(t * 4 + (v.phase || 0)) * 2.4;
  groundShadow(ctx, 0, 13 - hover, 12, 4.6, 0.26);
  ctx.save();
  ctx.translate(0, hover);
  // 圆盘身
  const g = radialHighlight(ctx, -2, -3, 14, PAL.suckerBody, PAL.suckerShade, -0.3, -0.36);
  ellipse(ctx, 0, 0, 13, 11, { fill: g, lineWidth: 3 });
  // 吸盘（同心圆）
  circle(ctx, 0, 2, 6.5, { fill: PAL.suckerShade, stroke: PAL.ink, lineWidth: 2 });
  circle(ctx, 0, 2, 3.4, { fill: '#2a2a32', stroke: null });
  miniEye(ctx, -4, -5, 3, '#c02020');
  miniEye(ctx, 5, -5, 3, '#c02020');
  flash(ctx, v, 18, 16);
  ctx.restore();
}

// ============================================================
// Bony —— 白骨兵（抛掷骨弹）
// ============================================================
export function drawBone(ctx, v = {}) {
  if (v.dead) { drawPopDeath(ctx, v.dead, PAL.boneBodyShade); return; }
  const t = v.t || 0;
  const walk = Math.sin(t * 7 + (v.phase || 0));
  const bob = Math.abs(walk) * 2;
  groundShadow(ctx, 0, 16, 12, 5, 0.3);
  ctx.save();
  ctx.translate(0, -bob);
  // 腿
  for (const side of [-1, 1]) {
    inkShape(ctx, (c) => {
      c.moveTo(side * 3, 6); c.lineTo(side * 7, 6); c.lineTo(side * 8, 16); c.lineTo(side * 4, 16); c.closePath();
    }, { fill: PAL.boneBody, lineWidth: 2.2 });
  }
  // 肋骨躯干
  inkShape(ctx, (c) => {
    c.moveTo(-8, -4); c.lineTo(8, -4); c.lineTo(6, 8); c.lineTo(-6, 8); c.closePath();
  }, { fill: PAL.boneBody, lineWidth: 2.6 });
  ctx.strokeStyle = PAL.boneBodyShade;
  ctx.lineWidth = 1.8;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-7, -2 + i * 3.4); ctx.lineTo(7, -2 + i * 3.4);
    ctx.stroke();
  }
  // 手臂（投掷姿势）
  inkShape(ctx, (c) => {
    c.moveTo(-7, -3); c.lineTo(-14, 2); c.lineTo(-12, 5); c.lineTo(-6, 0); c.closePath();
  }, { fill: PAL.boneBody, lineWidth: 2.2 });
  inkShape(ctx, (c) => {
    c.moveTo(7, -3); c.lineTo(13, -8); c.lineTo(11, -11); c.lineTo(6, -6); c.closePath();
  }, { fill: PAL.boneBody, lineWidth: 2.2 });
  // 头骨
  circle(ctx, 0, -10, 8, { fill: PAL.boneBody, stroke: PAL.ink, lineWidth: 2.8 });
  circle(ctx, -3, -11, 2.2, { fill: '#2a2420', stroke: null });
  circle(ctx, 3, -11, 2.2, { fill: '#2a2420', stroke: null });
  ctx.fillStyle = PAL.boneBodyShade;
  ctx.fillRect(-2, -6, 4, 3);
  flash(ctx, v, 18, 18);
  ctx.restore();
}
