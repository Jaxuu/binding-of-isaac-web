/**
 * draw-player.js — 以撒本体绘制
 *
 * 造型要点（对照原作）：
 * - 光头大脑袋（圆），带一点腮红，两颗黑豆眼，嘴是小小的下弯弧
 * - 身体是比头小的圆滚滚奶油色躯干，裸上身
 * - 头顶两侧有小耳朵/突起（原作是光头的头型起伏）
 * - 受伤时闪白/闪红；无敌帧闪烁由调用方控制 alpha
 * - 朝向会影响眼睛位置与身体偏移（4 向）
 *
 * 外观随属性变化（道具改变角色外观的核心诉求）：
 * - 恶魔形态（Brimstone）→ 头顶生角、眼睛变红
 * - 变体（crown / halo / wings）由 PlayerVisual 传入
 */

import { PAL } from './palette.js';
import { circle, ellipse, inkShape, groundShadow, linearShade, radialHighlight } from './primitives.js';
import { TAU } from '../core/math.js';

/**
 * 绘制以撒
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x 中心 x
 * @param {number} y 中心 y（脚底基准略上）
 * @param {object} v 视觉状态
 * @param {number} v.facing 朝向角度（用于眼睛偏移）
 * @param {number} v.bob 走路上下浮动偏移（像素，由调用方按时间算好）
 * @param {number} v.flash 0..1 受伤闪白强度
 * @param {boolean} v.devil 恶魔形态（角 + 红眼）
 * @param {boolean} v.crown 戴皇冠
 * @param {boolean} v.halo 头顶光环
 * @param {boolean} v.wings 背生翅膀
 * @param {string} [v.skin] 覆写肤色（如染血）
 * @param {number} [v.scale=1] 整体缩放
 */
export function drawPlayer(ctx, x, y, v = {}) {
  const s = v.scale === undefined ? 1 : v.scale;
  const facing = v.facing || 0;
  const bob = v.bob || 0;
  const flash = v.flash || 0;

  // 朝向单位向量（用于眼睛/身体偏移）
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(s, s);

  // 地面投影（不随 bob 抖动）
  groundShadow(ctx, 0, 20 - bob * 0.5, 16, 7, 0.32);

  // 视觉中心的 y（身体中心）
  const cy = -6;

  // ---- 背后的翅膀（先画，在身体后面）----
  if (v.wings) {
    drawWings(ctx, cy, -fy);
  }

  // ---- 身体（奶油色圆滚躯干）----
  const bodyGrad = linearShade(ctx, -14, cy - 6, 28, 34, PAL.isaacBody, PAL.isaacSkinShade);
  inkShape(ctx, (c) => {
    c.ellipse(0, cy + 10, 13.5, 15, 0, 0, TAU);
  }, { fill: bodyGrad, lineWidth: 3 });

  // 身体中线（肚脐/躯干起伏的暗示）
  ctx.save();
  ctx.strokeStyle = 'rgba(160,120,90,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-2, cy + 6);
  ctx.quadraticCurveTo(1, cy + 12, -1, cy + 18);
  ctx.stroke();
  ctx.restore();

  // ---- 手臂（根据朝向左右偏）----
  const armX = fx * 3;
  const armY = fy * 1.5;
  circle(ctx, -12.5 + armX, cy + 9 + armY, 4.2, {
    fill: PAL.isaacBody, lineWidth: 2.6,
  });
  circle(ctx, 12.5 + armX, cy + 9 + armY, 4.2, {
    fill: PAL.isaacBody, lineWidth: 2.6,
  });

  // ---- 腿（两个小圆脚）----
  circle(ctx, -5.5, cy + 23.5, 4.4, { fill: PAL.isaacSkin, lineWidth: 2.8 });
  circle(ctx, 5.5, cy + 23.5, 4.4, { fill: PAL.isaacSkin, lineWidth: 2.8 });

  // ---- 头（大圆）----
  const headY = cy - 16;
  const headR = 15.5;
  const headGrad = radialHighlight(ctx, 0, headY, headR, PAL.isaacHead, PAL.isaacSkinShade, -0.3, -0.35);
  inkShape(ctx, (c) => c.arc(0, headY, headR, 0, TAU), { fill: headGrad, lineWidth: 3 });

  // 头顶的几根呆毛/起伏（原作光头也有小突起轮廓）
  ctx.save();
  ctx.strokeStyle = PAL.isaacSkinShade;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-6, headY - headR + 1);
  ctx.quadraticCurveTo(-3, headY - headR - 3.5, 0.5, headY - headR + 0.5);
  ctx.stroke();
  ctx.restore();

  // 腮红
  ctx.save();
  ctx.globalAlpha = 0.5;
  circle(ctx, -10, headY + 6, 3.2, { fill: '#f0a8a0', stroke: null });
  circle(ctx, 10, headY + 6, 3.2, { fill: '#f0a8a0', stroke: null });
  ctx.restore();

  // ---- 眼睛（随朝向偏移）----
  const eyeDX = fx * 2.6;
  const eyeDY = fy * 1.6;
  const eyeY = headY + 1.5 + eyeDY;
  drawEye(ctx, -5.2 + eyeDX, eyeY, v.devil);
  drawEye(ctx, 5.2 + eyeDX, eyeY, v.devil);

  // 嘴（小小的下弯）
  ctx.save();
  ctx.strokeStyle = PAL.isaacEye;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-3.5 + eyeDX * 0.6, headY + 8 + eyeDY * 0.6);
  ctx.quadraticCurveTo(0 + eyeDX * 0.6, headY + 6.2 + eyeDY * 0.6, 3.5 + eyeDX * 0.6, headY + 8 + eyeDY * 0.6);
  ctx.stroke();
  ctx.restore();

  // ---- 恶魔形态：双角 + 尖牙 ----
  if (v.devil) drawDevilHorns(ctx, headY, headR);

  // ---- 皇冠 ----
  if (v.crown) drawCrown(ctx, headY - headR - 2);

  // ---- 光环 ----
  if (v.halo) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#ffe98a';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ffe98a';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.ellipse(0, headY - headR - 8, 9, 3.2, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  // ---- 受伤闪白/闪红（叠加混合）----
  if (flash > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = Math.min(0.75, flash);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-30, -46, 60, 84);
    ctx.restore();
  }

  ctx.restore();
}

