/**
 * boss.js — Boss「Monstro」实体与多阶段 AI
 *
 * 三阶段（按血量阈值切换，对应原作手感）：
 *   Phase 1 (hp > 60%)  间歇散射弹 + 跳跃砸地（落地时震屏与冲击波）
 *   Phase 2 (30~60%)    皮肤泛红，射速提升，散射弹数量增加
 *   Phase 3 (< 30%)     狂暴：连续弹幕 + 快速跳跃，张嘴更频繁
 *
 * 状态机：idle → windup → attack → recover → idle
 * 使用 core/state.js 的思路但内联实现（Boss 状态少，直接 switch 更清晰、更快）。
 */

import { TAU, clamp } from '../core/math.js';

export const MONSTRO = {
  id: 'monstro',
  name: 'Monstro',
  hp: 260,
  radius: 40,
  contactDamage: 1,
  score: 10,
  phases: [
    { threshold: 0.6, shootInterval: 2.25, jumpInterval: 3.4, spreadCount: 5, spreadArc: 0.7, shotSpeed: 178 },
    { threshold: 0.3, shootInterval: 1.55, jumpInterval: 2.8, spreadCount: 7, spreadArc: 0.95, shotSpeed: 200 },
    { threshold: 0.0, shootInterval: 1.05, jumpInterval: 2.1, spreadCount: 9, spreadArc: 1.25, shotSpeed: 224 },
  ],
};

export class Boss {
  constructor(x, y, rng, hpScale = 1) {
    this.id = 999999; // boss 用固定 id，避免与普通敌人混淆
    this.type = 'boss';
    this.name = MONSTRO.name;
    this.x = x;
    this.y = y;
    this.homeX = x;
    this.homeY = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = MONSTRO.radius;
    this.flying = false;
    this.contactDamage = MONSTRO.contactDamage;

    this.maxHp = Math.round(MONSTRO.hp * hpScale);
    this.hp = this.maxHp;

    this.phase = 0; // 0/1/2
    this.state = 'intro';
    this.stateT = 0;
    this.shootTimer = 1.2;
    this.jumpTimer = 2.6;
    this.mouth = 0; // 0..1 张嘴度
    this.squash = 1; // 1 = 正常
    this.rage = 0; // 0..1 视觉狂暴
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

    this.t = 0;
    this.def = { ai: 'boss' };
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
    for (let i = 0; i < MONSTRO.phases.length; i++) {
      if (r <= MONSTRO.phases[i].threshold) p = i + 1;
    }
    // 阶段定义：threshold 0.6 → phase1；0.3 → phase2；0.0 → phase3
    // 上面的循环得到 p = 1/2/3，映射到索引 0/1/2
    const newPhase = clamp(p, 0, 2);
    if (newPhase !== this.phase) {
      this.phase = newPhase;
      this.rage = this.phase / 2;
      // 切阶段时短暂无敌 + 停顿（给玩家喘息）
      this.invuln = 0.4;
      this.state = 'phaseShift';
      this.stateT = 0;
    }
  }

  get phaseCfg() {
    return MONSTRO.phases[this.phase];
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
 */
export function updateBoss(b, dt, player, api) {
  b.t += dt;
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
  const dx = player.x - b.x;
  const dy = player.y - b.y;
  const toPlayer = Math.atan2(dy, dx);
  const distTo = Math.hypot(dx, dy);

  // 张嘴度平滑靠近目标
  const mouthTarget = b.state === 'windup' ? 1 : b.state === 'attack' ? 0.85 : 0.15;
  b.mouth += (mouthTarget - b.mouth) * Math.min(1, dt * 9);

  switch (b.state) {
    case 'intro': {
      // 出场：静止咆哮，1.2s 后进入 idle
      if (b.stateT > 1.2) {
        setState(b, 'idle');
      }
      break;
    }
    case 'phaseShift': {
      // 切阶段停顿 0.6s，同时震屏
      api.shake && api.shake(0.35 * (1 - b.stateT / 0.6));
      if (b.stateT > 0.6) setState(b, 'idle');
      break;
    }
    case 'idle': {
      // 缓慢朝玩家漂移（保持中距离）
      const desired = 150;
      let dir = 0;
      if (distTo > desired * 1.25) dir = 1;
      else if (distTo < desired * 0.7) dir = -1;
      const spd = 42 + b.phase * 14;
      b.vx = Math.cos(toPlayer) * dir * spd;
      b.vy = Math.sin(toPlayer) * dir * spd;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      clampToRoom(b, api);

      b.shootTimer -= dt;
      b.jumpTimer -= dt;

      if (b.shootTimer <= 0) {
        setState(b, 'windup');
        b.attackKind = 'spread';
      } else if (b.jumpTimer <= 0) {
        setState(b, 'windup');
        b.attackKind = 'jump';
      }
      break;
    }
    case 'windup': {
      // 前摇：静止，嘴张开
      b.vx = 0;
      b.vy = 0;
      const wd = b.attackKind === 'jump' ? 0.55 : 0.42;
      // 跳之前微微下蹲
      if (b.attackKind === 'jump') {
        b.squash = 1 - Math.sin((b.stateT / wd) * Math.PI) * 0.16;
      }
      if (b.stateT >= wd) {
        if (b.attackKind === 'spread') {
          // 发射扇形弹幕
          const n = cfg.spreadCount;
          const arc = cfg.spreadArc;
          for (let i = 0; i < n; i++) {
            const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
            const a = toPlayer + t * arc * 0.5;
            api.spawnBullet(
              b.x + Math.cos(a) * (b.radius * 0.8),
              b.y + Math.sin(a) * (b.radius * 0.8),
              a,
              { speed: cfg.shotSpeed, r: 8, damage: 1, range: 620, kind: 'tear', color: '#ff5a3a' },
            );
          }
          api.audioShoot && api.audioShoot();
          b.squash = 1.14; // 吐弹后回弹
          b.shootTimer = cfg.shootInterval;
        } else {
          // 起跳
          b.jumping = true;
          b.jumpZ = 0;
          b.jumpVz = 300;
          // 朝玩家方向（限制最大跳跃距离）
          const jumpDist = Math.min(distTo, 210);
          b.jumpTargetX = b.x + Math.cos(toPlayer) * jumpDist;
          b.jumpTargetY = b.y + Math.sin(toPlayer) * jumpDist;
          b.jumpTimer = cfg.jumpInterval;
        }
        setState(b, 'attack');
      }
      break;
    }
    case 'attack': {
      if (b.attackKind === 'jump' && b.jumping) {
        // 抛物线跳跃
        b.jumpVz -= 900 * dt;
        b.jumpZ += b.jumpVz * dt;
        const totalT = 0.66;
        const p = clamp(b.stateT / totalT, 0, 1);
        b.x = b.x + (b.jumpTargetX - b.x) * Math.min(1, dt * 6);
        b.y = b.y + (b.jumpTargetY - b.y) * Math.min(1, dt * 6);
        b.squash = 1 + b.jumpZ / 120;
        if (b.jumpZ <= 0 && b.jumpVz < 0) {
          // 落地
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
        if (b.stateT > 0.22) setState(b, 'recover');
      }
      break;
    }
    case 'recover': {
      // 恢复：squash 回弹到 1
      b.squash += (1 - b.squash) * Math.min(1, dt * 7);
      if (b.stateT > 0.45) setState(b, 'idle');
      break;
    }
  }

  clampToRoom(b, api);
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
