# 02 · 战斗系统 GDD

> 项目：Isaac-Roguelike
> 作者：文策渊（Vince Coyer）· 设计战略师
> 版本：v1.0
> 依赖：`00-concept.md`（支柱 P1 手感）、`01-dungeon.md`（坐标常量）
> 被依赖：`03-items-stats.md`（属性 → 战斗参数映射）、`04-enemies-boss.md`（敌人受击/伤害）、`05-ux-flow.md`（输入映射）

---

## 1. 系统概述
定义玩家移动、眼泪发射、伤害判定、受击反馈、输入映射。本系统是**支柱 P1（手感优先）的落地载体**——所有数值以"响应快、反馈强、公平"为准绳。

---

## 2. 帧率与时间步

| 参数 | 值 | 说明 |
|------|-----|------|
| 逻辑帧率 | **60 Hz**（固定步长 16.667ms） | 所有帧数型参数基于此 |
| 渲染 | requestAnimationFrame，插值 | 逻辑与渲染解耦，保证不同刷新率一致性 |
| 时间步实现 | 累加器模式（固定 dt） | `while(acc >= STEP){ update(STEP); acc -= STEP; }` |

```js
const STEP = 1 / 60;  // 固定逻辑步长（秒）
const FPS  = 60;
```

> **注意**：以撒原作的"射速"以**帧延迟**表达，本作沿用帧数（便于与属性系统对齐），单位标注为 **frames @60fps**。

---

## 3. 玩家移动（手感核心）

### 3.1 参数表（单位：px/s、px/s²）
| 参数 | 推荐值 | 区间 | 说明 |
|------|-------|------|------|
| `BASE_MAX_SPEED` | **180 px/s** | 160–200 | 移速=1.0 倍率时的基础最大速 |
| `ACCEL` | **1200 px/s²** | 900–1500 | 加速度（达到最大速约 0.15s） |
| `FRICTION` | **1600 px/s²** | 1200–2000 | 无输入时减速度（停止约 0.11s） |
| `STOP_EPSILON` | 5 px/s | — | 低于此速度直接归零，防抖动 |
| 对角线归一化 | 是 | — | 斜向速度 = `MAX_SPEED`（非 ×1.414），否则斜走作弊 |
| 玩家碰撞半径 | **14 px** | 12–16 | 圆形碰撞 |
| 受击击退速度 | **220 px/s** | 180–280 | 衰减至 0（约 0.2s） |

### 3.2 移动模型（帧更新）
```js
// dir: 归一化输入向量 {x,y}，|dir| ∈ [0,1]
const maxSpeed = BASE_MAX_SPEED * stats.speedMul;   // stats.speedMul 见 03-items-stats.md
if (|dir| > 0) {
  vx += dir.x * ACCEL * dt;
  vy += dir.y * ACCEL * dt;
  // 钳制到 maxSpeed（沿速度方向）
  clampSpeed(v, maxSpeed);
} else {
  // 摩擦减速
  const sp = |v|;
  const ns = Math.max(0, sp - FRICTION * dt);
  v = |v|>0 ? v * (ns/sp) : v;
  if (ns < STOP_EPSILON) v = {x:0, y:0};
}
pos += v * dt;
```
- **手感要点**：`ACCEL` 高 + `FRICTION` 高 = "跟手、刹得住"。避免低速漂移。
- **撞墙**：按轴分离解决（AABB 分轴），撞墙时该轴速度归零，不丢失另一轴。

### 3.3 移速属性映射
```
maxSpeed = 180 * speedMul          // speedMul 默认 1.0
speedMul ∈ [0.6, 2.0]              // 上下限钳制（见 03-items-stats.md）
```
> 原作移速约 1.0 对应 ~0.85 格/帧，本作取 180 px/s（=4.5 tile/s）作为基准，手感接近原作。

---

## 4. 眼泪 / 投射物系统

