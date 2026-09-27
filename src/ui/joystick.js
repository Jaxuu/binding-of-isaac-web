/**
 * joystick.js — 移动端虚拟摇杆 + 射击摇杆（Canvas 绘制 + 指针驱动）
 *
 * 设计（见 ADR-004）：
 * - 不用 DOM 元素做摇杆，而是直接画在 Canvas 上、用 Input 的指针通道驱动。
 *   好处：零布局/零 CSS、与游戏同分辨率、可与画面特效混用（发光、拖尾）。
 * - 双摇杆：左半屏 = 移动，右半屏 = 射击（由 core/input.js 的 _handlePointerDown 分流）。
 * - 自适应：只要设备「具备触摸能力」（input.touchCapable，静态探测）或用户曾用过触摸
 *   （input.usingTouch）就显示，避免桌面鼠标误触。触屏设备在**任何触摸之前**即显示待机底盘
 *   （仅底盘 + 外圈 + 十字刻度，α=0.42），按下才画摇杆头与图标。
 * - 矮视口（H < 560）自动缩小半径至 42 并上移至 0.72H，给属性条 / Boss 血条让位。
 *   视觉依据：design/mobile-controls-spec.md（林绘澄）。
 *
 * 本模块只负责「绘制」，指针逻辑在 Input 里，保证逻辑单一来源。
 */

import { PAL } from '../art/palette.js';
import { circle, strokedText, inkShape } from '../art/primitives.js';
import { TAU } from '../core/math.js';

/**
 * 待机（无触摸）时摇杆底盘的常驻透明度下限。
 * 依据 design/mobile-controls-spec.md §1：在最亮地砖 floorTreasure(#5b5343, L≈0.087)
 * 上，ring 白需 α≥0.29 才明显可辨；取 0.42 落在「可辨但退让」甜点区，
 * 并给激活态(1.0)留出 2.4× 层级差。
 */
const IDLE_ALPHA = 0.42;
/** 矮视口阈值：H < 560 时缩小半径并上移，给底部 HUD 让位（spec §4） */
const SHORT_VIEW_H = 560;
/** 常规/矮视口半径（spec §4） */
const STICK_R = 52;
const STICK_R_SHORT = 42;

export class JoystickRenderer {
  constructor() {
    this.alpha = 0;
    this.alphaMove = 0;
    this.alphaFire = 0;
    this.enabled = false;
  }

  /** 是否应该显示（设备具备触摸能力，或用户曾用过触摸） */
  update(dt, input) {
    const shouldShow = input.touchCapable || input.usingTouch;
    this.enabled = shouldShow;
    // 缓动终点：激活 → 1.0，待机 → 0.42（非 0，否则触摸前看不见）
    const targetM = input.stickMove.active ? 1 : IDLE_ALPHA;
    const targetF = input.stickFire.active ? 1 : IDLE_ALPHA;
    // 出现快、消失慢（避免手指抬起瞬间摇杆闪掉）
    this.alphaMove += (targetM - this.alphaMove) * Math.min(1, dt * (targetM > this.alphaMove ? 18 : 7));
    this.alphaFire += (targetF - this.alphaFire) * Math.min(1, dt * (targetF > this.alphaFire ? 18 : 7));
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('../core/input.js').Input} input
   * @param {number} [viewW] 视口宽（用于待机态固定位）
   * @param {number} [viewH] 视口高（用于矮视口自适应）
   */
  draw(ctx, input, viewW, viewH) {
    if (!this.enabled) return;
    const W = viewW || (ctx.canvas && ctx.canvas.clientWidth) || 0;
    const H = viewH || (ctx.canvas && ctx.canvas.clientHeight) || 0;
    // 矮视口自适应（spec §4）：半径缩小 + 纵位上移，给属性条 / Boss 血条让位
    const stickR = H < SHORT_VIEW_H ? STICK_R_SHORT : STICK_R;
    const stickY = H < SHORT_VIEW_H ? H * 0.72 : H * 0.78;
    // 横向不变 0.16W / 0.84W；但保证不越出屏幕
    const moveX = W * 0.16;
    const fireX = W * 0.84;
    this._drawStick(ctx, input.stickMove, this.alphaMove, {
      baseColor: 'rgba(240,230,210,0.16)',
      knobColor: 'rgba(240,230,210,0.62)',
      ring: 'rgba(255,255,255,0.42)',
      knobRing: 'rgba(255,255,255,0.6)',
      icon: 'move',
    }, moveX, stickY, stickR);
    this._drawStick(ctx, input.stickFire, this.alphaFire, {
      baseColor: 'rgba(220,90,70,0.18)',
      knobColor: 'rgba(230,110,80,0.68)',
      ring: 'rgba(255,180,150,0.5)',
      knobRing: 'rgba(255,190,160,0.65)',
      icon: 'fire',
    }, fireX, stickY, stickR);
  }

