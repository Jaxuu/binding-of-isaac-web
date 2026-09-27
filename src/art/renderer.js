/**
 * renderer.js — 渲染管线
 *
 * 分层绘制顺序（决定视觉正确性）：
 *   1. 清屏 / 相机变换（震屏）
 *   2. 房间静态层（烘焙的离屏画布：地板 + 墙 + 门）——一次 drawImage
 *   3. 地面装饰（尖刺、障碍投影）
 *   4. 实体（按 y 排序）：掉落物 → 障碍物 → 敌人 → Boss → 玩家 → 子弹/光束
 *   5. 特效（粒子、飘字、爆炸）
 *   6. UI 覆盖层（HUD、摇杆、面板、全屏界面）
 *
 * 房间尺寸固定，因此相机不做缩放跟随（原作也是整屏显示一个房间）。
 * 但为了适配不同窗口，整体做「等比缩放 + 居中」的信箱式布局。
 */

import { PAL } from './palette.js';
import { drawPlayer } from './draw-player.js';
import { drawGaper, drawPooter, drawHorf } from './draw-enemies.js';
import { drawMonstro } from './draw-boss.js';
import { paintRoom, drawObstacle, TILE, ROOM_COLS, ROOM_ROWS, WALL_T } from './draw-room.js';
import { drawTear, drawBeam, drawTechBeam, drawIpecac, drawKnife, drawExplosion, drawParticle } from './draw-projectiles.js';
import { drawItemPickup, drawPickup, drawChest } from './draw-items.js';
import {
  drawHUD, drawMinimap, drawItemPanel, drawDamageFlash,
  drawStartScreen, drawDeathScreen, drawWinScreen, drawPauseScreen, drawFloorTransition,
} from './ui.js';
import { strokedText } from './primitives.js';
import { bake, bakeSheet, drawSheetFrame, cacheKey } from './cache.js';
import { SCENE } from '../systems/game.js';
import { PLAY_PAD } from '../systems/rooms.js';
import { TAU } from '../core/math.js';

