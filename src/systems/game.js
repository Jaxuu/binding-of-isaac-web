/**
 * game.js — GameState：中央编排器
 *
 * 职责（把子系统串起来）：
 *   - 持有玩家、当前层地牢、当前房间、战斗、粒子、音频、输入
 *   - 每帧固定步：输入 → 玩家移动/碰撞 → 敌人 AI → 战斗 → 房间逻辑（清房/开门/切房）
 *   - 场景状态机：title / playing / paused / dead / win
 *   - 统计（击杀/拾取/时间/伤害/房间数）
 *
 * 不负责：绘制（由 renderer 负责，读取本对象状态）。
 * 这样保证「逻辑可测试」：Node 环境下不需要 canvas 就能跑 GameState.update。
 */

import { Player, createBaseWeapon } from '../entities/player.js';
import { Enemy, updateEnemyAI } from '../entities/enemy.js';
import { Boss, updateBoss } from '../entities/boss.js';
import { Combat } from './combat.js';
import { ParticleSystem } from '../art/particles.js';
import { generateDungeon, validateDungeon, DIRS, roomKey, ROOM_KIND } from './dungeon.js';
import { Room, populateRoom, ROOM_W, ROOM_H, PLAY_PAD } from './rooms.js';
import { applyItem, rollItem, RARITY_WEIGHTS, ITEM_BY_ID } from '../entities/items.js';
import { EVT } from '../core/events.js';
import { Rng } from '../core/rng.js';
import { clamp, TAU } from '../core/math.js';
import { TILE } from '../art/draw-room.js';

export const SCENE = Object.freeze({
  TITLE: 'title',
  PLAYING: 'playing',
  PAUSED: 'paused',
  DEAD: 'dead',
  WIN: 'win',
  FLOOR_INTRO: 'floorIntro',
});

/** 每层主题名（UI 显示） */
const BIOMES = [
  'Basement',
  'Caves',
  'Depths',
  'Womb',
  'Sheol',
  'Cathedral',
];

export class GameState {
  constructor({ bus, input, audio, width, height }) {
    this.bus = bus;
    this.input = input;
    this.audio = audio;
    this.W = width;
    this.H = height;
    this._h = height; // ui.js 读取

    this.fx = new ParticleSystem();
    this.combat = new Combat(bus, this.fx, audio);

    this.scene = SCENE.TITLE;
    this.sceneT = 0;
    this.hoverBtn = null;

    // 主种子
    this.seed = 1;
    this.rng = new Rng(1);

    // 玩家（延迟到开局创建）
    this.player = new Player(ROOM_W / 2, ROOM_H / 2);

    // 地牢
    this.floor = 1;
    this.dungeon = null;
    this.roomsByKey = {}; // key → Room（运行时对象）
    this.currentRoom = null;
    this.visitedRooms = new Set();
    this.visitedCount = 0;
    this.biomeName = BIOMES[0];

    // 资源
    this.coins = 0;
    this.keys = 1;
    this.bombs = 1;

    // 统计
    this.stats = {
      kills: 0,
      itemsPicked: 0,
      timeAlive: 0,
      floorReached: 1,
      damageDealt: 0,
      roomsVisited: 0,
    };

    // 视觉反馈
    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.damageFlash = 0;
    this.itemPanel = null; // {item, t}
    this.transitionT = 0;
    this.transitionLabel = '';

    // 输入辅助
    this._prevConfirm = false;

    this._wireEvents();
  }

  _wireEvents() {
    this.bus.on(EVT.ENEMY_DAMAGED, (e) => {
      // 伤害统计写在 takeDamage 调用点更准确，这里只做视觉（已在 combat 内做）
    });
    this.bus.on(EVT.ENEMY_DIED, (e) => this._onEnemyDied(e));
    this.bus.on(EVT.PLAYER_DAMAGED, (amount) => {
      this.damageFlash = 1;
      this.addShake(0.5);
      this.audio.sfxHurt();
    });
  }

  // ==================== 开局 / 重开 ====================

