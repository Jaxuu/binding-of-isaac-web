/**
 * draw-room.js — 房间地板/墙体/门/障碍物绘制
 *
 * 烘焙策略（性能关键）：
 *   房间静态外观（地板纹样 + 四周墙体 + 门洞）整体烘焙到一张 13×7 格 × TILE 像素的离屏画布，
 *   每帧只 drawImage 一次。房间布局改变或换主题时才重建。
 *
 * 房间尺寸：标准《以撒》房间是 13×7 格（宽 13 格、高 7 格），
 * 本作用 TILE=48 → 624×336 世界像素，外部再留墙体厚度。
 */

import { PAL } from './palette.js';
import { roundRectPath, inkShape, circle, ellipse } from './primitives.js';
import { TAU } from '../core/math.js';
import { Rng } from '../core/rng.js';

export const TILE = 48;
export const ROOM_COLS = 13;
export const ROOM_ROWS = 7;
export const WALL_T = 26; // 墙体厚度（外圈）

/** 房间主题（按房间类型换地砖/墙配色） */
export function themeFor(kind) {
  switch (kind) {
    case 'boss':
      return { floorA: PAL.floorBoss, floorB: shade(PAL.floorBoss, -0.12), wallTint: '#6a4a42', deco: 'skull' };
    case 'treasure':
      return { floorA: PAL.floorTreasure, floorB: shade(PAL.floorTreasure, -0.1), wallTint: '#7a6450', deco: 'gold' };
    case 'start':
      return { floorA: PAL.floorStart, floorB: PAL.floorB, wallTint: PAL.wall, deco: 'none' };
    case 'shop':
      return { floorA: '#4b4a55', floorB: '#43424c', wallTint: '#5f5c68', deco: 'none' };
    default:
      return { floorA: PAL.floorA, floorB: PAL.floorB, wallTint: PAL.wall, deco: 'rock' };
  }
}

/** hex 明暗调整（amount: -1..1） */
export function shade(hex, amount) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
  return `#${((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1)}`;
}

/**
 * 把整个房间静态外观画到 ctx 上（坐标系原点 = 房间内容区左上角）。
 * 由 RoomRenderer 调用一次并缓存。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} o
 * @param {string} o.kind 房间类型
 * @param {number} o.seed 种子（纹样确定性）
 * @param {{up:boolean,down:boolean,left:boolean,right:boolean}} o.doors
 * @param {boolean} o.cleared 是否已清空（决定门的外观）
 * @param {import('./draw-obstacles.js')} o.obstaclePainter 可选：画障碍物
 */
export function paintRoom(ctx, o) {
  const theme = themeFor(o.kind);
  const W = ROOM_COLS * TILE;
  const H = ROOM_ROWS * TILE;
  const rng = new Rng(o.seed ^ 0x51ed);

  // ---------- 地板 ----------
  // 棋盘格 + 每格内部随机的裂纹/斑点，形成原作那种「脏地砖」
  ctx.save();
  for (let ry = 0; ry < ROOM_ROWS; ry++) {
    for (let rx = 0; rx < ROOM_COLS; rx++) {
      const x = rx * TILE;
      const y = ry * TILE;
      const even = (rx + ry) % 2 === 0;
      ctx.fillStyle = even ? theme.floorA : theme.floorB;
      ctx.fillRect(x, y, TILE, TILE);

      // 砖缝（细暗线）
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);

      // 随机小斑点 / 裂纹
      const spots = rng.int(1, 3);
      for (let s = 0; s < spots; s++) {
        const sx = x + rng.range(5, TILE - 5);
        const sy = y + rng.range(5, TILE - 5);
        const kind = rng.float();
        if (kind < 0.55) {
          ctx.fillStyle = 'rgba(0,0,0,0.13)';
          ctx.beginPath();
          ctx.ellipse(sx, sy, rng.range(1.6, 4.2), rng.range(1.2, 3.2), rng.range(0, TAU), 0, TAU);
          ctx.fill();
        } else if (kind < 0.85) {
          ctx.fillStyle = 'rgba(255,255,255,0.055)';
          ctx.beginPath();
          ctx.ellipse(sx, sy, rng.range(2, 5), rng.range(1.5, 3), rng.range(0, TAU), 0, TAU);
          ctx.fill();
        } else {
          // 裂纹
          ctx.strokeStyle = 'rgba(0,0,0,0.22)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + rng.range(-7, 7), sy + rng.range(-7, 7));
          ctx.lineTo(sx + rng.range(-10, 10), sy + rng.range(-10, 10));
          ctx.stroke();
        }
      }
    }
  }
  // 整体压暗（低明度底），并叠一圈房间四周的落影
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // ---------- 特殊房间装饰 ----------
  if (theme.deco === 'skull') paintBossDecor(ctx, W, H, rng);
  if (theme.deco === 'gold') paintTreasureDecor(ctx, W, H, rng);
  if (theme.deco === 'rock') paintRockDecor(ctx, W, H, rng);

  // ---------- 墙体（外圈）----------
  paintWalls(ctx, W, H, o.doors, theme, rng, o.cleared);

  return { W, H };
}

