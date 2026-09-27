/**
 * boss.js — Boss 实体与多阶段 AI（12 个专属 Boss）
 *
 * 每个楼层有一个专属 Boss（见 systems/floors.js 的 `boss` 字段）。
 * Boss 定义（BOSS_DEFS）包含：
 *   · 基础数值：hp / radius / contactDamage / score
 *   · 移动风格：moveSpeed / keepDistance（原地 / 中距漂移 / 贴身突进）
 *   · 三个阶段：threshold（血量阈值）、attackInterval、bulletSpeed、extraBullets
 *   · 技能池：moves[]（从 MOVE 处理器里挑），params 提供每个技能的参数
 *   · 弹幕外观：bullet{color,r,kind}
 *
 * 状态机：intro → idle → windup → attack → recover → idle
 * 阶段切换（血量阈值）时短暂无敌 + 停顿（给玩家喘息）。
 *
 * 技能（MOVE 表）：
 *   spread   扇形散射      radial   环形弹幕      spiral  旋转螺旋弹幕
 *   jump     跳跃砸地      stomp    阴影踩踏      charge  突进冲撞
 *   laser    光束扫射      summon   召唤小怪      homing  追踪弹
 */

import { TAU, clamp } from '../core/math.js';

/** Boss 定义表（id 与 systems/floors.js 的 boss 字段对应） */
export const BOSS_DEFS = {
  monstro: {
    id: 'monstro', name: 'Monstro', nameZh: '怪物',
    hp: 260, radius: 40, contactDamage: 1, score: 10,
    moveSpeed: 42, keepDistance: 150,
    bullet: { color: '#ff5a3a', r: 8, kind: 'tear' },
    moves: ['spread', 'jump'],
    params: { spreadCount: 5, spreadArc: 0.8, jumpDist: 200 },
    phases: [
      { threshold: 0.6, attackInterval: 2.25, bulletSpeed: 178, extraBullets: 0 },
      { threshold: 0.3, attackInterval: 1.55, bulletSpeed: 200, extraBullets: 2 },
      { threshold: 0.0, attackInterval: 1.05, bulletSpeed: 224, extraBullets: 4 },
    ],
  },
  larry: {
    id: 'larry', name: 'Larry Jr.', nameZh: '小拉里',
    hp: 230, radius: 34, contactDamage: 1, score: 10,
    moveSpeed: 96, keepDistance: 0,
    bullet: { color: '#ffb04a', r: 7, kind: 'tear' },
    moves: ['charge', 'radial', 'spread'],
    params: { spreadCount: 3, spreadArc: 0.5, radialCount: 10, chargeDist: 240 },
    phases: [
      { threshold: 0.5, attackInterval: 2.0, bulletSpeed: 170, extraBullets: 0 },
      { threshold: 0.0, attackInterval: 1.35, bulletSpeed: 200, extraBullets: 2 },
    ],
  },
  chub: {
    id: 'chub', name: 'Chub', nameZh: '胖虫',
    hp: 360, radius: 44, contactDamage: 1, score: 12,
    moveSpeed: 60, keepDistance: 120,
    bullet: { color: '#d0607a', r: 9, kind: 'tear' },
    moves: ['charge', 'radial', 'summon'],
    params: { radialCount: 12, summonType: 'maggot', summonCount: 3, chargeDist: 260 },
    phases: [
      { threshold: 0.55, attackInterval: 2.2, bulletSpeed: 165, extraBullets: 0 },
      { threshold: 0.0, attackInterval: 1.4, bulletSpeed: 198, extraBullets: 3 },
    ],
  },
  gurdy: {
    id: 'gurdy', name: 'Gurdy', nameZh: '格蒂',
    hp: 420, radius: 46, contactDamage: 1, score: 12,
    moveSpeed: 0, keepDistance: 999, // 坐桩型：不移动
    bullet: { color: '#e0c060', r: 8, kind: 'tear' },
    moves: ['spread', 'summon', 'radial'],
    params: { spreadCount: 7, spreadArc: 1.1, summonType: 'attackFly', summonCount: 4, radialCount: 14 },
    phases: [
      { threshold: 0.6, attackInterval: 2.4, bulletSpeed: 160, extraBullets: 0 },
      { threshold: 0.3, attackInterval: 1.7, bulletSpeed: 190, extraBullets: 2 },
      { threshold: 0.0, attackInterval: 1.2, bulletSpeed: 215, extraBullets: 3 },
    ],
  },
  duke: {
    id: 'duke', name: 'The Duke of Flies', nameZh: '蝇公爵',
    hp: 380, radius: 40, contactDamage: 1, score: 12,
    moveSpeed: 34, keepDistance: 160,
    bullet: { color: '#b0a0c0', r: 7, kind: 'tear' },
    moves: ['summon', 'radial', 'spread'],
    params: { summonType: 'attackFly', summonCount: 5, radialCount: 12, spreadCount: 5, spreadArc: 0.9 },
    phases: [
      { threshold: 0.5, attackInterval: 2.0, bulletSpeed: 168, extraBullets: 0 },
      { threshold: 0.0, attackInterval: 1.3, bulletSpeed: 200, extraBullets: 2 },
    ],
  },
  fistula: {
    id: 'fistula', name: 'Fistula', nameZh: '瘘管',
    hp: 400, radius: 38, contactDamage: 1, score: 12,
    moveSpeed: 52, keepDistance: 140,
    bullet: { color: '#b0c070', r: 8, kind: 'tear' },
    moves: ['radial', 'jump', 'summon'],
    params: { radialCount: 12, jumpDist: 220, summonType: 'maggot', summonCount: 3 },
    phases: [
      { threshold: 0.6, attackInterval: 2.1, bulletSpeed: 165, extraBullets: 0 },
      { threshold: 0.3, attackInterval: 1.5, bulletSpeed: 195, extraBullets: 2 },
      { threshold: 0.0, attackInterval: 1.1, bulletSpeed: 220, extraBullets: 4 },
    ],
  },
  mom: {
    id: 'mom', name: 'Mom', nameZh: '妈妈',
    hp: 540, radius: 44, contactDamage: 1, score: 15,
    moveSpeed: 0, keepDistance: 999,
    bullet: { color: '#e0a080', r: 8, kind: 'tear' },
    moves: ['stomp', 'spread', 'summon'],
    params: { spreadCount: 7, spreadArc: 1.0, summonType: 'gaper', summonCount: 3 },
    phases: [
      { threshold: 0.55, attackInterval: 2.3, bulletSpeed: 175, extraBullets: 0 },
      { threshold: 0.0, attackInterval: 1.5, bulletSpeed: 205, extraBullets: 2 },
    ],
  },
  momsHeart: {
    id: 'momsHeart', name: "Mom's Heart", nameZh: '妈妈的心脏',
    hp: 640, radius: 44, contactDamage: 1, score: 15,
    moveSpeed: 0, keepDistance: 999,
    bullet: { color: '#ff4a6a', r: 7, kind: 'tear' },
    moves: ['spiral', 'radial', 'summon'],
    params: { radialCount: 16, summonType: 'attackFly', summonCount: 4, spiralCount: 3 },
    phases: [
      { threshold: 0.6, attackInterval: 2.4, bulletSpeed: 160, extraBullets: 0 },
      { threshold: 0.3, attackInterval: 1.8, bulletSpeed: 190, extraBullets: 2 },
      { threshold: 0.0, attackInterval: 1.3, bulletSpeed: 215, extraBullets: 3 },
    ],
  },
  satan: {
    id: 'satan', name: 'Satan', nameZh: '撒旦',
    hp: 720, radius: 46, contactDamage: 1, score: 20,
    moveSpeed: 48, keepDistance: 130,
    bullet: { color: '#ff3a2a', r: 8, kind: 'tear' },
    moves: ['stomp', 'laser', 'spread', 'charge'],
    params: { spreadCount: 9, spreadArc: 1.2, chargeDist: 280 },
    phases: [
      { threshold: 0.66, attackInterval: 2.2, bulletSpeed: 175, extraBullets: 0 },
      { threshold: 0.33, attackInterval: 1.6, bulletSpeed: 205, extraBullets: 2 },
      { threshold: 0.0, attackInterval: 1.1, bulletSpeed: 235, extraBullets: 4 },
    ],
  },
  isaac: {
    id: 'isaac', name: 'Isaac', nameZh: '以撒',
    hp: 780, radius: 34, contactDamage: 1, score: 20,
    moveSpeed: 62, keepDistance: 150,
    bullet: { color: '#e8f0ff', r: 7, kind: 'tear' },
    moves: ['spread', 'radial', 'homing', 'laser'],
    params: { spreadCount: 7, spreadArc: 0.9, radialCount: 14, homingCount: 3, homing: 80 },
    phases: [
      { threshold: 0.66, attackInterval: 2.0, bulletSpeed: 180, extraBullets: 0 },
      { threshold: 0.33, attackInterval: 1.5, bulletSpeed: 210, extraBullets: 2 },
      { threshold: 0.0, attackInterval: 1.0, bulletSpeed: 240, extraBullets: 3 },
    ],
  },
  blueBaby: {
    id: 'blueBaby', name: '???', nameZh: '蓝婴',
    hp: 840, radius: 36, contactDamage: 1, score: 25,
    moveSpeed: 54, keepDistance: 140,
    bullet: { color: '#8ac0e0', r: 8, kind: 'tear' },
    moves: ['homing', 'spread', 'radial', 'summon'],
    params: { spreadCount: 6, spreadArc: 0.8, radialCount: 16, homingCount: 4, homing: 95, summonType: 'attackFly', summonCount: 4 },
    phases: [
      { threshold: 0.66, attackInterval: 2.0, bulletSpeed: 180, extraBullets: 0 },
      { threshold: 0.33, attackInterval: 1.4, bulletSpeed: 210, extraBullets: 2 },
      { threshold: 0.0, attackInterval: 1.0, bulletSpeed: 240, extraBullets: 4 },
    ],
  },
  lamb: {
    id: 'lamb', name: 'The Lamb', nameZh: '羔羊',
    hp: 920, radius: 40, contactDamage: 1, score: 30,
    moveSpeed: 84, keepDistance: 60,
    bullet: { color: '#f0e8d8', r: 8, kind: 'tear' },
    moves: ['charge', 'summon', 'radial', 'spread'],
    params: { spreadCount: 7, spreadArc: 1.0, radialCount: 16, summonType: 'attackFly', summonCount: 5, chargeDist: 300 },
    phases: [
      { threshold: 0.66, attackInterval: 2.0, bulletSpeed: 185, extraBullets: 0 },
      { threshold: 0.33, attackInterval: 1.4, bulletSpeed: 215, extraBullets: 2 },
      { threshold: 0.0, attackInterval: 0.95, bulletSpeed: 245, extraBullets: 4 },
    ],
  },
};

