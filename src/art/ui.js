/**
 * ui.js — HUD / 界面绘制（全部 Canvas 代码绘制，无 DOM 图元）
 *
 * 包含：
 *   drawHUD        血量心、主动道具、属性小条、金币/钥匙/炸弹计数、层进度
 *   drawMinimap    右上角小地图（房间格 + 当前房高亮 + 已清房标记）
 *   drawItemPanel  拾取道具时的弹出面板（图标 + 名称 + 描述）
 *   drawDamageFlash 受伤红屏
 *   各全屏界面：开始 / 死亡 / 通关 / 暂停
 */

import { PAL } from './palette.js';
import { drawHeart, drawSoulHeart, drawBlackHeart, drawCoin, drawKey, drawBomb, ITEM_ICONS } from './draw-items.js';
import { roundRect, roundRectPath, inkShape, strokedText, circle } from './primitives.js';
import { TAU } from '../core/math.js';
import { statBar } from '../entities/stats.js';
import { trackForFloor } from '../core/music.js';

/**
 * 中文 UI 字体栈。
 * Canvas 的 font 简写里，非 ASCII 字形需要显式给 CJK 字族才能保证字重/字距一致，
 * 否则浏览器回退字族的字重往往比西文字族细一档。按平台从新到旧排列：
 * Windows → Microsoft YaHei；macOS → PingFang SC；Linux/通用 → Noto Sans SC / Hiragino。
 */
const FONT_UI = '"Microsoft YaHei","PingFang SC","Noto Sans SC","Hiragino Sans GB",sans-serif';

/**
 * 绘制血量（红心 + 魂心 + 黑心）
 * @param {number} x 左上角
 * @param {number} y
 * @param {object} player
 */
export function drawHealth(ctx, x, y, player) {
  const size = 22;
  const gap = 3;
  let cx = x;
  const cy = y + size * 0.5;

  // 红心
  const full = Math.floor(player.health / 2);
  const half = player.health % 2 === 1;
  for (let i = 0; i < full; i++) {
    drawHeart(ctx, cx, cy, size);
    cx += size + gap;
  }
  if (half) {
    drawHalfHeart(ctx, cx, cy, size);
    cx += size + gap;
  }
  // 空容器（最大生命里还没用的）
  const emptyCount = Math.ceil(player.maxHealth / 2) - full - (half ? 1 : 0);
  for (let i = 0; i < emptyCount; i++) {
    drawEmptyHeart(ctx, cx, cy, size);
    cx += size + gap;
  }
  // 魂心
  const soulFull = Math.floor(player.soulHearts / 2);
  const soulHalf = player.soulHearts % 2 === 1;
  for (let i = 0; i < soulFull; i++) {
    drawSoulHeart(ctx, cx, cy, size);
    cx += size + gap;
  }
  if (soulHalf) {
    drawHalfSoulCtx(ctx, cx, cy, size);
    cx += size + gap;
  }
  // 黑心
  const blackFull = Math.floor(player.blackHearts / 2);
  for (let i = 0; i < blackFull; i++) {
    drawBlackHeart(ctx, cx, cy, size);
    cx += size + gap;
  }
}

function drawHalfHeart(ctx, x, y, size) {
  const s = size / 13;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  // 左半实心
  ctx.save();
  ctx.beginPath();
  ctx.rect(-14, -14, 14, 28);
  ctx.clip();
  inkShape(ctx, (c) => heartPath(c), { fill: PAL.pickupHeart, lineWidth: 2.4 });
  ctx.restore();
  // 右半空
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, -14, 14, 28);
  ctx.clip();
  inkShape(ctx, (c) => heartPath(c), { fill: PAL.uiHeartEmpty, lineWidth: 2.4 });
  ctx.restore();
  ctx.restore();
}

function drawEmptyHeart(ctx, x, y, size) {
  const s = size / 13;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  inkShape(ctx, (c) => heartPath(c), { fill: PAL.uiHeartEmpty, lineWidth: 2.4, stroke: '#2a1a1a' });
  ctx.restore();
}

