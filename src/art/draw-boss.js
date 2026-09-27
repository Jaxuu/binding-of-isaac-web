/**
 * draw-boss.js — Boss「Monstro」绘制
 *
 * Monstro 造型（对照原作）：
 * - 巨大绿色粘液肉块，形如畸形的蟾蜍/肿瘤团
 * - 米黄色大肚皮（下腹）
 * - 两只突出的大白眼（可充血变红）
 * - 一张横贯的巨嘴，能张开吐弹/喷血；上下唇有肉色牙龈
 * - 有两条短粗的腿（下半埋）
 *
 * 阶段表现（由 BossEntity 传入 v.stage / v.rage）：
 *   stage 1：常规，间歇吐散射弹 + 跳跃砸地
 *   stage 2（血量 <60%）：皮肤变深红、眼睛充红、射速提升
 *   stage 3（血量 <30%）：狂暴，嘴大幅张合、弹幕更密
 */

import { PAL } from './palette.js';
import { circle, ellipse, inkShape, groundShadow, radialHighlight } from './primitives.js';
import { TAU } from '../core/math.js';
import { lerp } from '../core/math.js';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} v
 * @param {number} v.t 时间
 * @param {number} v.mouth 嘴张开度 0..1
 * @param {number} v.squash 挤压变形 1=正常，<1 压扁（落地瞬间），>1 拉伸（跳跃）
 * @param {number} v.rage 0..1 狂暴程度（影响颜色与眼睛）
 * @param {number} v.hurt 受伤闪白
 * @param {number} v.dead 0..1 死亡进度
 * @param {number} [v.scale=1]
 */
export function drawMonstro(ctx, v = {}) {
  const t = v.t || 0;
  const s = v.scale === undefined ? 1 : v.scale;
  if (v.dead > 0) {
    drawMonstroDeath(ctx, v.dead, s);
    return;
  }
  const rage = v.rage || 0;
  const squashY = v.squash === undefined ? 1 : v.squash;
  const squashX = 1 / Math.max(0.4, Math.sqrt(squashY));

  // 呼吸
  const breathe = 1 + Math.sin(t * 1.9) * 0.018;

  ctx.save();
  ctx.translate(0, 0);
  groundShadow(ctx, 0, 30, 40 * squashX, 12, 0.4);

  ctx.scale(s * squashX * breathe, s * squashY * breathe);

  // ---- 短腿 ----
  for (const side of [-1, 1]) {
    inkShape(ctx, (c) => {
      c.moveTo(side * 10, 16);
      c.quadraticCurveTo(side * 20, 24, side * 22, 30);
      c.lineTo(side * 8, 30);
      c.closePath();
    }, { fill: lerpColor(PAL.monstroBodyShade, '#6a3020', rage), lineWidth: 3.4 });
    ellipse(ctx, side * 15, 30, 8, 4, { fill: lerpColor(PAL.monstroBodyShade, '#5a2a1a', rage), lineWidth: 3 });
  }

  // ---- 主体（大肿瘤团）----
  const bodyTop = lerpColor(PAL.monstroBody, '#8a3a2a', rage);
  const bodyBot = lerpColor(PAL.monstroBodyShade, '#5a2018', rage);
  const bodyGrad = radialHighlight(ctx, -6, -12, 40, bodyTop, bodyBot, -0.32, -0.36);

  inkShape(ctx, (c) => {
    // 用多段贝塞尔勾勒畸形的团块轮廓
    c.moveTo(-30, 6);
    c.bezierCurveTo(-38, -14, -26, -32, -8, -34);
    c.bezierCurveTo(6, -36, 18, -28, 24, -18);
    c.bezierCurveTo(36, -10, 36, 10, 26, 20);
    c.bezierCurveTo(16, 30, -8, 32, -18, 26);
    c.bezierCurveTo(-26, 22, -28, 14, -30, 6);
    c.closePath();
  }, { fill: bodyGrad, lineWidth: 3.6 });

  // ---- 疣状突起（体表小包）----
  ctx.save();
  ctx.globalAlpha = 0.85;
  const warts = [
    [-20, -20, 4.6], [12, -26, 3.8], [22, -6, 4.2], [-24, -2, 3.4],
    [8, 18, 3.6], [-14, 20, 3.2], [26, 8, 3.0],
  ];
  for (const [wx, wy, wr] of warts) {
    circle(ctx, wx, wy, wr, {
      fill: lerpColor(PAL.monstroBodyShade, '#6a2818', rage),
      lineWidth: 2.4,
      stroke: 'rgba(26,13,13,0.7)',
    });
    circle(ctx, wx - wr * 0.3, wy - wr * 0.35, wr * 0.42, { fill: 'rgba(255,255,255,0.22)', stroke: null });
  }
  ctx.restore();

  // ---- 米黄色大肚皮（下腹）----
  const bellyGrad = ctx.createLinearGradient(0, 2, 0, 28);
  bellyGrad.addColorStop(0, lerpColor(PAL.monstroBelly, '#d8b090', rage * 0.5));
  bellyGrad.addColorStop(1, lerpColor(PAL.monstroBellyShade, '#a88060', rage * 0.5));
  inkShape(ctx, (c) => {
    c.ellipse(0, 14, 22, 15, 0, 0, TAU);
  }, { fill: bellyGrad, lineWidth: 3.2 });
  // 肚皮分节线
  ctx.save();
  ctx.strokeStyle = 'rgba(120,95,65,0.55)';
  ctx.lineWidth = 1.8;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(0, 12, 8 + i * 5, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
  ctx.restore();

  // ---- 两只大眼（突出）----
  drawBossEye(ctx, -13, -20, rage, t, 0);
  drawBossEye(ctx, 11, -21, rage, t, 1.2);

  // ---- 巨嘴 ----
  drawMonstroMouth(ctx, 0, 2, v.mouth || 0, rage, t);

  // ---- 受伤闪白 ----
  if (v.hurt > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = Math.min(0.7, v.hurt);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-46, -46, 92, 84);
    ctx.restore();
  }

  ctx.restore();
}

