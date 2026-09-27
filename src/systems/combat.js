/**
 * combat.js — 战斗系统
 *
 * 职责：
 * - 玩家射击（按武器特性生成子弹/光束/飞刀）
 * - 子弹与敌人 / 玩家 / 障碍 / 房间边界 的碰撞结算
 * - 光束（Brimstone/Tech）的命中检测（线段 × 圆）
 * - 爆炸范围伤害
 * - 接触伤害（敌人碰到玩家）
 * - 追踪（homing）与回旋（curving）弹道修正
 *
 * 所有伤害结算集中在这里，方便平衡与测试。
 * 不使用事件总线做每帧高频调用（避免分配），只有「死亡/受伤」这类低频事件才 emit。
 */

import { Projectile, Beam, Explosion } from '../entities/projectile.js';
import { Pool, ActiveList } from '../core/pool.js';
import { EVT } from '../core/events.js';
import { TAU, clamp, aabb, circleRect } from '../core/math.js';
import { TILE } from '../art/draw-room.js';

export class Combat {
  /**
   * @param {import('../core/events.js').EventBus} bus
   * @param {import('../art/particles.js').ParticleSystem} fx
   * @param {import('../core/audio.js').Audio} audio
   */
  constructor(bus, fx, audio) {
    this.bus = bus;
    this.fx = fx;
    this.audio = audio;

    this.playerBullets = new ActiveList(new Pool(() => new Projectile(), null, null, 120));
    this.enemyBullets = new ActiveList(new Pool(() => new Projectile(), null, null, 100));
    this.beams = new ActiveList(new Pool(() => new Beam()));
    this.explosions = new ActiveList(new Pool(() => new Explosion()));

    /** 供命中去重使用的递增 id */
    this._hitSeq = 1;
  }

  reset() {
    this.playerBullets.clear();
    this.enemyBullets.clear();
    this.beams.clear();
    this.explosions.clear();
  }

  // ================= 玩家射击 =================

  /**
   * 玩家开火（由 GameState 根据输入与冷却调用）
   * @param {import('../entities/player.js').Player} p
   * @param {number} angle 发射角度
   * @param {object} weapon player.weapon
   * @param {object} stats player.stats
   */
  playerFire(p, angle, weapon, stats) {
    if (weapon.charge) {
      // 需要蓄力的武器：由 GameState 在释放时调用 fireCharged
      return;
    }
    const shots = Math.max(1, weapon.shots || 1);
    const spread = weapon.spread || 0;
    const baseDamage = stats.damage * (weapon.damageMul || 1);

    for (let i = 0; i < shots; i++) {
      const offsetT = shots === 1 ? 0 : (i / (shots - 1)) * 2 - 1; // -1..1
      const a = angle + offsetT * spread * 0.5;
      this.spawnPlayerBullet(p, a, weapon, stats, baseDamage);
    }
    p.muzzleFlash = 1;
    this.audio.sfxShoot(weapon.kind === 'brimstone' ? 0.7 : 1);
  }

  /** 蓄力武器释放 */
  playerFireCharged(p, angle, weapon, stats, chargeRatio = 1) {
    const baseDamage = stats.damage * (weapon.damageMul || 1) * (0.6 + chargeRatio * 0.7);
    if (weapon.kind === 'knife') {
      // Mom's Knife：投掷飞刀（穿透）
      const spd = stats.shotSpeed * 1.5;
      const b = this.playerBullets.add(this.playerBullets.pool.acquire(
        p.x, p.y, Math.cos(angle) * spd, Math.sin(angle) * spd,
        {
          r: 9, damage: baseDamage * 1.5, kind: 'knife',
          pierce: (weapon.pierce || 0) + 1,
          range: stats.range * 1.35,
          angle,
        },
      ));
      b.angle = angle;
      this.audio.tone({ freq: 900, freqEnd: 300, type: 'sawtooth', dur: 0.16, gain: 0.2 });
      p.muzzleFlash = 1;
      return;
    }
    // 默认：光束
    this.spawnBeam(p, angle, weapon, baseDamage);
    p.muzzleFlash = 1;
    this.audio.noise({ dur: 0.3, gain: 0.22, filterFrom: 1600, filterTo: 200 });
  }

