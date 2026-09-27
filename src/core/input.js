/**
 * input.js — 输入抽象层
 *
 * 职责：把「物理输入源」（键盘 / 指针 / 虚拟摇杆）归一化为「逻辑动作」。
 * 游戏逻辑永远只读逻辑动作，不直接读 DOM 事件 —— 这样桌面与移动端共用同一套玩法代码。
 * 见 ADR-004。
 *
 * 逻辑动作：
 *   moveX / moveY        —— 归一化移动向量（WASD 或摇杆）
 *   fireX / fireY        —— 发射方向向量（方向键或射击摇杆）
 *   firing               —— 是否正在发射（含自动射击）
 *   pause / confirm / cancel —— 菜单动作（边沿触发）
 */

import { snapTo4, snapTo8, clamp } from './math.js';

/** 键盘 key → 逻辑动作映射 */
const KEY_MOVE = {
  KeyW: [0, -1],
  KeyA: [-1, 0],
  KeyS: [0, 1],
  KeyD: [1, 0],
};
const KEY_FIRE = {
  ArrowUp: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowRight: [1, 0],
};

/**
 * 静态触摸能力探测：不依赖任何一次事件，页面加载完成即可判定。
 * 与 `usingTouch`（表示「用户确实用触摸操作过」）语义不同 —— 后者在首次
 * pointerdown 之前恒为 false，若只依赖它，虚拟摇杆在首帧/待机态永远不可见。
 * @returns {boolean}
 */