function drawHalfSoulCtx(ctx, x, y, size) {
  const s = size / 13;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-14, -14, 14, 28);
  ctx.clip();
  inkShape(ctx, (c) => heartPath(c), { fill: PAL.uiSoulFull, lineWidth: 2.4 });
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, -14, 14, 28);
  ctx.clip();
  inkShape(ctx, (c) => heartPath(c), { fill: PAL.uiHeartEmpty, lineWidth: 2.4 });
  ctx.restore();
  ctx.restore();
}

function heartPath(c) {
  c.moveTo(0, 4);
  c.bezierCurveTo(-13, -3, -9, -13, -3.5, -8.5);
  c.bezierCurveTo(-2.4, -7.6, -1, -6.4, 0, -5);
  c.bezierCurveTo(1, -6.4, 2.4, -7.6, 3.5, -8.5);
  c.bezierCurveTo(9, -13, 13, -3, 0, 4);
  c.closePath();
}

/**
 * 完整 HUD
 * @param {object} g GameState（读取 player/currentFloor/stats/coin/key/bomb）
 * @param {number} W 逻辑画布宽
 */
export function drawHUD(ctx, g, W) {
  const p = g.player;
  const pad = 14;

  // ---- 左上：血量 ----
  drawHealth(ctx, pad, pad, p);

  // ---- 左上（血量下方）：金币/钥匙/炸弹 ----
  const resY = pad + 34;
  let rx = pad + 4;
  const r = 9;
  drawCoin(ctx, rx, resY, r);
  strokedText(ctx, `×${g.coins}`, rx + 14, resY + 5, { font: 'bold 15px "Trebuchet MS",sans-serif', fill: PAL.uiText, lineWidth: 3 });
  rx += 52;
  drawKey(ctx, rx, resY, 10);
  strokedText(ctx, `×${g.keys}`, rx + 14, resY + 5, { font: 'bold 15px "Trebuchet MS",sans-serif', fill: PAL.uiText, lineWidth: 3 });
  rx += 52;
  drawBomb(ctx, rx, resY, 9);
  strokedText(ctx, `×${g.bombs}`, rx + 14, resY + 5, { font: 'bold 15px "Trebuchet MS",sans-serif', fill: PAL.uiText, lineWidth: 3 });

  // ---- 左下：属性小条 ----
  drawStatBars(ctx, pad, g);

  // ---- 右上：层数 + 小地图 ----
  const biomeZh = g.biomeNameZh || g.biomeName || '';
  const floorText = `${biomeZh}  第${g.floor}层`;
  strokedText(ctx, floorText, W - pad, pad + 18, {
    font: `bold 19px ${FONT_UI}`,
    fill: PAL.uiText,
    lineWidth: 4,
    align: 'right',
  });
  drawMinimap(ctx, g, W - pad, pad + 28);

  // ---- 顶部中央：当前层房间进度 ----
  const total = g.dungeon ? g.dungeon.count : 0;
  if (total > 0) {
    strokedText(ctx, `${g.visitedCount}/${total} 房间`, W / 2, pad + 16, {
      font: 'bold 15px "Trebuchet MS",sans-serif',
      fill: PAL.uiTextDim,
      lineWidth: 3,
      align: 'center',
    });
  }

  // ---- 蓄力指示（Brimstone）----
  if (p.charging && p.weapon.charge) {
    const cr = Math.min(1, p.chargeTime / p.chargeMax);
    const bx = W / 2 - 60;
    const by = 44;
    ctx.save();
    roundRect(ctx, bx, by, 120, 9, 4, { fill: PAL.uiBarBg, stroke: PAL.ink, lineWidth: 2 });
    roundRect(ctx, bx + 1.5, by + 1.5, (120 - 3) * cr, 6, 3, {
      fill: cr >= 1 ? '#ff3a2a' : '#c94a3a',
      stroke: null,
    });
    if (cr >= 1) {
      ctx.globalAlpha = 0.5 + Math.sin(performance.now() / 90) * 0.4;
      strokedText(ctx, '就绪', W / 2, by + 30, {
        font: `bold 15px ${FONT_UI}`, fill: '#ff8a6a', lineWidth: 3, align: 'center',
      });
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ---- 静音提示（M 键切换）----
  if (g.audioMuted) {
    strokedText(ctx, '已静音  ·  按 M 恢复', W / 2, g._h - 14, {
      font: `bold 14px ${FONT_UI}`, fill: '#c88a6a', lineWidth: 3, align: 'center',
    });
  }
}

/**
 * 左下角「角色属性面板」。
 *
 * 中文标签 + 放大版式（相对旧版：条宽 62→80、条高 7→10、行高 15→20、字号 10→13）。
 * 位置策略：默认贴底（左下角，桌面端所见即所得）；在**触屏且高视口**（H ≥ 560）下，
 * 面板会整体移到移动摇杆**下方**，避免与摇杆底盘重叠 —— 摇杆位于 0.78H、半径 52
 * （见 ui/joystick.js），矮视口（横屏）维持旧行为不变。
 */
function drawStatBars(ctx, x, g) {
  const p = g.player;
  const stats = [
    { key: 'damage', label: '伤害', color: '#e05a4a' },
    { key: 'fireDelay', label: '射速', color: '#e0a83a' },
    { key: 'speed', label: '移速', color: '#4aa3e0' },
    { key: 'range', label: '射程', color: '#9b6bd6' },
    { key: 'shotSpeed', label: '弹速', color: '#3ac0a0' },
  ];
  const labelW = 40; // 中文标签列宽（两字 × 13px + 间距）
  const bw = 80; // 属性条宽
  const bh = 10; // 属性条高
  const lineH = 20; // 行高
  const padX = 10;
  const padY = 9;
  const panelW = labelW + bw + padX * 2;
  const panelH = padY * 2 + stats.length * lineH - (lineH - bh);

  // 面板底边
  let bottom = g._h - 46;
  const touch = !!(g.input && (g.input.touchCapable || g.input.usingTouch));
  if (touch && g._h >= 560) {
    const stickBottom = g._h * 0.78 + 52; // 摇杆底盘下沿
    bottom = stickBottom + 10 + panelH <= g._h - 8
      ? stickBottom + 10 + panelH // 摇杆下方有空间 → 整体下移
      : Math.min(bottom, g._h * 0.78 - 52 - 10); // 否则上移到摇杆上方
  }
  const panelX = x - padX;
  const panelY = bottom - panelH;

  // 半透明底板 + 细边框（提高面板在浅色地砖上的可读性）
  ctx.save();
  ctx.globalAlpha = 0.62;
  roundRect(ctx, panelX, panelY, panelW, panelH, 8, { fill: PAL.uiBg, stroke: null });
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.32;
  roundRect(ctx, panelX, panelY, panelW, panelH, 8, { fill: null, stroke: PAL.uiTextDim, lineWidth: 1.5 });
  ctx.restore();

  let rowTop = panelY + padY;
  for (const s of stats) {
    const bx = x + labelW;
    ctx.save();
    roundRect(ctx, bx, rowTop, bw, bh, 4, { fill: PAL.uiBarBg, stroke: PAL.ink, lineWidth: 1.8 });
    const v = statBar(s.key, p.stats[s.key]);
    if (v > 0.01) {
      roundRect(ctx, bx + 1.5, rowTop + 1.5, Math.max(3, (bw - 3) * v), bh - 3, 3, { fill: s.color, stroke: null });
    }
    ctx.restore();
    strokedText(ctx, s.label, x, rowTop + bh * 0.5 + 4.5, {
      font: `bold 13px ${FONT_UI}`, fill: PAL.uiText, lineWidth: 3,
    });
    rowTop += lineH;
  }
}

/**
 * 小地图：右上角，显示已探索房间格与连接
 * @param {number} x 右侧锚点（右对齐）
 * @param {number} y 顶部锚点
 */
export function drawMinimap(ctx, g, x, y) {
  if (!g.dungeon) return;
  const cell = 15;
  const gap = 3;
  const rooms = g.dungeon.rooms;
  // 计算包围盒
  let minGX = Infinity, maxGX = -Infinity, minGY = Infinity, maxGY = -Infinity;
  for (const r of rooms) {
    minGX = Math.min(minGX, r.gx);
    maxGX = Math.max(maxGX, r.gx);
    minGY = Math.min(minGY, r.gy);
    maxGY = Math.max(maxGY, r.gy);
  }
  const cols = maxGX - minGX + 1;
  const rows = maxGY - minGY + 1;
  const mapW = cols * (cell + gap) - gap;
  const mapH = rows * (cell + gap) - gap;

  const ox = x - mapW;
  const oy = y;

  // 底板
  ctx.save();
  roundRect(ctx, ox - 8, oy - 6, mapW + 16, mapH + 12, 6, {
    fill: PAL.mapBg, stroke: 'rgba(200,180,150,0.3)', lineWidth: 1.5,
  });
  ctx.restore();

  // 房间
  for (const r of rooms) {
    const rx = ox + (r.gx - minGX) * (cell + gap);
    const ry = oy + (r.gy - minGY) * (cell + gap);
    const isCur = g.currentRoom && g.currentRoom.key === r.key;
    const isVisited = g.visitedRooms.has(r.key);

    let fill = PAL.mapRoom;
    if (isCur) fill = PAL.mapRoomCur;
    else if (r.kind === 'boss' && isVisited) fill = PAL.mapRoomBoss;
    else if (r.kind === 'treasure' && isVisited) fill = PAL.mapRoomTreasure;
    else if (isVisited) fill = r.cleared ? PAL.mapRoomClear : '#6a5f64';

    ctx.save();
    // 未访问的房间：不显示（原作是走过后才显示）
    if (!isVisited && !isCur) {
      ctx.globalAlpha = 0;
    }
    roundRect(ctx, rx, ry, cell, cell, 2.5, {
      fill, stroke: isCur ? '#fff' : 'rgba(20,10,10,0.8)', lineWidth: isCur ? 2 : 1.4,
    });
    // boss 房标记
    if (isVisited && r.kind === 'boss' && !isCur) {
      strokedText(ctx, '☠', rx + cell / 2, ry + cell * 0.76, {
        font: 'bold 11px sans-serif', fill: '#fff', stroke: null, align: 'center',
      });
    }
    if (isVisited && r.kind === 'treasure' && !isCur) {
      circle(ctx, rx + cell / 2, ry + cell / 2, 3, { fill: PAL.itemGold, stroke: '#5a3a10', lineWidth: 1 });
    }
    // 门（连向右侧/下方邻居，避免重复绘制）
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = PAL.mapDoor;
    if (r.doors.right && g.dungeon.byKey[`${r.gx + 1},${r.gy}`]) {
      ctx.fillRect(rx + cell, ry + cell / 2 - 1.5, gap, 3);
    }
    if (r.doors.down && g.dungeon.byKey[`${r.gx},${r.gy + 1}`]) {
      ctx.fillRect(rx + cell / 2 - 1.5, ry + cell, 3, gap);
    }
    ctx.restore();
  }
}

/**
 * 道具拾取面板
 * @param {number} t 0..1 出现进度
 */
export function drawItemPanel(ctx, W, H, item, t) {
  if (!item) return;
  const ease = t < 0.5 ? t * 2 : 1 - (t - 0.5) * 2 * 0.02; // 快速弹出后保持
  const age = Math.min(1, t * 3);

  const pw = 420;
  const ph = 132;
  const px = W / 2 - pw / 2;
  const py = H * 0.5 - ph / 2 - (1 - age) * 30;

  ctx.save();
  ctx.globalAlpha = age;

  // 阴影 + 面板
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 20;
  roundRect(ctx, px, py, pw, ph, 10, { fill: PAL.uiPanel, stroke: '#0d0a0c', lineWidth: 3 });
  ctx.restore();
  // 顶部高光
  roundRect(ctx, px + 3, py + 3, pw - 6, 26, 8, { fill: PAL.uiPanelHi, stroke: null });
  // 金色描边
  roundRect(ctx, px + 1.5, py + 1.5, pw - 3, ph - 3, 9, { fill: null, stroke: PAL.itemGold, lineWidth: 2 });

  // 图标
  const iconCX = px + 62;
  const iconCY = py + ph / 2 + 6;
  circle(ctx, iconCX, iconCY, 38, { fill: 'rgba(20,16,18,0.9)', stroke: PAL.itemGold, lineWidth: 2.6 });
  ctx.save();
  ctx.translate(iconCX, iconCY);
  ctx.scale(1.7, 1.7);
  const fn = ITEM_ICONS[item.id] || ITEM_ICONS['tear'];
  fn(ctx);
  ctx.restore();

  // 文本
  strokedText(ctx, '拾取道具', px + 118, py + 26, {
    font: 'bold 12px "Trebuchet MS",sans-serif', fill: PAL.uiGold, lineWidth: 3,
  });
  const nameFont = 'bold 24px "Trebuchet MS",sans-serif';
  strokedText(ctx, item.name, px + 118, py + 54, {
    font: nameFont, fill: PAL.uiText, lineWidth: 4,
  });
  // 中文名紧跟英文名右侧：必须用「与英文名相同的字体」测量宽度。
  // 注意 strokedText 内部 save/restore，不会把 font 留在 ctx 上，
  // 所以这里必须先显式设置 ctx.font 再 measureText，否则宽度会失真导致文字重叠。
  ctx.save();
  ctx.font = nameFont;
  const nameW = ctx.measureText(item.name).width;
  ctx.restore();
  strokedText(ctx, item.nameZh, px + 118 + nameW + 14, py + 54, {
    font: 'bold 15px "Trebuchet MS",sans-serif', fill: PAL.uiTextDim, lineWidth: 3,
  });
  // 描述自动换行
  wrapText(ctx, item.desc, px + 118, py + 82, pw - 136, 20, {
    font: '15px "Trebuchet MS",sans-serif', fill: '#d8ccb4', lineWidth: 3,
  });

  ctx.restore();
}

/** 简易文本换行 */
export function wrapText(ctx, text, x, y, maxW, lineH, style) {
  ctx.save();
  ctx.font = style.font;
  const chars = text.split('');
  let line = '';
  let yy = y;
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line !== '') {
      strokedText(ctx, line, x, yy, style);
      line = ch;
      yy += lineH;
    } else {
      line = test;
    }
  }
  if (line) strokedText(ctx, line, x, yy, style);
  ctx.restore();
  return yy;
}

