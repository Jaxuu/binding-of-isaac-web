/**
 * enemy.js — 敌人类（普通敌人 + 通用 AI）
 *
 * 三种普通敌人（用 ai 字段区分行为）：
 *   gaper  —— 追击型：直线朝玩家移动，接触伤害
 *   pooter —— 飞行远程：悬空随机游走，周期性朝玩家发射直线弹
 *   horf   —— 静止炮台：原地不动，周期性朝玩家发射弹（有前摇）
 *
 * 通用属性：hp / speed / contactDamage / radius / flying
 * 受击：hurtFlash 计时，hitStun 短硬直（防止被一瞬间打空血无反馈）
 * 死亡：dead 进度用于播放死亡动画，播完后 alive=false 由系统回收
 *
 * 注意：不使用 ECS（见 ADR-002）。敌人是「带少量组件的 OOP 对象」，
 * 只有当某类敌人需要独特逻辑时才新增字段，保持轻量。
 */

import { TAU, clamp } from '../core/math.js';

/** 敌人定义表 */
export const ENEMY_DEFS = {
  gaper: {
    name: 'Gaper',
    hp: 12,
    speed: 78,
    contactDamage: 1,
    radius: 15,
    flying: false,
    ai: 'chase',
    /** 触墙反弹后的短暂停顿（避免卡墙抽动） */
    wallBumpPause: 0.18,
    canShoot: false,
    scoreWeight: 1,
  },
  pooter: {
    name: 'Pooter',
    hp: 9,
    speed: 42,
    contactDamage: 0,
    radius: 13,
    flying: true,
    ai: 'flyShooter',
    shootInterval: 1.55,
    shootWindup: 0.42,
    projectile: { speed: 148, r: 5.5, damage: 1, range: 420, kind: 'tear', color: '#ff4a4a' },
    keepDistance: 130, // 维持与玩家的距离
    scoreWeight: 1,
  },
  horf: {
    name: 'Horf',
    hp: 16,
    speed: 0,
    contactDamage: 0,
    radius: 16,
    flying: false,
    ai: 'turret',
    shootInterval: 1.9,
    shootWindup: 0.55,
    projectile: { speed: 172, r: 6.5, damage: 1, range: 500, kind: 'tear', color: '#ff7a3a' },
    scoreWeight: 1,
  },
};

export class Enemy {
  /**
   * @param {string} type
   * @param {number} x
   * @param {number} y
   * @param {import('../core/rng.js').Rng} rng
   */
  constructor(type, x, y, rng) {
    const def = ENEMY_DEFS[type] || ENEMY_DEFS.gaper;
    this.type = type;
    this.def = def;

    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = def.radius;
    this.flying = def.flying;

    // 血量（可被精英/楼层缩放）
    this.maxHp = def.hp;
    this.hp = def.hp;

    // 战斗
    this.contactDamage = def.contactDamage;
    this.speedMul = 1;
    this.hpMul = 1;

    // AI 状态
    this.facing = rng ? rng.range(0, TAU) : 0;
    this.phase = rng ? rng.range(0, TAU) : 0;
    this.aiTimer = rng ? rng.range(0, 0.6) : 0;
    this.shootTimer = rng ? rng.range(0.3, 1.2) : 0.5;
    this.windup = 0; // 前摇剩余时间
    this.state = 'idle';
    this.bumpPause = 0;

    // 视觉
    this.hurtFlash = 0;
    this.dead = 0; // 0 = 活着；>0 = 死亡动画进度
    this.isDead = false; // 逻辑死亡（停止参与碰撞/AI）
    this.alive = true; // 实体是否还在活动列表
    this.t = rng ? rng.range(0, 10) : 0;
    this.wobble = rng ? rng.range(0, TAU) : 0;

    // 玩家弹「已命中」追踪（防止穿透弹每帧重复命中）
    this.id = Enemy._nextId++;
    this.knockX = 0;
    this.knockY = 0;
    this.hitStun = 0;
    this.entering = 0.35; // 出场时的无敌/淡入
  }

  get hpRatio() {
    return this.maxHp > 0 ? clamp(this.hp / this.maxHp, 0, 1) : 0;
  }

  /** 受击 */
  takeDamage(amount, fromX = null, fromY = null, knockback = 90) {
    if (this.isDead) return false;
    this.hp -= amount;
    this.hurtFlash = 1;
    this.hitStun = 0.07;
    if (fromX !== null) {
      const a = Math.atan2(this.y - fromY, this.x - fromX);
      this.knockX = Math.cos(a) * knockback;
      this.knockY = Math.sin(a) * knockback;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.isDead = true;
      this.dead = 0.0001; // 启动死亡动画
      return true;
    }
    return false;
  }

  /**
   * 缩放（用于楼层难度递增）
   * @param {number} hpMul
   * @param {number} speedMul
   */
  applyScaling(hpMul = 1, speedMul = 1) {
    this.hpMul = hpMul;
    this.maxHp = Math.max(1, Math.round(this.def.hp * hpMul));
    this.hp = this.maxHp;
    this.speedMul = speedMul;
  }