  spawnPlayerBullet(p, angle, weapon, stats, damage) {
    const spd = stats.shotSpeed;
    const range = stats.range;
    const kind = weapon.kind || 'tear';
    const r = kind === 'ipecac' ? 8 : (kind === 'knife' ? 8 : 6 * (weapon.tearScale || 1));

    const opts = {
      r,
      damage,
      kind,
      owner: 'player',
      pierce: weapon.pierce || 0,
      homing: weapon.homing || 0,
      ballistic: weapon.ballistic && kind === 'ipecac',
      explosive: weapon.explosive && kind === 'ipecac',
      explosionRadius: weapon.explosionRadius || 62,
      curving: weapon.curving || 0,
      spectral: !!weapon.spectral,
      range,
      color: weapon.tearColor,
      hiColor: weapon.tearHiColor,
      weaponId: weapon.weaponId || 0,
    };

    // 从身体边缘发出
    const ox = Math.cos(angle) * (p.radius + r * 0.5);
    const oy = Math.sin(angle) * (p.radius + r * 0.5);
    const b = this.playerBullets.add(this.playerBullets.pool.acquire(
      p.x + ox, p.y + oy, Math.cos(angle) * spd, Math.sin(angle) * spd, opts,
    ));
    b.angle = angle;
    if (opts.ballistic) {
      b.z = 2;
      b.vz = 90;
    }
    return b;
  }

  spawnBeam(p, angle, weapon, damage) {
    const len = weapon.rangeOverride || 620;
    const b = this.beams.add(this.beams.pool.acquire(p.x, p.y, angle, len, {
      width: weapon.beamWidth || 22,
      damage,
      owner: 'player',
      kind: weapon.kind === 'tech' ? 'tech' : 'brimstone',
      duration: weapon.beamDuration || 0.45,
      weaponId: weapon.weaponId || 0,
    }));
    return b;
  }

  /** 敌人发射子弹 */
  spawnEnemyBullet(x, y, angle, def) {
    const spd = def.speed;
    const b = this.enemyBullets.add(this.enemyBullets.pool.acquire(
      x, y, Math.cos(angle) * spd, Math.sin(angle) * spd,
      {
        r: def.r || 6,
        damage: def.damage || 1,
        kind: def.kind || 'tear',
        owner: 'enemy',
        range: def.range || 460,
        color: def.color || '#ff4a4a',
        hiColor: '#ffd0d0',
      },
    ));
    b.angle = angle;
    return b;
  }

  /** 敌人生成子弹（由 EnemySystem 注入的回调） */
  makeEnemySpawnFn() {
    return (x, y, angle, def) => this.spawnEnemyBullet(x, y, angle, def);
  }

  // ================= 更新 =================

  /**
   * @param {number} dt
   * @param {object} ctx
   * @param {import('../systems/rooms.js').Room} ctx.room
   * @param {import('../entities/player.js').Player} ctx.player
   */
  update(dt, ctx) {
    this._updateBullets(dt, this.playerBullets, ctx, true);
    this._updateBullets(dt, this.enemyBullets, ctx, false);
    this._updateBeams(dt, ctx);
    this._updateExplosions(dt, ctx);
  }