/** 四周墙体：外立面 + 顶面 + 砖缝 + 顶部受光 */
function paintWalls(ctx, W, H, doors, theme, rng, cleared) {
  const wt = WALL_T;
  const wallBase = theme.wallTint;
  const wallTop = shade(wallBase, 0.26);
  const wallDark = shade(wallBase, -0.34);

  // 门洞在四边的位置（居中，宽度 2.5 格）
  const doorSpan = TILE * 2.2;
  const doorStartX = W / 2 - doorSpan / 2;
  const doorStartY = H / 2 - doorSpan / 2;

  /** 画一段墙（含被门挖开的缺口处理） */
  function wallRect(x, y, w, h) {
    // 底/暗面
    ctx.fillStyle = wallBase;
    ctx.fillRect(x, y, w, h);
    // 顶面高光带（上方 40%）
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, wallTop);
    g.addColorStop(0.42, wallBase);
    g.addColorStop(1, wallDark);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);

    // 砖缝：沿墙的走向切分
    ctx.strokeStyle = 'rgba(20,10,8,0.42)';
    ctx.lineWidth = 1.4;
    const brick = 26;
    if (w > h) {
      // 水平墙：竖缝
      for (let bx = x + brick; bx < x + w - 1; bx += brick) {
        ctx.beginPath();
        ctx.moveTo(bx + 0.5, y);
        ctx.lineTo(bx + 0.5, y + h);
        ctx.stroke();
      }
      // 中横缝
      ctx.beginPath();
      ctx.moveTo(x, y + h * 0.52);
      ctx.lineTo(x + w, y + h * 0.52);
      ctx.stroke();
    } else {
      // 垂直墙：横缝
      for (let by = y + brick; by < y + h - 1; by += brick) {
        ctx.beginPath();
        ctx.moveTo(x, by + 0.5);
        ctx.lineTo(x + w, by + 0.5);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(x + w * 0.52, y);
      ctx.lineTo(x + w * 0.52, y + h);
      ctx.stroke();
    }

    // 脏渍
    const n = Math.max(2, Math.floor((w * h) / 900));
    for (let i = 0; i < n; i++) {
      const sx = x + rng.range(3, Math.max(4, w - 3));
      const sy = y + rng.range(3, Math.max(4, h - 3));
      ctx.fillStyle = rng.float() < 0.5 ? 'rgba(0,0,0,0.13)' : 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      ctx.ellipse(sx, sy, rng.range(2, 6), rng.range(1.5, 4), rng.range(0, TAU), 0, TAU);
      ctx.fill();
    }
  }

  // 上墙（若有上方的门，则分成左右两段）
  if (doors.up) {
    wallRect(-wt, -wt, doorStartX + wt, wt);
    wallRect(doorStartX + doorSpan, -wt, W - doorStartX - doorSpan + wt, wt);
  } else {
    wallRect(-wt, -wt, W + wt * 2, wt);
  }
  // 下墙
  if (doors.down) {
    wallRect(-wt, H, doorStartX + wt, wt);
    wallRect(doorStartX + doorSpan, H, W - doorStartX - doorSpan + wt, wt);
  } else {
    wallRect(-wt, H, W + wt * 2, wt);
  }
  // 左墙
  if (doors.left) {
    wallRect(-wt, -wt, wt, doorStartY + wt);
    wallRect(-wt, doorStartY + doorSpan, wt, H - doorStartY - doorSpan + wt);
  } else {
    wallRect(-wt, -wt, wt, H + wt * 2);
  }
  // 右墙
  if (doors.right) {
    wallRect(W, -wt, wt, doorStartY + wt);
    wallRect(W, doorStartY + doorSpan, wt, H - doorStartY - doorSpan + wt);
  } else {
    wallRect(W, -wt, wt, H + wt * 2);
  }

  // 墙与地板的交界投影（内侧一圈暗）
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.42)';
  ctx.lineWidth = 6;
  ctx.strokeRect(-3, -3, W + 6, H + 6);
  ctx.restore();

  // ---------- 门 ----------
  const drawDoor = (side) => {
    const open = cleared; // 清房后开门
    const cx = side === 'left' ? -wt / 2 : side === 'right' ? W + wt / 2 : W / 2;
    const cy = side === 'up' ? -wt / 2 : side === 'down' ? H + wt / 2 : H / 2;
    const horizontal = side === 'left' || side === 'right';

    ctx.save();
    ctx.translate(cx, cy);
    if (horizontal) ctx.rotate(Math.PI / 2);
    // 门框（拱形）
    const dw = doorSpan;
    const dh = wt;
    // 门框石
    ctx.fillStyle = PAL.doorArch;
    ctx.beginPath();
    ctx.moveTo(-dw / 2 - 5, -dh / 2);
    ctx.lineTo(-dw / 2 - 5, dh / 2);
    ctx.lineTo(dw / 2 + 5, dh / 2);
    ctx.lineTo(dw / 2 + 5, -dh / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,10,8,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 门洞
    ctx.fillStyle = open ? PAL.doorOpen : PAL.doorClosed;
    ctx.beginPath();
    ctx.moveTo(-dw / 2 + 2, -dh / 2 + 2);
    ctx.lineTo(-dw / 2 + 2, dh / 2 - 2);
    ctx.lineTo(dw / 2 - 2, dh / 2 - 2);
    ctx.lineTo(dw / 2 - 2, -dh / 2 + 2);
    ctx.closePath();
    ctx.fill();

    if (open) {
      // 开门：内部一片黑 + 边缘发光，暗示可通行
      const g = ctx.createLinearGradient(0, -dh / 2, 0, dh / 2);
      g.addColorStop(0, '#000000');
      g.addColorStop(0.5, '#2a1c14');
      g.addColorStop(1, '#000000');
      ctx.fillStyle = g;
      ctx.fillRect(-dw / 2 + 1, -dh / 2 + 1, dw - 2, dh - 2);
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(performance.now() / 500) * 0.12;
      ctx.strokeStyle = PAL.chestGoldHi;
      ctx.lineWidth = 2.2;
      ctx.strokeRect(-dw / 2 + 2, -dh / 2 + 2, dw - 4, dh - 4);
      ctx.restore();
    } else {
      // 关门：木门 + 铁钉 + 锁
      ctx.fillStyle = PAL.doorClosed;
      ctx.fillRect(-dw / 2 + 2, -dh / 2 + 2, dw - 4, dh - 4);
      ctx.strokeStyle = 'rgba(20,10,8,0.7)';
      ctx.lineWidth = 1.6;
      for (let i = -2; i <= 2; i++) {
        const px = i * (dw / 6);
        ctx.beginPath();
        ctx.moveTo(px, -dh / 2 + 3);
        ctx.lineTo(px, dh / 2 - 3);
        ctx.stroke();
      }
      // 锁
      circle(ctx, 0, 0, 3.4, { fill: '#c9a24a', stroke: PAL.ink, lineWidth: 1.6 });
    }
    ctx.restore();
  };

  if (doors.up) drawDoor('up');
  if (doors.down) drawDoor('down');
  if (doors.left) drawDoor('left');
  if (doors.right) drawDoor('right');
}