### 4.1 参数基线（属性未加成时）
| 参数 | 变量 | 基础值 | 单位 | 说明 |
|------|------|-------|------|------|
| 伤害 | `damage` | **3.5** | hp | 原作基准 |
| 射速延迟 | `fireDelay` | **10** | frames | 越小越快；原作基准 ~10 帧 |
| 射程 | `range` | **6.5** | tiles | 子弹存活距离 |
| 弹速 | `shotSpeed` | **1.0** | 倍率 | ×基础弹速 |
| 基础弹速 | `BASE_SHOT_SPEED` | **320 px/s** | px/s | 实际弹速 = 320 × shotSpeed |
| 子弹半径 | `projRadius` | **8 px** | px | 碰撞圆 |
| 子弹存活 | `projLifetime` | `range*TILE/ (320*shotSpeed)` 秒 | s | 由射程与弹速共同决定（TILE=32，见 `01-dungeon.md` §2.1） |

**射程→存活时间公式**：
```
lifetime = (range * TILE) / (BASE_SHOT_SPEED * shotSpeed)
         = (range * 32) / (320 * shotSpeed)
默认 = 6.5 * 32 / 320 = 0.65 s
```
- 即子弹在默认射程下飞行约 0.65s（≈ 6.5 格）后消失，视觉上表现为"眼泪飞一段就散掉"。

### 4.2 发射机制
```js
// 每帧对每个射击方向检查
fireCooldown -= 1;                       // 单位：帧
if (shootInput && fireCooldown <= 0) {
  spawnTear(playerPos, aimDir, currentStats);
  fireCooldown = fireDelay;              // = 10 帧基础，受射速属性影响
}
```
- **基础 DPS** = `damage / (fireDelay / 60)` = `3.5 / (10/60)` = **21 dmg/s**。
- 射速属性通过**降低 `fireDelay`** 实现（见 03）。射速上限：`fireDelay ≥ 1` 帧。

### 4.3 四方向射击 vs 摇杆瞄准
- **键盘**：方向键（↑↓←→）产生**四方向**射击向量；同时按两键 → 斜向（8 向）。**移动（WASD）与射击（方向键）完全独立**——这是以撒"双摇杆"的核心。
- **摇杆（移动端）**：右摇杆产生任意角度射击向量（连续 360°）。无输入时朝"最后瞄准方向"或"移动方向"（可选辅助开关）。
- **鼠标（可选增强）**：朝鼠标位置射击（需另开启，破坏原版对称性，非默认）。

**输入到射击向量**：
```js
// 键盘
aim = normalize({ x: (right?1:0)-(left?1:0), y: (down?1:0)-(up?1:0) });
// 摇杆
aim = normalize(stickVector) if |stickVector| > DEADZONE(0.25) else null;
```

### 4.4 伤害判定
- **命中检测**：圆-圆碰撞 `dist(proj, target) < projRadius + target.hitRadius`。
- **伤害流程**：命中 → 目标 HP -= damage → 目标进入 `hurt`（闪白 6 帧）→ 生成命中粒子 → 目标受击击退（速度 = `damage * 6 px/s`，上限 300）→ 子弹销毁（除非穿透属性）。
- **穿透**：`piercing=true` 时子弹命中后不销毁，但对同一目标**每颗子弹只结算一次**（维护 `hitSet`）。
- **无敌帧（目标）**：敌人受击后 **无**无敌帧（可被连射快速击杀，符合原作）；**玩家**受击后有无敌帧（见 5.1）。

### 4.5 投射物变体（详见 03-items-stats.md）
本系统提供**可插拔的投射物策略**，由道具切换：
| 变体 | 行为 | 触发道具（原作ID） |
|------|------|------------------|
| `TEAR`（默认） | 直线飞行、单发 | 无 |
| `LASER` | 瞬时直线光束，持续多帧，命中即结算 | Brimstone(c118), Technology(c68) |
| `LOB` | 抛物线抛射，落地爆炸范围伤害 | Ipecac(c149) |
| `HOMING` | 追踪最近敌人 | Spoon Bender(c3), Sacred Heart(c182) |
| `KNIFE` | 近战飞刀，高速直线，穿透 | Mom's Knife(c114) |
| `MULTISHOT` | 单次发射多发（扇形/排） | The Inner Eye(c2), Mutant Spider(c153), 20/20(c245), Soy Milk(c330) |

---

## 5. 受击与反馈（Juice）