/** 房间渲染所需的总画布尺寸（内容区 + 四周墙体 + 一点余量） */
export const WORLD_W = ROOM_COLS * TILE + WALL_T * 2;
export const WORLD_H = ROOM_ROWS * TILE + WALL_T * 2;

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../systems/game.js').GameState} game
   * @param {import('../ui/joystick.js').JoystickRenderer} joystick
   */
  constructor(canvas, game, joystick) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.game = game;
    this.joystick = joystick;

    // 逻辑分辨率（世界坐标）
    this.worldW = WORLD_W;
    this.worldH = WORLD_H;

    // 当前视口变换
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    // 脏标记：房间变了才重建烘焙层
    this._roomKey = null;

    this.resize();
  }

  /** 计算等比缩放与居中偏移 */
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = this.canvas.clientWidth || window.innerWidth;
    const ch = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.floor(cw * dpr);
    this.canvas.height = Math.floor(ch * dpr);
    this.dpr = dpr;

    // 逻辑视口 = CSS 像素尺寸（UI 布局用逻辑像素，便于阅读）
    this.viewW = cw;
    this.viewH = ch;

    // 世界等比缩放：让整个房间刚好放得下，并留一点边距给 HUD
    const padX = 24;
    const padY = 24;
    const sx = (cw - padX * 2) / this.worldW;
    const sy = (ch - padY * 2 - 30) / this.worldH; // 底部给 HUD 留空间
    this.scale = Math.max(0.35, Math.min(sx, sy));
    this.offsetX = (cw - this.worldW * this.scale) / 2;
    this.offsetY = (ch - this.worldH * this.scale) / 2 - 6;
  }

  /** 屏幕坐标 → 世界坐标（用于 UI 命中检测与 canvas 内指针） */
  screenToWorld(sx, sy) {
    return {
      x: (sx - this.offsetX) / this.scale,
      y: (sy - this.offsetY) / this.scale,
    };
  }

  /** 确保当前房间的静态层已烘焙 */
  _ensureRoomBaked(room) {
    const key = cacheKey('room', room.key, room.kind, room.seed, room.cleared ? 1 : 0, this.game.floor);
    if (this._roomKey === key) return;
    this._roomKey = key;

    this._bakedRoom = bake(key, this.worldW, this.worldH, (ctx) => {
      ctx.save();
      // 把内容区原点移动到 (WALL_T, WALL_T)
      ctx.translate(WALL_T, WALL_T);
      paintRoom(ctx, {
        kind: room.kind,
        seed: room.seed,
        doors: room.doors,
        cleared: room.cleared,
        floor: this.game.floor,
      });
      ctx.restore();
    });
  }

  /** 房间内容被修改（清房开门/宝箱开启）时失效烘焙 */
  invalidateRoom() {
    this._roomKey = null;
  }

  /**
   * 主渲染
   * @param {number} alpha 插值系数（本作不使用插值，保留参数）
   */
  render(alpha) {
    const ctx = this.ctx;
    const g = this.game;

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // ---- 清屏（黑底，避免任何闪白）----
    ctx.fillStyle = '#0a0709';
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    if (g.scene === SCENE.TITLE) {
      this._renderTitle(ctx);
    } else {
      this._renderWorld(ctx, g);
      this._renderOverlays(ctx, g);
    }

    ctx.restore();
  }

  _renderTitle(ctx) {
    const g = this.game;
    this.game._titleButtons = drawStartScreen(ctx, this.viewW, this.viewH, g.sceneT, g.hoverBtn && g.hoverBtn.id);
  }

  _renderWorld(ctx, g) {
    const room = g.currentRoom;
    if (!room) return;
    this._ensureRoomBaked(room);

    ctx.save();
    // 世界变换 + 震屏
    ctx.translate(this.offsetX + g.shakeX, this.offsetY + g.shakeY);
    ctx.scale(this.scale, this.scale);

    // ---- 1. 烘焙的房间静态层 ----
    ctx.drawImage(this._bakedRoom, 0, 0);

    // 进入房间的暗角过渡（进场淡入）
    if (room.enterGrace > 0.28) {
      ctx.save();
      ctx.globalAlpha = (room.enterGrace - 0.28) / 0.12 * 0.6;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.worldW, this.worldH);
      ctx.restore();
    }

    // 世界坐标原点 = 内容区左上角
    ctx.translate(WALL_T, WALL_T);

    const t = g.sceneT;

    // ---- 2. 地面装饰：尖刺 ----
    for (const s of room.spikes) {
      const sx = s.tx * TILE + TILE / 2;
      const sy = s.ty * TILE + TILE / 2;
      ctx.save();
      ctx.translate(sx, sy);
      // 周期性伸缩
      const k = 0.55 + Math.abs(Math.sin(s.phase)) * 0.45;
      ctx.scale(1, k);
      drawObstacle(ctx, 0, 0, 'spike', 1, t);
      ctx.restore();
    }

    // ---- 3. 掉落物（最底层，玩家踩上去）----
    for (const k of room.pickups) {
      drawPickup(ctx, k.x, k.y, k.kind, t);
    }
    for (const d of room.itemDrops) {
      if (!d.taken) drawItemPickup(ctx, d.x, d.y, d.itemId, t);
    }

    // ---- 4. 宝箱 ----
    for (const c of room.chests) {
      drawChest(ctx, c.x, c.y, c.opened ? 1 : 0, t);
    }

    // ---- 5. 障碍物 ----
    for (const o of room.obstacles) {
      const ox = o.tx * TILE + TILE / 2;
      const oy = o.ty * TILE + TILE / 2;
      // 投影（收小并减淡，避免在障碍物下方露出一圈「黑洞」）
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(ox, oy + 15, 15, 5.5, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
      drawObstacle(ctx, ox, oy, o.type, o.seed, t);
    }

    // ---- 6. 实体（按 y 排序，营造前后遮挡）----
    const drawables = [];
    for (const e of room.enemies) {
      if (!e.alive) continue;
      drawables.push({ y: e.y, kind: 'enemy', e });
    }
    if (room.boss && room.boss.alive) {
      drawables.push({ y: room.boss.y + 200, kind: 'boss', e: room.boss }); // boss 始终在前
    }
    drawables.push({ y: g.player.y, kind: 'player', e: g.player });
    drawables.sort((a, b) => a.y - b.y);

    for (const d of drawables) {
      ctx.save();
      ctx.translate(d.e.x, d.e.y);
      if (d.kind === 'enemy') {
        this._drawEnemy(ctx, d.e, t, g);
      } else if (d.kind === 'boss') {
        this._drawBoss(ctx, d.e, t);
      } else {
        this._drawPlayer(ctx, d.e, t);
      }
      ctx.restore();
    }

    // ---- 7. 子弹 / 光束 / 爆炸 ----
    this._drawProjectiles(ctx, g, t);

    // ---- 8. 粒子 ----
    this._drawParticles(ctx, g);

    // ---- 9. 受伤红屏（世界层，被 UI 覆盖但有沉浸感）----
    ctx.restore(); // 回到世界变换

    // 玩家死亡时的暗化
    if (!g.player.alive) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.viewW, this.viewH);
      ctx.restore();
    }
  }

  _drawEnemy(ctx, e, t, g) {
    const v = {
      t: e.t,
      phase: e.phase,
      facing: e.facing,
      hurt: e.hurtFlash,
      dead: e.isDead ? e.dead : 0,
      shotFlash: e.shotFlash || 0,
      charge: e.charge || 0,
    };
    switch (e.type) {
      case 'pooter': drawPooter(ctx, v); break;
      case 'horf': drawHorf(ctx, v); break;
      case 'gaper':
      default: drawGaper(ctx, v); break;
    }
    // 敌人 HP 条（受伤后显示 1.2s）
    if (!e.isDead && e.hurtFlash > 0.08 && e.hp < e.maxHp) {
      const w = 30;
      const h = 4;
      const bx = -w / 2;
      const by = -e.radius - 14;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
      ctx.fillStyle = '#a01818';
      ctx.fillRect(bx, by, w, h);
      ctx.fillStyle = '#e05a4a';
      ctx.fillRect(bx, by, w * e.hpRatio, h);
      ctx.restore();
    }
  }

  _drawBoss(ctx, b, t) {
    drawMonstro(ctx, {
      t: b.t,
      mouth: b.mouth,
      squash: b.squash,
      rage: b.rage,
      hurt: b.hurtFlash,
      dead: b.isDead ? b.dead : 0,
      scale: 1,
    });
    // Boss 血条画在屏幕顶部（由 _renderOverlays 负责）
    // 出场无敌闪烁
    if (b.entering > 0) {
      ctx.save();
      ctx.globalAlpha = 0.35 + Math.sin(t * 20) * 0.2;
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, b.radius + 16, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawPlayer(ctx, p, t) {
    if (!p.visible && p.alive) return;
    if (!p.alive) {
      // 死亡：倒地
      ctx.save();
      ctx.rotate(Math.min(Math.PI * 0.5, p.deathT * 3));
      ctx.globalAlpha = Math.max(0, 1 - p.deathT * 0.5);
      drawPlayer(ctx, 0, 0, { facing: p.facing, bob: 0, flash: 0, ...p.visual });
      ctx.restore();
      return;
    }
    drawPlayer(ctx, 0, 0, {
      facing: p.facing,
      bob: -p.bob,
      flash: p.hurtFlash,
      devil: p.visual.devil,
      crown: p.visual.crown,
      halo: p.visual.halo,
      wings: p.visual.wings,
      skin: p.visual.skin,
      scale: p.visual.scale,
    });

    // 蓄力时的枪口汇聚光
    if (p.charging) {
      const cr = Math.min(1, p.chargeTime / p.chargeMax);
      ctx.save();
      ctx.globalAlpha = 0.3 + cr * 0.7;
      ctx.shadowColor = '#ff3a2a';
      ctx.shadowBlur = 10 + cr * 24;
      ctx.fillStyle = '#ff6a3a';
      ctx.beginPath();
      ctx.arc(Math.cos(p.facing) * 14, Math.sin(p.facing) * 14, 2 + cr * 5, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // 穆勒火焰
    if (p.muzzleFlash > 0.05) {
      ctx.save();
      ctx.globalAlpha = p.muzzleFlash * 0.7;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(Math.cos(p.facing) * 15, Math.sin(p.facing) * 15, 3 + p.muzzleFlash * 4, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  _drawProjectiles(ctx, g, t) {
    const c = g.combat;
    // 敌方子弹（画在玩家子弹下层）
    for (const b of c.enemyBullets.items) {
      ctx.save();
      ctx.translate(b.x, b.y);
      drawTear(ctx, {
        r: b.r,
        angle: b.angle,
        color: b.color,
        hiColor: b.hiColor,
        t,
        stretch: 0.12,
      });
      ctx.restore();
    }

    // 玩家子弹
    for (const b of c.playerBullets.items) {
      ctx.save();
      ctx.translate(b.x, b.y);
      if (b.ballistic) ctx.translate(0, -b.z * 0.6);
      switch (b.kind) {
        case 'ipecac':
          drawIpecac(ctx, { r: b.r, t, spin: b.spin });
          break;
        case 'knife':
          drawKnife(ctx, { angle: b.angle, len: 30, t });
          break;
        default:
          drawTear(ctx, {
            r: b.r,
            angle: b.angle,
            color: b.color,
            hiColor: b.hiColor,
            t,
            stretch: 0.22,
            spectral: b.spectral,
          });
          break;
      }
      ctx.restore();
    }

    // 光束
    for (const b of c.beams.items) {
      ctx.save();
      if (b.kind === 'tech') {
        drawTechBeam(ctx, { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2, width: b.width, t });
      } else {
        drawBeam(ctx, { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2, width: b.width, t });
      }
      ctx.restore();
    }

    // 爆炸
    for (const ex of c.explosions.items) {
      ctx.save();
      ctx.translate(ex.x, ex.y);
      drawExplosion(ctx, { p: ex.progress, r: ex.radius });
      ctx.restore();
    }
  }

  _drawParticles(ctx, g) {
    const fx = g.fx;
    for (const p of fx.list.items) {
      ctx.save();
      ctx.translate(p.x, p.y);
      const lifeK = 1 - p.age / p.life;
      drawParticle(ctx, {
        r: p.r * (0.4 + lifeK * 0.6),
        color: p.color,
        alpha: p.alpha * Math.min(1, lifeK * 1.6),
        square: p.square,
        spark: p.spark,
        squash: p.squash,
      });
      ctx.restore();
    }
    // 飘字
    for (const ft of fx.texts.items) {
      const k = 1 - ft.age / ft.life;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 1.8);
      strokedText(ctx, ft.text, ft.x, ft.y, {
        font: `bold ${ft.size}px "Trebuchet MS",sans-serif`,
        fill: ft.color,
        stroke: ft.stroke,
        lineWidth: 3.4,
        align: 'center',
      });
      ctx.restore();
    }
  }

  /** UI 覆盖层（屏幕空间） */
  _renderOverlays(ctx, g) {
    const W = this.viewW;
    const H = this.viewH;

    // 受伤红屏
    drawDamageFlash(ctx, W, H, g.damageFlash);

    if (g.scene === SCENE.PLAYING || g.scene === SCENE.PAUSED || g.scene === SCENE.FLOOR_INTRO) {
      if (g.scene !== SCENE.FLOOR_INTRO) {
        drawHUD(ctx, g, W);
        this._drawBossBar(ctx, g, W, H);
      }
    }

    // 虚拟摇杆
    this.joystick.draw(ctx, g.input, W, H);

    // 道具面板
    if (g.itemPanel) {
      drawItemPanel(ctx, W, H, g.itemPanel.item, Math.min(1, g.itemPanel.t / 0.25));
    }

    // 全屏界面
    if (g.scene === SCENE.DEAD) {
      g._deadButtons = drawDeathScreen(ctx, W, H, g.sceneT, g.stats, g.hoverBtn && g.hoverBtn.id);
    } else if (g.scene === SCENE.WIN) {
      g._winButtons = drawWinScreen(ctx, W, H, g.sceneT, g.stats, g.hoverBtn && g.hoverBtn.id);
    } else if (g.scene === SCENE.PAUSED) {
      g._pauseButtons = drawPauseScreen(ctx, W, H, g.hoverBtn && g.hoverBtn.id);
    } else if (g.scene === SCENE.FLOOR_INTRO) {
      drawFloorTransition(ctx, W, H, g.transitionT, g.floor, g.biomeName);
    }

    // FPS（开发信息）
    if (g.showDebug) {
      strokedText(ctx, `${g.fps} FPS  |  ${g.fx.count} fx  |  ${g.combat.playerBullets.length + g.combat.enemyBullets.length} 子弹`, 10, H - 10, {
        font: '11px monospace', fill: '#8a7f74', lineWidth: 2,
      });
    }
  }

  _drawBossBar(ctx, g, W, H) {
    const room = g.currentRoom;
    if (!room || !room.boss || !room.boss.alive || room.boss.entering > 0.5) return;
    const b = room.boss;
    const bw = Math.min(460, W * 0.6);
    const bh = 16;
    const bx = W / 2 - bw / 2;
    // 矮视口（横屏 860×420 等）血条下移贴底，避开虚拟摇杆操作区（spec §4）
    const by = H < 520 ? H - 30 : H - 58;

    ctx.save();
    // 底板
    ctx.fillStyle = 'rgba(10,6,6,0.8)';
    ctx.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
    ctx.strokeStyle = '#3a2020';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx - 3, by - 3, bw + 6, bh + 6);
    // 血量
    const g1 = ctx.createLinearGradient(0, by, 0, by + bh);
    g1.addColorStop(0, '#ff5a4a');
    g1.addColorStop(0.5, '#c92020');
    g1.addColorStop(1, '#7a0a0a');
    ctx.fillStyle = g1;
    ctx.fillRect(bx, by, bw * b.hpRatio, bh);
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(bx, by, bw * b.hpRatio, bh * 0.4);
    // 名称
    strokedText(ctx, b.name.toUpperCase(), W / 2, by - 8, {
      font: 'bold 16px "Trebuchet MS",sans-serif',
      fill: '#f0e0d0',
      lineWidth: 3.5,
      align: 'center',
    });
    ctx.restore();
  }
}