/** 普通房：散落的碎石与骨堆 */
function paintRockDecor(ctx, W, H, rng) {
  const n = rng.int(3, 6);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const x = rng.range(TILE * 1.2, W - TILE * 1.2);
    const y = rng.range(TILE * 1.2, H - TILE * 1.2);
    if (Math.abs(x - W / 2) < TILE * 1.4 && Math.abs(y - H / 2) < TILE * 1.4) continue; // 避开中心
    if (rng.float() < 0.6) {
      // 碎石堆
      for (let k = 0; k < 3; k++) {
        const rx = x + rng.range(-8, 8);
        const ry = y + rng.range(-6, 6);
        ctx.fillStyle = PAL.rubble;
        ctx.beginPath();
        ctx.ellipse(rx, ry, rng.range(2.5, 5), rng.range(2, 3.6), rng.range(0, TAU), 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(20,10,8,0.5)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    } else {
      // 骨头
      ctx.strokeStyle = '#ddd6be';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 3);
      ctx.lineTo(x + 6, y + 3);
      ctx.stroke();
      ctx.fillStyle = '#ddd6be';
      ctx.beginPath();
      ctx.arc(x - 7, y - 4, 2.4, 0, TAU);
      ctx.arc(x + 7, y + 4, 2.4, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Boss 房：中央大骷髅印记 + 四周血色 */
function paintBossDecor(ctx, W, H, rng) {
  ctx.save();
  // 血色地面污渍
  for (let i = 0; i < 7; i++) {
    const x = rng.range(W * 0.15, W * 0.85);
    const y = rng.range(H * 0.15, H * 0.85);
    ctx.globalAlpha = rng.range(0.08, 0.18);
    ctx.fillStyle = '#7a1010';
    ctx.beginPath();
    ctx.ellipse(x, y, rng.range(20, 60), rng.range(14, 40), rng.range(0, TAU), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 中央骷髅标记（淡淡的）
  ctx.globalAlpha = 0.3;
  const cx = W / 2;
  const cy = H / 2;
  ctx.fillStyle = '#e8e0c8';
  ctx.beginPath();
  ctx.arc(cx, cy, 30, 0, TAU);
  ctx.fill();
  ctx.fillStyle = PAL.floorBoss;
  ctx.beginPath();
  ctx.arc(cx - 11, cy - 5, 7, 0, TAU);
  ctx.arc(cx + 11, cy - 5, 7, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy + 14);
  ctx.lineTo(cx + 6, cy + 14);
  ctx.lineTo(cx, cy + 22);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 宝箱房：中央金色光环地毯 */
function paintTreasureDecor(ctx, W, H, rng) {
  ctx.save();
  const cx = W / 2;
  const cy = H / 2;
  const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 90);
  g.addColorStop(0, 'rgba(243,199,63,0.28)');
  g.addColorStop(0.6, 'rgba(243,199,63,0.12)');
  g.addColorStop(1, 'rgba(243,199,63,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 96, 66, 0, 0, TAU);
  ctx.fill();

  // 地毯描边
  ctx.strokeStyle = 'rgba(217,164,65,0.45)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 78, 52, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/**
 * 绘制单个「障碍物」（岩石块 / 粪便 / 尖刺），带描边阴影。
 * 障碍物用格坐标定位，占用 1 格。
 */
export function drawObstacle(ctx, x, y, type, seed = 0, t = 0) {
  const rng = new Rng(seed);
  // 关键：所有图元都以「障碍物自身」为原点绘制，必须平移到传入的格位坐标。
  // （曾经的缺陷：本函数忽略了 x/y，导致所有障碍物本体都堆叠在房间内容区左上角，
  //   画面上只剩渲染器内联绘制的投影椭圆 —— 表现为「地板上的黑洞」。）
  // 注意：spike 由调用方预先 translate 后以 (0,0) 调用，此处为无操作，安全。
  ctx.save();
  ctx.translate(x, y);
  switch (type) {
    case 'rock': {
      // 岩石：不规则圆角多边形，几乎占满格子；亮面填充 + 粗描边 + 顶面受光 + 底部暗面 + 裂纹
      const R = 20; // 基准半径（48px 格 → 视觉直径约 40px）
      const n = 9;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i / n) * TAU;
        const r = R * rng.range(0.86, 1.06);
        pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.92 });
      }
      // 主体
      inkShape(ctx, (c) => {
        c.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
        c.closePath();
      }, { fill: '#a89786', lineWidth: 3.2 });

      // 底部暗面（体积感）
      ctx.save();
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = '#5f5147';
      ctx.beginPath();
      ctx.ellipse(1, 9, 13, 5, 0.08, 0, TAU);
      ctx.fill();
      ctx.restore();

      // 顶面受光
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#d3c4b0';
      ctx.beginPath();
      ctx.ellipse(-4, -6, 10.5, 7, -0.35, 0, TAU);
      ctx.fill();
      ctx.restore();

      // 裂纹（增加辨识度）
      ctx.save();
      ctx.strokeStyle = 'rgba(26,13,13,0.42)';
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-7, -3); ctx.lineTo(-2, 1.5); ctx.lineTo(-4.5, 6.5);
      ctx.moveTo(5.5, -6); ctx.lineTo(8.5, -0.5);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'poop': {
      // 粪便（原作经典障碍）：三层递减的棕球
      const layers = [
        { y: 10, rx: 17, ry: 8 },
        { y: 1, rx: 13, ry: 7 },
        { y: -7, rx: 9, ry: 6 },
      ];
      for (const L of layers) {
        inkShape(ctx, (c) => c.ellipse(0, L.y, L.rx, L.ry, 0, 0, TAU), {
          fill: '#8d5a26', lineWidth: 3,
        });
        ctx.save();
        ctx.globalAlpha = 0.42;
        ctx.fillStyle = '#c08a4c';
        ctx.beginPath();
        ctx.ellipse(-L.rx * 0.3, L.y - L.ry * 0.4, L.rx * 0.4, L.ry * 0.3, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      // 顶上的小尖
      inkShape(ctx, (c) => {
        c.moveTo(-3, -12);
        c.lineTo(0, -18);
        c.lineTo(3, -12);
        c.closePath();
      }, { fill: '#8d5a26', lineWidth: 2.4 });
      break;
    }
    case 'spike': {
      // 尖刺陷阱：三个金属锥
      for (const sx of [-11, 0, 11]) {
        inkShape(ctx, (c) => {
          c.moveTo(sx - 6, 10);
          c.lineTo(sx, -16);
          c.lineTo(sx + 6, 10);
          c.closePath();
        }, { fill: '#c8ccd4', lineWidth: 3 });
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(sx, -16);
        ctx.lineTo(sx - 2, 8);
        ctx.lineTo(sx + 0.5, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      // 底座
      inkShape(ctx, (c) => roundRectPathLite(c, -18, 8, 36, 6, 2), { fill: '#6a6e78', lineWidth: 2.6 });
      break;
    }
  }
  ctx.restore();
}

function roundRectPathLite(c, x, y, w, h, r) {
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
