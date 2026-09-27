/**
 * music.js — 逐层程序化配乐（零音频文件）
 *
 * 设计参考（联网检索：《以撒的结合：重生》原声，作曲 Ridiculon）：
 *   原作每个楼层有一首主曲，并且**当房间内敌人/Boss 足够多时会叠加「加重变体」乐器**
 *   （Wiki 明确标注了每层叠加的乐器：吉他 / 低音吉他 / 鼓 / 环境音效 / 背景合唱）。
 *   本模块照此机制实现：`setCombat(true)` 时启用该层的加重层。
 *
 * ⚠️ 版权说明：本项目**不包含、不还原**任何原作旋律或音频素材。
 *   所有音符由 Web Audio 实时合成，每层的调式/速度/音色/节奏型均为**原创设计**，
 *   仅在「情绪取向 + 加重乐器」这一层面对原作做致敬性对应。
 *
 * 楼层 ↔ 参考曲目 ↔ 加重乐器（对照表，见 FLOOR_TRACKS）：
 *   B1 Basement   Diptera Sonata        [Guitar]
 *   B2 Cellar     Periculum             [Guitar]
 *   B3 Caves      Sodden Hollow         [Bass guitar]
 *   B4 Catacombs  Capiticus Calvaria    [Guitar]
 *   B5 Depths     Abyss                 [Ambient]
 *   B6 Necropolis When Blood Dries      [Guitar]
 *   B7 Womb       Viscera               [Drums]
 *   B8 Utero       Viscera (heavier)    [Drums]
 *   B9 Sheol      Duress                [Drums]
 *   B10 Cathedral Everlasting Hymn      [Backing choir]
 *   B11 Chest     Sketches of Pain      [Guitar]
 *   B12 Dark Room Devoid                [—]（本作补一层低频嗡鸣，见下）
 *
 * 时序：调度由 GameState.update（固定 60Hz）驱动，使用「前瞻调度」——
 *   每次把 currentTime + 0.12s 之内的音符排进 Web Audio 的时间轴，
 *   因此节拍不受帧率抖动影响（不依赖 setInterval，便于测试与暂停）。
 */

/** 调式（半音偏移） */
const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  wholeTone: [0, 2, 4, 6, 8, 10],
};

/**
 * 12 层配乐定义。
 * bassPat / arpPat 为 8 分音符网格（每小节 8 格）：
 *   bassPat：'x' = 和弦根音，'5' = 五度，'3' = 三度，'.' = 休止
 *   arpPat ：'.' = 休止，'0'..'6' = 音阶级数（叠加 arpOct 八度）
 * drums：none / soft / medium / heavy / heart（心跳）
 * combat：none / guitar / bass / drums / choir / ambient（加重变体）
 */
