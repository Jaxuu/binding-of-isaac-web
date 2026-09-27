/**
 * draw-boss.js — Boss 绘制（12 个专属模型）
 *
 * 每个 Boss 以「实体中心」为原点绘制。函数签名统一：
 *   drawX(ctx, v)
 *   v = { t, mouth, squash, rage, hurt, dead, scale }
 *
 * 通过 drawBoss(ctx, id, v) 统一分派（renderer 调用）。
 * 所有形状走 art/primitives.js 的「先描边后填充」笔法，保持暗黑卡通统一风格。
 */

import { PAL } from './palette.js';
import { circle, ellipse, inkShape, groundShadow, radialHighlight, star } from './primitives.js';
import { TAU, lerp } from '../core/math.js';

/** 极简 hex 颜色插值（只支持 #rrggbb） */
export function lerpColor(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

/** 统一分派入口 */
export function drawBoss(ctx, id, v = {}) {
  switch (id) {
    case 'larry': return drawLarry(ctx, v);
    case 'chub': return drawChub(ctx, v);
    case 'gurdy': return drawGurdy(ctx, v);
    case 'duke': return drawDuke(ctx, v);
    case 'fistula': return drawFistula(ctx, v);
    case 'mom': return drawMom(ctx, v);
    case 'momsHeart': return drawMomsHeart(ctx, v);
    case 'satan': return drawSatan(ctx, v);
    case 'isaac': return drawIsaacBoss(ctx, v);
    case 'blueBaby': return drawBlueBaby(ctx, v);
    case 'lamb': return drawLamb(ctx, v);
    case 'monstro':
    default: return drawMonstro(ctx, v);
  }
}

/** 通用受伤闪白（在世界坐标内叠加到实体包围盒） */
function hurtFlash(ctx, v, w, h) {
  if (!(v.hurt > 0.01)) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = Math.min(0.75, v.hurt);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-w, -h, w * 2, h * 2);
  ctx.restore();
}