  _drawStick(ctx, stick, alpha, style, defaultX = 0, defaultY = 0, maxR = STICK_R) {
    if (alpha < 0.02) return;
    // 摇杆位置：激活时用动态原点（手指按下处），待机时退回视口固定位。
    // 注意：松手后 Input 会把 originX/Y 复位为 0，故仅凭 originX!=0 判定会误用 (0,0)，
    // 因此以 stick.active 为准 —— 未激活一律画在待机固定位。
    const useOrigin = stick.active && stick.originX != null && stick.originY != null;
    const ox = useOrigin ? stick.originX : defaultX;
    const oy = useOrigin ? stick.originY : defaultY;

    ctx.save();
    ctx.globalAlpha = alpha;

    // 层 1（最底）：暗色底衬圆 —— 把背景地砖压暗，保证 ring 在亮/暗地砖上都稳定可读（spec §3）
    ctx.beginPath();
    ctx.arc(ox, oy, maxR + 4, 0, TAU);
    ctx.fillStyle = 'rgba(10,8,8,0.34)';
    ctx.fill();

    // 层 2：底盘
    ctx.beginPath();
    ctx.arc(ox, oy, maxR, 0, TAU);
    ctx.fillStyle = style.baseColor;
    ctx.fill();
    // 层 3：外圈
    ctx.lineWidth = 3;
    ctx.strokeStyle = style.ring;
    ctx.stroke();

    // 层 4：方向刻度（十字）—— 待机/激活都画
    ctx.save();
    ctx.globalAlpha = alpha * 0.4;
    ctx.strokeStyle = style.ring;
    ctx.lineWidth = 2;
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      ctx.beginPath();
      ctx.moveTo(ox + Math.cos(a) * (maxR * 0.62), oy + Math.sin(a) * (maxR * 0.62));
      ctx.lineTo(ox + Math.cos(a) * (maxR * 0.88), oy + Math.sin(a) * (maxR * 0.88));
      ctx.stroke();
    }
    ctx.restore();

    // 层 5/6：摇杆头 + 图标 —— **仅激活时绘制**（spec §2：待机态实心圆会被误认成场景物）
    if (!stick.active) {
      ctx.restore();
      return;
    }
    const kx = ox + stick.x * maxR;
    const ky = oy + stick.y * maxR;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(kx, ky, 22, 0, TAU);
    ctx.fillStyle = style.knobColor;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = style.knobRing;
    ctx.stroke();
    ctx.restore();

    // 图标
    if (style.icon === 'fire') {
      // 准心
      ctx.save();
      ctx.strokeStyle = 'rgba(255,220,200,0.9)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(kx, ky, 7, 0, TAU);
      ctx.moveTo(kx - 11, ky);
      ctx.lineTo(kx - 4, ky);
      ctx.moveTo(kx + 4, ky);
      ctx.lineTo(kx + 11, ky);
      ctx.moveTo(kx, ky - 11);
      ctx.lineTo(kx, ky - 4);
      ctx.moveTo(kx, ky + 4);
      ctx.lineTo(kx, ky + 11);
      ctx.stroke();
      ctx.restore();
    } else {
      // 方向箭头
      ctx.save();
      ctx.translate(kx, ky);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(-4, -4);
        ctx.lineTo(4, -4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore();
  }
}

/**
 * 供 HTML 层（可选）使用的 DOM 摇杆。
 * 本作默认不用：全部走 Canvas。保留此导出是为了「渐进增强」——
 * 如果之后要做可点击的 DOM 按钮（如暂停按钮），可复用。
 */
export function makeDomStick(container, onMove, onFire) {
  const el = document.createElement('div');
  el.className = 'touch-stick';
  container.appendChild(el);
  return {
    move: el,
    fire: el,
    destroy: () => el.remove(),
  };
}