### 5.1 玩家受击
| 参数 | 值 | 说明 |
|------|-----|------|
| 无敌帧时长 | **60 帧（1.0s）** | 受击后 1s 不可再受伤 |
| 闪白 | 每 6 帧切换 1 次（共 60 帧内闪 10 次） | 无敌期视觉提示 |
| 击退 | 速度 220 px/s，方向 = 受击来源反方向 | 0.2s 衰减 |
| 屏幕震动 | 幅度 6 px，持续 12 帧 | 方向随机 |
| 扣血 | −1 红心 | 红心 ≤ 0 → 死亡 |
| 音效（增强） | 短促"哎哟"+ 低音 | — |

### 5.2 敌人受击
| 参数 | 值 |
|------|-----|
| 闪白 | 6 帧纯白覆盖 |
| 击退 | `min(damage*6, 300)` px/s，方向 = 子弹飞行方向 |
| 受击粒子 | 3–5 个血滴粒子（Canvas 小圆），存活 0.3s |
| 死亡 | 播放 8 帧"爆浆"动画 + 屏幕震动 4px/8帧 |

### 5.3 屏幕震动系统
```js
shake = { magnitude: 0, decayPerFrame: 0.85 };
function addShake(mag) { shake.magnitude = Math.max(shake.magnitude, mag); }
// 每帧渲染前：ctx.translate(rand(-mag,mag), rand(-mag,mag))
// 更新：shake.magnitude *= 0.85; if (<0.3) =0
```
| 事件 | 震动幅度 |
|------|---------|
| 玩家受击 | 6 px |
| 敌人死亡 | 4 px |
| Boss 跳跃落地 | 14 px |
| Boss 受击 | 5 px |

### 5.4 命中停顿（Hit Stop · 可选增强）

- 大伤害命中（damage ≥ 20，如 Polyphemus）时**暂停逻辑 4 帧**（不影响渲染），强化"重击感"。MVP 可省略。

### 5.5 战斗可访问性契约（对齐 `design/accessibility.md` §3）

> 本节回应可访问性专员林绘澄在 `accessibility.md` 中定义的**核心契约**（本作选定级别 **Standard + 1 项 Comprehensive 加配**），其中 2 项直接影响战斗数值设计：

**（1）「降低弹幕密度/速度」辅助模式（Comprehensive 加配 · 唯一加配项）**
> 定义（`accessibility.md` §3 第 13 行）：敌人子弹速度 ×0.7、Boss 预告帧 +30%。

| 影响对象 | 默认值 | 辅助模式 | 实现 |
|---------|-------|---------|------|
| 敌方弹速（Pooter/Horf/Monstro 弹幕） | 100% | **×0.70** | 在敌人子弹生成的 `speed` 上乘 `ASSIST.bulletSpeedMul` |
| Boss 预告帧（Monstro 蓄力） | 基础 | **×1.30** | 在 `04-enemies-boss.md` 的蓄力帧数乘 `ASSIST.telegraphMul` |
| 玩家自身子弹 | 不变 | **不变** | 只降敌方，不削弱玩家输出 |

```js
const ASSIST = { bulletSpeedMul: 1.0, telegraphMul: 1.0 }; // 默认关闭
// 开启辅助：ASSIST.bulletSpeedMul = 0.7; ASSIST.telegraphMul = 1.3;
// 敌人子弹生成： proj.speed = baseSpeed * ASSIST.bulletSpeedMul;
// Boss 蓄力：      chargeFrames = baseChargeFrames * ASSIST.telegraphMul;
```
**对难度曲线的影响评估**：辅助模式**不破坏** `00-concept.md` §6 心流曲线设计——它按比例降低**敌方威胁的施加速率**，但不改变房间配置、敌人数量、Boss 阶段阈值与玩家成长曲线。心流曲线描述的是"压力相对关系"（房间→Boss 递增），等比降速后该相对关系**保持不变**，只是整体平移向更宽松的绝对难度。**结论：可通过，不破坏曲线设计。**

**（2）形状冗余（不靠颜色单通道）**
> `accessibility.md` §4 要求：关键信息必须有形状/亮度冗余通道。