/** 通用死亡：塌缩 + 血花四溅 */
function genericDeath(ctx, p, color, radius) {
  const e = 1 - p;
  ctx.save();
  ctx.translate(0, p * 12);
  ctx.globalAlpha = Math.min(1, e * 1.5);
  ctx.scale(1 + p * 0.3, Math.max(0.05, e));
  inkShape(ctx, (c) => c.ellipse(0, 4, radius, radius * 0.9, 0, 0, TAU), { fill: color, lineWidth: 3.6 });
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = Math.min(1, e);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + 0.4;
    const d = 8 + p * 60;
    const r = Math.max(0.6, (6 - (i % 4)) * e);
    ctx.fillStyle = i % 3 === 0 ? '#8a2020' : color;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d * 0.8 + p * 16, r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** 通用眼球 */
function eye(ctx, x, y, r, white, iris, pupil) {
  circle(ctx, x, y, r, { fill: white, stroke: PAL.ink, lineWidth: 2.6 });
  circle(ctx, x, y, r * 0.56, { fill: iris, stroke: null });
  circle(ctx, x, y, r * 0.28, { fill: pupil || '#101010', stroke: null });
  circle(ctx, x - r * 0.3, y - r * 0.34, r * 0.18, { fill: '#ffffff', stroke: null });
}

// ============================================================
// 1. Monstro —— 绿色粘液肉块（Basement）
// ============================================================
export function drawMonstro(ctx, v = {}) {
  const t = v.t || 0;
  const s = v.scale === undefined ? 1 : v.scale;
  if (v.dead > 0) { genericDeath(ctx, v.dead, PAL.monstroBodyShade, 32); return; }
  const rage = v.rage || 0;
  const squashY = v.squash === undefined ? 1 : v.squash;
  const squashX = 1 / Math.max(0.4, Math.sqrt(squashY));
  const breathe = 1 + Math.sin(t * 1.9) * 0.018;

  ctx.save();
  groundShadow(ctx, 0, 30, 40 * squashX, 12, 0.4);
  ctx.scale(s * squashX * breathe, s * squashY * breathe);

  // 短腿
  for (const side of [-1, 1]) {
    inkShape(ctx, (c) => {
      c.moveTo(side * 10, 16);
      c.quadraticCurveTo(side * 20, 24, side * 22, 30);
      c.lineTo(side * 8, 30);
      c.closePath();
    }, { fill: lerpColor(PAL.monstroBodyShade, '#6a3020', rage), lineWidth: 3.4 });
    ellipse(ctx, side * 15, 30, 8, 4, { fill: lerpColor(PAL.monstroBodyShade, '#5a2a1a', rage), lineWidth: 3 });
  }

  const bodyGrad = radialHighlight(ctx, -6, -12, 40, lerpColor(PAL.monstroBody, '#8a3a2a', rage), lerpColor(PAL.monstroBodyShade, '#5a2018', rage), -0.32, -0.36);
  inkShape(ctx, (c) => {
    c.moveTo(-30, 6);
    c.bezierCurveTo(-38, -14, -26, -32, -8, -34);
    c.bezierCurveTo(6, -36, 18, -28, 24, -18);
    c.bezierCurveTo(36, -10, 36, 10, 26, 20);
    c.bezierCurveTo(16, 30, -8, 32, -18, 26);
    c.bezierCurveTo(-26, 22, -28, 14, -30, 6);
    c.closePath();
  }, { fill: bodyGrad, lineWidth: 3.6 });

  // 疣
  ctx.save();
  ctx.globalAlpha = 0.85;
  for (const [wx, wy, wr] of [[-20, -20, 4.6], [12, -26, 3.8], [22, -6, 4.2], [-24, -2, 3.4], [8, 18, 3.6], [-14, 20, 3.2], [26, 8, 3.0]]) {
    circle(ctx, wx, wy, wr, { fill: lerpColor(PAL.monstroBodyShade, '#6a2818', rage), lineWidth: 2.4, stroke: 'rgba(26,13,13,0.7)' });
    circle(ctx, wx - wr * 0.3, wy - wr * 0.35, wr * 0.42, { fill: 'rgba(255,255,255,0.22)', stroke: null });
  }
  ctx.restore();

  // 肚皮
  const bellyGrad = ctx.createLinearGradient(0, 2, 0, 28);
  bellyGrad.addColorStop(0, lerpColor(PAL.monstroBelly, '#d8b090', rage * 0.5));
  bellyGrad.addColorStop(1, lerpColor(PAL.monstroBellyShade, '#a88060', rage * 0.5));
  inkShape(ctx, (c) => c.ellipse(0, 14, 22, 15, 0, 0, TAU), { fill: bellyGrad, lineWidth: 3.2 });

  // 眼睛
  drawMonstroEye(ctx, -13, -20, rage, t, 0);
  drawMonstroEye(ctx, 11, -21, rage, t, 1.2);
  // 嘴
  drawMouth(ctx, 0, 2, v.mouth || 0, rage, t, 26, PAL.monstroMouth, PAL.monstroGum);
  hurtFlash(ctx, v, 46, 46);
  ctx.restore();
}

function drawMonstroEye(ctx, x, y, rage, t, phase) {
  const jitter = Math.sin(t * 7 + phase) * 0.8;
  const R = 9.2;
  const white = rage > 0.4 ? lerpColor('#ffffff', '#ffb0b0', (rage - 0.4) / 0.6) : '#ffffff';
  circle(ctx, x, y + jitter * 0.4, R, { fill: white, stroke: PAL.ink, lineWidth: 3 });
  if (rage > 0.25) {
    ctx.save();
    ctx.globalAlpha = (rage - 0.25) / 0.75;
    ctx.strokeStyle = '#c02020';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + phase;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * R * 0.5, y + jitter * 0.4 + Math.sin(a) * R * 0.5);
      ctx.lineTo(x + Math.cos(a) * R * 0.92, y + jitter * 0.4 + Math.sin(a) * R * 0.92);
      ctx.stroke();
    }
    ctx.restore();
  }
  const pOff = Math.sin(t * 1.3 + phase) * 1.6;
  circle(ctx, x + pOff, y + jitter * 0.4 + 0.6, R * 0.46, { fill: PAL.monstroPupil, stroke: null });
  circle(ctx, x + pOff - 1.6, y + jitter * 0.4 - 1.4, R * 0.16, { fill: '#ffffff', stroke: null });
}

