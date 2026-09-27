/**
 * audio.js — Web Audio 合成音效（零音频文件）
 *
 * 设计（见 ADR-001 的衍生决定）：
 * - 所有音效在运行时用 OscillatorNode / AudioBuffer 噪声合成，不加载任何 .wav/.mp3。
 * - 浏览器要求用户手势后才能 resume AudioContext，因此在第一次 pointerdown/keydown 时解锁。
 * - 音效必须轻量：每个音效一个短函数，节点用完即弃（用 stop 后的 onended 断开）。
 *
 * 参考：docs/framework-notes.md「MDN audio web audio api」章节。
 */

export class Audio {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.volume = 0.5;
    this._unlocked = false;
    this._noiseBuf = null;
  }

  /** 在首次用户手势后调用 —— 创建/恢复 AudioContext */
  unlock() {
    if (this._unlocked) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this._noiseBuf = this._makeNoiseBuffer(0.5);
      this._unlocked = true;
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (err) {
      console.warn('[Audio] init failed:', err);
    }
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  /** 生成白噪声缓冲，供爆炸/受击等音效使用 */
  _makeNoiseBuffer(seconds) {
    if (!this.ctx) return null;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /**
   * 基础音：振荡器 + 包络
   * @param {object} o
   * @param {number} o.freq 起始频率
   * @param {number} [o.freqEnd] 结束频率（滑音）
   * @param {OscillatorType} [o.type]
   * @param {number} [o.dur] 时长秒
   * @param {number} [o.gain] 峰值增益
   * @param {number} [o.delay] 延迟秒
   */
  tone({ freq, freqEnd = freq, type = 'square', dur = 0.12, gain = 0.25, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  /** 噪声爆破（带低通滤波扫频），用于受击/爆炸/门开 */
  noise({ dur = 0.18, gain = 0.2, filterFrom = 2400, filterTo = 300, delay = 0 }) {
    if (!this.ctx || this.muted || !this._noiseBuf) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(filterFrom, t0);
    filt.frequency.exponentialRampToValueAtTime(Math.max(60, filterTo), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
    src.onended = () => {
      src.disconnect();
      filt.disconnect();
      g.disconnect();
    };
  }

  // ---------------- 具体音效 ----------------

  /** 玩家射击：短促「呲」声，音高随眼泪变体变化 */
  sfxShoot(pitch = 1) {
    this.tone({ freq: 720 * pitch, freqEnd: 380 * pitch, type: 'triangle', dur: 0.09, gain: 0.14 });
  }

  /** 子弹命中敌人：清脆「啪」 */
  sfxHit() {
    this.tone({ freq: 320, freqEnd: 140, type: 'square', dur: 0.06, gain: 0.16 });
    this.noise({ dur: 0.06, gain: 0.1, filterFrom: 3000, filterTo: 600 });
  }

  /** 敌人死亡：下坠音 + 噪声 */
  sfxEnemyDie() {
    this.tone({ freq: 440, freqEnd: 90, type: 'sawtooth', dur: 0.26, gain: 0.18 });
    this.noise({ dur: 0.22, gain: 0.16, filterFrom: 1800, filterTo: 200 });
  }

  /** 玩家受伤：低沉刺耳 */
  sfxHurt() {
    this.tone({ freq: 180, freqEnd: 70, type: 'sawtooth', dur: 0.3, gain: 0.26 });
    this.noise({ dur: 0.2, gain: 0.18, filterFrom: 900, filterTo: 150 });
  }

  /** 拾取道具：上行琶音 */
  sfxPickup() {
    this.tone({ freq: 523, type: 'triangle', dur: 0.1, gain: 0.2 });
    this.tone({ freq: 784, type: 'triangle', dur: 0.12, gain: 0.2, delay: 0.08 });
    this.tone({ freq: 1046, type: 'triangle', dur: 0.16, gain: 0.18, delay: 0.16 });
  }

  /** 开箱 / 掉落 */
  sfxDrop() {
    this.tone({ freq: 300, freqEnd: 600, type: 'square', dur: 0.12, gain: 0.14 });
  }

  /** 门开启 */
  sfxDoor() {
    this.noise({ dur: 0.35, gain: 0.14, filterFrom: 700, filterTo: 180 });
    this.tone({ freq: 120, freqEnd: 60, type: 'sine', dur: 0.3, gain: 0.18 });
  }

  /** 层级切换 / 进新区域 */
  sfxFloor() {
    this.tone({ freq: 262, type: 'sine', dur: 0.22, gain: 0.22 });
    this.tone({ freq: 392, type: 'sine', dur: 0.3, gain: 0.2, delay: 0.1 });
  }

  /** Boss 咆哮（进入 Boss 房） */
  sfxBossRoar() {
    this.tone({ freq: 90, freqEnd: 55, type: 'sawtooth', dur: 0.9, gain: 0.3 });
    this.noise({ dur: 0.8, gain: 0.2, filterFrom: 500, filterTo: 90 });
  }

  /** Boss 死亡 */
  sfxBossDie() {
    this.noise({ dur: 0.9, gain: 0.28, filterFrom: 2200, filterTo: 80 });
    this.tone({ freq: 220, freqEnd: 50, type: 'sawtooth', dur: 0.9, gain: 0.24 });
  }

  /** 死亡界面：下行长音 */
  sfxGameOver() {
    this.tone({ freq: 330, freqEnd: 80, type: 'triangle', dur: 1.1, gain: 0.26 });
    this.tone({ freq: 220, freqEnd: 55, type: 'sine', dur: 1.3, gain: 0.2, delay: 0.12 });
  }

  /** 通关胜利：上行大三和弦琶音 */
  sfxWin() {
    const notes = [392, 494, 587, 784];
    notes.forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.28, gain: 0.22, delay: i * 0.12 }));
  }

  /** 菜单点击 */
  sfxClick() {
    this.tone({ freq: 620, freqEnd: 880, type: 'square', dur: 0.07, gain: 0.16 });
  }

  /** 暂停 */
  sfxPause() {
    this.tone({ freq: 500, freqEnd: 300, type: 'sine', dur: 0.12, gain: 0.18 });
  }
}