/** 受伤红屏 */
export function drawDamageFlash(ctx, W, H, amount) {
  if (amount <= 0.01) return;
  ctx.save();
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.62);
  g.addColorStop(0, 'rgba(150,10,10,0)');
  g.addColorStop(1, `rgba(160,5,5,${Math.min(0.72, amount * 0.72)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// ==================== 全屏界面 ====================

/** 标题按钮（返回其矩形用于命中检测） */
export function drawButton(ctx, x, y, w, h, label, opts = {}) {
  const hover = !!opts.hover;
  const primary = !!opts.primary;
  const bg = primary
    ? (hover ? '#d94a3a' : PAL.uiAccent)
    : (hover ? '#3a2e34' : PAL.uiPanel);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = hover ? 12 : 6;
  ctx.shadowOffsetY = 2;
  roundRect(ctx, x, y, w, h, 8, { fill: bg, stroke: PAL.ink, lineWidth: 3 });
  ctx.restore();
  roundRect(ctx, x + 2, y + 2, w - 4, h * 0.42, 6, {
    fill: 'rgba(255,255,255,0.12)', stroke: null,
  });
  strokedText(ctx, label, x + w / 2, y + h / 2 + 7, {
    font: 'bold 20px "Trebuchet MS",sans-serif',
    fill: PAL.uiText,
    lineWidth: 4,
    align: 'center',
  });
  return { x, y, w, h };
}

/** 通用全屏遮罩。tint 为不含 alpha、不含右括号的 rgba 前缀。 */
export function drawScreenDim(ctx, W, H, alpha = 0.82, tint = 'rgba(8,6,8,') {
  ctx.save();
  ctx.fillStyle = tint + alpha + ')';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
/** 标题艺术字（带血渍感的描边大字） */
export function drawTitle(ctx, text, x, y, size, opts = {}) {
  ctx.save();
  ctx.font = opts.font || `bold ${size}px "Trebuchet MS", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // 多层描边制造厚度
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = '#0d0808';
  ctx.strokeText(text, x, y);
  ctx.lineWidth = size * 0.08;
  ctx.strokeStyle = opts.stroke || '#5a1414';
  ctx.strokeText(text, x, y);
  // 填充渐变
  const g = ctx.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
  g.addColorStop(0, opts.top || '#f0e0c0');
  g.addColorStop(0.55, opts.mid || '#d8b070');
  g.addColorStop(1, opts.bottom || '#8a5a2a');
  ctx.fillStyle = g;
  ctx.fillText(text, x, y);
  // 顶部高光
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, x, y - 2);
  ctx.restore();
}

