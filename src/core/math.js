/**
 * math.js — 无分配的向量/几何/插值工具
 *
 * 性能约定（core 层零热路径分配）：
 * - 需要每帧调用的函数把结果写入调用方传入的 out 对象，避免 GC 抖动。
 * - 纯标量函数（clamp/lerp/dist2）返回 number，无分配。
 */

export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** 帧率无关的指数趋近（用于平滑跟随/相机） */
export function damp(current, target, smoothing, dt) {
  return lerp(current, target, 1 - Math.pow(smoothing, dt));
}

export function sign(v) {
  return v < 0 ? -1 : v > 0 ? 1 : 0;
}

/** 平方距离——避免 sqrt，用于比较 */
export function dist2(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function dist(ax, ay, bx, by) {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

/** AABB 相交：矩形用 {x, y, w, h}，x/y 为左上角 */
export function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/** 圆 × 矩形（用于子弹打房间墙壁 / 门） */
export function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

/** 矩形中心 */
export function rectCenterX(r) {
  return r.x + r.w * 0.5;
}
export function rectCenterY(r) {
  return r.y + r.h * 0.5;
}

/** 把角度规整到 (-PI, PI] */
export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a <= -Math.PI) a += TAU;
  return a;
}

/**
 * 把方向（dx,dy）吸附到四方向之一，返回角度（弧度）。
 * 用于方向键四方向射击。若为零向量返回 null。
 */
export function snapTo4(dx, dy) {
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 0 : Math.PI;
  }
  return dy >= 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
}

/**
 * 把方向吸附到最近的 8 方向（用于带摇杆的移动端手感更顺滑）。
 */
export function snapTo8(dx, dy) {
  if (dx === 0 && dy === 0) return null;
  const a = Math.atan2(dy, dx);
  const step = TAU / 8;
  return Math.round(a / step) * step;
}

/** 归一化到 out {x,y}；零向量保持不变 */
export function normalizeTo(x, y, out) {
  const len = Math.hypot(x, y);
  if (len > 1e-6) {
    out.x = x / len;
    out.y = y / len;
  } else {
    out.x = 0;
    out.y = 0;
  }
  return out;
}

/** 角度 → 单位向量写回 out */
export function angleToVec(angle, out) {
  out.x = Math.cos(angle);
  out.y = Math.sin(angle);
  return out;
}
