/**
 * loop.js — 固定时间步游戏循环
 *
 * 决策（见 ADR-001 / architecture.md §游戏循环）：
 * - 逻辑更新固定 60Hz（FIXED_DT = 1/60），保证物理与手感帧率无关、可复现。
 * - 渲染跟随显示器刷新率（rAF），无插值造成额外复杂度 —— 本作是像素风俯视 2D，
 *   直接渲染最新状态即可，视觉上无差异。
 * - 累积器（accumulator）上限 MAX_STEPS，防止切后台回来后「追帧」卡死。
 */

export const FIXED_DT = 1 / 60;
const MAX_STEPS = 5;
/** 单帧最大允许 dt，防止长时间挂起后巨大跳变 */
const MAX_FRAME_DT = 0.25;

export class GameLoop {
  /**
   * @param {{update:(dt:number)=>void, render:(alpha:number)=>void}} handlers
   */
  constructor(handlers) {
    this.update = handlers.update;
    this.render = handlers.render;
    this.running = false;
    this._raf = 0;
    this._last = 0;
    this._acc = 0;

    // 性能遥测
    this.fps = 0;
    this.frameMs = 0;
    this._fpsAcc = 0;
    this._fpsFrames = 0;
    this.updateMs = 0;
    this.renderMs = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    this._acc = 0;
    this._raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  _tick = (now) => {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._tick);

    let frameDt = (now - this._last) / 1000;
    this._last = now;
    if (frameDt > MAX_FRAME_DT) frameDt = MAX_FRAME_DT;
    this.frameMs = frameDt * 1000;

    // FPS 平滑（每 0.25s 刷新一次读数）
    this._fpsAcc += frameDt;
    this._fpsFrames++;
    if (this._fpsAcc >= 0.25) {
      this.fps = Math.round(this._fpsFrames / this._fpsAcc);
      this._fpsAcc = 0;
      this._fpsFrames = 0;
    }

    this._acc += frameDt;
    let steps = 0;
    const t0 = performance.now();
    while (this._acc >= FIXED_DT && steps < MAX_STEPS) {
      this.update(FIXED_DT);
      this._acc -= FIXED_DT;
      steps++;
    }
    // 若累积过多（切标签页 / 严重掉帧 / 低端机），限制累积器上限而非清零 ——
    // 清零会整段吞掉游戏时间；保留下限（最多 2 个步长）可平滑恢复，避免时间跳跃。
    if (steps >= MAX_STEPS) this._acc = Math.min(this._acc, FIXED_DT * 2);
    this.updateMs = performance.now() - t0;

    const t1 = performance.now();
    this.render(this._acc / FIXED_DT);
    this.renderMs = performance.now() - t1;
  };
}
