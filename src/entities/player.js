/**
 * player.js — 玩家（以撒）实体
 *
 * 职责：
 * - 位置/速度积分（移动由输入驱动）
 * - 生命值（半心为最小单位）、无敌帧、受伤
 * - 射击计时（由 stats.fireDelay 决定）
 * - 外观状态（道具改变外观的载体）：facing / bob / hurtFlash / 变体旗标
 * - 蓄力（Brimstone 需要按住蓄力后释放）
 *
 * 不负责：碰撞响应（EnemySystem/CombatSystem 处理，因为需要知道房间边界）、
 * 道具效果（ItemSystem 处理）。
 */

import { clamp, TAU } from '../core/math.js';
import { BASE_STATS, computeStats } from './stats.js';

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = 13;

    // ---- 属性 ----
    /** @type {Array<{flat?:object, mult?:object}>} 道具修正列表 */
    this.modifiers = [];
    this.items = []; // 已拾取道具（含 id，用于外观与去重）
    this.stats = computeStats([]);

    // ---- 生命 ----
    this.maxHealth = this.stats.maxHealth;
    this.health = this.maxHealth;
    this.soulHearts = 0; // 灵魂心（先扣）
    this.blackHearts = 0; // 黑心（扣血时对全场造成伤害，本作简化：仅作血量）
    this.invuln = 0;
    this.hurtFlash = 0;

    // ---- 射击 ----
    this.fireCooldown = 0;
    this.charging = false; // Brimstone 蓄力
    this.chargeTime = 0;
    this.chargeMax = 0.52;
    this.muzzleFlash = 0;

    // ---- 视觉 ----
    this.facing = -Math.PI / 2; // 初始朝上
    this.moveFacing = -Math.PI / 2;
    this.bob = 0;
    this.bobT = 0;
    this.moving = false;
    this.alive = true;
    this.deathT = 0;

    // ---- 外观变体（由 ItemSystem 维护）----
    this.visual = {
      devil: false,
      crown: false,
      halo: false,
      wings: false,
      skin: null,
      scale: 1,
    };

    // ---- 武器特性（由 ItemSystem 写入）----
    this.weapon = createBaseWeapon();

    // 统计用的内部计数（真正统计在 GameState.stats）
    this.shotAngle = -Math.PI / 2;
  }

  get hpRatio() {
    const total = this.maxHealth + this.soulHearts + this.blackHearts;
    const cur = this.health + this.soulHearts + this.blackHearts;
    return total > 0 ? clamp(cur / total, 0, 1) : 0;
  }

  /** 总血量（半心） */
  get totalHearts() {
    return this.health + this.soulHearts + this.blackHearts;
  }

  /** 重算属性（道具变化后调用） */
  recalcStats() {
    this.stats = computeStats(this.modifiers);
    const oldMax = this.maxHealth;
    this.maxHealth = this.stats.maxHealth;
    // 最大生命提升时直接补满新增部分（原作行为：加心道具立刻给心）
    if (this.maxHealth > oldMax) {
      this.health += this.maxHealth - oldMax;
    } else if (this.maxHealth < oldMax) {
      this.health = Math.min(this.health, this.maxHealth);
    }
    this.health = clamp(this.health, 0, this.maxHealth);
  }

  /**
   * 受伤
   * @param {number} amount 半心数
   * @returns {boolean} 是否实际受伤（无敌帧内返回 false）
   */
  takeDamage(amount) {
    if (!this.alive || this.invuln > 0 || amount <= 0) return false;
    // 先扣灵魂心 → 黑心 → 红心
    let left = amount;
    if (this.blackHearts > 0) {
      const take = Math.min(this.blackHearts, left);
      this.blackHearts -= take;
      left -= take;
    }
    if (left > 0 && this.soulHearts > 0) {
      const take = Math.min(this.soulHearts, left);
      this.soulHearts -= take;
      left -= take;
    }
    if (left > 0) {
      this.health -= left;
    }
    this.invuln = 1.0; // 1 秒无敌
    this.hurtFlash = 1;
    if (this.health <= 0) {
      this.health = 0;
      if (this.soulHearts <= 0 && this.blackHearts <= 0) {
        this.alive = false;
      }
    }
    return true;
  }

  /** 治疗（半心数） */
  heal(halves) {
    if (halves <= 0) return 0;
    const before = this.health;
    this.health = clamp(this.health + halves, 0, this.maxHealth);
    return this.health - before;
  }

  /** 增加最大生命上限（心之容器） */
  addMaxHealth(halves) {
    this.modifiers.push({ flat: { maxHealth: halves } });
    this.recalcStats();
  }

  /** 加魂心/黑心 */
  addSoulHearts(n) {
    this.soulHearts = Math.min(24, this.soulHearts + n);
  }
  addBlackHearts(n) {
    this.blackHearts = Math.min(24, this.blackHearts + n);
  }

  /**
   * 每帧更新（移动积分由外部传入期望速度；这里只做时间/动画状态推进）
   * @param {number} dt
   */
  tick(dt) {
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt * 4);
    if (this.fireCooldown > 0) this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.muzzleFlash > 0) this.muzzleFlash = Math.max(0, this.muzzleFlash - dt * 8);

    // 走路上下浮动
    const spd = Math.hypot(this.vx, this.vy);
    this.moving = spd > 6;
    if (this.moving) {
      this.bobT += dt * (6 + spd * 0.03);
      this.bob = Math.abs(Math.sin(this.bobT)) * 2.4;
    } else {
      this.bob += (0 - this.bob) * Math.min(1, dt * 10);
    }

    if (!this.alive) this.deathT += dt;
  }

  /** 无敌帧是否处于闪烁的「隐」相位（渲染用） */
  get visible() {
    if (this.invuln <= 0) return true;
    return Math.floor(this.invuln * 14) % 2 === 0;
  }
}

/** 基础武器：单发眼泪 */
export function createBaseWeapon() {
  return {
    kind: 'tear', // tear | brimstone | knife | tech | ipecac | spectral
    shots: 1, // 同时发射数量
    spread: 0, // 散射弧度
    damageMul: 1,
    pierce: 0,
    homing: 0, // 度/秒
    explosive: false,
    ballistic: false,
    spectral: false,
    curving: 0,
    charge: false, // 是否需要蓄力（Brimstone）
    beamWidth: 20,
    beamDuration: 0.45,
    tearColor: null,
    tearHiColor: null,
    /** 多发的横向偏移（如三连发是 [-1, 0, 1] × offset） */
    offsets: null,
    /** 每发之间的延迟（如三连发是扇形同步，本字段保留扩展） */
    burst: 1,
    burstDelay: 0,
    weaponId: 0, // 用于穿透弹命中去重
  };
}