  _updateBullets(dt, list, ctx, isPlayerOwned) {
    const { room, player } = ctx;
    const enemies = isPlayerOwned ? room.enemies : null;

    // 反序遍历 + swap-remove，安全移除
    for (let i = list.items.length - 1; i >= 0; i--) {
      const b = list.items[i];

      // --- 生命周期 ---
      b.t += dt;
      b.life -= dt;
      if (!b.alive || b.life <= 0) {
        list.removeAt(i);
        continue;
      }

      // --- 追踪 ---
      if (b.homing > 0 && enemies) {
        const target = findNearestEnemy(enemies, b.x, b.y, 260, room.boss);
        if (target) {
          const desired = Math.atan2(target.y - b.y, target.x - b.x);
          const cur = Math.atan2(b.vy, b.vx);
          const maxTurn = (b.homing * Math.PI / 180) * dt;
          let diff = desired - cur;
          while (diff > Math.PI) diff -= TAU;
          while (diff < -Math.PI) diff += TAU;
          const turn = clamp(diff, -maxTurn, maxTurn);
          const spd = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(cur + turn) * spd;
          b.vy = Math.sin(cur + turn) * spd;
          b.angle = cur + turn;
        }
      }

      // --- 回旋（My Reflection）---
      if (b.curving !== 0) {
        const spd = Math.hypot(b.vx, b.vy);
        const cur = Math.atan2(b.vy, b.vx);
        // 随时间反向弯曲：前期加速，中段减速并掉头
        const progress = b.traveled / Math.max(1, b.maxDist);
        const turnRate = b.curving * (1 - Math.min(1, progress) * 0.6);
        const na = cur + (turnRate * Math.PI / 180) * dt;
        b.vx = Math.cos(na) * spd;
        b.vy = Math.sin(na) * spd;
        b.angle = na;
      }

      // --- 弹道 z（Ipecac）---
      if (b.ballistic) {
        b.vz -= b.gravity * dt;
        b.z += b.vz * dt;
        if (b.z <= 0 && b.vz < 0) {
          // 落地爆炸
          if (b.explosive) {
            this.explode(b.x, b.y, b.explosionRadius, b.damage, 'player');
          } else {
            this.fx.tearSplash(b.x, b.y, 5, '#8fc84a');
          }
          list.removeAt(i);
          continue;
        }
      }

      // --- 位移 ---
      const dx = b.vx * dt;
      const dy = b.vy * dt;
      b.x += dx;
      b.y += dy;
      b.traveled += Math.hypot(dx, dy);
      b.spin += dt * 8;

      // --- 射程耗尽 ---
      if (b.traveled >= b.maxDist) {
        if (b.explosive) this.explode(b.x, b.y, b.explosionRadius, b.damage, 'player');
        else this.fx.tearSplash(b.x, b.y, 3, b.color || '#9fe0f5');
        list.removeAt(i);
        continue;
      }

      // --- 房间边界（门是出口；子弹撞墙消失）---
      const r = b.r;
      if (b.x < room.minX - r || b.x > room.maxX + r || b.y < room.minY - r || b.y > room.maxY + r) {
        // 允许穿过开启的门（视觉上子弹飞出门外），否则在墙前碎裂
        const throughDoor = isExitingThroughDoor(b, room);
        if (!throughDoor) {
          if (b.explosive) this.explode(clamp(b.x, room.minX, room.maxX), clamp(b.y, room.minY, room.maxY), b.explosionRadius, b.damage, 'player');
          else this.fx.tearSplash(b.x, b.y, 4, b.color || '#9fe0f5');
          list.removeAt(i);
          continue;
        }
        if (b.x < -80 || b.x > room.maxX + 80 || b.y < -80 || b.y > room.maxY + 80) {
          list.removeAt(i);
          continue;
        }
      }

      // --- 障碍物（幽灵弹穿过）---
      if (!b.spectral && !b.ballistic) {
        const obs = room.hitsObstacle(b.x, b.y, r);
        if (obs) {
          if (b.explosive) this.explode(b.x, b.y, b.explosionRadius, b.damage, 'player');
          else {
            this.fx.sparkBurst(b.x, b.y, 4, '#c8b8a8', b.angle + Math.PI);
            this.audio.sfxHit();
          }
          list.removeAt(i);
          continue;
        }
      }

      // --- 命中敌人 ---
      if (isPlayerOwned) {
        const hitTargets = collectTargets(room);
        let removed = false;
        for (const e of hitTargets) {
          if (e.isDead) continue;
          if (b.hasHit(e.id)) continue;
          const rr = (b.r + e.radius);
          if (dist2Sq(b.x, b.y, e.x, e.y) <= rr * rr) {
            // 命中
            b.recordHit(e.id);
            ensureEnemyId(e);
            const died = e.takeDamage(b.damage, b.x, b.y, e.type === 'boss' ? 0 : 130);
            this.fx.damageNumber(e.x, e.y - e.radius - 4, Math.round(b.damage), '#ffd24a');
            this.fx.bloodBurst(b.x, b.y, 5, 1.6, b.angle);
            this.audio.sfxHit();
            this.bus.emit(EVT.ENEMY_DAMAGED, e);
            if (died) {
              this.bus.emit(EVT.ENEMY_DIED, e);
            }
            if (b.explosive) {
              this.explode(b.x, b.y, b.explosionRadius, b.damage, 'player');
              list.removeAt(i);
              removed = true;
              break;
            }
            if (b.onHitEnemy()) {
              list.removeAt(i);
              removed = true;
              break;
            }
          }
        }
        if (removed) continue;
      } else {
        // --- 命中玩家 ---
        if (player.alive) {
          const rr = b.r + player.radius * 0.82;
          if (dist2Sq(b.x, b.y, player.x, player.y) <= rr * rr) {
            const damaged = player.takeDamage(b.damage);
            if (damaged) {
              this.bus.emit(EVT.PLAYER_DAMAGED, b.damage);
              this.audio.sfxHurt();
              this.fx.bloodBurst(player.x, player.y, 7, TAU, 0, { color: '#d93b3b' });
            }
            list.removeAt(i);
            continue;
          }
        }
      }
    }
  }

