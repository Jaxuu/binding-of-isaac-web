/**
 * events.js — 极简同步事件总线
 *
 * 用途：解耦子系统。例如战斗系统只发 'entity:died'，成就/统计/音频各自监听。
 * 决策：同步派发（非 microtask），保证同一帧内监听者看到一致状态，便于测试。
 * 限制：单帧内高频事件（每颗子弹碰撞）不走总线，直接函数调用，避免热路径分配。
 */

export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._handlers = new Map();
    /** 派发中若发生增删，缓冲到本帧结束，避免迭代器失效 */
    this._depth = 0;
    /** @type {Array<() => void>} */
    this._deferred = [];
  }

  /**
   * 订阅。返回取消订阅函数。
   * @param {string} type
   * @param {Function} fn
   * @returns {() => void}
   */
  on(type, fn) {
    let set = this._handlers.get(type);
    if (!set) {
      set = new Set();
      this._handlers.set(type, set);
    }
    set.add(fn);
    return () => this.off(type, fn);
  }

  /** 只触发一次 */
  once(type, fn) {
    const off = this.on(type, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off(type, fn) {
    const set = this._handlers.get(type);
    if (!set) return;
    if (this._depth > 0) {
      this._deferred.push(() => set.delete(fn));
    } else {
      set.delete(fn);
    }
  }

  /**
   * 派发事件。异常被隔离，单个监听器出错不影响其余监听器与主循环。
   * @param {string} type
   * @param {*} [payload]
   */
  emit(type, payload) {
    const set = this._handlers.get(type);
    if (!set || set.size === 0) return;
    this._depth++;
    try {
      // 拷贝一份，避免监听器内部增删导致迭代问题
      const list = Array.from(set);
      for (let i = 0; i < list.length; i++) {
        try {
          list[i](payload);
        } catch (err) {
          console.error(`[EventBus] handler error for "${type}":`, err);
        }
      }
    } finally {
      this._depth--;
      if (this._depth === 0 && this._deferred.length) {
        const d = this._deferred;
        this._deferred = [];
        for (const fn of d) fn();
      }
    }
  }

  /** 清空所有订阅（切换场景时调用，防止泄漏） */
  clear() {
    this._handlers.clear();
    this._deferred.length = 0;
  }
}

/** 事件名常量表。集中管理避免拼写错误。 */
export const EVT = Object.freeze({
  // 战斗
  ENEMY_DAMAGED: 'enemy:damaged',
  ENEMY_DIED: 'enemy:died',
  PLAYER_DAMAGED: 'player:damaged',
  PLAYER_HEALED: 'player:healed',
  PLAYER_DIED: 'player:died',
  PLAYER_FIRED: 'player:fired',
  // 房间 / 地牢
  ROOM_ENTERED: 'room:entered',
  ROOM_CLEARED: 'room:cleared',
  FLOOR_CHANGED: 'floor:changed',
  BOSS_SPAWNED: 'boss:spawned',
  BOSS_DIED: 'boss:died',
  // 道具
  ITEM_PICKED: 'item:picked',
  STATS_CHANGED: 'stats:changed',
  // 流程
  GAME_STARTED: 'game:started',
  GAME_OVER: 'game:over',
  GAME_WON: 'game:won',
  SCENE_CHANGED: 'scene:changed',
  // 音频触发（由音频系统消费）
  SFX: 'sfx',
});