/** 通用大嘴（张开度 open 0..1） */
function drawMouth(ctx, x, y, open, rage, t, w, innerColor, gumColor) {
  const h = 4 + open * 15;
  const grad = ctx.createRadialGradient(x, y + h * 0.2, 1, x, y, w);
  grad.addColorStop(0, '#260505');
  grad.addColorStop(0.75, innerColor);
  grad.addColorStop(1, '#7a1010');
  inkShape(ctx, (c) => c.ellipse(x, y, w, h, 0, 0, TAU), { fill: grad, lineWidth: 3.4 });
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y, w, h, 0, 0, TAU);
  ctx.clip();
  ctx.fillStyle = gumColor;
  ctx.fillRect(x - w, y - h - 2, w * 2, 4.2);
  ctx.fillRect(x - w, y + h - 2.2, w * 2, 4.2);
  if (open > 0.4) {
    ctx.globalAlpha = (open - 0.4) / 0.6;
    ctx.fillStyle = '#c9455a';
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.45, w * 0.6, h * 0.42, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  if (open > 0.08) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, open * 2.2);
    ctx.fillStyle = '#f4eeda';
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 1.6;
    const n = Math.max(4, Math.round(w / 4));
    for (let i = 0; i < n; i++) {
      const px = x - w + 2.5 + i * ((w * 2 - 5) / (n - 1));
      const th = h * 0.55;
      ctx.beginPath();
      ctx.moveTo(px - 2.4, y - h + 1); ctx.lineTo(px + 2.4, y - h + 1); ctx.lineTo(px, y - h + 1 + th); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px - 2.4, y + h - 1); ctx.lineTo(px + 2.4, y + h - 1); ctx.lineTo(px, y + h - 1 - th * 0.8); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
}

// ============================================================
// 2. Larry Jr. —— 分节蠕虫（Cellar）
// ============================================================
export function drawLarry(ctx, v = {}) {
  const t = v.t || 0;
  if (v.dead > 0) { genericDeath(ctx, v.dead, PAL.larryBodyShade, 26); return; }
  const squash = v.squash === undefined ? 1 : v.squash;
  ctx.save();
  groundShadow(ctx, 0, 26, 40, 12, 0.36);
  ctx.scale(1 / Math.max(0.5, Math.sqrt(squash)), squash);

  // 5 节身体：越靠后越小、越暗
  const segs = 5;
  for (let i = segs - 1; i >= 0; i--) {
    const off = i * 15;
    const wob = Math.sin(t * 4 + i * 0.7) * 4;
    const r = 20 - i * 2.4;
    const dark = i / segs * 0.35;
    const col = lerpColor(PAL.larryBody, PAL.larryBodyShade, dark + v.rage * 0.2);
    ellipse(ctx, -off * 0.5, wob + i * 2, r, r * 0.86, { fill: col, lineWidth: 3.2 });
    // 节间斑点
    ctx.save();
    ctx.globalAlpha = 0.4;
    circle(ctx, -off * 0.5 - 4, wob + i * 2 - 4, r * 0.22, { fill: '#6a4218', stroke: null });
    ctx.restore();
  }
  // 头
  const hx = 8;
  const hy = Math.sin(t * 4) * 3;
  ellipse(ctx, hx, hy, 22, 20, { fill: lerpColor(PAL.larryBody, '#e0a860', v.rage * 0.3), lineWidth: 3.4 });
  // 角/触须
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hx - 6, hy - 16); ctx.quadraticCurveTo(hx - 14, hy - 26, hx - 20, hy - 22);
  ctx.moveTo(hx + 6, hy - 16); ctx.quadraticCurveTo(hx + 14, hy - 26, hx + 20, hy - 22);
  ctx.stroke();
  eye(ctx, hx - 8, hy - 4, 7, '#ffffff', '#c02020');
  eye(ctx, hx + 8, hy - 4, 7, '#ffffff', '#c02020');
  // 嘴
  drawMouth(ctx, hx, hy + 9, 0.4 + Math.abs(Math.sin(t * 5)) * 0.4, v.rage, t, 13, '#5a1a10', '#c9453a');
  hurtFlash(ctx, v, 60, 40);
  ctx.restore();
}