  /** 应用击退（由移动系统在积分前调用） */
  applyKnockback(dt) {
    if (this.knockX === 0 && this.knockY === 0) return;
    const decay = Math.pow(0.0015, dt);
    this.x += this.knockX * dt;
    this.y += this.knockY * dt;
    this.knockX *= decay;
    this.knockY *= decay;
    if (Math.abs(this.knockX) < 1) this.knockX = 0;
    if (Math.abs(this.knockY) < 1) this.knockY = 0;
  }
}

Enemy._nextId = 1;

/**
 * 敌人 AI 更新（纯函数式：读 enemy + 上下文，写 enemy 的意图速度）
 * 移动/碰撞由 EnemySystem 统一处理，保证行为可预测、可测试。
 *
 * @param {Enemy} e
 * @param {number} dt
 * @param {{x:number, y:number, alive:boolean}} player
 * @param {(x:number,y:number,angle:number,def:object)=>void} spawnBullet 回调
 */
export function updateEnemyAI(e, dt, player, spawnBullet) {
  e.t += dt;
  if (e.hurtFlash > 0) e.hurtFlash = Math.max(0, e.hurtFlash - dt * 4.2);
  if (e.hitStun > 0) e.hitStun = Math.max(0, e.hitStun - dt);
  if (e.entering > 0) e.entering = Math.max(0, e.entering - dt);

  // 死亡动画推进
  if (e.isDead) {
    e.dead += dt * 1.8;
    if (e.dead >= 1) e.alive = false;
    return;
  }

  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const distToPlayer = Math.hypot(dx, dy) || 1;
  const toPlayerAngle = Math.atan2(dy, dx);

  // 硬直/击退中不主动移动
  if (e.hitStun > 0) {
    e.vx = 0;
    e.vy = 0;
    return;
  }

  const ai = e.def.ai;
  const spd = e.def.speed * e.speedMul;

  if (ai === 'chase') {
    // ---- Gaper：直线追击 ----
    if (e.bumpPause > 0) {
      e.bumpPause -= dt;
      e.vx = 0;
      e.vy = 0;
    } else {
      const a = toPlayerAngle + Math.sin(e.t * 3 + e.phase) * 0.14; // 略微摇摆，不呆板
      e.vx = Math.cos(a) * spd;
      e.vy = Math.sin(a) * spd;
      e.facing = a;
    }
  } else if (ai === 'flyShooter') {
    // ---- Pooter：保持距离 + 横向游走 + 周期射击 ----
    const desired = e.def.keepDistance;
    let radial = 0;
    if (distToPlayer > desired * 1.25) radial = 1;
    else if (distToPlayer < desired * 0.75) radial = -1;

    const tangent = Math.sin(e.t * 1.5 + e.phase) * 0.9;
    const ax = Math.cos(toPlayerAngle) * radial + Math.cos(toPlayerAngle + Math.PI / 2) * tangent;
    const ay = Math.sin(toPlayerAngle) * radial + Math.sin(toPlayerAngle + Math.PI / 2) * tangent;
    const len = Math.hypot(ax, ay) || 1;
    e.vx = (ax / len) * spd;
    e.vy = (ay / len) * spd;
    e.facing = toPlayerAngle;

    // 射击循环（统一的 interval → windup → fire 流程）
    updateShooterTimers(e, dt, toPlayerAngle, spawnBullet);
    if (e.shotFlash > 0) e.shotFlash = Math.max(0, e.shotFlash - dt * 6);
  } else if (ai === 'turret') {
    // ---- Horf：不动，但有前摇的射击 ----
    e.vx = 0;
    e.vy = 0;
    e.facing = toPlayerAngle;
    updateShooterTimers(e, dt, toPlayerAngle, spawnBullet);
  }
}

/** 统一的射击计时器：跑 interval → 前摇 windup → 发射 */
function updateShooterTimers(e, dt, angle, spawnBullet) {
  if (!e.def.projectile) return;
  if (e.windup > 0) {
    e.windup -= dt;
    e.charge = clamp(1 - e.windup / e.def.shootWindup, 0, 1);
    if (e.windup <= 0) {
      fireEnemyBullet(e, angle, spawnBullet);
      e.charge = 0;
      e.shootTimer = e.def.shootInterval;
    }
  } else {
    e.charge = 0;
    e.shootTimer -= dt;
    if (e.shootTimer <= 0) {
      e.windup = e.def.shootWindup;
      e.shootTimer = 0;
    }
  }
}

function fireEnemyBullet(e, angle, spawnBullet) {
  const p = e.def.projectile;
  if (!p || !spawnBullet) return;
  // 从身体边缘发出，避免在体内生成
  const ox = Math.cos(angle) * (e.radius + 2);
  const oy = Math.sin(angle) * (e.radius + 2);
  spawnBullet(e.x + ox, e.y + oy, angle, p);
  if (e.def.ai === 'flyShooter') e.shotFlash = 0.14;
}