function detectTouchCapable() {
  if (typeof window === 'undefined') return false;
  const coarse =
    typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const hasTouch =
    (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
  return coarse || hasTouch;
}

export class Input {
  /**
   * @param {HTMLCanvasElement} canvas 用于绑定指针事件与坐标换算
   * @param {HTMLElement} [overlay] 虚拟控件容器（摇杆 DOM），可空
   */
  constructor(canvas, overlay = null) {
    this.canvas = canvas;
    this.overlay = overlay;

    /** @type {Set<string>} 当前按下的物理键 code */
    this.keys = new Set();

    /** 菜单动作边沿：本帧是否刚按下 */
    this._pressed = new Set();
    /** 上一帧的按键快照，用于计算边沿 */
    this._prevKeys = new Set();

    /** 摇杆状态（由虚拟摇杆 / 触摸驱动，也可能被鼠标拖动驱动） */
    this.stickMove = { x: 0, y: 0, active: false };
    this.stickFire = { x: 0, y: 0, active: false };

    /** 输出：归一化逻辑动作，每帧 update() 后有效 */
    this.moveX = 0;
    this.moveY = 0;
    this.fireX = 0;
    this.fireY = 0;
    this.firing = false;

    /** 用户「是否已实际用触摸操作过」（首次 pointerdown 后置 true） */
    this.usingTouch = false;

    /**
     * 设备是否具备触摸能力（静态探测，首帧即可决定是否显示虚拟控件）。
     * 与 usingTouch 并列存在：前者是「能力」，后者是「事实」。
     */
    this.touchCapable = detectTouchCapable();

    /** 指针 → 摇杆 的指针 id 映射（多点触控） */
    this._pointers = new Map();

    this._bind();
  }

  _bind() {
    // ---- 键盘 ----
    this._onKeyDown = (e) => {
      // 阻止方向键/空格滚动页面
      if (
        e.code.startsWith('Arrow') ||
        e.code === 'Space' ||
        e.code === 'KeyW' ||
        e.code === 'KeyA' ||
        e.code === 'KeyS' ||
        e.code === 'KeyD'
      ) {
        e.preventDefault();
      }
      if (e.repeat) return;
      this.keys.add(e.code);
    };
    this._onKeyUp = (e) => {
      this.keys.delete(e.code);
    };
    this._onBlur = () => {
      this.keys.clear();
      this.stickMove.active = false;
      this.stickFire.active = false;
      this.stickMove.x = this.stickMove.y = 0;
      this.stickFire.x = this.stickFire.y = 0;
    };

    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);

    // ---- 指针（鼠标 + 触屏统一）----
    // 由虚拟控件层注册自己的 pointerdown；此处只处理「画布空白区拖动 = 移动摇杆」
    // 的动态摇杆（类似《以撒》手游的左侧半屏拖动）。
    this._onPointerDown = (e) => this._handlePointerDown(e);
    this._onPointerMove = (e) => this._handlePointerMove(e);
    this._onPointerUp = (e) => this._handlePointerUp(e);

    this.canvas.addEventListener('pointerdown', this._onPointerDown, { passive: false });
    window.addEventListener('pointermove', this._onPointerMove, { passive: false });
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
  }

  /** 虚拟控制层调用：声明某指针属于哪个摇杆 */
  claimPointer(pointerId, which) {
    this._pointers.set(pointerId, { which, originX: 0, originY: 0 });
  }

  /**
   * 动态摇杆：在画布空白区域按下即产生摇杆原点。
   * 左半屏 → 移动；右半屏 → 射击。
   */
  _handlePointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.usingTouch = e.pointerType !== 'mouse';
    if (this._pointers.has(e.pointerId)) return;

    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const which = px < rect.width * 0.5 ? 'move' : 'fire';
    this._pointers.set(e.pointerId, { which, originX: px, originY: py, x: px, y: py });
    this._setStick(which, 0, 0, true, px, py);
  }

  _handlePointerMove(e) {
    const p = this._pointers.get(e.pointerId);
    if (!p) return;
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    p.x = px;
    p.y = py;
    const dx = px - p.originX;
    const dy = py - p.originY;
    const maxR = 52;
    const len = Math.hypot(dx, dy);
    const dead = 6;
    if (len < dead) {
      this._setStick(p.which, 0, 0, true, p.originX, p.originY);
      return;
    }
    const scale = Math.min(len, maxR) / len;
    const nx = (dx * scale) / maxR;
    const ny = (dy * scale) / maxR;
    this._setStick(p.which, clamp(nx, -1, 1), clamp(ny, -1, 1), true, p.originX, p.originY);
  }

  _handlePointerUp(e) {
    if (!this._pointers.has(e.pointerId)) return;
    const p = this._pointers.get(e.pointerId);
    this._pointers.delete(e.pointerId);
    this._setStick(p.which, 0, 0, false, 0, 0);
  }

  /** 虚拟控件（DOM 摇杆/射击按钮）直接写入摇杆通道 */
  _setStick(which, x, y, active, originX = 0, originY = 0) {
    if (which === 'move') {
      this.stickMove.x = x;
      this.stickMove.y = y;
      this.stickMove.active = active;
      this.stickMove.originX = originX;
      this.stickMove.originY = originY;
    } else {
      this.stickFire.x = x;
      this.stickFire.y = y;
      this.stickFire.active = active;
      this.stickFire.originX = originX;
      this.stickFire.originY = originY;
    }
  }

  /**
   * 供 UI 层调用（DOM 摇杆组件 / 测试脚本）。
   * 不传入原点 → originX/Y 记为 null（「未指定」），渲染层会回退到待机固定位，
   * 而不是误画在 (0,0) 角落。真实触摸由 _handlePointerDown/Move 传入 px/py 原点。
   */
  setStick(which, x, y, active) {
    this._setStick(which, x, y, active, null, null);
  }

  /** 边沿检测（本帧刚按下） */
  pressed(code) {
    return this._pressed.has(code);
  }

  /** 每帧在逻辑更新前调用一次：把物理输入折算为逻辑动作 */
  update() {
    // ---- 移动：键盘 WASD 优先，其次摇杆 ----
    let mx = 0;
    let my = 0;
    let kb = false;
    for (const code in KEY_MOVE) {
      if (this.keys.has(code)) {
        mx += KEY_MOVE[code][0];
        my += KEY_MOVE[code][1];
        kb = true;
      }
    }
    if (!kb && (this.stickMove.x !== 0 || this.stickMove.y !== 0)) {
      mx = this.stickMove.x;
      my = this.stickMove.y;
    }
    // 归一化（摇杆给小量时保留模拟量，键盘则是 1）
    const mlen = Math.hypot(mx, my);
    if (mlen > 1) {
      mx /= mlen;
      my /= mlen;
    }
    this.moveX = mx;
    this.moveY = my;

    // ---- 发射方向：方向键四方向优先，其次射击摇杆（8 方向吸附）----
    let fx = 0;
    let fy = 0;
    for (const code in KEY_FIRE) {
      if (this.keys.has(code)) {
        fx += KEY_FIRE[code][0];
        fy += KEY_FIRE[code][1];
      }
    }
    if (fx === 0 && fy === 0 && (this.stickFire.x !== 0 || this.stickFire.y !== 0)) {
      fx = this.stickFire.x;
      fy = this.stickFire.y;
      const a = snapTo8(fx, fy);
      if (a !== null) {
        fx = Math.cos(a);
        fy = Math.sin(a);
      }
      // 摇杆推离死区即自动持续射击
      this.firing = Math.hypot(fx, fy) > 0.28;
      this.fireX = fx;
      this.fireY = fy;
    } else if (fx !== 0 || fy !== 0) {
      const a = snapTo4(fx, fy);
      if (a !== null) {
        fx = Math.cos(a);
        fy = Math.sin(a);
      }
      this.fireX = fx;
      this.fireY = fy;
      this.firing = true;
    } else {
      // 无方向输入：可选键盘自动射击（Space 按住 → 面朝移动方向射击）
      this.fireX = 0;
      this.fireY = 0;
      this.firing = false;
    }

    // ---- 菜单边沿 ----
    this._pressed.clear();
    for (const k of this.keys) {
      if (!this._prevKeys.has(k)) this._pressed.add(k);
    }
    this._prevKeys.clear();
    for (const k of this.keys) this._prevKeys.add(k);
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
  }
}
