/**
 * cache.js — 离屏画布预烘焙
 *
 * 动机：程序化绘制每帧重跑路径/渐变很贵（尤其墙体纹理由上千次 stroke 组成）。
 * 策略：把「不随时间变化」的绘制结果烘焙到 OffscreenCanvas（或回退到普通 canvas），
 * 每帧只 drawImage 一次。
 *
 * 适用范围：
 *   - 房间地面/墙体纹理（每层生成一次）
 *   - 道具图标（每个 id 一次）
 *   - UI 面板背景
 * 不适用：需要每帧变化的实体本体（但可用「按帧号烘焙」的精灵表，见 spriteBake）。
 */

/** 创建离屏画布（优先 OffscreenCanvas） */
export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** 统一取 2d 上下文（OffscreenCanvas 与 HTMLCanvasElement 接口一致） */
export function ctx2d(canvas) {
  return canvas.getContext('2d');
}

/**
 * 烘焙缓存：按 key 缓存离屏画布。
 * 用法：
 *   const key = cacheKey('room-floor', roomId, floorTheme);
 *   const cv = cacheGet(key) || cacheSet(key, drawInto(makeCanvas(W,H)));
 */
const _cache = new Map();

export function cacheKey(...parts) {
  return parts.join('|');
}

export function cacheGet(key) {
  return _cache.get(key);
}

export function cacheSet(key, canvas) {
  _cache.set(key, canvas);
  return canvas;
}

export function cacheHas(key) {
  return _cache.has(key);
}

/** 清空缓存（切换楼层时如果主题变化，需要重建） */
export function cacheClear(prefix = null) {
  if (prefix === null) {
    _cache.clear();
    return;
  }
  for (const k of Array.from(_cache.keys())) {
    if (k.startsWith(prefix)) _cache.delete(k);
  }
}

/**
 * 便捷：如果 key 不存在，就用 painter 在新建的离屏画布上绘制并缓存。
 * @param {string} key
 * @param {number} w
 * @param {number} h
 * @param {(ctx: CanvasRenderingContext2D, canvas: any) => void} painter
 */
export function bake(key, w, h, painter) {
  const hit = _cache.get(key);
  if (hit) return hit;
  const cv = makeCanvas(w, h);
  const c = ctx2d(cv);
  painter(c, cv);
  _cache.set(key, cv);
  return cv;
}

/**
 * 精灵表烘焙：把「帧号 → 绘制函数」的动画一次性烘焙成横向排列的图集。
 * 适合：敌人行走循环、Boss 张嘴循环。运行时只 drawImage 切片，零路径计算。
 *
 * @param {string} key
 * @param {number} frames
 * @param {number} fw 单帧宽
 * @param {number} fh 单帧高
 * @param {(ctx: CanvasRenderingContext2D, frame: number) => void} painter
 * @returns {any} 图集（宽 = fw*frames）
 */
export function bakeSheet(key, frames, fw, fh, painter) {
  const hit = _cache.get(key);
  if (hit) return hit;
  const cv = makeCanvas(fw * frames, fh);
  const c = ctx2d(cv);
  for (let f = 0; f < frames; f++) {
    c.save();
    c.translate(f * fw, 0);
    // 坐标系原点移到帧中心，方便实体绘制函数以 (0,0) 为中心作画
    c.translate(fw * 0.5, fh * 0.5);
    painter(c, f);
    c.restore();
  }
  _cache.set(key, cv);
  return cv;
}

/** 绘制图集的一帧到目标位置（中心对齐） */
export function drawSheetFrame(ctx, sheet, frame, fw, fh, x, y, opts = {}) {
  const sx = frame * fw;
  const w = opts.w || fw;
  const h = opts.h || fh;
  if (opts.flipX) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.drawImage(sheet, sx, 0, fw, fh, -w * 0.5, -h * 0.5, w, h);
    ctx.restore();
    return;
  }
  ctx.drawImage(sheet, sx, 0, fw, fh, x - w * 0.5, y - h * 0.5, w, h);
}
