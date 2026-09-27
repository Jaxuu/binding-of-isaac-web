/**
 * main.js — 引导与主循环装配
 *
 * 装配顺序（重要）：
 *   1. 拿到 canvas，处理 HiDPI
 *   2. 创建 EventBus / Audio / Input / GameState / Renderer / Joystick
 *   3. 用 GameLoop 驱动固定步 update + 可变帧 render
 *   4. 处理窗口 resize、可见性变化（切后台自动暂停）、指针（UI 点击 / 音频解锁）
 */

import { EventBus } from './core/events.js';
import { Audio } from './core/audio.js';
import { Input } from './core/input.js';
import { GameLoop, FIXED_DT } from './core/loop.js';
import { GameState, SCENE } from './systems/game.js';
import { Renderer } from './art/renderer.js';
import { JoystickRenderer } from './ui/joystick.js';

function boot() {
  const canvas = document.getElementById('game');
  if (!canvas) {
    console.error('[boot] 找不到 #game canvas');
    return;
  }

  const bus = new EventBus();
  const audio = new Audio();
  const input = new Input(canvas);
  const joystick = new JoystickRenderer();

  const game = new GameState({
    bus,
    input,
    audio,
    width: window.innerWidth,
    height: window.innerHeight,
  });
  game.showDebug = false;

  const renderer = new Renderer(canvas, game, joystick);

  // ---------------- 事件绑定 ----------------

  // 尺寸变化
  const onResize = () => {
    renderer.resize();
    game.W = renderer.viewW;
    game.H = renderer.viewH;
    game._h = renderer.viewH;
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 120));
  onResize();

  // 首次交互解锁音频（浏览器策略要求用户手势）
  const unlock = () => {
    audio.unlock();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  // 指针 → UI 命中检测（菜单按钮点击）
  let pointerDownPos = null;
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    pointerDownPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!pointerDownPos) return;
    const rect = canvas.getBoundingClientRect();
    const up = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const dist = Math.hypot(up.x - pointerDownPos.x, up.y - pointerDownPos.y);
    pointerDownPos = null;
    // 视为「点击」而非「拖动」时才触发按钮
    if (dist > 12) return;
    if (game.scene !== SCENE.PLAYING) {
      game.setMouse(up.x, up.y);
      game.handleUIClick(up.x, up.y);
    }
  });

  // 鼠标移动 → hover 状态
  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    game.setMouse(e.clientX - rect.left, e.clientY - rect.top);
  });
  canvas.addEventListener('pointerleave', () => game.setMouse(-1, -1));

  // 切后台自动暂停（防止回来时时间跳变 + 被偷袭）
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.scene === SCENE.PLAYING) {
      game.gotoScene(SCENE.PAUSED);
    }
  });

  // 调试开关：F3 显示 FPS/实体数
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3') {
      game.showDebug = !game.showDebug;
      e.preventDefault();
    }
    // 静音切换：M（音效与配乐同时静音）
    if (e.code === 'KeyM') {
      game.audioMuted = audio.toggleMuted();
    }
    // 快速重开：R（在死亡/通关界面）
    if (e.code === 'KeyR' && (game.scene === SCENE.DEAD || game.scene === SCENE.WIN)) {
      game.startGame();
    }
  });

  // 支持 ?seed=xxx 复现同一局
  const params = new URLSearchParams(location.search);
  const urlSeed = params.get('seed');
  if (urlSeed) {
    game.startGame(urlSeed);
  }

  // ---------------- 主循环 ----------------

  const loop = new GameLoop({
    update: (dt) => {
      game.update(dt);
      joystick.update(dt, input);
      game.fps = loop.fps;
    },
    render: () => {
      renderer.render(0);
    },
  });
  loop.start();

  // 暴露到 window 便于自动化测试与手动调试
  window.__ISAAC__ = { game, renderer, loop, input, audio, bus, SCENE };

  console.log('[The Binding of Isaac · Web] 已启动。种子:', game.seed);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