// ============================================================
// 3. Chub —— 肥硕巨虫（Caves）
// ============================================================
export function drawChub(ctx, v = {}) {
  const t = v.t || 0;
  if (v.dead > 0) { genericDeath(ctx, v.dead, PAL.chubShade, 34); return; }
  const squash = v.squash === undefined ? 1 : v.squash;
  const breathe = 1 + Math.sin(t * 2.2) * 0.03;
  ctx.save();
  groundShadow(ctx, 0, 32, 44, 14, 0.4);
  ctx.scale(1 / Math.max(0.5, Math.sqrt(squash)) * breathe, squash * breathe);

  // 肥硕主躯
  const g = radialHighlight(ctx, -6, -14, 44, lerpColor(PAL.chubBody, '#e090a0', v.rage * 0.3), lerpColor(PAL.chubShade, '#6a3040', v.rage * 0.3), -0.3, -0.34);
  inkShape(ctx, (c) => {
    c.moveTo(-34, 12);
    c.bezierCurveTo(-42, -16, -22, -36, 0, -36);
    c.bezierCurveTo(22, -36, 42, -16, 34, 12);
    c.bezierCurveTo(24, 32, -24, 32, -34, 12);
    c.closePath();
  }, { fill: g, lineWidth: 3.6 });

  // 分节环
  ctx.save();
  ctx.strokeStyle = 'rgba(120,60,80,0.55)';
  ctx.lineWidth = 2.2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(0, -14 + i * 14, 30 - i * 4, 7, 0, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
  ctx.restore();

  // 眼睛（小，藏在顶部）
  eye(ctx, -10, -24, 6, '#ffffff', '#e0a020');
  eye(ctx, 10, -24, 6, '#ffffff', '#e0a020');
  // 大嘴
  drawMouth(ctx, 0, 8, v.mouth || 0.2, v.rage, t, 22, '#5a1030', '#c9455a');
  hurtFlash(ctx, v, 46, 42);
  ctx.restore();
}

// ============================================================
// 4. Gurdy —— 坐桩巨肉（Catacombs）
// ============================================================
export function drawGurdy(ctx, v = {}) {
  const t = v.t || 0;
  if (v.dead > 0) { genericDeath(ctx, v.dead, PAL.gurdyShade, 36); return; }
  const breathe = 1 + Math.sin(t * 1.6) * 0.02;
  ctx.save();
  groundShadow(ctx, 0, 34, 48, 15, 0.42);
  ctx.scale(breathe, breathe);

  // 底座肉堆
  const g = radialHighlight(ctx, 0, -10, 46, lerpColor(PAL.gurdyBody, '#d0b878', v.rage * 0.25), lerpColor(PAL.gurdyShade, '#6a5828', v.rage * 0.25), -0.25, -0.3);
  inkShape(ctx, (c) => {
    c.moveTo(-40, 20);
    c.bezierCurveTo(-46, -12, -28, -30, 0, -30);
    c.bezierCurveTo(28, -30, 46, -12, 40, 20);
    c.bezierCurveTo(28, 34, -28, 34, -40, 20);
    c.closePath();
  }, { fill: g, lineWidth: 3.6 });

  // 顶部小头
  ellipse(ctx, 0, -30, 18, 16, { fill: lerpColor(PAL.gurdyBody, '#c8a860', 0), lineWidth: 3.2 });
  eye(ctx, -6, -32, 5, '#ffffff', '#3a2a10');
  eye(ctx, 6, -32, 5, '#ffffff', '#3a2a10');
  drawMouth(ctx, 0, -22, 0.3 + Math.abs(Math.sin(t * 3)) * 0.4, v.rage, t, 9, '#4a2a10', '#b08040');

  // 身上的小孔（吐弹口）
  for (const [ox, oy] of [[-24, 4], [22, 6], [0, 18], [-14, -6], [16, -8]]) {
    const open = 0.5 + Math.sin(t * 3 + ox) * 0.5;
    inkShape(ctx, (c) => c.ellipse(ox, oy, 6, 4 + open * 3, 0, 0, TAU), { fill: '#3a2410', lineWidth: 2.4 });
  }
  hurtFlash(ctx, v, 50, 46);
  ctx.restore();
}

// ============================================================
// 5. The Duke of Flies —— 蝇公爵（Depths）
// ============================================================
export function drawDuke(ctx, v = {}) {
  const t = v.t || 0;
  if (v.dead > 0) { genericDeath(ctx, v.dead, PAL.dukeShade, 32); return; }
  const squash = v.squash === undefined ? 1 : v.squash;
  ctx.save();
  groundShadow(ctx, 0, 30, 38, 12, 0.38);
  ctx.scale(1 / Math.max(0.5, Math.sqrt(squash)), squash);

  // 主体（暗紫肉团）
  const g = radialHighlight(ctx, -4, -10, 36, PAL.dukeBody, PAL.dukeShade, -0.3, -0.34);
  inkShape(ctx, (c) => c.ellipse(0, 0, 32, 28, 0, 0, TAU), { fill: g, lineWidth: 3.6 });

  // 环绕的苍蝇
  for (let i = 0; i < 9; i++) {
    const a = t * 1.6 + (i / 9) * TAU;
    const r = 30 + Math.sin(t * 3 + i) * 5;
    const fx = Math.cos(a) * r;
    const fy = Math.sin(a) * r * 0.8 - 6;
    drawFly(ctx, fx, fy, 4, t + i);
  }

  // 王冠
  inkShape(ctx, (c) => {
    c.moveTo(-16, -22); c.lineTo(-16, -34); c.lineTo(-8, -28); c.lineTo(0, -38);
    c.lineTo(8, -28); c.lineTo(16, -34); c.lineTo(16, -22); c.closePath();
  }, { fill: PAL.itemGold, lineWidth: 2.6 });

  // 大眼睛
  eye(ctx, -11, -4, 9, '#ffffff', '#8a1f1f');
  eye(ctx, 11, -4, 9, '#ffffff', '#8a1f1f');
  // 咧嘴
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, 10, 12, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  hurtFlash(ctx, v, 40, 40);
  ctx.restore();
}

/** 小苍蝇（Duke / 装饰用） */
function drawFly(ctx, x, y, r, seed) {
  const flap = Math.sin(seed * 9) * 0.6;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(220,228,240,0.7)';
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.rotate(side * (0.5 + flap));
    ctx.beginPath();
    ctx.ellipse(side * r * 0.9, -r * 0.5, r * 0.9, r * 0.45, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  circle(ctx, 0, 0, r, { fill: PAL.flyBody, lineWidth: 1.6 });
  circle(ctx, -r * 0.3, -r * 0.2, r * 0.3, { fill: PAL.flyEye, stroke: null });
  ctx.restore();
}

// ============================================================
// 6. Fistula —— 分裂肉泡（Necropolis）
// ============================================================
export function drawFistula(ctx, v = {}) {
  const t = v.t || 0;
  if (v.dead > 0) { genericDeath(ctx, v.dead, PAL.fistulaShade, 32); return; }
  const breathe = 1 + Math.sin(t * 2.4) * 0.025;
  ctx.save();
  groundShadow(ctx, 0, 30, 40, 13, 0.38);
  ctx.scale(breathe, breathe);

  // 主泡
  const g = radialHighlight(ctx, -6, -10, 34, lerpColor(PAL.fistulaBody, '#c0d090', v.rage * 0.3), lerpColor(PAL.fistulaShade, '#4a5828', v.rage * 0.3), -0.3, -0.34);
  inkShape(ctx, (c) => c.ellipse(0, 0, 30, 28, 0, 0, TAU), { fill: g, lineWidth: 3.6 });

  // 附属小泡（沿边缘分布）
  const bumps = [[-24, -12, 12], [22, -14, 11], [26, 8, 10], [-20, 14, 11], [0, -28, 10], [4, 24, 9]];
  for (let i = 0; i < bumps.length; i++) {
    const [bx, by, br] = bumps[i];
    const pulse = 1 + Math.sin(t * 3 + i) * 0.06;
    inkShape(ctx, (c) => c.ellipse(bx, by, br * pulse, br * 0.9 * pulse, 0, 0, TAU), {
      fill: lerpColor(PAL.fistulaBody, PAL.fistulaShade, 0.15 + i * 0.05), lineWidth: 3,
    });
  }
  // 内眼
  eye(ctx, -8, -2, 7, '#ffffff', '#8a2a2a');
  eye(ctx, 8, -2, 7, '#ffffff', '#8a2a2a');
  drawMouth(ctx, 0, 12, 0.2 + Math.abs(Math.sin(t * 4)) * 0.3, v.rage, t, 10, '#3a4018', '#8a9040');
  hurtFlash(ctx, v, 44, 42);
  ctx.restore();
}

// ============================================================
// 7. Mom —— 妈妈的巨足（Womb）
// ============================================================
export function drawMom(ctx, v = {}) {
  const t = v.t || 0;
  if (v.dead > 0) { genericDeath(ctx, v.dead, PAL.momDressShade, 30); return; }
  const squash = v.squash === undefined ? 1 : v.squash;
  ctx.save();
  groundShadow(ctx, 0, 34, 40, 14, 0.4);
  ctx.scale(1 / Math.max(0.5, Math.sqrt(squash)), squash);

  // 裙摆（上方隐入）
  inkShape(ctx, (c) => {
    c.moveTo(-30, -60);
    c.lineTo(30, -60);
    c.lineTo(24, -14);
    c.quadraticCurveTo(0, -4, -24, -14);
    c.closePath();
  }, { fill: PAL.momDress, lineWidth: 3.4 });

  // 腿
  inkShape(ctx, (c) => {
    c.moveTo(-13, -18);
    c.lineTo(13, -18);
    c.lineTo(11, 14);
    c.lineTo(-11, 14);
    c.closePath();
  }, { fill: PAL.momSkin, lineWidth: 3.2 });

  // 高跟鞋
  inkShape(ctx, (c) => {
    c.moveTo(-18, 12);
    c.lineTo(14, 12);
    c.quadraticCurveTo(26, 16, 24, 30);
    c.lineTo(-16, 30);
    c.quadraticCurveTo(-20, 20, -18, 12);
    c.closePath();
  }, { fill: '#8a2a3a', lineWidth: 3.4 });
  // 鞋跟
  inkShape(ctx, (c) => {
    c.moveTo(-14, 30); c.lineTo(-6, 30); c.lineTo(-7, 44); c.lineTo(-13, 44); c.closePath();
  }, { fill: '#6a1a28', lineWidth: 2.6 });
  // 鞋面高光
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = '#c05a6a';
  ctx.beginPath();
  ctx.ellipse(-4, 18, 10, 4, -0.2, 0, TAU);
  ctx.fill();
  ctx.restore();

  // 脚踝的肉褶
  ctx.strokeStyle = 'rgba(150,90,60,0.5)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-11, 2); ctx.quadraticCurveTo(0, 5, 11, 2);
  ctx.stroke();
  hurtFlash(ctx, v, 32, 56);
  ctx.restore();
}

// ============================================================
// 8. Mom's Heart —— 妈妈的心脏（Utero）
// ============================================================
export function drawMomsHeart(ctx, v = {}) {
  const t = v.t || 0;
  if (v.dead > 0) { genericDeath(ctx, v.dead, PAL.heartBodyShade, 30); return; }
  // 搏动
  const beat = 1 + Math.sin(t * 4.2) * 0.05 + Math.sin(t * 8.4) * 0.02;
  ctx.save();
  groundShadow(ctx, 0, 34, 38, 12, 0.34);
  ctx.translate(0, -6);
  ctx.scale(beat, beat);

  // 心形主体
  const g = radialHighlight(ctx, -8, -12, 40, lerpColor(PAL.heartBody, '#ff7088', v.rage * 0.3), lerpColor(PAL.heartBodyShade, '#6a1024', v.rage * 0.3), -0.3, -0.36);
  inkShape(ctx, (c) => {
    c.moveTo(0, 30);
    c.bezierCurveTo(-40, 2, -30, -30, -12, -22);
    c.bezierCurveTo(-5, -19, -2, -14, 0, -10);
    c.bezierCurveTo(2, -14, 5, -19, 12, -22);
    c.bezierCurveTo(30, -30, 40, 2, 0, 30);
    c.closePath();
  }, { fill: g, lineWidth: 3.6 });

  // 血管
  ctx.save();
  ctx.strokeStyle = PAL.heartVein;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-6, -18); ctx.quadraticCurveTo(-2, 0, -8, 14);
  ctx.moveTo(8, -16); ctx.quadraticCurveTo(4, 0, 10, 12);
  ctx.moveTo(0, -20); ctx.lineTo(0, 6);
  ctx.stroke();
  ctx.restore();

  // 心上的脸（原作 Mom's Heart 有眼睛）
  eye(ctx, -11, -4, 7, '#ffffff', '#7a1020');
  eye(ctx, 11, -4, 7, '#ffffff', '#7a1020');
  hurtFlash(ctx, v, 44, 40);
  ctx.restore();
}

// ============================================================
// 9. Satan —— 撒旦（Sheol）
// ============================================================
export function drawSatan(ctx, v = {}) {
  const t = v.t || 0;
  if (v.dead > 0) { genericDeath(ctx, v.dead, PAL.satanBodyShade, 34); return; }
  const squash = v.squash === undefined ? 1 : v.squash;
  ctx.save();
  groundShadow(ctx, 0, 32, 42, 14, 0.44);
  ctx.scale(1 / Math.max(0.5, Math.sqrt(squash)), squash);

  // 山羊腿
  for (const side of [-1, 1]) {
    inkShape(ctx, (c) => {
      c.moveTo(side * 8, 12);
      c.quadraticCurveTo(side * 20, 22, side * 16, 32);
      c.lineTo(side * 24, 32);
      c.quadraticCurveTo(side * 26, 20, side * 14, 8);
      c.closePath();
    }, { fill: PAL.satanBodyShade, lineWidth: 3 });
  }

  // 躯体
  const g = radialHighlight(ctx, -4, -12, 38, PAL.satanBody, PAL.satanBodyShade, -0.3, -0.34);
  inkShape(ctx, (c) => {
    c.moveTo(-26, 10);
    c.bezierCurveTo(-32, -14, -18, -32, 0, -32);
    c.bezierCurveTo(18, -32, 32, -14, 26, 10);
    c.bezierCurveTo(14, 22, -14, 22, -26, 10);
    c.closePath();
  }, { fill: g, lineWidth: 3.6 });

  // 双角
  for (const side of [-1, 1]) {
    inkShape(ctx, (c) => {
      c.moveTo(side * 12, -26);
      c.quadraticCurveTo(side * 24, -40, side * 16, -48);
      c.quadraticCurveTo(side * 20, -38, side * 6, -28);
      c.closePath();
    }, { fill: PAL.satanHorn, lineWidth: 2.8 });
  }

  // 发光眼
  ctx.save();
  ctx.shadowColor = PAL.satanEye;
  ctx.shadowBlur = 10;
  circle(ctx, -9, -8, 5, { fill: PAL.satanEye, stroke: PAL.ink, lineWidth: 2.4 });
  circle(ctx, 9, -8, 5, { fill: PAL.satanEye, stroke: PAL.ink, lineWidth: 2.4 });
  ctx.restore();

  // 獠牙嘴
  drawMouth(ctx, 0, 6, v.mouth || 0.2, v.rage, t, 16, '#3a0505', '#8a1a1a');
  hurtFlash(ctx, v, 40, 44);
  ctx.restore();
}

// ============================================================
// 10. Isaac —— 以撒（Cathedral）
// ============================================================
export function drawIsaacBoss(ctx, v = {}) {
  const t = v.t || 0;
  if (v.dead > 0) { genericDeath(ctx, v.dead, PAL.isaacBossShade, 26); return; }
  const bob = Math.sin(t * 2.4) * 2.5;
  ctx.save();
  groundShadow(ctx, 0, 30, 26, 10, 0.36);
  ctx.translate(0, -bob);

  // 腿
  for (const side of [-1, 1]) {
    inkShape(ctx, (c) => {
      c.moveTo(side * 5, 12); c.lineTo(side * 9, 12); c.lineTo(side * 9, 26); c.lineTo(side * 5, 26); c.closePath();
    }, { fill: PAL.isaacBossSkin, lineWidth: 2.6 });
  }
  // 身体（白袍）
  inkShape(ctx, (c) => {
    c.moveTo(-13, -8); c.lineTo(13, -8); c.lineTo(11, 14); c.lineTo(-11, 14); c.closePath();
  }, { fill: '#f4f0e6', lineWidth: 3 });
  // 头
  circle(ctx, 0, -18, 15, { fill: PAL.isaacBossSkin, stroke: PAL.ink, lineWidth: 3 });
  // 眼泪
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = PAL.tear;
    ctx.beginPath();
    ctx.ellipse(side * 6, -12 + ((t * 20) % 12), 2.6, 4, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  // 闭眼（哭泣）
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(-6, -20, 4, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.arc(6, -20, 4, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  // 光环
  ctx.save();
  ctx.globalAlpha = 0.75 + Math.sin(t * 3) * 0.15;
  ctx.strokeStyle = PAL.itemGold;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, -36, 14, 4.5, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
  hurtFlash(ctx, v, 30, 46);
  ctx.restore();
}

// ============================================================
// 11. ??? (Blue Baby) —— 蓝婴（Chest）
// ============================================================
export function drawBlueBaby(ctx, v = {}) {
  const t = v.t || 0;
  if (v.dead > 0) { genericDeath(ctx, v.dead, PAL.blueBabyShade, 28); return; }
  const bob = Math.sin(t * 2.6) * 3;
  ctx.save();
  groundShadow(ctx, 0, 32, 28, 10, 0.36);
  ctx.translate(0, -bob);

  // 小身体
  inkShape(ctx, (c) => {
    c.moveTo(-12, -4); c.lineTo(12, -4); c.lineTo(10, 16); c.lineTo(-10, 16); c.closePath();
  }, { fill: '#d8e4ee', lineWidth: 3 });
  // 大头
  const g = radialHighlight(ctx, -5, -18, 20, PAL.blueBabyBody, PAL.blueBabyShade, -0.3, -0.34);
  circle(ctx, 0, -18, 16, { fill: g, stroke: PAL.ink, lineWidth: 3.2 });
  // 死眼（全黑小眼）
  circle(ctx, -6, -19, 3.4, { fill: '#101018', stroke: null });
  circle(ctx, 6, -19, 3.4, { fill: '#101018', stroke: null });
  // 嘴（一条线）
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-5, -8); ctx.lineTo(5, -8);
  ctx.stroke();
  // 漂浮的泪滴
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = PAL.tear;
  for (let i = 0; i < 3; i++) {
    const a = t * 1.4 + (i / 3) * TAU;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * 26, Math.sin(a) * 20 - 12, 3, 4.4, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  hurtFlash(ctx, v, 30, 44);
  ctx.restore();
}

// ============================================================
// 12. The Lamb —— 羔羊（Dark Room）
// ============================================================
export function drawLamb(ctx, v = {}) {
  const t = v.t || 0;
  if (v.dead > 0) { genericDeath(ctx, v.dead, PAL.lambShade, 30); return; }
  const squash = v.squash === undefined ? 1 : v.squash;
  ctx.save();
  groundShadow(ctx, 0, 30, 38, 13, 0.4);
  ctx.scale(1 / Math.max(0.5, Math.sqrt(squash)), squash);

  // 躯体（羊毛质感）
  const g = radialHighlight(ctx, -4, -8, 34, lerpColor(PAL.lambBody, '#ffffff', v.rage * 0.2), lerpColor(PAL.lambShade, '#8a8270', v.rage * 0.3), -0.3, -0.34);
  inkShape(ctx, (c) => c.ellipse(0, 2, 30, 26, 0, 0, TAU), { fill: g, lineWidth: 3.6 });
  // 羊毛卷
  ctx.save();
  ctx.strokeStyle = 'rgba(160,152,130,0.5)';
  ctx.lineWidth = 2;
  for (const [ox, oy] of [[-16, -6], [14, -8], [-10, 14], [12, 12], [0, -16]]) {
    ctx.beginPath();
    ctx.arc(ox, oy, 6, 0, TAU * 0.75);
    ctx.stroke();
  }
  ctx.restore();

  // 头
  ellipse(ctx, 0, -22, 17, 15, { fill: PAL.lambBody, lineWidth: 3.2 });
  // 卷角
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.strokeStyle = PAL.lambShade;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(side * 15, -26, 8, side > 0 ? Math.PI * 0.2 : Math.PI * 0.8, side > 0 ? Math.PI * 1.5 : Math.PI * 2.2, side < 0);
    ctx.stroke();
    ctx.restore();
  }
  // 红眼
  ctx.save();
  ctx.shadowColor = PAL.lambEye;
  ctx.shadowBlur = 8;
  circle(ctx, -6, -23, 3.4, { fill: PAL.lambEye, stroke: null });
  circle(ctx, 6, -23, 3.4, { fill: PAL.lambEye, stroke: null });
  ctx.restore();
  // 嘴
  drawMouth(ctx, 0, -14, v.mouth || 0.15, v.rage, t, 9, '#3a1010', '#a05050');
  hurtFlash(ctx, v, 42, 40);
  ctx.restore();
}