/** 默认 Boss（兜底，避免未知 id 崩溃） */
export const DEFAULT_BOSS = 'monstro';

export class Boss {
  /**
   * @param {number} x
   * @param {number} y
   * @param {import('../core/rng.js').Rng} rng
   * @param {number} hpScale 楼层血量倍率
   * @param {string} [bossId='monstro']
   */
  constructor(x, y, rng, hpScale = 1, bossId = DEFAULT_BOSS) {
    const def = BOSS_DEFS[bossId] || BOSS_DEFS[DEFAULT_BOSS];
    this.def = def;
    this.defId = def.id;
    this.id = 999999; // boss 用固定 id，避免与普通敌人混淆
    this.type = 'boss';
    this.name = def.name;
    this.nameZh = def.nameZh;

    this.x = x;
    this.y = y;
    this.homeX = x;
    this.homeY = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = def.radius;
    this.flying = false;
    this.contactDamage = def.contactDamage;

    this.maxHp = Math.round(def.hp * hpScale);
    this.hp = this.maxHp;

    this.phase = 0; // 阶段索引
    this.state = 'intro';
    this.stateT = 0;
    this.attackTimer = 1.2;
    this.moveIndex = 0;
    this.attackKind = null;
    this.spiralT = 0;
    this.spiralAngle = 0;
    this.mouth = 0;
    this.squash = 1;
    this.rage = 0;
    this.hurtFlash = 0;
    this.dead = 0;
    this.isDead = false;
    this.alive = true;
    this.invuln = 0;

    // 跳跃
    this.jumpZ = 0;
    this.jumpVz = 0;
    this.jumping = false;
    this.landShake = 0;
    // 踩踏（Mom / Satan）
    this.stompX = 0;
    this.stompY = 0;
    this.stompT = 0;
    // 突进
    this.chargeDir = { x: 0, y: 0 };

    this.t = 0;
    this._rng = rng;
    this.hitStun = 0;
    this.entering = 1.2; // 出场无敌
  }