export const FLOOR_TRACKS = [
  {
    id: 'basement', name: 'Diptera Sonata',
    bpm: 96, root: 110.0, scale: SCALES.minor, prog: [0, 5, 3, 4],
    bassPat: 'x.x.5.x.', arpPat: '.0.2.4.2', arpOct: 2,
    drums: 'soft', combat: 'guitar', ambience: 0.18,
    padWave: 'triangle', bassWave: 'triangle', leadWave: 'square',
  },
  {
    id: 'cellar', name: 'Periculum',
    bpm: 104, root: 73.42, scale: SCALES.dorian, prog: [0, 3, 5, 4],
    bassPat: 'x.xx..5.', arpPat: '..2.3.2.', arpOct: 2,
    drums: 'soft', combat: 'guitar', ambience: 0.2,
    padWave: 'sawtooth', bassWave: 'triangle', leadWave: 'square',
  },
  {
    id: 'caves', name: 'Sodden Hollow',
    bpm: 88, root: 82.41, scale: SCALES.phrygian, prog: [0, 1, 5, 4],
    bassPat: 'x...5...', arpPat: '.1..0..1', arpOct: 2,
    drums: 'soft', combat: 'bass', ambience: 0.34,
    padWave: 'triangle', bassWave: 'sawtooth', leadWave: 'triangle',
  },
  {
    id: 'catacombs', name: 'Capiticus Calvaria',
    bpm: 112, root: 65.41, scale: SCALES.harmonicMinor, prog: [0, 4, 5, 0],
    bassPat: 'x.x5x.x5', arpPat: '0.4.6.4.', arpOct: 2,
    drums: 'medium', combat: 'guitar', ambience: 0.16,
    padWave: 'sawtooth', bassWave: 'sawtooth', leadWave: 'square',
  },
  {
    id: 'depths', name: 'Abyss',
    bpm: 72, root: 43.65, scale: SCALES.locrian, prog: [0, 1, 3, 2],
    bassPat: 'x.......', arpPat: '........', arpOct: 3,
    drums: 'none', combat: 'ambient', ambience: 0.55,
    padWave: 'sine', bassWave: 'sine', leadWave: 'triangle',
  },
  {
    id: 'necropolis', name: 'When Blood Dries',
    bpm: 100, root: 61.74, scale: SCALES.phrygian, prog: [0, 5, 1, 4],
    bassPat: 'x.x.x.5.', arpPat: '.2.1.0.1', arpOct: 2,
    drums: 'medium', combat: 'guitar', ambience: 0.24,
    padWave: 'sawtooth', bassWave: 'triangle', leadWave: 'square',
  },
  {
    id: 'womb', name: 'Viscera',
    bpm: 84, root: 49.0, scale: SCALES.minor, prog: [0, 3, 4, 5],
    bassPat: 'x..x..x.', arpPat: '.0..2...', arpOct: 3,
    drums: 'heart', combat: 'drums', ambience: 0.3,
    padWave: 'sine', bassWave: 'sine', leadWave: 'triangle',
  },
  {
    id: 'utero', name: 'Viscera (Utero)',
    bpm: 94, root: 51.91, scale: SCALES.harmonicMinor, prog: [0, 5, 3, 4],
    bassPat: 'x.x.x.x.', arpPat: '.2.4.3.2', arpOct: 3,
    drums: 'heart', combat: 'drums', ambience: 0.3,
    padWave: 'triangle', bassWave: 'sine', leadWave: 'square',
  },
  {
    id: 'sheol', name: 'Duress',
    bpm: 122, root: 55.0, scale: SCALES.phrygian, prog: [0, 1, 5, 4],
    bassPat: 'x.x5x.x5', arpPat: '0.1.3.1.', arpOct: 2,
    drums: 'heavy', combat: 'drums', ambience: 0.14,
    padWave: 'sawtooth', bassWave: 'sawtooth', leadWave: 'sawtooth',
  },
  {
    id: 'cathedral', name: 'Everlasting Hymn',
    bpm: 76, root: 130.81, scale: SCALES.lydian, prog: [0, 4, 3, 5],
    bassPat: 'x.......', arpPat: '0..2..4.', arpOct: 1,
    drums: 'none', combat: 'choir', ambience: 0.42,
    padWave: 'sine', bassWave: 'sine', leadWave: 'sine',
  },
  {
    id: 'chest', name: 'Sketches of Pain',
    bpm: 108, root: 146.83, scale: SCALES.dorian, prog: [0, 3, 4, 5],
    bassPat: 'x.5.x.x.', arpPat: '.0.3.2.4', arpOct: 2,
    drums: 'medium', combat: 'guitar', ambience: 0.2,
    padWave: 'triangle', bassWave: 'triangle', leadWave: 'square',
  },
  {
    id: 'darkroom', name: 'Devoid',
    bpm: 64, root: 65.41, scale: SCALES.wholeTone, prog: [0, 2, 4, 3],
    bassPat: 'x.......', arpPat: '..0...2.', arpOct: 3,
    drums: 'none', combat: 'ambient', ambience: 0.6,
    padWave: 'sine', bassWave: 'sine', leadWave: 'triangle',
  },
];

/** 取某层配乐（1 基；越界钳制） */
export function trackForFloor(n) {
  const i = Math.max(0, Math.min(FLOOR_TRACKS.length - 1, (Math.floor(n) || 1) - 1));
  return FLOOR_TRACKS[i];
}