  /**
   * 开始新游戏
   * @param {number|string} [seed] 可为空（随机）；字符串走 hash
   */
  startGame(seed) {
    this.seed = seed === undefined ? (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0 : seed;
    this.rng = new Rng(this.seed);

    // 重置玩家
    this.player = new Player(ROOM_W / 2, ROOM_H / 2);
    this.player.weapon = createBaseWeapon();

    // 重置资源与统计
    this.coins = 0;
    this.keys = 1;
    this.bombs = 1;
    this.stats = {
      kills: 0,
      itemsPicked: 0,
      timeAlive: 0,
      floorReached: 1,
      damageDealt: 0,
      roomsVisited: 0,
    };
    this.floor = 1;
    this.fx.clear();
    this.combat.reset();
    this.itemPanel = null;
    this.damageFlash = 0;
    this.shake = 0;
    this._bossAdvanceTimer = null;

    this.generateFloor(1);

    this.scene = SCENE.FLOOR_INTRO;
    this.sceneT = 0;
    this.transitionT = 0;
    this.transitionLabel = '';
    this.biomeName = BIOMES[0];
    this.bus.emit(EVT.GAME_STARTED, { seed: this.seed });
    this.audio.unlock();
  }

  /** 生成一层地牢并放置玩家到起点房 */
  generateFloor(floor) {
    this.floor = floor;
    this.biomeName = BIOMES[Math.min(BIOMES.length - 1, floor - 1)];
    this.stats.floorReached = Math.max(this.stats.floorReached, floor);

    const dungeon = generateDungeon(this.rng, {
      minRooms: 5,
      maxRooms: 8,
      floor,
      wantTreasure: true,
    });
    // 运行时断言（开发期自检；线上若有不变量破坏会在 console 报错但不崩）
    const v = validateDungeon(dungeon);
    if (!v.ok) {
      console.error('[dungeon] 不变量被破坏:', v.errors);
    }
    this.dungeon = dungeon;

    // 创建运行时 Room 并填充内容
    this.roomsByKey = {};
    const owned = new Set(this.player.items.map((i) => i.id));
    for (const meta of dungeon.rooms) {
      const room = new Room(meta);
      room.visited = false;
      room.bossDefeated = false;
      populateRoom(room, this.rng, { floor, ownedItems: owned });
      this.roomsByKey[room.key] = room;
    }

    this.visitedRooms = new Set();
    this.visitedCount = 0;

    // 新楼层不残留上一层的瞬时 UI（道具面板/伤害闪屏）
    this.itemPanel = null;
    this.damageFlash = 0;

    // 玩家放到起点房中心
    const startRoom = this.roomsByKey[dungeon.startKey];
    this.currentRoom = startRoom;
    startRoom.visited = true;
    this.visitedRooms.add(startRoom.key);
    this.visitedCount = 1;
    this.stats.roomsVisited = Math.max(this.stats.roomsVisited, this.visitedCount);

    // 玩家位置：起点房中心（若起点有门，从对侧进入更自然——简化：放中心）
    this.player.x = ROOM_W / 2;
    this.player.y = ROOM_H / 2;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.invuln = 1.0;

    this.bus.emit(EVT.FLOOR_CHANGED, { floor });
  }

  // ==================== 场景切换 ====================

  gotoScene(s) {
    // 切场景时清掉瞬时 UI 覆盖层，避免「道具面板/伤害闪屏」残留到下一屏幕
    if (s !== SCENE.PLAYING) {
      this.itemPanel = null;
      this.damageFlash = 0;
    }
    this.scene = s;
    this.sceneT = 0;
    this.bus.emit(EVT.SCENE_CHANGED, s);
  }

  // ==================== 更新 ====================

  /**
   * 固定步更新
   * @param {number} dt
   */
  update(dt) {
    this.sceneT += dt;
    this.input.update();

    // 震屏衰减
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.6);
      const amp = this.shake * 9;
      this.shakeX = (Math.random() - 0.5) * amp;
      this.shakeY = (Math.random() - 0.5) * amp;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
    if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 1.8);
    if (this.itemPanel) {
      this.itemPanel.t += dt;
      if (this.itemPanel.t > 3.0) this.itemPanel = null;
    }