function drawBossEye(ctx, x, y, rage, t, phase) {
  const jitter = Math.sin(t * 7 + phase) * 0.8;
  const R = 9.2;
  // 眼白（充血时偏红）
  const white = rage > 0.4 ? lerpColor('#ffffff', '#ffb0b0', (rage - 0.4) / 0.6) : '#ffffff';
  circle(ctx, x, y + jitter * 0.4, R, { fill: white, stroke: PAL.ink, lineWidth: 3 });
  // 血丝
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
  // 瞳孔（追视玩家：由 phase 带来的微小偏移模拟）
  const pOff = Math.sin(t * 1.3 + phase) * 1.6;
  circle(ctx, x + pOff, y + jitter * 0.4 + 0.6, R * 0.46, { fill: PAL.monstroPupil, stroke: null });
  circle(ctx, x + pOff - 1.6, y + jitter * 0.4 - 1.4, R * 0.16, { fill: '#ffffff', stroke: null });
}

function drawMonstroMouth(ctx, x, y, open, rage, t) {
  const openAmt = open;
  const w = 26;
  const h = 4 + openAmt * 15; // 闭合时是细缝，张开是大洞

  // 口腔
  const grad = ctx.createRadialGradient(x, y + h * 0.2, 1, x, y, w);
  grad.addColorStop(0, '#260505');
  grad.addColorStop(0.75, PAL.monstroMouth);
  grad.addColorStop(1, '#7a1010');
  inkShape(ctx, (c) => c.ellipse(x, y, w, h, 0, 0, TAU), {
    fill: grad, lineWidth: 3.4,
  });

  // 上下唇的肉色牙龈
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y, w, h, 0, 0, TAU);
  ctx.clip();
  ctx.fillStyle = PAL.monstroGum;
  ctx.fillRect(x - w, y - h - 2, w * 2, 4.2);
  ctx.fillRect(x - w, y + h - 2.2, w * 2, 4.2);
  // 舌头（张嘴时露出）
  if (openAmt > 0.4) {
    ctx.globalAlpha = (openAmt - 0.4) / 0.6;
    ctx.fillStyle = '#c9455a';
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.45, w * 0.6, h * 0.42, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // 牙齿（张得越开越明显）
  if (openAmt > 0.08) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, openAmt * 2.2);
    ctx.fillStyle = '#f4eeda';
    ctx.strokeStyle = PAL.ink;
    ctx.lineWidth = 1.6;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const px = x - w + 2.5 + i * ((w * 2 - 5) / (n - 1));
      const th = h * 0.55;
      // 上牙
      ctx.beginPath();
      ctx.moveTo(px - 2.6, y - h + 1);
      ctx.lineTo(px + 2.6, y - h + 1);
      ctx.lineTo(px, y - h + 1 + th);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // 下牙
      ctx.beginPath();
      ctx.moveTo(px - 2.6, y + h - 1);
      ctx.lineTo(px + 2.6, y + h - 1);
      ctx.lineTo(px, y + h - 1 - th * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawMonstroDeath(ctx, p, s) {
  const e = 1 - p;
  ctx.save();
  ctx.translate(0, p * 10);
  ctx.globalAlpha = Math.min(1, e * 1.5);
  ctx.scale(s * (1 + p * 0.25), s * Math.max(0.05, e));
  inkShape(ctx, (c) => {
    c.ellipse(0, 6, 32, 30, 0, 0, TAU);
  }, { fill: PAL.monstroBodyShade, lineWidth: 3.6 });
  ctx.restore();

  // 崩解的血肉块
  ctx.save();
  ctx.globalAlpha = Math.min(1, e);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + 0.4;
    const d = 8 + p * 50;
    const r = Math.max(0.6, (6 - (i % 4)) * e);
    ctx.fillStyle = i % 3 === 0 ? '#8a3a2a' : PAL.monstroBodyShade;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d * 0.8 + p * 14, r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

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