export class MusicPlayer {
  /**
   * @param {import('./audio.js').Audio} audio
   */
  constructor(audio) {
    this.audio = audio;
    this.track = null;
    this.playing = false;
    this.paused = false;
    this.combat = false;
    this._step = 0; // 8 分音符步进
    this._bar = 0;
    this._nextTime = 0;
    this._stepDur = 0.3;
    this._wantFloor = null; // 音频尚未解锁时暂存
  }

  /** 切换/开始某层配乐（音频未解锁时先记住，解锁后自动开播） */
  play(floor) {
    this._wantFloor = floor;
    this._beginIfReady();
  }

  /** 停止（回到标题 / 死亡 / 通关） */
  stop() {
    this._wantFloor = null;
    this.playing = false;
    this.paused = false;
    this.track = null;
  }

  /** 暂停（暂停菜单：停止推进节拍） */
  setPaused(p) {
    this.paused = !!p;
  }

  /** 战斗强度：房间内有存活敌人时启用「加重变体」层（对应原作机制） */
  setCombat(on) {
    this.combat = !!on;
  }

  /** 当前曲目名（调试/UI 用） */
  get trackName() {
    return this.track ? this.track.name : '';
  }

  _beginIfReady() {
    const a = this.audio;
    if (!a || !a.ctx || this._wantFloor == null) return;
    const t = trackForFloor(this._wantFloor);
    if (this.playing && this.track && this.track.id === t.id) return;
    this.track = t;
    this._stepDur = 60 / t.bpm / 2; // 8 分音符
    this._step = 0;
    this._bar = 0;
    this._nextTime = a.ctx.currentTime + 0.08;
    this.playing = true;
    this.paused = false;
  }

  /**
   * 由 GameState.update 每帧调用（固定 60Hz）。
   * 只做「前瞻调度」：把 0.12s 内的音符排进音频时间轴。
   */
  update() {
    if (!this.playing) this._beginIfReady();
    if (!this.playing || this.paused) return;
    const a = this.audio;
    if (!a || !a.ctx) return;
    if (a.ctx.state === 'suspended') return; // 未解锁/被挂起时不动时间轴

    const ahead = 0.12;
    let guard = 0;
    while (this._nextTime < a.ctx.currentTime + ahead && guard++ < 64) {
      this._scheduleStep(this._step, this._nextTime);
      this._nextTime += this._stepDur;
      this._step++;
      if (this._step >= 8) {
        this._step = 0;
        this._bar++;
      }
    }
    // 若长时间被挂起（切后台），把时间轴拉回当前，避免一次性补播大量音符
    if (this._nextTime < a.ctx.currentTime) this._nextTime = a.ctx.currentTime + 0.05;
  }

  // ================= 内部：调度 =================

  _scheduleStep(step, time) {
    const t = this.track;
    if (!t) return;
    const a = this.audio;
    if (a.muted) return; // 静音时不创建节点（省 CPU），节拍仍照常推进

    const chordDeg = t.prog[this._bar % t.prog.length];
    const bus = a.musicGain;

    // ---- 鼓组 ----
    this._drums(t.drums, step, time);

    // ---- 低音 ----
    const b = t.bassPat[step] || '.';
    if (b === 'x') this._voice(t.bassWave, this._deg(t, chordDeg, 0), time, this._stepDur * 1.7, 0.2, 'bass');
    else if (b === '5') this._voice(t.bassWave, this._deg(t, chordDeg + 4, 0), time, this._stepDur * 1.4, 0.16, 'bass');
    else if (b === '3') this._voice(t.bassWave, this._deg(t, chordDeg + 2, 0), time, this._stepDur * 1.4, 0.15, 'bass');

    // ---- 铺垫和弦（每小节第 0 步）----
    // 电平刻意压低：垫底用，给「加重变体」留出可听的动态空间
    if (step === 0) {
      const dur = this._stepDur * 8;
      for (const d of [0, 2, 4]) {
        this._voice(t.padWave, this._deg(t, chordDeg + d, 1), time, dur, 0.032, 'pad');
      }
    }

    // ---- 主旋律 / 琶音 ----
    const arp = t.arpPat[step] || '.';
    if (arp !== '.') {
      const deg = chordDeg + parseInt(arp, 10);
      this._voice(t.leadWave, this._deg(t, deg, t.arpOct), time, this._stepDur * 1.25, 0.075, 'lead');
    }

    // ---- 加重变体（战斗层，对应原作「敌人多时叠加乐器」）----
    if (this.combat) this._combatLayer(t, step, chordDeg, time);

    // ---- 环境延迟（Abyss / Cathedral 等氛围）----
    if (t.ambience > 0.3 && step === 0) this._swell(t, chordDeg, time, bus);
  }