| 战斗信息 | 原始通道 | 本作形状冗余（已满足） |
|---------|---------|----------------------|
| 玩家子弹类型 | 颜色 | 泪=**圆** / 刀=**长条** / 激光=**细线**（`03` §5.3 已定义各异形状） |
| 敌方弹幕（Pooter/Horf） | 颜色 | 敌方弹=**实心圆**且尺寸大于玩家泪（r=7 vs 5）；与玩家泪可辨 |
| Boss 攻击预告 | 变红 | Monstro **张嘴**（形状变化）而非仅变色（`04` §3.5 / art-bible §2.4） |
| 敌人受击/无敌 | 闪白 | 受击=**闪白**（亮度通道），非颜色 |
| 玩家生命 | 红色 | 心形**形状**区分满/半/空（`05` §4.1 / art-bible §2.7） |

**结论**：本作战斗系统的所有关键信息均满足"形状或亮度可辨"，**不依赖颜色单通道**，通过 `accessibility.md` §4 契约。

**（3）其他战斗相关契约映射**
| 契约项 | 战斗系统落地 |
|-------|-------------|
| 屏幕震动开关（三档 开/减弱/关） | `02` §5.3 各事件震幅乘 `SHAKE.scale`（开=1.0 / 减弱=0.33 / 关=0） |
| 闪烁/强光开关 | `02` §5.2 敌人受击闪白在"关闭"档改为**仅轮廓描边闪白**，不做全屏白闪；全屏白闪频率 ≤3 次/秒、alpha ≤0.6 |
| 按键重映射 | `02` §6 输入全部走逻辑动作名，映射表可存 localStorage 覆盖（见 `05` §8） |
| 暂停 | `02` §9 边缘情况 8：暂停冻结所有帧计时器（含敌人攻击 CD） |

---

## 6. 输入映射（完整表）


> 详细 UX/触摸热区见 `05-ux-flow.md`；此处只定义**逻辑输入 → 游戏动作**。

| 逻辑动作 | 键盘 | 移动端 | 备注 |
|---------|------|-------|------|
| 移动 上/下/左/右 | W / S / A / D | 左虚拟摇杆（连续） | 8 向基于键盘 |
| 射击 上/下/左/右 | ↑ / ↓ / ← / → | 右射击按钮 + 摇杆 | 独立于移动 |
| 暂停 | Esc / P | 屏幕暂停键 | 弹出暂停菜单 |
| 重开（死亡界面） | R | 点击按钮 | — |
| 确认/菜单导航 | Enter / 方向键 | 触摸 | — |
| 主动道具使用（增强） | Space | 屏幕按钮 | MVP 无主动道具 |

**按键去抖与合并规则**：
- 键盘 `keydown/keyup` 维护 `keys` 集合；用 `e.code`（`KeyW` 等）而非 `e.key`（避免大小写/输入法问题）。
- 阻止方向键滚动：对 ↑↓←→ 调用 `e.preventDefault()`。

---

## 7. 敌人 AI 模式分类（框架层）

> 具体敌人规格见 `04-enemies-boss.md`；此处定义**复用行为模块**。

| 模式 | 代码标识 | 行为 | 代表性敌人 |
|------|---------|------|-----------|
| 追击型 | `CHASER` | 朝玩家当前位置直线移动，无攻击 | Gaper, Clot, Mulligan |
| 远程型（移动） | `KITER` | 与玩家保持距离并射击（若飞行则无视地面障碍） | Pooter, Boom Fly |
| 射击型（静止） | `TURRET` | 不移动，间隔朝玩家吐弹 | Horf |
| 跳跃型 | `JUMPER` | 蓄力→跳向玩家→落地伤害/落地后攻击 | Monstro, Hopper |
| 飞行型 | `FLYER` | 无视坑洞/岩石，飘忽移动 | Fly, Boom Fly |
| 分裂型 | `SPLITTER` | 死亡时分裂成 2 个更小单位 | （增强层） |
| 冲撞型 | `CHARGER` | 蓄力后沿直线冲锋 | （增强层） |

