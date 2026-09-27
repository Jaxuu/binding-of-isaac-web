/**
 * projectile.js — 子弹 / 激光 / 飞刀 / 爆炸 实体
 *
 * 统一模型：所有「会飞的伤害源」都是 Projectile，用 kind 区分渲染与行为。
 * 关键字段：
 *   kind    'tear' | 'brimstone' | 'ipecac' | 'knife' | 'tech' | 'spectral'
 *   damage  命中伤害
 *   pierce  可穿透的剩余敌人数（0 = 命中即消失）
 *   homing  追踪强度（每秒转角度数）
 *   ballistic 是否受重力（Ipecac）
 *   explosive 命中/落地是否爆炸
 *   curving 是否回旋（My Reflection 类）
 *
 * 与玩家的关系：owner = 'player' | 'enemy'，决定能命中谁。
 */

import { TAU } from '../core/math.js';

export class Projectile {
  constructor() {
    this.reset();
  }

  reset(x = 0, y = 0, vx = 0, vy = 0, opts = {}) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.r = opts.r === undefined ? 6 : opts.r;
    this.damage = opts.damage === undefined ? 3.5 : opts.damage;
    this.kind = opts.kind || 'tear';
    this.owner = opts.owner || 'player';
    this.pierce = opts.pierce === undefined ? 0 : opts.pierce;
    this.homing = opts.homing === undefined ? 0 : opts.homing;
    this.ballistic = !!opts.ballistic;
    this.explosive = !!opts.explosive;
    this.explosionRadius = opts.explosionRadius === undefined ? 62 : opts.explosionRadius;
    this.curving = opts.curving || 0;
    this.spectral = !!opts.spectral;
    this.color = opts.color || null;
    this.hiColor = opts.hiColor || null;

    // 射程：按累积飞行距离消耗
    this.maxDist = opts.range === undefined ? 340 : opts.range;
    this.traveled = 0;

    // 视觉
    this.angle = Math.atan2(vy, vx);
    this.spin = 0;
    this.t = 0;
    this.alive = true;
    this.life = opts.life === undefined ? 6 : opts.life; // 硬超时保护

    // 弹道（Ipecac 抛物线）
    this.z = 0; // 离地高度（渲染用）
    this.vz = opts.vz === undefined ? 0 : opts.vz;
    this.gravity = opts.gravity === undefined ? 520 : opts.gravity;

    // 命中记录（穿透时避免重复命中同一敌人）
    this.hitIds = null;
    this.weaponId = opts.weaponId || 0;

    // 追踪目标（由 CombatSystem 每帧写）
    this._target = null;
    return this;
  }

  /** 是否需要在弹道模式下模拟 z（Ipecac） */
  get isBallistic3D() {
    return this.ballistic;
  }

  /** 供 ActiveList 使用 */
  markDead() {
    this.alive = false;
  }

  /** 是否已经命中过该实体 */
  hasHit(id) {
    return this.hitIds !== null && this.hitIds.has(id);
  }

  recordHit(id) {
    if (this.hitIds === null) this.hitIds = new Set();
    this.hitIds.add(id);
  }

  /** 命中后的处理：返回是否应该销毁 */
  onHitEnemy() {
    if (this.explosive) return true; // 爆弹命中即炸即销毁
    if (this.pierce > 0) {
      this.pierce--;
      return false;
    }
    return true;
  }
}

/** Brimstone 光束：不是「飞行的弹」，而是一条瞬时存在若干帧的射线 */
export class Beam {
  constructor() {
    this.reset();
  }

  reset(x1, y1, angle, length, opts = {}) {
    this.x1 = x1;
    this.y1 = y1;
    this.angle = angle;
    this.length = length;
    this.x2 = x1 + Math.cos(angle) * length;
    this.y2 = y1 + Math.sin(angle) * length;
    this.width = opts.width === undefined ? 20 : opts.width;
    this.damage = opts.damage === undefined ? 8 : opts.damage;
    this.owner = opts.owner || 'player';
    this.kind = opts.kind || 'brimstone';
    this.duration = opts.duration === undefined ? 0.45 : opts.duration;
    this.t = 0;
    this.alive = true;
    // 伤害节流：每 0.1s 对同一实体最多结算一次
    this.tickTimer = 0;
    this.hitThisTick = null;
    this.weaponId = opts.weaponId || 0;
    // 光束是否跟随玩家（蓄力期间角度固定，但起点跟随）
    this.followOwner = opts.followOwner !== false;
    return this;
  }

  markDead() {
    this.alive = false;
  }

  updateGeometry(x1, y1, angle) {
    this.x1 = x1;
    this.y1 = y1;
    this.angle = angle;
    this.x2 = x1 + Math.cos(angle) * this.length;
    this.y2 = y1 + Math.sin(angle) * this.length;
  }
}

/** 爆炸（视觉 + 一次性范围伤害结算） */
export class Explosion {
  constructor() {
    this.reset();
  }

  reset(x, y, radius, damage, opts = {}) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.damage = damage;
    this.owner = opts.owner || 'player';
    this.duration = opts.duration === undefined ? 0.42 : opts.duration;
    this.t = 0;
    this.alive = true;
    this.applied = false;
    this.friendlyFire = opts.friendlyFire !== false; // 是否也伤玩家
    return this;
  }

  markDead() {
    this.alive = false;
  }

  get progress() {
    return Math.min(1, this.t / this.duration);
  }
}