  /** 加重层：吉他 / 低音吉他 / 鼓 / 合唱 / 环境 */
  _combatLayer(t, step, chordDeg, time) {
    switch (t.combat) {
      case 'guitar': {
        // 反拍强力和弦（失真锯齿）—— 原作的「吉他加重」
        if (step % 2 === 1 || step === 2 || step === 6) {
          this._powerChord(this._deg(t, chordDeg, 2), time, this._stepDur * 1.05, 0.16);
        }
        break;
      }
      case 'bass': {
        // 低音吉他 8 分推进 —— 原作的「低音吉他加重」
        this._voice('sawtooth', this._deg(t, chordDeg, 0) / 2, time, this._stepDur * 0.9, 0.22, 'bass');
        break;
      }
      case 'drums': {
        // 加花：通鼓 + 镲 —— 原作的「鼓加重」
        if (step === 3 || step === 7) this._tom(time, 150);
        if (step % 2 === 0) this._hat(time, 0.08);
        break;
      }
      case 'choir': {
        // 背景合唱（正弦簇，缓慢起音）—— 原作的「背景合唱加重」
        if (step === 0) {
          for (const d of [0, 4, 7]) {
            this._voice('sine', this._deg(t, chordDeg + d, 2), time, this._stepDur * 8, 0.075, 'choir');
          }
        }
        break;
      }
      case 'ambient': {
        // 低频嗡鸣 + 噪声涌动 —— 原作的「环境音效加重」
        if (step === 0) {
          this._voice('sine', this._deg(t, chordDeg, 0) / 2, time, this._stepDur * 8, 0.16, 'bass');
          this.audio.noise({ dur: 1.6, gain: 0.08, filterFrom: 400, filterTo: 90, delay: Math.max(0, time - this.audio.ctx.currentTime) });
        }
        break;
      }
      default:
        break;
    }
  }

  /** 音阶级数 → 频率 */
  _deg(t, degree, octave) {
    const n = t.scale.length;
    const idx = ((degree % n) + n) % n;
    const oct = octave + Math.floor(degree / n);
    return t.root * Math.pow(2, (t.scale[idx] + 12 * oct) / 12);
  }

  // ================= 内部：合成 =================

  /**
   * 单音（振荡器 + 包络）
   * @param {string} wave
   * @param {number} freq
   * @param {number} time 绝对音频时间
   * @param {number} dur
   * @param {number} gain
   * @param {string} role 'pad' | 'bass' | 'lead' | 'choir'
   */
  _voice(wave, freq, time, dur, gain, role) {
    const a = this.audio;
    if (!a.ctx || freq <= 0) return;
    const osc = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, time);

