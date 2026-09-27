/**
 * particles.js — 粒子与飘字系统
 *
 * 两类效果：
 *   Particle —— 血滴/火花/骨屑/烟雾，有速度、重力、寿命、渐隐
 *   FloatText —— 伤害数字/拾取提示，上浮渐隐
 *
 * 用对象池避免 GC（见 core/pool.js）。上限保护：超过 MAX 时复用最老的。
 */

import { Pool, ActiveList } from '../core/pool.js';
import { TAU } from '../core/math.js';

export class Particle {
  reset(x, y, vx, vy, opts = {}) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.r = opts.r === undefined ? 3 : opts.r;
    this.color = opts.color || '#a01818';
    this.life = opts.life === undefined ? 0.5 : opts.life;
    this.age = 0;
    this.gravity = opts.gravity === undefined ? 0 : opts.gravity;
    this.drag = opts.drag === undefined ? 0.9 : opts.drag;
    this.alpha = opts.alpha === undefined ? 1 : opts.alpha;
    this.square = !!opts.square;
    this.spark = !!opts.spark;
    this.squash = opts.squash === undefined ? 1 : opts.squash;
    this.groundY = opts.groundY === undefined ? null : opts.groundY; // 落地停止
    this.alive = true;
    return this;
  }
  markDead() {
    this.alive = false;
  }
}

export class FloatText {
  reset(x, y, text, opts = {}) {
    this.x = x;
    this.y = y;
    this.text = String(text);
    this.color = opts.color || '#ffffff';
    this.stroke = opts.stroke || '#1a0d0d';
    this.size = opts.size === undefined ? 15 : opts.size;
    this.life = opts.life === undefined ? 0.85 : opts.life;
    this.age = 0;
    this.vy = opts.vy === undefined ? -34 : opts.vy;
    this.vx = opts.vx === undefined ? 0 : opts.vx;
    this.alive = true;
    return this;
  }
  markDead() {
    this.alive = false;
  }
}

export class ParticleSystem {
  constructor(max = 520) {
    this.max = max;
    this.pool = new Pool(
      () => new Particle(),
      null,
      null,
      120,
    );
    this.list = new ActiveList(this.pool);

    this.textPool = new Pool(() => new FloatText());
    this.texts = new ActiveList(this.textPool);
  }

  _spawn(x, y, vx, vy, opts) {
    if (this.list.length >= this.max) {
      // 池满：覆盖最后一个（视觉上损失一个最老粒子无所谓，避免分配）
      const old = this.list.items[this.list.length - 1];
      if (old) {
        old.reset(x, y, vx, vy, opts);
        return old;
      }
    }
    return this.list.add(this.pool.acquire(x, y, vx, vy, opts));
  }

  /** 血花：向四周飞溅 */
  bloodBurst(x, y, count = 8, spread = TAU, dir = 0, opts = {}) {
    for (let i = 0; i < count; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const spd = 60 + Math.random() * 150;
      this._spawn(x, y, Math.cos(a) * spd, Math.sin(a) * spd, {
        r: 2 + Math.random() * 3.2,
        color: opts.color || (Math.random() < 0.5 ? '#a01818' : '#c9302c'),
        life: 0.35 + Math.random() * 0.4,
        gravity: 320,
        drag: 0.82,
        groundY: y + 14,
      });
    }
  }

  /** 火花（命中金属/科技） */
  sparkBurst(x, y, count = 6, color = '#ffd24a', dir = 0) {
    for (let i = 0; i < count; i++) {
      const a = dir + (Math.random() - 0.5) * 2.2;
      const spd = 90 + Math.random() * 170;
      this._spawn(x, y, Math.cos(a) * spd, Math.sin(a) * spd, {
        r: 1.6 + Math.random() * 1.8,
        color,
        life: 0.16 + Math.random() * 0.2,
        drag: 0.86,
        spark: true,
      });
    }
  }

  /** 水花（眼泪命中） */
  tearSplash(x, y, count = 6, color = '#9fe0f5') {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const spd = 40 + Math.random() * 110;
      this._spawn(x, y, Math.cos(a) * spd, Math.sin(a) * spd, {
        r: 1.6 + Math.random() * 2.4,
        color,
        life: 0.2 + Math.random() * 0.28,
        gravity: 240,
        drag: 0.88,
      });
    }
  }

  /** 爆炸碎片 */
  explode(x, y, count = 14, radius = 40) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const spd = 80 + Math.random() * 240;
      this._spawn(x, y, Math.cos(a) * spd, Math.sin(a) * spd, {
        r: 3 + Math.random() * 5,
        color: Math.random() < 0.5 ? '#ffb03a' : '#ff5a1e',
        life: 0.3 + Math.random() * 0.45,
        drag: 0.88,
        gravity: 120,
        spark: Math.random() < 0.4,
      });
    }
    // 烟
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * TAU;
      this._spawn(x, y, Math.cos(a) * 26, Math.sin(a) * 26, {
        r: 8 + Math.random() * 10,
        color: 'rgba(60,40,30,0.5)',
        life: 0.5 + Math.random() * 0.5,
        drag: 0.92,
        alpha: 0.6,
      });
    }
  }

  /** 骨屑/碎屑（敌人死亡） */
  gibBurst(x, y, count = 12, color = '#e8c9a0') {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const spd = 70 + Math.random() * 200;
      this._spawn(x, y, Math.cos(a) * spd, Math.sin(a) * spd, {
        r: 2.5 + Math.random() * 4,
        color: Math.random() < 0.3 ? '#a01818' : color,
        life: 0.45 + Math.random() * 0.5,
        gravity: 420,
        drag: 0.86,
        square: Math.random() < 0.4,
      });
    }
  }

  /** 拾取光点 */
  pickupSparkle(x, y, color = '#f3c73f') {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * TAU;
      const spd = 30 + Math.random() * 80;
      this._spawn(x, y, Math.cos(a) * spd, Math.sin(a) * spd - 40, {
        r: 1.8 + Math.random() * 2.6,
        color,
        life: 0.4 + Math.random() * 0.4,
        drag: 0.9,
        spark: true,
      });
    }
  }

  /** 伤害数字 */
  damageNumber(x, y, amount, color = '#ffd24a', size = 15) {
    this.texts.add(this.textPool.acquire(x + (Math.random() - 0.5) * 10, y - 12, fmtNum(amount), {
      color, size, vy: -46, life: 0.7,
    }));
  }

  /** 泛用飘字（拾取名称/状态提示） */
  floatText(x, y, text, opts = {}) {
    this.texts.add(this.textPool.acquire(x, y, text, opts));
  }

  update(dt) {
    this.list.sweep((p) => {
      p.age += dt;
      if (p.age >= p.life) return true;
      p.vy += p.gravity * dt;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.groundY !== null && p.y >= p.groundY) {
        p.y = p.groundY;
        p.vy = 0;
        p.vx *= 0.6;
      }
      return false;
    });

    this.texts.sweep((t) => {
      t.age += dt;
      if (t.age >= t.life) return true;
      t.y += t.vy * dt;
      t.x += t.vx * dt;
      // 上浮减速
      t.vy *= Math.pow(0.9, dt * 60);
      return false;
    });
  }

  clear() {
    this.list.clear();
    this.texts.clear();
  }

  get count() {
    return this.list.length + this.texts.length;
  }
}

function fmtNum(n) {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(n < 10 ? 1 : 0);
}