  get hpRatio() {
    return clamp(this.hp / this.maxHp, 0, 1);
  }

  takeDamage(amount, fromX = null, fromY = null, knockback = 0) {
    if (this.isDead) return false;
    if (this.invuln > 0 || this.entering > 0.6) return false;
    this.hp -= amount;
    this.hurtFlash = 1;
    if (this.hp <= 0) {
      this.hp = 0;
      this.isDead = true;
      this.dead = 0.0001;
      return true;
    }
    this._updatePhase();
    return false;
  }

  _updatePhase() {
    const r = this.hpRatio;
    let p = 0;
    for (let i = 0; i < this.def.phases.length; i++) {
      if (r <= this.def.phases[i].threshold) p = i + 1;
    }
    const newPhase = clamp(p, 0, this.def.phases.length - 1);
    if (newPhase !== this.phase) {
      this.phase = newPhase;
      this.rage = this.def.phases.length > 1 ? this.phase / (this.def.phases.length - 1) : 0;
      this.invuln = 0.4;
      this.state = 'phaseShift';
      this.stateT = 0;
    }
  }

  get phaseCfg() {
    return this.def.phases[Math.min(this.phase, this.def.phases.length - 1)];
  }

  /** 是否在过场状态（不参与接触伤害） */
  get isIntangible() {
    return this.entering > 0 || this.state === 'intro' || this.state === 'phaseShift';
  }