/** 单只眼睛（豆眼 + 高光） */
function drawEye(ctx, x, y, devil) {
  if (devil) {
    // 恶魔：红色发光眼
    ctx.save();
    ctx.shadowColor = '#ff2020';
    ctx.shadowBlur = 6;
    circle(ctx, x, y, 3.4, { fill: '#ff2a2a', stroke: PAL.ink, lineWidth: 1.6 });
    circle(ctx, x - 1, y - 1, 1.2, { fill: '#ffd0d0', stroke: null });
    ctx.restore();
    return;
  }
  circle(ctx, x, y, 3.2, { fill: PAL.isaacEye, stroke: PAL.ink, lineWidth: 1.4 });
  circle(ctx, x - 1, y - 1, 1.05, { fill: '#ffffff', stroke: null });
}

/** 恶魔角 */
function drawDevilHorns(ctx, headY, headR) {
  const hornFill = '#8a3a2a';
  inkShape(ctx, (c) => {
    c.moveTo(-headR + 2, headY - headR + 7);
    c.quadraticCurveTo(-headR - 6, headY - headR - 6, -headR + 1, headY - headR - 12);
    c.quadraticCurveTo(-headR + 4, headY - headR - 4, -headR + 8, headY - headR + 6);
    c.closePath();
  }, { fill: hornFill, lineWidth: 2.4 });
  inkShape(ctx, (c) => {
    c.moveTo(headR - 2, headY - headR + 7);
    c.quadraticCurveTo(headR + 6, headY - headR - 6, headR - 1, headY - headR - 12);
    c.quadraticCurveTo(headR - 4, headY - headR - 4, headR - 8, headY - headR + 6);
    c.closePath();
  }, { fill: hornFill, lineWidth: 2.4 });
}

/** 皇冠 */
function drawCrown(ctx, y) {
  inkShape(ctx, (c) => {
    c.moveTo(-10, y + 6);
    c.lineTo(-10, y - 2);
    c.lineTo(-6, y + 1);
    c.lineTo(-3, y - 6);
    c.lineTo(0, y + 1);
    c.lineTo(3, y - 6);
    c.lineTo(6, y + 1);
    c.lineTo(10, y - 2);
    c.lineTo(10, y + 6);
    c.closePath();
  }, { fill: PAL.itemGold, lineWidth: 2.4 });
  circle(ctx, 0, y + 2, 1.6, { fill: PAL.itemRed, stroke: PAL.ink, lineWidth: 1.2 });
}

/** 翅膀（背在身后） */
function drawWings(ctx, cy, backDir) {
  const dir = backDir >= 0 ? 1 : -1;
  const wy = cy - 2;
  ctx.save();
  ctx.globalAlpha = 0.95;
  for (const side of [-1, 1]) {
    inkShape(ctx, (c) => {
      c.moveTo(side * 8, wy);
      c.quadraticCurveTo(side * 26, wy - 14, side * 32, wy + 2);
      c.quadraticCurveTo(side * 24, wy + 6, side * 20, wy + 12);
      c.quadraticCurveTo(side * 16, wy + 4, side * 8, wy + 6);
      c.closePath();
    }, { fill: '#f6f0e0', lineWidth: 2.6 });
  }
  ctx.restore();
}
