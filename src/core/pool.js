/**
 * pool.js — 通用对象池
 *
 * 用途：子弹、粒子、掉落物每帧大量创建/销毁，直接 new/GC 会造成帧抖动。
 * 约束：池中对象必须有 `reset(...args)` 方法，或提供工厂 + 重置函数。
 */

export class Pool {
  /**
   * @param {() => object} factory 创建新对象
   * @param {(obj: object, ...args: any[]) => void} [onAcquire] 出池时调用
   * @param {(obj: object) => void} [onRelease] 回池时调用
   * @param {number} [prewarm] 预热数量
   */
  constructor(factory, onAcquire = null, onRelease = null, prewarm = 0) {
    this.factory = factory;
    this.onAcquire = onAcquire;
    this.onRelease = onRelease;
    /** @type {object[]} */
    this.free = [];
    this.created = 0;
    for (let i = 0; i < prewarm; i++) {
      this.free.push(this.factory());
      this.created++;
    }
  }

  acquire(...args) {
    let obj;
    if (this.free.length > 0) {
      obj = this.free.pop();
    } else {
      obj = this.factory();
      this.created++;
    }
    if (obj.reset) obj.reset(...args);
    if (this.onAcquire) this.onAcquire(obj, ...args);
    return obj;
  }

  release(obj) {
    if (this.onRelease) this.onRelease(obj);
    this.free.push(obj);
  }

  get size() {
    return this.free.length;
  }
}

/**
 * 活跃对象列表封装：支持 add / 遍历 / 反向安全移除（swap-remove）。
 * 用 swap-remove 保证 O(1) 移除且无数组塌陷开销。
 */
export class ActiveList {
  /** @param {Pool} [pool] 移除时归还的池 */
  constructor(pool = null) {
    /** @type {object[]} */
    this.items = [];
    this.pool = pool;
  }

  add(obj) {
    this.items.push(obj);
    return obj;
  }

  /**
   * 移除索引 i 的元素（O(1)）。
   * 注意：会打乱顺序 —— 对子弹/粒子无所谓；若需要顺序请用 retain。
   */
  removeAt(i) {
    const arr = this.items;
    const obj = arr[i];
    if (obj === undefined) return;
    arr[i] = arr[arr.length - 1];
    arr.pop();
    if (this.pool && obj) this.pool.release(obj);
  }

  /** 移除指定对象（线性查找） */
  remove(obj) {
    const i = this.items.indexOf(obj);
    if (i >= 0) this.removeAt(i);
    return i >= 0;
  }

  /**
   * 用回调过滤，返回是否被移除（推荐在倒序遍历中使用 removeAt）。
   * @param {(obj: object, i: number) => boolean} pred 返回 true 表示移除
   */
  sweep(pred) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (pred(this.items[i], i)) this.removeAt(i);
    }
  }

  clear() {
    if (this.pool) {
      for (const o of this.items) this.pool.release(o);
    }
    this.items.length = 0;
  }

  get length() {
    return this.items.length;
  }

  forEach(fn) {
    for (let i = 0; i < this.items.length; i++) fn(this.items[i], i);
  }
}