/** 开始界面 */
export function drawStartScreen(ctx, W, H, t, hoverBtn) {
  drawScreenDim(ctx, W, H, 0.86, 'rgba(10,7,9,');

  // 背景脉动光
  ctx.save();
  const pulse = 0.5 + Math.sin(t * 1.6) * 0.5;
  const g = ctx.createRadialGradient(W / 2, H * 0.38, 20, W / 2, H * 0.38, W * 0.55);
  g.addColorStop(0, `rgba(160,30,30,${0.12 + pulse * 0.1})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  const bob = Math.sin(t * 1.8) * 4;
  drawTitle(ctx, 'THE BINDING OF', W / 2, H * 0.2 + bob, Math.min(38, W * 0.05));
  drawTitle(ctx, 'ISAAC', W / 2, H * 0.3 + bob, Math.min(86, W * 0.115), {
    top: '#ffe8c0', mid: '#e0b060', bottom: '#8a3a1a', stroke: '#5a1414',
  });
  strokedText(ctx, '~ 网页复刻版 ~', W / 2, H * 0.365 + bob, {
    font: 'bold 16px "Trebuchet MS",sans-serif', fill: PAL.uiTextDim, lineWidth: 3, align: 'center',
  });

  // 开始按钮
  const bw = 260, bh = 60;
  const bx = W / 2 - bw / 2;
  const by = H * 0.48;
  drawButton(ctx, bx, by, bw, bh, '开始游戏  ▶', { primary: true, hover: hoverBtn === 'start' });

  // 操作说明（双列，桌面 / 移动端）
  const ly = by + bh + 34;
  strokedText(ctx, '桌面：WASD 移动   ·   方向键发射   ·   P/ESC 暂停   ·   M 静音', W / 2, ly, {
    font: `bold 15px ${FONT_UI}`, fill: PAL.uiText, lineWidth: 3, align: 'center',
  });
  strokedText(ctx, '移动端：左半屏拖动移动   ·   右半屏拖动瞄准射击', W / 2, ly + 24, {
    font: `bold 15px ${FONT_UI}`, fill: PAL.uiTextDim, lineWidth: 3, align: 'center',
  });
  strokedText(ctx, '清空房间内的敌人即可开启门 ·  击败 Boss 进入下一层 ·  每层有专属配乐', W / 2, ly + 48, {
    font: `14px ${FONT_UI}`, fill: PAL.uiTextDim, lineWidth: 3, align: 'center',
  });
  strokedText(ctx, `种子 ${t % 1 === 0 ? '' : ''}${(ctx.canvas && ctx.canvas.dataset && ctx.canvas.dataset.seed) || ''}`, W / 2, H - 18, {
    font: '12px monospace', fill: '#6a5f5a', lineWidth: 2, align: 'center',
  });
  return [{ id: 'start', ...{ x: bx, y: by, w: bw, h: bh } }];
}

/** 死亡界面（含统计） */
export function drawDeathScreen(ctx, W, H, t, stats, hoverBtn) {
  drawScreenDim(ctx, W, H, 0.88, 'rgba(12,4,4,');

  const fade = Math.min(1, t * 2);
  ctx.save();
  ctx.globalAlpha = fade;

  drawTitle(ctx, 'YOU DIED', W / 2, H * 0.22, Math.min(72, W * 0.1), {
    top: '#e0a0a0', mid: '#a02020', bottom: '#4a0a0a', stroke: '#2a0505',
  });

  // 统计面板
  const pw = Math.min(440, W * 0.82);
  const ph = 220;
  const px = W / 2 - pw / 2;
  const py = H * 0.32;
  roundRect(ctx, px, py, pw, ph, 12, { fill: 'rgba(28,20,22,0.94)', stroke: '#4a2020', lineWidth: 3 });

  strokedText(ctx, '本次探索统计', W / 2, py + 34, {
    font: 'bold 19px "Trebuchet MS",sans-serif', fill: PAL.uiGold, lineWidth: 4, align: 'center',
  });

  const rows = [
    ['击杀数', String(stats.kills)],
    ['拾取道具', String(stats.itemsPicked)],
    ['存活时间', formatTime(stats.timeAlive)],
    ['抵达层数', `第${stats.floorReached}层`],
    ['造成伤害', String(Math.round(stats.damageDealt))],
    ['探索房间', `${stats.roomsVisited}`],
  ];
  const rowH = 26;
  let ry = py + 62;
  rows.forEach((row, i) => {
    const yy = ry + Math.floor(i) * rowH;
    strokedText(ctx, row[0], px + 36, yy, {
      font: '16px "Trebuchet MS",sans-serif', fill: PAL.uiTextDim, lineWidth: 3,
    });
    strokedText(ctx, row[1], px + pw - 36, yy, {
      font: 'bold 17px "Trebuchet MS",sans-serif', fill: PAL.uiText, lineWidth: 3, align: 'right',
    });
  });

  // 按钮
  const bw = 190, bh = 52;
  const gap = 18;
  const by = py + ph + 30;
  const b1 = drawButton(ctx, W / 2 - bw - gap / 2, by, bw, bh, '再来一次', { primary: true, hover: hoverBtn === 'retry' });
  const b2 = drawButton(ctx, W / 2 + gap / 2, by, bw, bh, '返回标题', { hover: hoverBtn === 'title' });

  ctx.restore();
  return [
    { id: 'retry', ...b1 },
    { id: 'title', ...b2 },
  ];
}

/** 通关界面 */
export function drawWinScreen(ctx, W, H, t, stats, hoverBtn) {
  drawScreenDim(ctx, W, H, 0.88, 'rgba(10,8,16,');

  // 金色光芒
  ctx.save();
  const pulse = 0.5 + Math.sin(t * 2.2) * 0.5;
  const g = ctx.createRadialGradient(W / 2, H * 0.3, 20, W / 2, H * 0.3, W * 0.6);
  g.addColorStop(0, `rgba(255,210,100,${0.16 + pulse * 0.12})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 旋转的放射线
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#ffd24a';
  ctx.lineWidth = 18;
  ctx.translate(W / 2, H * 0.3);
  for (let i = 0; i < 12; i++) {
    ctx.rotate(TAU / 12);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -W * 0.75);
    ctx.stroke();
  }
  ctx.restore();

  const fade = Math.min(1, t * 2);
  ctx.save();
  ctx.globalAlpha = fade;

  drawTitle(ctx, 'VICTORY!', W / 2, H * 0.2, Math.min(76, W * 0.105), {
    top: '#fffbe0', mid: '#f3c73f', bottom: '#a06a10', stroke: '#5a3a08',
  });
  strokedText(ctx, '你击败了地下最深处的魔王', W / 2, H * 0.29, {
    font: 'bold 18px "Trebuchet MS",sans-serif', fill: '#ffe9a3', lineWidth: 4, align: 'center',
  });

  const pw = Math.min(440, W * 0.82);
  const ph = 220;
  const px = W / 2 - pw / 2;
  const py = H * 0.35;
  roundRect(ctx, px, py, pw, ph, 12, { fill: 'rgba(28,24,18,0.94)', stroke: '#8a6a20', lineWidth: 3 });
  strokedText(ctx, '通关统计', W / 2, py + 34, {
    font: 'bold 19px "Trebuchet MS",sans-serif', fill: PAL.uiGold, lineWidth: 4, align: 'center',
  });
  const rows = [
    ['击杀数', String(stats.kills)],
    ['拾取道具', String(stats.itemsPicked)],
    ['存活时间', formatTime(stats.timeAlive)],
    ['抵达层数', `第${stats.floorReached}层`],
    ['造成伤害', String(Math.round(stats.damageDealt))],
    ['探索房间', `${stats.roomsVisited}`],
  ];
  let ry = py + 62;
  rows.forEach((row, i) => {
    const yy = ry + i * 26;
    strokedText(ctx, row[0], px + 36, yy, { font: '16px "Trebuchet MS",sans-serif', fill: PAL.uiTextDim, lineWidth: 3 });
    strokedText(ctx, row[1], px + pw - 36, yy, { font: 'bold 17px "Trebuchet MS",sans-serif', fill: PAL.uiText, lineWidth: 3, align: 'right' });
  });

  const bw = 190, bh = 52;
  const gap = 18;
  const by = py + ph + 30;
  const b1 = drawButton(ctx, W / 2 - bw - gap / 2, by, bw, bh, '再玩一次', { primary: true, hover: hoverBtn === 'retry' });
  const b2 = drawButton(ctx, W / 2 + gap / 2, by, bw, bh, '返回标题', { hover: hoverBtn === 'title' });

  ctx.restore();
  return [
    { id: 'retry', ...b1 },
    { id: 'title', ...b2 },
  ];
}