  _updateBeams(dt, ctx) {
    const { room, player } = ctx;
    const list = this.beams;
    for (let i = list.items.length - 1; i >= 0; i--) {
      const beam = list.items[i];
      beam.t += dt;
      if (beam.t >= beam.duration) {
        list.removeAt(i);
        continue;
      }
      if (beam.owner !== 'player') continue;

      // 命中节流：每 0.09s 结算一次
      beam.tickTimer -= dt;
      const doTick = beam.tickTimer <= 0;
      if (doTick) {
        beam.tickTimer = 0.09;
      }

      const targets = collectTargets(room);
      const widthHalf = beam.width * 0.5;
      for (const e of targets) {
        if (e.isDead) continue;
        const dist = pointToSegment(e.x, e.y, beam.x1, beam.y1, beam.x2, beam.y2);
        if (dist <= e.radius + widthHalf) {
          if (!doTick) continue;
          ensureEnemyId(e);
          // 光束每 tick 的伤害按 duration/tick 折算，保证总伤害符合预期
          const perTick = beam.damage * (0.09 / Math.max(0.05, beam.duration)) * 2.2;
          const died = e.takeDamage(perTick, beam.x1, beam.y1, e.type === 'boss' ? 0 : 40);
          if (Math.random() < 0.35) this.fx.damageNumber(e.x, e.y - e.radius - 4, Math.round(perTick), '#ff6b4a');
          this.fx.sparkBurst(e.x, e.y, 2, '#ff8a3d', 0);
          this.bus.emit(EVT.ENEMY_DAMAGED, e);
          if (died) this.bus.emit(EVT.ENEMY_DIED, e);
        }
      }
      // 光束命中障碍：截断视觉（此处简化，仅在终点产生火花）
      if (Math.random() < 0.4) {
        this.fx.sparkBurst(beam.x2, beam.y2, 1, '#ff8a3d', beam.angle);
      }
    }
  }

  _updateExplosions(dt, ctx) {
    const list = this.explosions;
    for (let i = list.items.length - 1; i >= 0; i--) {
      const ex = list.items[i];
      ex.t += dt;
      if (!ex.applied && ex.t >= 0.05) {
        ex.applied = true;
        this._applyExplosion(ex, ctx);
      }
      if (ex.t >= ex.duration) list.removeAt(i);
    }
  }

  _applyExplosion(ex, ctx) {
    const { room, player } = ctx;
    if (ex.owner === 'player') {
      const targets = collectTargets(room);
      for (const e of targets) {
        if (e.isDead) continue;
        const d = Math.hypot(e.x - ex.x, e.y - ex.y);
        if (d <= ex.radius + e.radius) {
          ensureEnemyId(e);
          const falloff = 1 - clamp(d / (ex.radius + e.radius), 0, 1) * 0.45;
          const dmg = ex.damage * falloff;
          const died = e.takeDamage(dmg, ex.x, ex.y, e.type === 'boss' ? 0 : 180);
          this.fx.damageNumber(e.x, e.y - e.radius - 4, Math.round(dmg), '#ffb03a');
          this.bus.emit(EVT.ENEMY_DAMAGED, e);
          if (died) this.bus.emit(EVT.ENEMY_DIED, e);
        }
      }
      if (ex.friendlyFire && player.alive) {
        const d = Math.hypot(player.x - ex.x, player.y - ex.y);
        if (d <= ex.radius) {
          // 自伤：半心
          if (player.takeDamage(1)) {
            this.bus.emit(EVT.PLAYER_DAMAGED, 1);
            this.audio.sfxHurt();
          }
        }
      }
    }
    this.fx.explode(ex.x, ex.y, 16, ex.radius);
    this.audio.noise({ dur: 0.4, gain: 0.28, filterFrom: 2400, filterTo: 120 });
    this.audio.tone({ freq: 140, freqEnd: 50, type: 'sawtooth', dur: 0.35, gain: 0.24 });
  }

