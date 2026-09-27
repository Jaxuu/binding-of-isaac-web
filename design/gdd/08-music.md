# 08 · 逐层配乐规格（程序化合成）

> 记录本作配乐系统的设计：12 层各一曲、原创合成、并实现原作的「加重变体」机制。
> 代码落点：`src/core/music.js`（配乐引擎）、`src/core/audio.js`（配乐总线）。

---

## 1. 设计约束

| 约束 | 说明 |
|---|---|
| **零音频素材** | 项目定位「零图片/音频素材」，所有音符由 Web Audio 实时合成，不加载任何 `.mp3/.wav` |
| **零依赖** | 只用 `OscillatorNode` / `BiquadFilterNode` / `GainNode` / `AudioBufferSourceNode` |
| **版权安全** | **不包含、不还原**任何原作旋律或音频。调式、速度、根音、音色、节奏型均为**原创设计**；仅在「情绪取向 + 加重乐器」层面对原作做致敬性对应 |
| **确定性友好** | 调度由 `GameState.update`（固定 60Hz）驱动，**不使用 `setInterval`**，便于暂停/测试；音频本身不参与游戏逻辑，不影响可复现性 |
| **静音可控** | 音效与配乐走独立总线（`master` / `musicGain`），`M` 键统一静音 |

---

## 2. 参考来源（联网检索）

《以撒的结合：重生 / 忏悔》原声由 **Ridiculon** 创作。Wiki 给出的两条关键事实：

1. **每层一首主曲**（如 Basement = *Diptera Sonata*、Catacombs = *Capiticus Calvaria*、
   Womb = *Viscera*、Sheol = *Duress*、Cathedral = *Everlasting Hymn*、Chest = *Sketches of Pain*）。
2. **「加重变体」机制**：多数主楼层曲目在**房间内敌人/Boss 足够多时**切换到加重变体，
   Wiki 逐层标注了叠加的乐器 —— **吉他 / 低音吉他 / 鼓 / 环境音效 / 背景合唱**。

> 本作照此实现第 2 条：`music.setCombat(room.hasLiveEnemies)` 控制加重层的开关。

---

## 3. 楼层 ↔ 曲目 ↔ 加重乐器

| 层 | 曲目（致敬命名） | 调式 | BPM | 根音 | 鼓组 | 加重乐器 |
|---|---|---|---|---|---|---|
| B1 地下室 | Diptera Sonata | minor | 96 | A2 110.0 | soft | guitar |
| B2 地窖 | Periculum | dorian | 104 | D2 73.42 | soft | guitar |
| B3 洞穴 | Sodden Hollow | phrygian | 88 | E2 82.41 | soft | **bass** |
| B4 地下墓穴 | Capiticus Calvaria | harmonicMinor | 112 | C2 65.41 | medium | guitar |
| B5 深处 | Abyss | locrian | 72 | F1 43.65 | none | **ambient** |
| B6 大墓地 | When Blood Dries | phrygian | 100 | B1 61.74 | medium | guitar |
| B7 子宫 | Viscera | minor | 84 | G1 49.0 | **heart** | drums |
| B8 子宫内 | Viscera (Utero) | harmonicMinor | 94 | G#1 51.91 | **heart** | drums |
| B9 阴间 | Duress | phrygian | 122 | A1 55.0 | heavy | drums |
| B10 大教堂 | Everlasting Hymn | lydian | 76 | C3 130.81 | none | **choir** |
| B11 宝箱 | Sketches of Pain | dorian | 108 | D3 146.83 | medium | guitar |
| B12 黑暗房间 | Devoid | wholeTone | 64 | C2 65.41 | none | ambient |

> **B12 的说明**：Wiki 未标注 Dark Room 曲目的加重变体（记为「—」）。本作为了战斗反馈的一致性，
> 补了一层**低频嗡鸣 + 噪声涌动**（标记为 `ambient`）—— 这是一处**有意的设计偏离**，已在代码注释中标明。

---

## 4. 音轨结构

每首曲子由 4 个声部叠加，**8 分音符网格**（每小节 8 格）：