/** 暂停界面 */
export function drawPauseScreen(ctx, W, H, hoverBtn) {
  drawScreenDim(ctx, W, H, 0.7, 'rgba(6,5,8,');
  drawTitle(ctx, 'PAUSED', W / 2, H * 0.32, Math.min(52, W * 0.075));
  const bw = 220, bh = 54;
  const gap = 16;
  const b1 = drawButton(ctx, W / 2 - bw / 2, H * 0.46, bw, bh, '继续游戏', { primary: true, hover: hoverBtn === 'resume' });
  const b2 = drawButton(ctx, W / 2 - bw / 2, H * 0.46 + bh + gap, bw, bh, '返回标题', { hover: hoverBtn === 'title' });
  strokedText(ctx, '按 P / ESC 继续', W / 2, H * 0.46 + bh * 2 + gap + 34, {
    font: '15px "Trebuchet MS",sans-serif', fill: PAL.uiTextDim, lineWidth: 3, align: 'center',
  });
  return [
    { id: 'resume', ...b1 },
    { id: 'title', ...b2 },
  ];
}

/**
 * 层间过渡（关卡加载页）。
 * 版式：`第 N 层`（小字）→ **楼层中文名**（大字）→ 英文原名（小字）→ 本层配乐名。
 * @param {string} [label]   英文楼层名（如 'Womb'）
 * @param {string} [labelZh] 中文楼层名（如 '子宫'）
 */