  /** 生成爆炸 */
  explode(x, y, radius, damage, owner) {
    this.explosions.add(this.explosions.pool.acquire(x, y, radius, damage, { owner }));
  }

  /** 接触伤害：敌人碰到玩家 */
  resolveContactDamage(player, room) {
    if (!player.alive) return;
    const targets = collectTargets(room);
    for (const e of targets) {
      if (e.isDead) continue;
      if (e.contactDamage <= 0) continue;
      const rr = e.radius + player.radius * 0.8;
      if (dist2Sq(e.x, e.y, player.x, player.y) <= rr * rr) {
        if (player.takeDamage(e.contactDamage)) {
          this.bus.emit(EVT.PLAYER_DAMAGED, e.contactDamage);
          this.audio.sfxHurt();
          this.fx.bloodBurst(player.x, player.y, 8, TAU, 0, { color: '#d93b3b' });
          // 被撞后玩家被弹开一点
          const a = Math.atan2(player.y - e.y, player.x - e.x);
          player.vx += Math.cos(a) * 120;
          player.vy += Math.sin(a) * 120;
        }
      }
    }
  }

  /** 尖刺伤害 */
  resolveSpikes(player, room) {
    if (!player.alive || room.spikes.length === 0) return;
    for (const s of room.spikes) {
      const sx = s.tx * TILE + TILE / 2;
      const sy = s.ty * TILE + TILE / 2;
      if (Math.hypot(player.x - sx, player.y - sy) < TILE * 0.42 + player.radius * 0.6) {
        if (player.takeDamage(1)) {
          this.bus.emit(EVT.PLAYER_DAMAGED, 1);
          this.audio.sfxHurt();
          this.fx.bloodBurst(player.x, player.y, 6, TAU, 0, { color: '#d93b3b' });
        }
        break;
      }
    }
  }
}

// ---------------- 辅助函数（无分配优先）----------------

function collectTargets(room) {
  // 返回一个复用的数组，避免每次分配
  const out = collectTargets._buf;
  out.length = 0;
  for (let i = 0; i < room.enemies.length; i++) out.push(room.enemies[i]);
  if (room.boss) out.push(room.boss);
  return out;
}
collectTargets._buf = [];

function ensureEnemyId(e) {
  // 兜底：理论上所有敌人（Enemy/Boss）在构造时都有 id；
  // 若没有（例如未来的自定义实体），用稳定的计数器而非 Math.random，
  // 以免破坏「可复现」契约（控制清单 C2）。
  if (e.id === undefined || e.id === null) e.id = _nextFallbackId++;
}
let _nextFallbackId = 1e9; // 高位段，避免与 Enemy._nextId / Boss.id(999999) 冲突

function dist2Sq(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

function findNearestEnemy(enemies, x, y, maxDist, boss) {
  let best = null;
  let bestD = maxDist * maxDist;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.isDead) continue;
    const d = dist2Sq(x, y, e.x, e.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  if (boss && !boss.isDead) {
    const d = dist2Sq(x, y, boss.x, boss.y);
    if (d < bestD) best = boss;
  }
  return best;
}

/** 点到线段的距离（光束命中检测） */
export function pointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = clamp(t, 0, 1);
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** 子弹是否正从开启的门飞出房间（用于放行） */
function isExitingThroughDoor(b, room) {
  if (!room.cleared) return false;
  const doorSpan = TILE * 1.6;
  const W = room.maxX - room.minX;
  const H = room.maxY - room.minY;
  const cx = room.maxX - W / 2;
  const cy = room.maxY - H / 2;
  // 判断子弹是否在门上/门外且在门的横向范围内
  if (b.y < room.minY && room.doors.up && Math.abs(b.x - cx) < doorSpan && b.vy < 0) return true;
  if (b.y > room.maxY && room.doors.down && Math.abs(b.x - cx) < doorSpan && b.vy > 0) return true;
  if (b.x < room.minX && room.doors.left && Math.abs(b.y - cy) < doorSpan && b.vx < 0) return true;
  if (b.x > room.maxX && room.doors.right && Math.abs(b.y - cy) < doorSpan && b.vx > 0) return true;
  return false;
}
