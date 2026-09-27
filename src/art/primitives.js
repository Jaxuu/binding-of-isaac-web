/**
 * primitives.js — 绘制原语
 *
 * 所有形体的统一画法：先 stroke（粗黑描边在下层，稍微外扩），再 fill。
 * 这样能得到「粗黑描边 + 扁平填充」的卡通感，而不是细描边的矢量风。
 *
 * 关键函数：
 *   inkShape(ctx, pathFn, {fill, stroke, lineWidth})  —— 带描边的形状
 *   blob(ctx, x, y, r, seedRand, opts)                —— 不规则圆形（血肉感）
 *   ellipseGrad / roundRect / star / polygon
 */

import { PAL } from './palette.js';
import { TAU } from '../core/math.js';

/**
 * 以「先描边后填充」的方式绘制任意路径。
 * @param {CanvasRenderingContext2D} ctx
 * @param {(ctx: CanvasRenderingContext2D) => void} pathFn 路径构造函数（内部自行 beginPath）
 * @param {object} [opts]
 * @param {string|null} [opts.fill]
 * @param {string|null} [opts.stroke]
 * @param {number} [opts.lineWidth=3]
 * @param {boolean} [opts.close=true]
 */
export function inkShape(ctx, pathFn, opts = {}) {
  const fill = opts.fill === undefined ? null : opts.fill;
  const stroke = opts.stroke === undefined ? PAL.ink : opts.stroke;
  const lw = opts.lineWidth === undefined ? 3 : opts.lineWidth;
  ctx.save();
  ctx.beginPath();
  pathFn(ctx);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke && lw > 0) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.restore();
}

/** 圆（带描边/填充） */
export function circle(ctx, x, y, r, opts = {}) {
  inkShape(ctx, (c) => c.arc(x, y, r, 0, TAU), opts);
}

/** 椭圆 */
export function ellipse(ctx, x, y, rx, ry, opts = {}, rot = 0) {
  inkShape(ctx, (c) => c.ellipse(x, y, rx, ry, rot, 0, TAU), opts);
}

/** 圆角矩形路径（不含 beginPath 之外的开销，供 inkShape 复用） */
export function roundRectPath(c, x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  c.moveTo(x + rr, y);
  c.lineTo(x + w - rr, y);
  c.arcTo(x + w, y, x + w, y + rr, rr);
  c.lineTo(x + w, y + h - rr);
  c.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  c.lineTo(x + rr, y + h);
  c.arcTo(x, y + h, x, y + h - rr, rr);
  c.lineTo(x, y + rr);
  c.arcTo(x, y, x + rr, y, rr);
}

/** 圆角矩形（带描边/填充） */
export function roundRect(ctx, x, y, w, h, r, opts = {}) {
  inkShape(ctx, (c) => roundRectPath(c, x, y, w, h, r), opts);
}

/** 多边形（points 为 [x,y,x,y,...] 的扁平数组，或 [{x,y}] 数组） */
export function polygon(ctx, points, opts = {}) {
  inkShape(ctx, (c) => {
    if (points.length === 0) return;
    if (typeof points[0] === 'number') {
      c.moveTo(points[0], points[1]);
      for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
    } else {
      c.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) c.lineTo(points[i].x, points[i].y);
    }
    c.closePath();
  }, opts);
}

/**
 * 不规则「血肉团」形状 —— 以撒美术的核心笔法。
 * 用极坐标 + 每角随机扰动生成闭合曲线，得到手绘感的不规则圆。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} r 基础半径
 * @param {number[]} jitter 每个控制点的半径扰动系数（长度=采样数）
 * @param {object} [opts]
 * @param {number} [opts.squashY=1] 纵向压缩（<1 更扁）
 * @param {number} [opts.rot=0]
 */
export function blob(ctx, x, y, r, jitter, opts = {}) {
  const n = jitter.length;
  const squashY = opts.squashY === undefined ? 1 : opts.squashY;
  const rot = opts.rot || 0;
  inkShape(ctx, (c) => {
    // 用二次贝塞尔平滑连接，避免多边形的折角感
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * TAU;
      const rr = r * (1 + jitter[i]);
      pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * squashY });
    }
    if (pts.length < 3) return;
    // Catmull-Rom → 采样点，直接 lineTo 也够平滑（n 足够大时）
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < n; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % n];
      const mx = (p0.x + p1.x) * 0.5;
      const my = (p0.y + p1.y) * 0.5;
      c.quadraticCurveTo(p0.x, p0.y, mx, my);
    }
    c.closePath();
  }, opts);
}

/**
 * 生成一个固定长度的 jitter 数组（确定性，避免每帧抖动 → 动画闪烁）。
 * @param {number} n
 * @param {number} amount 0.1 = ±10%
 * @param {import('../core/rng.js').Rng} rng
 */
export function makeJitter(n, amount, rng) {
  const arr = new Array(n);
  for (let i = 0; i < n; i++) arr[i] = rng.range(-amount, amount);
  return arr;
}

/** 径向高光（用于球体/眼睛/道具的立体感） */
export function radialHighlight(ctx, x, y, r, inner, outer, offX = -0.32, offY = -0.36) {
  const g = ctx.createRadialGradient(x + r * offX, y + r * offY, r * 0.05, x, y, r);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  return g;
}

/** 线性渐变（from 顶部亮 → to 底部暗），用于扁平加微渐变的身体 */
export function linearShade(ctx, x, y, w, h, top, bottom) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  return g;
}

/** 星形（爆炸/闪光/星星眼） */
export function star(ctx, x, y, outer, inner, points, opts = {}, rot = -Math.PI / 2) {
  inkShape(ctx, (c) => {
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = rot + (i / (points * 2)) * TAU;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
  }, opts);
}

/**
 * 描边文字（卡通 UI 的标准做法：先画深色描边再填色）
 */
export function strokedText(ctx, text, x, y, {
  font = '16px "Trebuchet MS", sans-serif',
  fill = PAL.uiText,
  stroke = PAL.ink,
  lineWidth = 4,
  align = 'left',
  baseline = 'alphabetic',
  maxWidth,
} = {}) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  if (stroke) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    if (maxWidth) ctx.strokeText(text, x, y, maxWidth);
    else ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = fill;
  if (maxWidth) ctx.fillText(text, x, y, maxWidth);
  else ctx.fillText(text, x, y);
  ctx.restore();
}

/** 阴影辅助：在绘制物体前把 ctx.shadowBlur 打开，画完恢复 */
export function withShadow(ctx, { color = PAL.shadow, blur = 6, offY = 3 } = {}, fn) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = offY;
  fn();
  ctx.restore();
}

/** 地面投影（椭圆软阴影），让实体有「站在地上」的感觉 */
export function groundShadow(ctx, x, y, rx, ry, alpha = 0.3) {
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(0.7, `rgba(0,0,0,${alpha * 0.5})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}