| 声部 | 触发规则 | 波形 |
|---|---|---|
| **低音 bass** | `bassPat`：`x`=和弦根音 / `5`=五度 / `3`=三度 / `.`=休止 | `bassWave` |
| **铺垫 pad** | 每小节第 0 格，奏和弦三音（根/三/五），持续整小节 | `padWave` |
| **主旋律 lead** | `arpPat`：`.`=休止，`0`..`6`=音阶级数（+`arpOct` 八度） | `leadWave` |
| **鼓组 drums** | `none` / `soft` / `medium` / `heavy` / `heart`（心跳：每小节两下「咚—咚」） | 合成鼓 |

**和弦进行** `prog` 为 4 小节循环（音阶级数数组，如 `[0, 5, 3, 4]`）。

**加重层**（`combat`）在敌人存活时叠加：

| 加重乐器 | 实现 |
|---|---|
| `guitar` | 反拍强力和弦：两层 ±7 音分失谐锯齿 + 低通（2400Hz），6/8 格触发 |
| `bass` | 低音吉他 8 分推进（根音低一个八度） |
| `drums` | 通鼓（第 3/7 格）+ 高频镲 |
| `choir` | 正弦簇（根/五/八度）长音，0.5s 慢起音 |
| `ambient` | 低频正弦嗡鸣 + 低通扫频噪声涌动 |

**氛围层**：`ambience > 0.3` 的曲目（Abyss / Cathedral / Dark Room）每小节叠加一次
带通/低通扫频的噪声涌动，营造空旷感。

---

## 5. 时序与生命周期

```
GameState.update(dt)  ──►  MusicPlayer.update()
                             │  前瞻调度：把 currentTime + 0.12s 内的音符排进音频时间轴
                             └─ 步长 = 60 / bpm / 2（8 分音符）
```

| 事件 | 行为 |
|---|---|
| `generateFloor(n)` | `music.play(n)` —— 切到该层曲目（音频未解锁时暂存，解锁后自动开播） |
| 每帧 `_updatePlaying` | `music.setCombat(room.hasLiveEnemies)` |
| `gotoScene(PAUSED)` | `music.setPaused(true)`（停止推进节拍） |
| `gotoScene(PLAYING)` | `music.setPaused(false)` |
| `gotoScene(TITLE/DEAD/WIN)` | `music.stop()` |
| `gotoScene(FLOOR_INTRO)` | 保持播放（换层时已切曲） |
| 按 `M` | `audio.toggleMuted()`（`master.gain = 0`，音效与配乐同时静音） |

**节点回收**：每个音符用完即 `disconnect()`。注意 `GainNode` / `BiquadFilterNode`
**没有 `onended` 事件**，所以强力和弦把回收统一挂到最后一个 `OscillatorNode` 上，
否则这些节点会长期留在音频图上累积成泄漏。

---

## 6. 验收（实跑，非引用）

| 项 | 方法 | 结果 |
|---|---|---|
| 12 层均能出声 | 在 `audio.master` 挂 `AnalyserNode` 采样时域 RMS | 12/12 层 peak 0.015–0.047 ✅ |
| 12 层曲目互不相同 | 曲目名集合去重 | 12 个 ✅ |
| 加重变体生效 | 空房 vs 有敌房各采样 2 小节 RMS | `0.0190 → 0.0196`（avg）、`0.0304 → 0.0351`（peak）✅ |
| 静音可用 | 按 M 后采样 | `avg = 0.0000`、`masterGain = 0` ✅ |
| 无页面错误 | 控制台监听 | 0 ✅ |
| 逻辑单测 | `node tests/run-tests.mjs` | 114/114（含 7 项配乐断言）✅ |

> 验证脚本：`tests/_verify-music.mjs`（一次性探针，不入库）。
> **关键教训**：音量表必须挂在 `master`（真正送往扬声器的节点）而非 `musicGain`（上游），
> 否则「静音是否生效」根本测不出来；采样窗口须覆盖**完整小节**，否则小节相位会淹没差异。