  // 兼容 Enemy 接口（供统一系统调用）
  applyKnockback() {}
  applyScaling() {}
}

/**
 * Boss AI 更新
 * @param {Boss} b
 * @param {number} dt
 * @param {{x:number,y:number,alive:boolean}} player
 * @param {object} api
 * @param {(x,y,angle,def)=>void} api.spawnBullet
 * @param {(x,y,radius,damage,owner)=>void} api.explode
 * @param {(amount:number)=>void} api.shake
 * @param {(x,y,angle,opts)=>void} [api.beam]
 * @param {(type,x,y)=>void} [api.spawnEnemy]
 * @param {Function} [api.audioShoot]
 * @param {Function} [api.audioLand]
 */
export function updateBoss(b, dt, player, api) {
  b.t += dt;
  if (!b._spawn && api.spawnBullet) b._spawn = api.spawnBullet;
  if (b.hurtFlash > 0) b.hurtFlash = Math.max(0, b.hurtFlash - dt * 4);
  if (b.invuln > 0) b.invuln = Math.max(0, b.invuln - dt);
  if (b.entering > 0) b.entering = Math.max(0, b.entering - dt);
  if (b.landShake > 0) b.landShake = Math.max(0, b.landShake - dt * 3);

  // 死亡
  if (b.isDead) {
    b.dead += dt * 0.85;
    b.mouth = Math.max(0, b.mouth - dt * 3);
    if (b.dead >= 1) b.alive = false;
    return;
  }

  b.stateT += dt;
  const cfg = b.phaseCfg;
  const def = b.def;
  const dx = player.x - b.x;
  const dy = player.y - b.y;
  const toPlayer = Math.atan2(dy, dx);
  const distTo = Math.hypot(dx, dy);

  // 张嘴度平滑靠近目标
  const mouthTarget = b.state === 'windup' ? 1 : b.state === 'attack' ? 0.85 : 0.15;
  b.mouth += (mouthTarget - b.mouth) * Math.min(1, dt * 9);

  switch (b.state) {
    case 'intro': {
      if (b.stateT > 1.2) setState(b, 'idle');
      break;
    }
    case 'phaseShift': {
      api.shake && api.shake(0.35 * (1 - b.stateT / 0.6));
      if (b.stateT > 0.6) setState(b, 'idle');
      break;
    }
    case 'idle': {
      // 漂移：keepDistance=999 表示坐桩不动
      if (def.keepDistance < 900) {
        const desired = def.keepDistance;
        let dir = 0;
        if (desired <= 0) dir = 1;
        else if (distTo > desired * 1.25) dir = 1;
        else if (distTo < desired * 0.7) dir = -1;
        const spd = def.moveSpeed + b.phase * 12;
        b.vx = Math.cos(toPlayer) * dir * spd;
        b.vy = Math.sin(toPlayer) * dir * spd;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        clampToRoom(b, api);
      }
      b.attackTimer -= dt;
      if (b.attackTimer <= 0) {
        b.attackKind = def.moves[b.moveIndex % def.moves.length];
        b.moveIndex++;
        setState(b, 'windup');
      }
      break;
    }
    case 'windup': {
      b.vx = 0;
      b.vy = 0;
      const wd = windupFor(b.attackKind);
      if (b.attackKind === 'jump') {
        b.squash = 1 - Math.sin((b.stateT / wd) * Math.PI) * 0.16;
      }
      // 踩踏：前摇期间阴影锁定玩家当前位置
      if (b.attackKind === 'stomp') {
        b.stompX = player.x;
        b.stompY = player.y;
        b.stompT = clamp(b.stateT / wd, 0, 1);
      }
      // 突进：锁定方向
      if (b.attackKind === 'charge') {
        b.chargeDir = { x: Math.cos(toPlayer), y: Math.sin(toPlayer) };
        b.facing = toPlayer;
      }
      if (b.stateT >= wd) {
        beginMove(b, cfg, toPlayer, distTo, player, api);
        setState(b, 'attack');
      }
      break;
    }
    case 'attack': {
      runMove(b, dt, cfg, toPlayer, player, api);
      break;
    }
    case 'recover': {
      b.squash += (1 - b.squash) * Math.min(1, dt * 7);
      b.vx *= 0.85;
      b.vy *= 0.85;
      if (b.stateT > 0.45) setState(b, 'idle');
      break;
    }
  }

  clampToRoom(b, api);
}