**AI 通用状态机**：
```
IDLE ──(检测到玩家)──▶ ACTIVE ──(进入攻击范围/冷却好)──▶ ATTACK
  ▲                                                      │
  └────────────────(攻击结束)───────────────────────────┘
受击：任意状态 ──▶ HURT(6帧) ──▶ 返回原状态
HP<=0：任意状态 ──▶ DYING(8帧) ──▶ 移除 & 掉落判定
```
- **激活规则**：进入房间即全部 `ACTIVE`（原作行为），不设"睡眠"。
- **攻击冷却**：每敌人独立计时器，避免同帧齐射（可加 ±2 帧随机抖动）。

---

## 8. 数据与公式汇总

```js
// 玩家
damage        = base(3.5)  × damageMul            // 见 03
fireDelay     = base(10)   / fireRateMul          // 取整，下限 1 帧
range         = base(6.5)  × rangeMul             // tiles
shotSpeed     = base(1.0)  × shotSpeedMul         // 倍率
speedMul      = 1.0        × speedItemMul         // 钳制 [0.6,2.0]
luck          = 0          + luckAdd              // 见 03

// 派生
DPS           = damage / (fireDelay/60)
tearLifetime  = range * TILE / (320 * shotSpeed)    // 秒（TILE=32）
实际射程(px)   = range * TILE
```

---

## 9. 边缘情况（Edge Cases）

1. **射速极快（Soy Milk 类）**：`fireDelay` 最小 1 帧；子弹生成速率≥60/s 时需**对象池**复用子弹，避免 GC 卡顿。若同帧子弹数 > 64 → 合并渲染。
2. **射程趋近 0（Number One 叠加）**：`range` 下限钳制 **2.0 tiles**，否则子弹出即消失、体验崩坏。
3. **弹速极低**：`shotSpeed` 下限 **0.4**，否则子弹原地悬停像"掉帧"。
4. **玩家与敌人重叠**：玩家接触伤害（contact damage）每敌人独立判定，但因玩家有无敌帧，1s 内最多掉 1 心。
5. **子弹同时命中多敌（穿透）**：保护 `hitSet`；穿透子弹对同一敌仅 1 次伤害。
6. **对角斜射**：8 向斜向子弹正常；子弹方向归一化，斜向不加速。
7. **无敌帧内叠加受击**：忽略，不消耗、不重置计时（不延长无敌）。
8. **暂停时计时器**：暂停必须冻结所有帧计时器与 RNG，避免暂停作弊或状态错乱。
9. **窗口失焦**：`visibilitychange` 时自动暂停。
10. **Boss 死亡时玩家在无敌帧**：正常结算掉落与开门。

---

## 10. 待用户审批项
1. **屏幕震动强度**：是否接受受击 6px 震动？敏感用户可能不适（可访问性：提供"关闭震动"开关，见 `05-ux-flow.md`）。
2. **鼠标瞄准**：是否作为可选输入加入？（默认为纯键盘双摇杆，更贴近原作）。
3. **Hit Stop**：是否纳入 MVP？（默认省略）。
4. **射击辅助**：移动端是否默认开启"朝最近敌人微调"？（建议默认开，可关）。

## 11. 依赖与接口
- **上游**：`01-dungeon.md`（TILE、房间坐标、门坐标）。
- **下游**：`03-items-stats.md` 通过本文件第 8 节公式把属性转为战斗参数；`04-enemies-boss.md` 消费受击/伤害/掉落接口。
- **接口契约（给程基岩）**：
  ```js
  createPlayer(x,y) -> Player           // 含 stats 对象
  fireProjectile(origin, dir, stats, variant)
  applyDamage(target, amount, knockbackDir)
  addShake(magnitude)
  // Player 暴露只读统计：{ damage, fireDelay, range, shotSpeed, speedMul, luck, variant }
  ```

## 12. 验收标准
- [ ] 玩家加速到最大速 ≤ 0.2s；松开后 ≤ 0.15s 停止。
- [ ] 键盘同时按 WASD 与方向键互不干扰（边测试）。
- [ ] 默认 DPS ≈ 21；连续射击无卡顿（≥100 子弹同屏 ≥55fps）。
- [ ] 玩家受击后 1.0s 内不再掉血。
- [ ] 穿透子弹对单敌只结算一次。
- [ ] 暂停冻结所有计时器。
