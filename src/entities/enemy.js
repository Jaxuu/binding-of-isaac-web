/**
 * enemy.js — 敌人类（普通敌人 + 通用 AI）
 *
 * 敌人用 `ai` 字段区分行为族。共 19 种，覆盖《以撒的结合》的经典行为原型：
 *
 *   追击族   chase / flyChase            —— 直线/飞行追击，接触伤害
 *   射击族   flyShooter / turret         —— 悬空游走射击 / 静止炮台
 *            wanderShooter / slowShooter —— 游走射击（十字/单发）
 *            homingShooter               —— 追踪弹
 *            boneThrower                 —— 抛掷骨弹
 *   冲锋族   charger                     —— 游走→锁定→冲刺
 *   跳跃族   jumper / leaper             —— 连续小跳 / 单次长跳
 *   召唤族   summoner                    —— 逃避玩家，死亡时召唤
 *   伏击族   ambusher                    —— 常态无敌，靠近后抬头射击
 *   激光族   laser                       —— 蓄力后发射光束
 *   爆炸族   exploder / slowExploder     —— 自爆
 *   分裂族   diagonalFlyer               —— 对角飞行，死亡爆炸
 *   重生族   （revive 标记，配合 chase） —— 死亡后短暂复活一次
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
  // ---------------- 追击族 ----------------
  gaper: {
    name: 'Gaper', nameZh: '呆滞者',
    hp: 12, speed: 78, contactDamage: 1, radius: 15, flying: false,
    ai: 'chase', wallBumpPause: 0.18, scoreWeight: 1,
  },
  maggot: {
    name: 'Maggot', nameZh: '蛆虫',
    hp: 18, speed: 46, contactDamage: 1, radius: 14, flying: false,
    ai: 'chase', wallBumpPause: 0.3, wobbleAmp: 0.3, scoreWeight: 1,
  },
  globin: {
    name: 'Globin', nameZh: '血球蛋白',
    hp: 20, speed: 66, contactDamage: 1, radius: 15, flying: false,
    ai: 'chase', wallBumpPause: 0.2, revives: 1, scoreWeight: 1.4,
  },
  attackFly: {
    name: 'Attack Fly', nameZh: '攻击苍蝇',
    hp: 6, speed: 138, contactDamage: 1, radius: 9, flying: true,
    ai: 'flyChase', scoreWeight: 0.7,
  },
  // ---------------- 射击族 ----------------
  pooter: {
    name: 'Pooter', nameZh: '飘浮射手',
    hp: 9, speed: 42, contactDamage: 0, radius: 13, flying: true,
    ai: 'flyShooter', shootInterval: 1.55, shootWindup: 0.42,
    projectile: { speed: 148, r: 5.5, damage: 1, range: 420, kind: 'tear', color: '#ff4a4a' },
    keepDistance: 130, scoreWeight: 1,
  },
  horf: {
    name: 'Horf', nameZh: '静止炮台',
    hp: 16, speed: 0, contactDamage: 0, radius: 16, flying: false,
    ai: 'turret', shootInterval: 1.9, shootWindup: 0.55,
    projectile: { speed: 172, r: 6.5, damage: 1, range: 500, kind: 'tear', color: '#ff7a3a' },
    scoreWeight: 1,
  },
  clotty: {
    name: 'Clotty', nameZh: '血块',
    hp: 16, speed: 38, contactDamage: 1, radius: 15, flying: false,
    ai: 'wanderShooter', shootInterval: 2.1, shootWindup: 0.4, spreadCount: 4, spreadArc: Math.PI / 2,
    projectile: { speed: 150, r: 6, damage: 1, range: 460, kind: 'tear', color: '#e05050' },
    scoreWeight: 1.2,
  },
  spitty: {
    name: 'Spitty', nameZh: '吐痰者',
    hp: 16, speed: 34, contactDamage: 0, radius: 14, flying: false,
    ai: 'slowShooter', shootInterval: 1.7, shootWindup: 0.5,
    projectile: { speed: 158, r: 6, damage: 1, range: 460, kind: 'tear', color: '#ff9a4a' },
    scoreWeight: 1,
  },
  maw: {
    name: 'Maw', nameZh: '巨口',
    hp: 18, speed: 40, contactDamage: 0, radius: 16, flying: true,
    ai: 'homingShooter', shootInterval: 2.0, shootWindup: 0.5,
    projectile: { speed: 132, r: 6.5, damage: 1, range: 520, kind: 'tear', color: '#d070b0', homing: 90 },
    keepDistance: 120, scoreWeight: 1.4,
  },
  bone: {
    name: 'Bony', nameZh: '白骨兵',
    hp: 20, speed: 52, contactDamage: 1, radius: 15, flying: false,
    ai: 'boneThrower', shootInterval: 2.2, shootWindup: 0.45, keepDistance: 150,
    projectile: { speed: 190, r: 7, damage: 1, range: 520, kind: 'bone', color: '#e6e0c6' },
    scoreWeight: 1.2,
  },
  // ---------------- 冲锋族 ----------------
  charger: {
    name: 'Charger', nameZh: '冲撞者',
    hp: 20, speed: 54, contactDamage: 1, radius: 16, flying: false,
    ai: 'charger', chargeSpeed: 300, chargeWindup: 0.42, chargeDuration: 1.05, chargeCooldown: 0.7,
    scoreWeight: 1.3,
  },
  // ---------------- 跳跃族 ----------------
  hopper: {
    name: 'Hopper', nameZh: '跳蚤',
    hp: 14, speed: 0, contactDamage: 1, radius: 14, flying: false,
    ai: 'jumper', hopInterval: 0.95, hopPower: 210, hopAirTime: 0.42,
    scoreWeight: 1,
  },
  trite: {
    name: 'Trite', nameZh: '蜘蛛怪',
    hp: 10, speed: 0, contactDamage: 1, radius: 12, flying: true,
    ai: 'leaper', hopInterval: 0.8, hopPower: 300, hopAirTime: 0.34, leapRange: 260,
    scoreWeight: 0.9,
  },
  // ---------------- 召唤族 ----------------
  mulligan: {
    name: 'Mulligan', nameZh: '呆瓜',
    hp: 22, speed: 50, contactDamage: 1, radius: 17, flying: false,
    ai: 'summoner', summonType: 'attackFly', summonCount: 2, summonOnDeath: true, scoreWeight: 1.5,
  },
  // ---------------- 伏击族 ----------------
  host: {
    name: 'Host', nameZh: '宿主',
    hp: 24, speed: 0, contactDamage: 0, radius: 18, flying: false,
    ai: 'ambusher', riseRange: 130, riseTime: 0.5, shootInterval: 2.4, shootWindup: 0.5,
    spreadCount: 3, spreadArc: 0.6,
    projectile: { speed: 168, r: 6, damage: 1, range: 480, kind: 'tear', color: '#ff6a5a' },
    scoreWeight: 1.5,
  },
  // ---------------- 激光族 ----------------
  vis: {
    name: 'Vis', nameZh: '激光眼',
    hp: 22, speed: 40, contactDamage: 1, radius: 15, flying: false,
    ai: 'laser', beamRange: 230, beamWindup: 0.85, beamDuration: 0.42, beamDamage: 1.5,
    scoreWeight: 1.6,
  },
  // ---------------- 爆炸族 ----------------
  mulliboom: {
    name: 'Mulliboom', nameZh: '自爆呆瓜',
    hp: 14, speed: 96, contactDamage: 0, radius: 16, flying: false,
    ai: 'exploder', kamikaze: true, explodeRadius: 66, explodeDamage: 1.5,
    scoreWeight: 1.2,
  },
  sucker: {
    name: 'Sucker', nameZh: '吸盘怪',
    hp: 16, speed: 44, contactDamage: 0, radius: 14, flying: true,
    ai: 'slowExploder', kamikaze: false, explodeOnDeath: true, explodeRadius: 72, explodeDamage: 1.5,
    scoreWeight: 1.1,
  },
  // ---------------- 分裂族 ----------------
  boomFly: {
    name: 'Boom Fly', nameZh: '轰炸蝇',
    hp: 14, speed: 118, contactDamage: 1, radius: 13, flying: true,
    ai: 'diagonalFlyer', explodeOnDeath: true, explodeRadius: 58, explodeDamage: 1.5,
    scoreWeight: 1.2,
  },
};

/** 全部敌人类型 id（供测试与楼层配置校验） */
export const ENEMY_TYPES = Object.keys(ENEMY_DEFS);

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
    this.invuln = 0;

    // 重生（Globin 等）
    this.revivesLeft = def.revives || 0;

    // AI 状态
    this.facing = rng ? rng.range(0, TAU) : 0;
    this.phase = rng ? rng.range(0, TAU) : 0;
    this.aiTimer = rng ? rng.range(0, 0.6) : 0;
    this.shootTimer = rng ? rng.range(0.3, 1.2) : 0.5;
    this.windup = 0; // 前摇剩余时间
    this.state = 'idle';
    this.stateT = 0;
    this.bumpPause = 0;

    // 冲锋
    this.chargeState = 'wander'; // wander | windup | dashing | recover
    this.chargeDir = { x: 0, y: 0 };
    // 跳跃
    this.hopZ = 0;
    this.hopVz = 0;
    this.hopping = false;
    this.hopTimer = 0;
    // 对角飞行
    this.dir = { x: rng ? (rng.chance(0.5) ? 1 : -1) : 1, y: rng ? (rng.chance(0.5) ? 1 : -1) : 1 };
    // 伏击
    this.risen = false;

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
    this._deathFx = false; // 死亡特效是否已触发（爆炸/召唤只触发一次）
  }

  get hpRatio() {
    return this.maxHp > 0 ? clamp(this.hp / this.maxHp, 0, 1) : 0;
  }

  /** 是否处于无敌（伏击怪潜伏时 / 出场保护 / 复活僵直） */
  get intangible() {
    return this.invuln > 0 || this.entering > 0;
  }

  /** 受击 */
  takeDamage(amount, fromX = null, fromY = null, knockback = 90) {
    if (this.isDead) return false;
    // 无敌：伏击怪潜伏期 / 复活僵直期（出场淡入不阻挡伤害，保持原有手感）
    if (this.invuln > 0) return false;
    this.hp -= amount;
    this.hurtFlash = 1;
    this.hitStun = 0.07;
    if (fromX !== null) {
      const a = Math.atan2(this.y - fromY, this.x - fromX);
      this.knockX = Math.cos(a) * knockback;
      this.knockY = Math.sin(a) * knockback;
    }
    if (this.hp <= 0) {
      // 重生：Globin 等被打成一滩粘液，短暂后恢复半血（只触发一次）
      if (this.revivesLeft > 0) {
        this.revivesLeft--;
        this.hp = Math.max(1, Math.round(this.maxHp * 0.5));
        this.state = 'revive';
        this.stateT = 0;
        this.invuln = 0.9; // 复活僵直期无敌，给玩家反应时间
        this.vx = 0;
        this.vy = 0;
        return false;
      }
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
 * @param {object} api
 * @param {(x:number,y:number,angle:number,def:object)=>void} api.spawnBullet
 * @param {(x:number,y:number,radius:number,damage:number,owner:string)=>void} [api.explode]
 * @param {(type:string,x:number,y:number)=>void} [api.spawnEnemy]
 * @param {(x:number,y:number,angle:number,opts:object)=>void} [api.beam]
 */
export function updateEnemyAI(e, dt, player, api) {
  // 兼容旧调用：第 4 参若为函数则视为 spawnBullet
  const A = typeof api === 'function' ? { spawnBullet: api } : (api || {});
  const spawnBullet = A.spawnBullet;

  e.t += dt;
  e.stateT += dt;
  if (e.hurtFlash > 0) e.hurtFlash = Math.max(0, e.hurtFlash - dt * 4.2);
  if (e.hitStun > 0) e.hitStun = Math.max(0, e.hitStun - dt);
  if (e.entering > 0) e.entering = Math.max(0, e.entering - dt);
  if (e.invuln > 0) e.invuln = Math.max(0, e.invuln - dt);

  // 死亡动画推进 + 一次性死亡特效（爆炸/召唤）
  if (e.isDead) {
    if (!e._deathFx) {
      e._deathFx = true;
      if (e.def.explodeOnDeath && A.explode) {
        A.explode(e.x, e.y, e.def.explodeRadius || 60, e.def.explodeDamage || 1.5, 'enemy');
      }
      if (e.def.summonOnDeath && A.spawnEnemy) {
        const n = e.def.summonCount || 2;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + e.phase;
          A.spawnEnemy(e.def.summonType, e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 20);
        }
      }
    }
    e.dead += dt * 1.8;
    if (e.dead >= 1) e.alive = false;
    return;
  }

  // 复活僵直：不动、不攻击
  if (e.state === 'revive') {
    e.vx = 0;
    e.vy = 0;
    if (e.stateT > 0.7) {
      e.state = 'idle';
      e.stateT = 0;
    }
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

  switch (ai) {
    case 'chase': {
      // 直线追击（可带轻微摇摆）
      if (e.bumpPause > 0) {
        e.bumpPause -= dt;
        e.vx = 0;
        e.vy = 0;
      } else {
        const wob = e.def.wobbleAmp || 0.14;
        const a = toPlayerAngle + Math.sin(e.t * 3 + e.phase) * wob;
        e.vx = Math.cos(a) * spd;
        e.vy = Math.sin(a) * spd;
        e.facing = a;
      }
      break;
    }
    case 'flyChase': {
      // 飞行追击：更快、带环形扰动，压迫感更强
      const a = toPlayerAngle + Math.sin(e.t * 6 + e.phase) * 0.5;
      e.vx = Math.cos(a) * spd;
      e.vy = Math.sin(a) * spd;
      e.facing = a;
      break;
    }
    case 'flyShooter': {
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
      updateShooterTimers(e, dt, toPlayerAngle, spawnBullet);
      if (e.shotFlash > 0) e.shotFlash = Math.max(0, e.shotFlash - dt * 6);
      break;
    }
    case 'turret': {
      e.vx = 0;
      e.vy = 0;
      e.facing = toPlayerAngle;
      updateShooterTimers(e, dt, toPlayerAngle, spawnBullet);
      break;
    }
    case 'wanderShooter': {
      // 随机游走 + 周期性十字/扇形弹幕
      updateWander(e, dt, spd);
      e.facing = toPlayerAngle;
      updateShooterTimers(e, dt, toPlayerAngle, spawnBullet, e.def.spreadCount || 1, e.def.spreadArc || 0);
      break;
    }
    case 'slowShooter': {
      updateWander(e, dt, spd * 0.7);
      e.facing = toPlayerAngle;
      updateShooterTimers(e, dt, toPlayerAngle, spawnBullet);
      break;
    }
    case 'homingShooter': {
      const desired = e.def.keepDistance || 120;
      let radial = 0;
      if (distToPlayer > desired * 1.3) radial = 1;
      else if (distToPlayer < desired * 0.7) radial = -1;
      const tangent = Math.sin(e.t * 1.2 + e.phase) * 0.7;
      const ax = Math.cos(toPlayerAngle) * radial + Math.cos(toPlayerAngle + Math.PI / 2) * tangent;
      const ay = Math.sin(toPlayerAngle) * radial + Math.sin(toPlayerAngle + Math.PI / 2) * tangent;
      const len = Math.hypot(ax, ay) || 1;
      e.vx = (ax / len) * spd;
      e.vy = (ay / len) * spd;
      e.facing = toPlayerAngle;
      updateShooterTimers(e, dt, toPlayerAngle, spawnBullet);
      break;
    }
    case 'boneThrower': {
      // 保持距离，抛掷骨弹
      const desired = e.def.keepDistance || 150;
      let radial = 0;
      if (distToPlayer > desired * 1.3) radial = 1;
      else if (distToPlayer < desired * 0.7) radial = -1;
      const tangent = Math.sin(e.t * 1.1 + e.phase) * 0.6;
      const ax = Math.cos(toPlayerAngle) * radial + Math.cos(toPlayerAngle + Math.PI / 2) * tangent;
      const ay = Math.sin(toPlayerAngle) * radial + Math.sin(toPlayerAngle + Math.PI / 2) * tangent;
      const len = Math.hypot(ax, ay) || 1;
      e.vx = (ax / len) * spd;
      e.vy = (ay / len) * spd;
      e.facing = toPlayerAngle;
      updateShooterTimers(e, dt, toPlayerAngle, spawnBullet);
      break;
    }
    case 'charger': {
      updateCharger(e, dt, spd, distToPlayer, toPlayerAngle);
      break;
    }
    case 'jumper': {
      updateHopper(e, dt, distToPlayer, toPlayerAngle, false);
      break;
    }
    case 'leaper': {
      updateHopper(e, dt, distToPlayer, toPlayerAngle, true);
      break;
    }
    case 'summoner': {
      // 逃避玩家；靠近时才缓慢游走
      const flee = distToPlayer < 170 ? -1 : 0.4;
      const tangent = Math.sin(e.t * 1.4 + e.phase) * 0.8;
      const ax = Math.cos(toPlayerAngle) * flee + Math.cos(toPlayerAngle + Math.PI / 2) * tangent;
      const ay = Math.sin(toPlayerAngle) * flee + Math.sin(toPlayerAngle + Math.PI / 2) * tangent;
      const len = Math.hypot(ax, ay) || 1;
      e.vx = (ax / len) * spd;
      e.vy = (ay / len) * spd;
      e.facing = toPlayerAngle;
      break;
    }
    case 'ambusher': {
      // 常态潜伏（无敌）；玩家靠近 → 抬头 → 三连散射 → 缩回
      e.vx = 0;
      e.vy = 0;
      const inRange = distToPlayer < (e.def.riseRange || 130);
      if (!e.risen && inRange) {
        e.risen = true;
        e.state = 'rise';
        e.stateT = 0;
        e.invuln = 0; // 抬头后解除无敌，可被击伤
      }
      if (e.risen) {
        e.facing = toPlayerAngle;
        if (e.state === 'rise') {
          if (e.stateT >= (e.def.riseTime || 0.5)) {
            e.state = 'idle';
            e.stateT = 0;
            e.shootTimer = 0.25;
          }
        } else {
          updateShooterTimers(e, dt, toPlayerAngle, spawnBullet, e.def.spreadCount || 3, e.def.spreadArc || 0.6);
        }
        // 玩家远离太久则重新潜伏
        if (distToPlayer > (e.def.riseRange || 130) * 2.4) {
          e.risen = false;
          e.state = 'idle';
          e.stateT = 0;
          e.invuln = 9999;
        }
      } else {
        e.invuln = 9999; // 潜伏期无敌（保持进入无敌不会被递减回 0）
      }
      break;
    }
    case 'laser': {
      updateWander(e, dt, spd);
      e.facing = toPlayerAngle;
      // 蓄力 → 发射光束
      if (e.state === 'laserCharge') {
        if (e.stateT >= (e.def.beamWindup || 0.85)) {
          if (A.beam) {
            A.beam(e.x, e.y, toPlayerAngle, {
              length: e.def.beamRange || 230,
              width: 16,
              damage: e.def.beamDamage || 1.5,
              duration: e.def.beamDuration || 0.42,
              kind: 'enemy',
              color: PAL_VIS_BEAM,
            });
          }
          e.state = 'laserFire';
          e.stateT = 0;
        }
      } else if (e.state === 'laserFire') {
        if (e.stateT >= (e.def.beamDuration || 0.42)) {
          e.state = 'idle';
          e.stateT = 0;
          e.shootTimer = 1.6;
        }
      } else {
        e.shootTimer -= dt;
        if (e.shootTimer <= 0 && distToPlayer < 340) {
          e.state = 'laserCharge';
          e.stateT = 0;
        }
      }
      break;
    }
    case 'exploder': {
      // 快速追击，接触即爆（爆炸在 combat.resolveContactDamage 中触发）
      const a = toPlayerAngle + Math.sin(e.t * 4 + e.phase) * 0.2;
      e.vx = Math.cos(a) * spd;
      e.vy = Math.sin(a) * spd;
      e.facing = a;
      break;
    }
    case 'slowExploder': {
      // 缓慢逼近，死亡时爆炸
      e.vx = Math.cos(toPlayerAngle) * spd;
      e.vy = Math.sin(toPlayerAngle) * spd;
      e.facing = toPlayerAngle;
      break;
    }
    case 'diagonalFlyer': {
      // 沿固定对角线飞行，撞墙反弹；死亡爆炸
      e.vx = e.dir.x * spd;
      e.vy = e.dir.y * spd;
      e.facing = Math.atan2(e.dir.y, e.dir.x);
      break;
    }
    default: {
      e.vx = 0;
      e.vy = 0;
    }
  }
}

const PAL_VIS_BEAM = '#ff4a2a';

/** 随机游走：定期换方向 */
function updateWander(e, dt, spd) {
  e.aiTimer -= dt;
  if (e.aiTimer <= 0) {
    e.aiTimer = 0.8 + (e.phase % 1.4);
    const a = e.wobble + e.t * 0.7;
    e.wanderDir = a;
  }
  const a = e.wanderDir === undefined ? e.phase : e.wanderDir;
  e.vx = Math.cos(a) * spd;
  e.vy = Math.sin(a) * spd;
}

/** 冲锋：游走 → 前摇 → 冲刺 → 恢复 */
function updateCharger(e, dt, spd, distToPlayer, toPlayerAngle) {
  if (e.chargeState === 'wander') {
    updateWander(e, dt, spd);
    e.chargeCooldownT = (e.chargeCooldownT || 0) - dt;
    if (e.chargeCooldownT <= 0 && distToPlayer < 320) {
      e.chargeState = 'windup';
      e.stateT = 0;
      e.chargeDir = { x: Math.cos(toPlayerAngle), y: Math.sin(toPlayerAngle) };
    }
  } else if (e.chargeState === 'windup') {
    // 前摇：锁定方向、原地颤抖
    e.vx = 0;
    e.vy = 0;
    e.facing = Math.atan2(e.chargeDir.y, e.chargeDir.x);
    if (e.stateT >= (e.def.chargeWindup || 0.42)) {
      e.chargeState = 'dashing';
      e.stateT = 0;
    }
  } else if (e.chargeState === 'dashing') {
    e.vx = e.chargeDir.x * (e.def.chargeSpeed || 300);
    e.vy = e.chargeDir.y * (e.def.chargeSpeed || 300);
    if (e.stateT >= (e.def.chargeDuration || 1.05)) {
      e.chargeState = 'recover';
      e.stateT = 0;
    }
  } else {
    // recover
    e.vx *= 0.85;
    e.vy *= 0.85;
    if (e.stateT >= 0.5) {
      e.chargeState = 'wander';
      e.chargeCooldownT = e.def.chargeCooldown || 0.7;
      e.stateT = 0;
    }
  }
}

/** 跳跃：Hopper 连续小跳 / Trite 单次长跳 */
function updateHopper(e, dt, distToPlayer, toPlayerAngle, isLeap) {
  const hopInterval = e.def.hopInterval || 0.95;
  if (e.hopping) {
    e.hopVz -= 1400 * dt;
    e.hopZ += e.hopVz * dt;
    if (e.hopZ <= 0 && e.hopVz < 0) {
      e.hopZ = 0;
      e.hopping = false;
      e.hopTimer = hopInterval;
      e.vx = 0;
      e.vy = 0;
    }
    return;
  }
  e.vx = 0;
  e.vy = 0;
  e.hopTimer -= dt;
  if (e.hopTimer <= 0) {
    const power = e.def.hopPower || 210;
    const air = e.def.hopAirTime || 0.42;
    let a = toPlayerAngle;
    if (!isLeap) {
      // Hopper：带随机偏角，跳跃更「笨拙」
      a += Math.sin(e.t * 5 + e.phase) * 0.5;
    } else if (distToPlayer > (e.def.leapRange || 260)) {
      // Trite 超出射程时随机游走一下
      a += Math.sin(e.t * 3 + e.phase) * 1.2;
    }
    // 水平位移与跳跃力成正比；水平速度 = 位移 / 滞空时间
    const horiz = power * (isLeap ? 1.15 : 0.9) * air;
    e.vx = (Math.cos(a) * horiz) / air;
    e.vy = (Math.sin(a) * horiz) / air;
    e.hopVz = 700 * air; // 使滞空时间 ≈ air
    e.hopZ = 0.001;
    e.hopping = true;
    e.facing = a;
  }
}

/** 统一的射击计时器：跑 interval → 前摇 windup → 发射（支持扇形多发） */
function updateShooterTimers(e, dt, angle, spawnBullet, spreadCount = 1, spreadArc = 0) {
  if (!e.def.projectile) return;
  if (e.windup > 0) {
    e.windup -= dt;
    e.charge = clamp(1 - e.windup / (e.def.shootWindup || 0.5), 0, 1);
    if (e.windup <= 0) {
      fireEnemyBullet(e, angle, spawnBullet, spreadCount, spreadArc);
      e.charge = 0;
      e.shootTimer = e.def.shootInterval;
    }
  } else {
    e.charge = 0;
    e.shootTimer -= dt;
    if (e.shootTimer <= 0) {
      e.windup = e.def.shootWindup || 0.5;
      e.shootTimer = 0;
    }
  }
}

function fireEnemyBullet(e, angle, spawnBullet, spreadCount = 1, spreadArc = 0) {
  const p = e.def.projectile;
  if (!p || !spawnBullet) return;
  const n = Math.max(1, spreadCount);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // -1..1
    const a = angle + t * spreadArc * 0.5;
    const ox = Math.cos(a) * (e.radius + 2);
    const oy = Math.sin(a) * (e.radius + 2);
    spawnBullet(e.x + ox, e.y + oy, a, p);
  }
  if (e.def.ai === 'flyShooter' || e.def.ai === 'homingShooter' || e.def.ai === 'boneThrower') e.shotFlash = 0.14;
}