/** 各技能的前摇时长 */
function windupFor(kind) {
  switch (kind) {
    case 'jump': return 0.55;
    case 'stomp': return 0.8;
    case 'charge': return 0.45;
    case 'laser': return 0.75;
    case 'summon': return 0.5;
    case 'spiral': return 0.4;
    default: return 0.42;
  }
}

/** 技能进入 attack 状态的瞬间行为 */
function beginMove(b, cfg, toPlayer, distTo, player, api) {
  const def = b.def;
  const P = def.params || {};
  switch (b.attackKind) {
    case 'spread': {
      const n = (P.spreadCount || 5) + cfg.extraBullets;
      const arc = P.spreadArc || 0.8;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
        const a = toPlayer + t * arc * 0.5;
        fireBullet(b, a, cfg, 0.8);
      }
      api.audioShoot && api.audioShoot();
      b.squash = 1.14;
      b.attackTimer = cfg.attackInterval;
      break;
    }
    case 'radial': {
      const n = (P.radialCount || 10) + cfg.extraBullets * 2;
      const base = b.t * 0.7;
      for (let i = 0; i < n; i++) {
        fireBullet(b, base + (i / n) * TAU, cfg, 0.9);
      }
      api.audioShoot && api.audioShoot();
      b.squash = 1.12;
      b.attackTimer = cfg.attackInterval;
      break;
    }
    case 'homing': {
      const n = (P.homingCount || 3) + cfg.extraBullets;
      const arc = 0.7;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
        fireBullet(b, toPlayer + t * arc * 0.5, cfg, 0.9, { homing: P.homing || 80 });
      }
      api.audioShoot && api.audioShoot();
      b.attackTimer = cfg.attackInterval;
      break;
    }
    case 'spiral': {
      // 螺旋：进入持续发射状态
      b.spiralT = 0;
      b.spiralAngle = b.t;
      api.audioShoot && api.audioShoot();
      break;
    }
    case 'jump': {
      b.jumping = true;
      b.jumpZ = 0;
      b.jumpVz = 300;
      const jumpDist = Math.min(distTo, P.jumpDist || 200);
      b.jumpTargetX = b.x + Math.cos(toPlayer) * jumpDist;
      b.jumpTargetY = b.y + Math.sin(toPlayer) * jumpDist;
      break;
    }
    case 'charge': {
      b.charging = true;
      b.chargeT = 0;
      b.chargeDist = P.chargeDist || 260;
      break;
    }
    case 'stomp': {
      // 阴影已锁定；落地结算在 runMove 中
      b.stompImpact = true;
      break;
    }
    case 'laser': {
      if (api.beam) {
        api.beam(b.x, b.y, toPlayer, {
          length: 900, width: 26, damage: 2, duration: 0.5, kind: 'enemy', color: def.bullet.color,
        });
      }
      api.audioShoot && api.audioShoot();
      api.shake && api.shake(0.4);
      b.attackTimer = cfg.attackInterval;
      break;
    }
    case 'summon': {
      const n = (def.params && def.params.summonCount) || 3;
      if (api.spawnEnemy) {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + b.t;
          api.spawnEnemy(def.params.summonType || 'attackFly', b.x + Math.cos(a) * 40, b.y + Math.sin(a) * 40);
        }
      }
      b.attackTimer = cfg.attackInterval;
      break;
    }
    default:
      b.attackTimer = cfg.attackInterval;
  }
}