    const attack = role === 'choir' ? 0.5 : role === 'pad' ? 0.12 : 0.012;
    const rel = role === 'pad' || role === 'choir' ? 0.6 : 0.18;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + attack);
    g.gain.setValueAtTime(gain, time + Math.max(attack, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur + rel);

    osc.connect(g);
    g.connect(a.musicGain);
    osc.start(time);
    osc.stop(time + dur + rel + 0.05);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  /** 失真强力和弦（两层失谐锯齿 + 低通） */
  _powerChord(freq, time, dur, gain) {
    const a = this.audio;
    if (!a.ctx) return;
    const g = a.ctx.createGain();
    const lp = a.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, time);
    lp.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    lp.connect(g);
    g.connect(a.musicGain);
    const oscs = [];
    for (const det of [-7, 7]) {
      const osc = a.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);
      osc.detune.setValueAtTime(det, time);
      osc.connect(lp);
      osc.start(time);
      osc.stop(time + dur + 0.05);
      oscs.push(osc);
    }
    // GainNode / BiquadFilterNode 没有 onended 事件，统一挂到最后一个振荡器上回收，
    // 否则这些节点会一直留在图上（长期跑会累积成泄漏）。
    oscs[oscs.length - 1].onended = () => {
      for (const o of oscs) o.disconnect();
      lp.disconnect();
      g.disconnect();
    };
  }

  // ---- 鼓组 ----
  _drums(style, step, time) {
    if (style === 'none') return;
    const a = this.audio;
    if (!a.ctx) return;
    if (style === 'heart') {
      // 心跳：每小节两下「咚—咚」
      if (step === 0 || step === 3) this._kick(time, step === 0 ? 62 : 52);
      return;
    }
    const patterns = {
      soft: { kick: [0], snare: [4], hat: [2, 6] },
      medium: { kick: [0, 3], snare: [4, 7], hat: [1, 3, 5, 7] },
      heavy: { kick: [0, 2, 3], snare: [4, 6, 7], hat: [0, 1, 2, 3, 4, 5, 6, 7] },
    };
    const p = patterns[style];
    if (!p) return;
    if (p.kick.indexOf(step) >= 0) this._kick(time, 58);
    if (p.snare.indexOf(step) >= 0) this._snare(time);
    if (p.hat.indexOf(step) >= 0) this._hat(time, style === 'heavy' ? 0.07 : 0.05);
  }

  _kick(time, freq) {
    const a = this.audio;
    const osc = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.14);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.3, time + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
    osc.connect(g);
    g.connect(a.musicGain);
    osc.start(time);
    osc.stop(time + 0.24);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  _snare(time) {
    const a = this.audio;
    if (!a._noiseBuf) return;
    const src = a.ctx.createBufferSource();
    src.buffer = a._noiseBuf;
    const filt = a.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 1800;
    filt.Q.value = 0.8;
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.16, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);
    src.connect(filt);
    filt.connect(g);
    g.connect(a.musicGain);
    src.start(time);
    src.stop(time + 0.16);
    src.onended = () => {
      src.disconnect();
      filt.disconnect();
      g.disconnect();
    };
  }

  _hat(time, gain) {
    const a = this.audio;
    if (!a._noiseBuf) return;
    const src = a.ctx.createBufferSource();
    src.buffer = a._noiseBuf;
    const filt = a.ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 7000;
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    src.connect(filt);
    filt.connect(g);
    g.connect(a.musicGain);
    src.start(time);
    src.stop(time + 0.07);
    src.onended = () => {
      src.disconnect();
      filt.disconnect();
      g.disconnect();
    };
  }

  _tom(time, freq) {
    const a = this.audio;
    const osc = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, time + 0.16);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.2, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
    osc.connect(g);
    g.connect(a.musicGain);
    osc.start(time);
    osc.stop(time + 0.24);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  /** 低频涌动（Abyss / Dark Room 的氛围层） */
  _swell(t, chordDeg, time, bus) {
    const a = this.audio;
    if (!a._noiseBuf) return;
    const src = a.ctx.createBufferSource();
    src.buffer = a._noiseBuf;
    src.loop = true;
    const filt = a.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(160, time);
    filt.frequency.linearRampToValueAtTime(420, time + this._stepDur * 4);
    filt.frequency.linearRampToValueAtTime(160, time + this._stepDur * 8);
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(0.05 * t.ambience, time + this._stepDur * 3);
    g.gain.linearRampToValueAtTime(0.0001, time + this._stepDur * 8);
    src.connect(filt);
    filt.connect(g);
    g.connect(bus);
    src.start(time);
    src.stop(time + this._stepDur * 8 + 0.1);
    src.onended = () => {
      src.disconnect();
      filt.disconnect();
      g.disconnect();
    };
  }
}