    switch (this.scene) {
      case SCENE.TITLE:
        this._updateTitle(dt);
        break;
      case SCENE.FLOOR_INTRO:
        this.transitionT += dt;
        if (this.transitionT > 1.8 && this.sceneT > 0.2) {
          this.gotoScene(SCENE.PLAYING);
          this.transitionT = 0;
        }
        break;
      case SCENE.PLAYING:
        this._updatePlaying(dt);
        break;
      case SCENE.PAUSED:
        this._updatePaused(dt);
        break;
      case SCENE.DEAD:
        this.stats.timeAlive = this.stats.timeAlive; // 冻结
        this._updateDead(dt);
        break;
      case SCENE.WIN:
        this._updateWin(dt);
        break;
    }

    // 按钮命中检测（鼠标位置）
    this._updateHover();
  }

  _updateTitle(dt) {
    if (this._confirmPressed()) {
      this.audio.sfxClick();
      this.startGame();
    }
  }

  _updatePaused(dt) {
    // P / ESC 恢复
    if (this.input.pressed('KeyP') || this.input.pressed('Escape')) {
      this.audio.sfxPause();
      this.gotoScene(SCENE.PLAYING);
    }
  }

  _updateDead(dt) {
    // 延迟一点点才响应，避免死亡瞬间误触
    if (this.sceneT > 0.6 && this._confirmPressed()) {
      this.audio.sfxClick();
      this.startGame();
    }
  }

  _updateWin(dt) {
    if (this.sceneT > 0.6 && this._confirmPressed()) {
      this.audio.sfxClick();
      this.startGame();
    }
  }

  /** 主玩法更新 */
  _updatePlaying(dt) {
    const p = this.player;
    const room = this.currentRoom;

    this.stats.timeAlive += dt;

    // ---- 暂停输入 ----
    if (this.input.pressed('KeyP') || this.input.pressed('Escape')) {
      this.audio.sfxPause();
      this.gotoScene(SCENE.PAUSED);
      return;
    }

    // ---- 玩家移动 ----
    this._updatePlayerMovement(dt, p, room);

    // ---- 玩家射击 ----
    this._updatePlayerShooting(dt, p);

    // ---- 敌人 AI ----
    this._updateEnemies(dt, room);

    // ---- Boss ----
    this._updateBossIfAny(dt, room);

    // ---- Boss 击败后的延迟切层 ----
    this._tickBossAdvance(dt);
    // 若本帧因切层/通关改变了场景，必须立即停止本帧剩余玩法更新，
    // 否则会用「旧房间」的引用继续跑拾取/清房逻辑，造成跨场景状态污染。
    if (this.scene !== SCENE.PLAYING) return;

    // ---- 战斗结算 ----
    this.combat.update(dt, { room, player: p });
    if (p.alive) {
      this.combat.resolveContactDamage(p, room);
      this.combat.resolveSpikes(p, room);
    }

    // ---- 掉落物拾取 ----
    this._updatePickups(dt, room, p);

    // ---- 宝箱 ----
    this._updateChests(dt, room, p);

    // ---- 尖刺状态推进 ----
    for (const s of room.spikes) s.phase += dt * 3;

    // ---- 房间清空检测 → 开门 ----
    if (!room.cleared && !room.hasLiveEnemies && room.spawned && !room.inGrace) {
      // 进入房间后给 0.35s 缓冲，避免还在生成就判定清房
      if (room.enterGrace > 0) {
        room.enterGrace -= dt;
      } else {
        this._clearRoom(room);
      }
    } else if (room.enterGrace > 0) {
      room.enterGrace -= dt;
    }

    // ---- 玩家出界 / 门传送 ----
    this._checkDoors(dt, room, p);

    // ---- 边界钳制（不被门吸走时）----
    this._clampPlayer(p, room);

    // ---- 粒子 ----
    this.fx.update(dt);

    // ---- 死亡检测 ----
    if (!p.alive) {
      this.bus.emit(EVT.PLAYER_DIED, null);
      this.audio.sfxGameOver();
      this.addShake(1);
      this.gotoScene(SCENE.DEAD);
    }

    // ---- 玩家动画状态 ----
    p.tick(dt);
  }

  _updatePlayerMovement(dt, p, room) {
    const speed = p.stats.speed;
    const mx = this.input.moveX;
    const my = this.input.moveY;
    // 目标速度
    const targetVx = mx * speed;
    const targetVy = my * speed;
    // 平滑加速（提升手感，避免瞬间满速）
    const accel = Math.min(1, dt * 16);
    p.vx += (targetVx - p.vx) * accel;
    p.vy += (targetVy - p.vy) * accel;

    if (mx !== 0 || my !== 0) {
      // 移动朝向（用于身体倾斜/眼睛朝向的次要参考）
      p.moveFacing = Math.atan2(my, mx);
    }

    // 积分 + 障碍碰撞（分轴处理，实现贴墙滑动）
    let nx = p.x + p.vx * dt;
    if (!room.hitsObstacle(nx, p.y, p.radius)) {
      p.x = nx;
    } else {
      p.vx = 0;
    }
    let ny = p.y + p.vy * dt;
    if (!room.hitsObstacle(p.x, ny, p.radius)) {
      p.y = ny;
    } else {
      p.vy = 0;
    }
  }

  _updatePlayerShooting(dt, p) {
    const weapon = p.weapon;
    const firing = this.input.firing && (this.input.fireX !== 0 || this.input.fireY !== 0);

    if (firing) {
      p.facing = Math.atan2(this.input.fireY, this.input.fireX);
    }

    if (weapon.charge) {
      // 蓄力武器
      if (firing) {
        p.charging = true;
        p.chargeTime = Math.min(p.chargeMax, p.chargeTime + dt);
      } else if (p.charging) {
        // 释放
        const ratio = clamp(p.chargeTime / p.chargeMax, 0, 1);
        if (ratio > 0.15) {
          this.combat.playerFireCharged(p, p.facing, weapon, p.stats, ratio);
        }
        p.charging = false;
        p.chargeTime = 0;
        p.fireCooldown = p.stats.fireDelay;
      }
    } else {
      // 连发武器
      if (p.fireCooldown > 0) p.fireCooldown -= dt;
      if (firing && p.fireCooldown <= 0) {
        this.combat.playerFire(p, p.facing, weapon, p.stats);
        p.fireCooldown = p.stats.fireDelay;
      }
    }
  }

  _updateEnemies(dt, room) {
    const p = this.player;
    const spawnBullet = this.combat.makeEnemySpawnFn();
    for (let i = room.enemies.length - 1; i >= 0; i--) {
      const e = room.enemies[i];
      if (!e.alive) {
        room.enemies.splice(i, 1);
        continue;
      }
      updateEnemyAI(e, dt, p, spawnBullet);
      if (e.isDead) continue;

      // 击退位移
      e.applyKnockback(dt);

      // 移动 + 障碍/边界碰撞
      const nx = e.x + e.vx * dt;
      const ny = e.y + e.vy * dt;
      let blocked = false;
      if (e.flying) {
        // 飞行敌人无视障碍，但仍受房间边界
        e.x = nx;
        e.y = ny;
      } else {
        if (room.hitsObstacle(nx, e.y, e.radius)) {
          e.vx *= -0.4;
          blocked = true;
        } else e.x = nx;
        if (room.hitsObstacle(e.x, ny, e.radius)) {
          e.vy *= -0.4;
          blocked = true;
        } else e.y = ny;
      }
      if (blocked && e.def.ai === 'chase') {
        e.bumpPause = e.def.wallBumpPause || 0.15;
      }

      // 房间边界（内缩一点，避免贴到墙里）
      const pad = e.radius + PLAY_PAD * 0.4;
      const bx = clamp(e.x, pad, ROOM_W - pad);
      const by = clamp(e.y, pad, ROOM_H - pad);
      if (bx !== e.x && !e.flying) e.vx *= -0.4;
      if (by !== e.y && !e.flying) e.vy *= -0.4;
      e.x = bx;
      e.y = by;

      // 敌人互相分离（避免叠在一起成一坨）
      for (let j = 0; j < room.enemies.length; j++) {
        if (j === i) continue;
        const o = room.enemies[j];
        if (o.isDead) continue;
        const dx = o.x - e.x;
        const dy = o.y - e.y;
        const d2 = dx * dx + dy * dy;
        const minD = e.radius + o.radius;
        if (d2 > 0.01 && d2 < minD * minD) {
          const d = Math.sqrt(d2);
          const push = (minD - d) * 0.5;
          const ux = dx / d;
          const uy = dy / d;
          e.x -= ux * push;
          e.y -= uy * push;
          o.x += ux * push;
          o.y += uy * push;
        }
      }
    }
  }

  _updateBossIfAny(dt, room) {
    // Boss 在玩家进入 boss 房后生成
    if (room.kind === ROOM_KIND.BOSS && !room.bossSpawned) {
      if (room.visited && room.enterGrace <= 0) {
        const hpScale = 1 + (this.floor - 1) * 0.22;
        room.boss = new Boss(ROOM_W / 2, ROOM_H * 0.42, this.rng, hpScale);
        room.bossSpawned = true;
        room.cleared = false;
        this.audio.sfxBossRoar();
        this.addShake(1);
        this.bus.emit(EVT.BOSS_SPAWNED, room.boss);
      }
      return;
    }
    const b = room.boss;
    if (!b) return;

    // Boss 生命周期兜底：无论伤害来自哪条路径（战斗系统 / 爆炸 / 调试直调），
    // 只要 Boss 的死亡动画播完（alive=false），就在这里统一结算击杀与通关。
    // 这样避免「只有走 Combat 的 ENEMY_DIED 事件才会被统计」的脆弱耦合。
    if (!b.alive) {
      if (!room.bossDefeated) {
        room.bossDefeated = true;
        const e = b;
        this.stats.kills++;
        this.audio.sfxBossDie();
        this.addShake(1.2);
        this.fx.gibBurst(e.x, e.y, 40, '#6f9e6b');
        this.fx.explode(e.x, e.y, 24, 120);
        this.bus.emit(EVT.BOSS_DIED, e);
        this._onBossDefeated();
      }
      return;
    }
    if (!b.isDead) {
      // 活着：跑 AI
    }

    const api = {
      room,
      spawnBullet: this.combat.makeEnemySpawnFn(),
      explode: (x, y, r, dmg, owner) => this.combat.explode(x, y, r, dmg, owner),
      shake: (a) => this.addShake(a),
      audioShoot: () => this.audio.tone({ freq: 220, freqEnd: 90, type: 'sawtooth', dur: 0.2, gain: 0.22 }),
      audioLand: () => {
        this.audio.noise({ dur: 0.35, gain: 0.3, filterFrom: 1800, filterTo: 80 });
      },
    };
    updateBoss(b, dt, this.player, api);
  }

  _updatePickups(dt, room, p) {
    for (let i = room.pickups.length - 1; i >= 0; i--) {
      const k = room.pickups[i];
      if (Math.hypot(k.x - p.x, k.y - p.y) < p.radius + 14) {
        this._collectPickup(k);
        room.pickups.splice(i, 1);
      }
    }
    // 地面道具
    for (let i = room.itemDrops.length - 1; i >= 0; i--) {
      const d = room.itemDrops[i];
      if (d.taken) continue;
      if (Math.hypot(d.x - p.x, d.y - p.y) < p.radius + 22) {
        this._grantItem(d.itemId, d.x, d.y);
        room.itemDrops.splice(i, 1);
      }
    }
  }

  _collectPickup(k) {
    switch (k.kind) {
      case 'heart':
        if (this.player.heal(2) > 0) this.fx.pickupSparkle(k.x, k.y, PAL_HEART);
        else return; // 满血不吃
        break;
      case 'soulHeart':
        this.player.addSoulHearts(2);
        this.fx.pickupSparkle(k.x, k.y, '#a8d0e6');
        break;
      case 'coin':
        this.coins++;
        this.fx.pickupSparkle(k.x, k.y, '#f0c944');
        break;
      case 'key':
        this.keys++;
        this.fx.pickupSparkle(k.x, k.y, '#e0b64a');
        break;
      case 'bomb':
        this.bombs++;
        this.fx.pickupSparkle(k.x, k.y, '#8a8a98');
        break;
      default:
        break;
    }
    this.audio.sfxDrop();
  }

  _updateChests(dt, room, p) {
    for (const c of room.chests) {
      if (c.opened) continue;
      if (Math.hypot(c.x - p.x, c.y - p.y) < p.radius + 26) {
        c.opened = true;
        this.audio.sfxDoor();
        this.addShake(0.3);
        // 掉落到地面，玩家走上去拾取
        room.itemDrops.push({ x: c.x, y: c.y + 34, itemId: c.itemId, taken: false, t: 0 });
        this.fx.pickupSparkle(c.x, c.y, '#f3c73f');
      }
    }
  }

  /** 授予道具 */
  _grantItem(itemId, x, y) {
    const item = ITEM_BY_ID[itemId] || rollItem(this.rng, RARITY_WEIGHTS.normalDrop);
    if (!item) return;
    applyItem(this.player, item, this.player.weapon);
    this.stats.itemsPicked++;
    this.itemPanel = { item, t: 0 };
    this.fx.pickupSparkle(x, y, '#f3c73f');
    this.audio.sfxPickup();
    this.bus.emit(EVT.ITEM_PICKED, item);
    this.bus.emit(EVT.STATS_CHANGED, this.player.stats);
  }

  /** 清房：开门 + 发奖 + 记录 */
  _clearRoom(room) {
    // Boss 房的「清空」由 _updateBossIfAny 的兜底路径专门处理（含掉落与通关），
    // 这里直接跳过，避免 Boss 房掉出普通奖励或重复结算。
    if (room.kind === ROOM_KIND.BOSS) return;
    room.cleared = true;
    this.audio.sfxDoor();
    this.fx.floatText(ROOM_W / 2, ROOM_H / 2 - 40, '房间已清空!', {
      color: '#ffe9a3', size: 20, life: 1.4, vy: -22,
    });
    this.bus.emit(EVT.ROOM_CLEARED, room);

    // 掉落奖励：普通房有 38% 概率掉一个小拾取物
    if (room.kind === ROOM_KIND.NORMAL && room.enemies.length > 0) {
      if (this.rng.chance(0.38)) {
        const kind = this.rng.weighted({ coin: 5, heart: 2.2, bomb: 1.6, key: 1.2 });
        const spot = this._randRoomSpot(room);
        room.pickups.push({ x: spot.x, y: spot.y, kind: kind || 'coin' });
      }
    }
  }

  _randRoomSpot(room) {
    for (let i = 0; i < 40; i++) {
      const x = this.rng.range(TILE, ROOM_W - TILE);
      const y = this.rng.range(TILE, ROOM_H - TILE);
      if (!room.hitsObstacle(x, y, 16)) return { x, y };
    }
    return { x: ROOM_W / 2, y: ROOM_H / 2 };
  }

  /** 门传送检测 */
  _checkDoors(dt, room, p) {
    if (!room.cleared) return;
    const rects = room.doorRects();
    for (const r of rects) {
      if (
        p.x > r.x && p.x < r.x + r.w &&
        p.y > r.y && p.y < r.y + r.h
      ) {
        const dir = DIRS.find((d) => d.name === r.dir);
        if (!dir) continue;
        const nk = roomKey(room.gx + dir.dx, room.gy + dir.dy);
        const next = this.roomsByKey[nk];
        if (!next) continue;
        this._enterRoom(next, dir);
        return;
      }
    }
  }

  /** 切换到相邻房间 */
  _enterRoom(next, fromDir) {
    const prev = this.currentRoom;
    this.currentRoom = next;
    next.visited = true;
    next.enterGrace = 0.4;

    if (!this.visitedRooms.has(next.key)) {
      this.visitedRooms.add(next.key);
      this.visitedCount++;
      this.stats.roomsVisited = Math.max(this.stats.roomsVisited, this.visitedCount);
    }

    // 玩家从对侧门进入
    const p = this.player;
    p.vx = 0;
    p.vy = 0;
    p.invuln = Math.max(p.invuln, 0.45);
    const inset = PLAY_PAD + 14;
    switch (fromDir.opposite) {
      case 'up': p.x = ROOM_W / 2; p.y = inset; p.facing = Math.PI / 2; break;
      case 'down': p.x = ROOM_W / 2; p.y = ROOM_H - inset; p.facing = -Math.PI / 2; break;
      case 'left': p.x = inset; p.y = ROOM_H / 2; p.facing = 0; break;
      case 'right': p.x = ROOM_W - inset; p.y = ROOM_H / 2; p.facing = Math.PI; break;
    }

    // 清空上一房间的子弹（避免带弹穿门）
    this.combat.playerBullets.clear();
    this.combat.enemyBullets.clear();
    this.combat.beams.clear();
    this.fx.clear();

    this.bus.emit(EVT.ROOM_ENTERED, next);

    // Boss 房：进门时咆哮由 _updateBossIfAny 触发
    if (next.kind === ROOM_KIND.BOSS && !next.bossSpawned) {
      this.fx.floatText(ROOM_W / 2, ROOM_H / 2 - 60, '!! BOSS !!', {
        color: '#ff5a3a', size: 30, life: 1.6, vy: -14,
      });
    }
    // 宝箱房提示
    if (next.kind === ROOM_KIND.TREASURE && next.chests.some((c) => !c.opened)) {
      this.fx.floatText(ROOM_W / 2, ROOM_H / 2 - 60, '宝箱房', {
        color: '#f3c73f', size: 24, life: 1.4, vy: -16,
      });
    }
  }

  _clampPlayer(p, room) {
    // 如果已清房，允许玩家走进门区（由 _checkDoors 处理传送），
    // 因此在门对应的边留出空间；否则严格夹住。
    const pad = p.radius + 4;
    if (room.cleared) {
      const doorSpan = TILE * 1.1;
      const nearDoorX = Math.abs(p.x - ROOM_W / 2) < doorSpan;
      const nearDoorY = Math.abs(p.y - ROOM_H / 2) < doorSpan;
      // 上
      if (room.doors.up && nearDoorX) {
        p.y = clamp(p.y, -20, ROOM_H - pad);
      } else {
        p.y = clamp(p.y, PLAY_PAD + p.radius * 0.2, ROOM_H - pad);
      }
      if (room.doors.down && nearDoorX) {
        p.y = clamp(p.y, pad, ROOM_H + 20);
      }
      if (room.doors.left && nearDoorY) {
        p.x = clamp(p.x, -20, ROOM_W - pad);
      } else {
        p.x = clamp(p.x, PLAY_PAD + p.radius * 0.2, ROOM_W - pad);
      }
      if (room.doors.right && nearDoorY) {
        p.x = clamp(p.x, pad, ROOM_W + 20);
      }
      // 通用兜底
      p.x = clamp(p.x, -20, ROOM_W + 20);
      p.y = clamp(p.y, -20, ROOM_H + 20);
    } else {
      p.x = clamp(p.x, PLAY_PAD + p.radius * 0.2, ROOM_W - pad);
      p.y = clamp(p.y, PLAY_PAD + p.radius * 0.2, ROOM_H - pad);
    }
  }

  // ==================== 敌人死亡 ====================

  _onEnemyDied(e) {
    const isBoss = e.type === 'boss' || e.name === 'Monstro';
    if (isBoss) {
      // 交给 _updateBossIfAny 的兜底路径统一结算（避免双计一次击杀）。
      // 这里只负责标记，让下一帧的轮询立即接手。
      const room = this.currentRoom;
      if (room && room.boss === e) room.bossDefeated = false;
      return;
    }
    this.stats.kills++;
    this.audio.sfxEnemyDie();
    this.fx.gibBurst(e.x, e.y, 14, '#e8c9a0');
    // 普通敌人小概率掉拾取物
    if (this.rng.chance(0.11)) {
      const kind = this.rng.weighted({ coin: 4, heart: 2, bomb: 1.5, key: 1 });
      this.currentRoom.pickups.push({ x: e.x, y: e.y, kind: kind || 'coin' });
    }
  }

  _onBossDefeated() {
    // Boss 房掉落稀有道具（与原作一致：先给奖励，再进下一层）
    const item = rollItem(this.rng, RARITY_WEIGHTS.bossRoom, new Set(this.player.items.map((i) => i.id)));
    const room = this.currentRoom;
    if (room) {
      room.itemDrops.push({
        x: ROOM_W / 2,
        y: ROOM_H * 0.5,
        itemId: item ? item.id : 'crickets_head',
        taken: false,
        t: 0,
      });
      room.cleared = true; // 门视为开启（视觉上）
      this.fx.pickupSparkle(ROOM_W / 2, ROOM_H * 0.5, '#f3c73f');
    }

    // 击败 Boss 后进入下一层（若已是最后一层 → 通关）
    const MAX_FLOOR = 5;
    if (this.floor >= MAX_FLOOR) {
      this.audio.sfxWin();
      this.gotoScene(SCENE.WIN);
      this.bus.emit(EVT.GAME_WON, this.stats);
      return;
    }
    // 延迟一会再切层，让死亡动画播完
    this._bossAdvanceTimer = 1.6;
  }

  /** 由固定步 update 推进的延迟切层（不用 setTimeout，便于确定性与测试） */
  _tickBossAdvance(dt) {
    if (this._bossAdvanceTimer == null) return;
    this._bossAdvanceTimer -= dt;
    if (this._bossAdvanceTimer <= 0) {
      this._bossAdvanceTimer = null;
      if (this.scene === SCENE.PLAYING) this._nextFloor();
    }
  }

  _nextFloor() {
    this.audio.sfxFloor();
    this.generateFloor(this.floor + 1);
    this.transitionT = 0;
    this.gotoScene(SCENE.FLOOR_INTRO);
  }

  // ==================== 输入辅助 ====================

  _confirmPressed() {
    const now = !!(this.input.pressed('Space') || this.input.pressed('Enter') || this.input.pressed('NumpadEnter'));
    return now;
  }

  addShake(a) {
    this.shake = Math.min(1.4, this.shake + a);
  }

  /** 鼠标点击 UI 按钮（由 main.js 转发） */
  handleUIClick(x, y) {
    const btn = this.hoverBtn;
    if (!btn) return false;
    if (btn.id === 'start' || btn.id === 'retry') {
      this.audio.sfxClick();
      this.startGame();
      return true;
    }
    if (btn.id === 'title') {
      this.audio.sfxClick();
      this.gotoScene(SCENE.TITLE);
      return true;
    }
    if (btn.id === 'resume') {
      this.audio.sfxPause();
      this.gotoScene(SCENE.PLAYING);
      return true;
    }
    return false;
  }

  /** 由 main.js 在拿到鼠标位置后调用，写入 hoverBtn（需要各界面把按钮列表暴露） */
  _updateHover() {
    const m = this._mouse;
    if (!m) {
      this.hoverBtn = null;
      return;
    }
    let list = null;
    if (this.scene === SCENE.TITLE) list = this._titleButtons;
    else if (this.scene === SCENE.DEAD) list = this._deadButtons;
    else if (this.scene === SCENE.WIN) list = this._winButtons;
    else if (this.scene === SCENE.PAUSED) list = this._pauseButtons;
    if (!list) {
      this.hoverBtn = null;
      return;
    }
    this.hoverBtn = null;
    for (const b of list) {
      if (m.x >= b.x && m.x <= b.x + b.w && m.y >= b.y && m.y <= b.y + b.h) {
        this.hoverBtn = b;
        break;
      }
    }
  }

  /** 渲染器每帧回写按钮列表与鼠标位置，供下一帧命中检测 */
  setMouse(x, y) {
    this._mouse = { x, y };
  }

  // ==================== 供渲染器读取的快照 ====================

  get fps() {
    return this._fps || 0;
  }
  set fps(v) {
    this._fps = v;
  }
}

const PAL_HEART = '#e04a4a';