/** 技能在 attack 状态每帧的行为 */
function runMove(b, dt, cfg, toPlayer, player, api) {
  const P = b.def.params || {};
  switch (b.attackKind) {
    case 'jump': {
      if (b.jumping) {
        b.jumpVz -= 900 * dt;
        b.jumpZ += b.jumpVz * dt;
        b.x += (b.jumpTargetX - b.x) * Math.min(1, dt * 6);
        b.y += (b.jumpTargetY - b.y) * Math.min(1, dt * 6);
        b.squash = 1 + b.jumpZ / 120;
        if (b.jumpZ <= 0 && b.jumpVz < 0) {
          b.jumpZ = 0;
          b.jumping = false;
          b.squash = 0.72;
          b.landShake = 1;
          api.explode && api.explode(b.x, b.y, 92, 1.5, 'enemy');
          api.shake && api.shake(0.7);
          api.audioLand && api.audioLand();
          setState(b, 'recover');
        }
      } else {
        setState(b, 'recover');
      }
      break;
    }
    case 'charge': {
      if (b.charging) {
        b.chargeT += dt;
        const spd = 340 + b.phase * 40;
        b.vx = b.chargeDir.x * spd;
        b.vy = b.chargeDir.y * spd;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        clampToRoom(b, api);
        const traveled = spd * b.chargeT;
        if (traveled >= b.chargeDist || b.chargeT > 1.4) {
          b.charging = false;
          setState(b, 'recover');
        }
      } else {
        setState(b, 'recover');
      }
      break;
    }
    case 'stomp': {
      // 落地瞬间：冲击波 + 震屏
      if (b.stompImpact) {
        b.stompImpact = false;
        api.explode && api.explode(b.stompX, b.stompY, 96, 2, 'enemy');
        api.shake && api.shake(0.9);
        api.audioLand && api.audioLand();
        // 踩踏同时向四周喷一圈弹
        const n = 8 + cfg.extraBullets * 2;
        for (let i = 0; i < n; i++) {
          api.spawnBullet && api.spawnBullet(b.stompX, b.stompY, (i / n) * TAU, bulletDef(b, cfg));
        }
        b.attackTimer = cfg.attackInterval;
        setState(b, 'recover');
      }
      break;
    }
    case 'spiral': {
      b.spiralT += dt;
      const tick = 0.1;
      b.spiralAcc = (b.spiralAcc || 0) + dt;
      if (b.spiralAcc >= tick) {
        b.spiralAcc = 0;
        b.spiralAngle += 0.42;
        const arms = 2 + b.phase;
        for (let i = 0; i < arms; i++) {
          fireBullet(b, b.spiralAngle + (i / arms) * TAU, cfg, 1);
        }
      }
      if (b.spiralT > 2.4) {
        b.attackTimer = cfg.attackInterval;
        setState(b, 'recover');
      }
      break;
    }
    default: {
      if (b.stateT > 0.22) setState(b, 'recover');
    }
  }
}

/** 生成一颗 Boss 子弹（发射口在身体边缘） */
function fireBullet(b, angle, cfg, radiusScale = 1, extra = null) {
  if (!b._spawn) return;
  const bullet = bulletDef(b, cfg);
  if (extra && extra.homing) bullet.homing = extra.homing;
  b._spawn(
    b.x + Math.cos(angle) * (b.radius * 0.8),
    b.y + Math.sin(angle) * (b.radius * 0.8),
    angle,
    bullet,
  );
}

function bulletDef(b, cfg) {
  const bt = b.def.bullet || { color: '#ff5a3a', r: 8, kind: 'tear' };
  return {
    speed: cfg.bulletSpeed,
    r: bt.r,
    damage: 1,
    range: 640,
    kind: bt.kind,
    color: bt.color,
    homing: 0,
  };
}

function setState(b, s) {
  b.state = s;
  b.stateT = 0;
}

function clampToRoom(b, api) {
  const room = api.room;
  if (!room) return;
  const pad = 40;
  b.x = clamp(b.x, room.minX + pad * 0.2, room.maxX - pad * 0.2);
  b.y = clamp(b.y, room.minY + pad * 0.2, room.maxY - pad * 0.2);
}
