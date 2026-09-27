/**
 * state.js — 通用有限状态机（场景 / Boss 阶段共用）
 *
 * 每个状态是一个对象：
 *   { enter(ctx, payload), update(dt, ctx), exit(ctx), render(ctx) }
 * 允许状态自己转发到别的状态；转发在 update 结束后统一生效，避免重入。
 */

export class StateMachine {
  /**
   * @param {object} ctx 传给每个状态回调的上下文（通常就是场景管理器 / 游戏实例）
   * @param {string} initial 初始状态名
   */
  constructor(ctx, initial) {
    this.ctx = ctx;
    this.states = new Map();
    this.current = null;
    this.currentName = '';
    this._pending = null;
    this._payload = undefined;
    this.elapsed = 0;
    this.previousName = '';
    this._initial = initial;
  }

  add(name, state) {
    this.states.set(name, state);
    return this;
  }

  has(name) {
    return this.states.has(name);
  }

  /** 启动状态机（在 add 完所有状态后调用） */
  start(payload) {
    this._force(this._initial, payload);
  }

  /** 请求切换（在本帧 update 结束后执行） */
  transition(name, payload) {
    if (!this.states.has(name)) {
      console.error(`[StateMachine] unknown state "${name}"`);
      return;
    }
    this._pending = name;
    this._payload = payload;
  }

  _force(name, payload) {
    if (this.current && this.current.exit) this.current.exit(this.ctx);
    this.previousName = this.currentName;
    this.currentName = name;
    this.current = this.states.get(name) || null;
    this.elapsed = 0;
    if (this.current && this.current.enter) this.current.enter(this.ctx, payload);
  }

  update(dt) {
    if (!this.current) return;
    this.elapsed += dt;
    if (this.current.update) this.current.update(dt, this.ctx);
    if (this._pending !== null) {
      const n = this._pending;
      const p = this._payload;
      this._pending = null;
      this._payload = undefined;
      this._force(n, p);
    }
  }

  render(...args) {
    if (this.current && this.current.render) this.current.render(this.ctx, ...args);
  }

  is(name) {
    return this.currentName === name;
  }
}