export function drawFloorTransition(ctx, W, H, t, floor, label, labelZh) {
  const p = t / 1.8;
  const alpha = p < 0.15 ? p / 0.15 : p > 0.82 ? (1 - p) / 0.18 : 1;
  const nameZh = labelZh || label || '';
  const size = Math.min(72, W * 0.1);
  const track = trackForFloor(floor);

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.fillStyle = 'rgba(6,4,6,0.92)';
  ctx.fillRect(0, 0, W, H);

  // 第 N 层（小字，交代进度）
  strokedText(ctx, `第 ${floor} 层`, W / 2, H * 0.35, {
    font: `bold 24px ${FONT_UI}`, fill: PAL.uiTextDim, lineWidth: 4, align: 'center',
  });
  // 楼层名（大字）
  drawTitle(ctx, nameZh, W / 2, H * 0.47, size, { font: `bold ${size}px ${FONT_UI}` });
  // 英文原名（小字）
  if (label) {
    strokedText(ctx, label, W / 2, H * 0.575, {
      font: 'bold 20px "Trebuchet MS",sans-serif', fill: PAL.uiTextDim, lineWidth: 4, align: 'center',
    });
  }
  // 本层配乐名
  if (track && track.name) {
    strokedText(ctx, `♪  ${track.name}`, W / 2, H * 0.66, {
      font: `15px ${FONT_UI}`, fill: '#8a7f74', lineWidth: 3, align: 'center',
    });
  }
  ctx.restore();
}

export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}
