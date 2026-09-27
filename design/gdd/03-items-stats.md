# 03 · 道具与属性系统 GDD

> 项目：Isaac-Roguelike
> 作者：文策渊（Vince Coyer）· 设计战略师
> 版本：v1.0
> 依赖：`00-concept.md`（支柱 P2 Build）、`02-combat.md`（第 8 节公式）
> 被依赖：`04-enemies-boss.md`（掉落表）、`05-ux-flow.md`（HUD 属性显示）

---

## 1. 系统概述
定义**六维属性的精确数值模型**、**属性叠加规则**、**道具规格表**、**掉落概率**与**眼泪变体系统**。本系统是支柱 P2（Build 化学爆炸）的落地载体：道具的价值不在于加数字，而在于**改变玩法**。

---

## 2. 六维属性模型（精确公式）

### 2.1 属性定义与基础值
| 属性 | 变量 | 基础值 | 单位 | 语义 |
|------|------|-------|------|------|
| 伤害 | `damage` | **3.5** | hp/发 | 单发眼泪伤害 |
| 射速 | `fireDelay` | **10** | frames | 两发之间最小帧间隔（越小越快） |
| 射程 | `range` | **6.5** | tiles | 子弹存活距离 |
| 弹速 | `shotSpeed` | **1.0** | 倍率 | ×基础弹速 320 px/s |
| 移速 | `speed` | **1.0** | 倍率 | ×基础移速 180 px/s |
| 幸运 | `luck` | **0** | 点 | 影响掉落/房间生成概率 |

### 2.2 计算顺序（关键 · 加法段 → 乘法段 → 钳制）
> **规则**：先结算所有**加法（additive）**修改，再结算**乘法（multiplicative）**修改，最后统一钳制。此顺序保证结果与道具拾取顺序**无关**（可交换性），避免"先拿谁更强"的隐藏最优解。

```js
// 对每个属性统一流程：
final = clamp( (base + Σ additive) × Π multiplicative, min, max )
```

### 2.3 各属性计算公式与钳制范围
```js
// ---- 伤害 ----
addCount = 道具中 damageAdd 之和              // 如 Cricket's Head +0.5, Blood of Martyr +1.0
mulCount = 道具中 damageMul 之积              // 如 Magic Mushroom ×1.5
damage   = clamp((3.5 + addCount) * mulCount, 0.5, 60.0)

// ---- 射速（注意：道具给的是"延迟修正量"，负值=更快）----
delayAdd = 道具中 fireDelayAdd 之和           // 如 Sad Onion -1, Number One -2（更负=更快）
delayMul = 道具中 fireDelayMul 之积           // 如 Soy Milk ×0.25
fireDelay = clamp((10 + delayAdd) * delayMul, 1, 60)   // 单位 frames，整数取整
fireRate  = 60 / fireDelay                    // 发/秒（派生，仅展示）

// ---- 射程 ----
range = clamp((6.5 + Σ rangeAdd) * Π rangeMul, 2.0, 30.0)     // tiles

// ---- 弹速 ----
shotSpeed = clamp((1.0 + Σ shotSpeedAdd) * Π shotSpeedMul, 0.4, 3.0)   // 倍率

// ---- 移速 ----
speed = clamp((1.0 + Σ speedAdd) * Π speedMul, 0.6, 2.0)      // 倍率

// ---- 幸运 ----
luck = clamp(0 + Σ luckAdd, -5, 15)           // 点
```

### 2.4 钳制上下限汇总表
| 属性 | 下限 | 上限 | 触底/触顶后果 |
|------|------|------|--------------|
| damage | 0.5 | 60.0 | 下限防"打不死"；上限防一枪秒 Boss |
| fireDelay | 1 帧 | 60 帧 | 1 帧=60发/s（引擎上限）；60 帧=1发/s |
| range | 2.0 tiles | 30.0 tiles | 下限防子弹瞬灭；上限防全屏清怪 |
| shotSpeed | 0.4 | 3.0 | 下限防悬停；上限防穿墙瞬移 |
| speed | 0.6 | 2.0 | 下限防寸步难行；上限防失控 |
| luck | -5 | 15 | 见掉落公式 |

---

## 3. 属性叠加规则（详细）

### 3.1 加法 vs 乘法分配原则
| 修改类型 | 用途 | 示例 |
|---------|------|------|
| **加法 (+X)** | 常规道具的线性增益 | Cricket's Head：damage +0.5 |
| **乘法 (×X)** | "质变型"强力道具 | Magic Mushroom：damage ×1.5 |
| **特性开关 (flag)** | 改变子弹行为，不涉及数值 | Brimstone：`variant='LASER'` |

### 3.2 叠加边界情况
1. **同一道具多次拾取**：MVP 中每个道具在单局内**只出现一次**（掉落池去重），故不处理重复叠加；增强层若允许多次拾取，则**加法道具可叠、乘法道具不叠**（保平衡）。
2. **乘法连乘溢出**：如 Magic Mushroom(×1.5) × Cricket's Body(×1.5) = ×2.25；仍受 2.4 钳制，安全。
3. **负数射程叠加**：Number One(-2 delay, -1 range) × Soy Milk(×0.25 delay)：
   `fireDelay = (10-2)*0.25 = 2 帧`；`range = 6.5-1 = 5.5`（钳制未触底）。
4. **伤害为 0 保护**：即使全部负数道具，`damage ≥ 0.5`，游戏始终可进行。
5. **射速=1 帧时的多重射击**：The Inner Eye(3发) × fireDelay=1 → 180 发/s，必须靠对象池 + 同屏子弹上限（64）渲染合并。
6. **属性面板显示**：显示为**整数/一位小数**，射速显示为"发/秒"（`60/fireDelay` 保留 1 位），避免玩家看到 `fireDelay=7.333` 的困惑。
7. **上限触发提示**：任一属性触及钳制边界时，HUD 对应条目**闪红边框**提示"已达上限"。

---

## 4. 道具规格表（16 个 · 含原作 ID）

> 稀有度：**C**=普通（房间/普通击杀）· **R**=稀有（宝箱/Boss）· **L**=传说（Boss/特殊房）
> 所有数值为**拾取单次**的修改量。`flag` 类改变子弹行为（见第 5 节）。

| # | 中文名 | 英文名 | 原作ID | 稀有度 | 数值改动 | 行为/外观改动 |
|---|--------|--------|-------|-------|---------|--------------|
| 1 | 洋葱 | The Sad Onion | c1 | C | `fireDelayAdd -1` | 无外观变化；屏幕右上显示道具图标 |
| 2 | 内眼 | The Inner Eye | c2 | R | `fireDelayAdd +3`（变慢） | **flag: MULTISHOT×3 扇形**；以撒多一只眼 |
| 3 | 弯勺 | Spoon Bender | c3 | R | 无 | **flag: HOMING**；眼泪带追踪弧线 |
| 4 | 蟋蟀的头 | Cricket's Head | c4 | R | `damageAdd +0.5`, `damageMul ×1.5` | **外观有变化（差异A·以 art-bible §2.1 为准）**：猫头轮廓+尖耳（三角底宽5高7）、头半径 r12→13（+8%）、竖瞳；眼泪变红略大 |
| 5 | 一号 | Number One | c6 | C | `fireDelayAdd -2`, `rangeAdd -1.0` | 眼泪变黄、射程短；以撒脸黄 |
| 6 | 殉道者之血 | Blood of the Martyr | c7 | R | `damageAdd +1.0` | **外观有变化（差异A·以 art-bible §2.1 为准）**：脸颊 3 条血痕（长4px/间隔2px/右倾20°）+ 头顶金环（r=9，描边2px） |
| 7 | 硫磺火 | Brimstone | c118 | L | `damageAdd ×3.0`（基础 3.5→约 10.5）, `fireDelayAdd +21`（变慢） | **flag: LASER**；射出血激光，蓄力→瞬发 |
| 8 | 吐根 | Ipecac | c149 | L | `damageAdd ×4.0`, `fireDelayAdd +10`, `rangeAdd -2.0` | **flag: LOB**；抛物爆炸弹（自杀风险） |
| 9 | 波吕斐摩斯 | Polyphemus | c169 | L | `damageAdd +14.0`（3.5→约17.5）, `fireDelayAdd +7`, `rangeAdd +1.0` | **flag: PIERCING**；巨型穿透眼泪 |
| 10 | 魔法蘑菇 | Magic Mushroom | c12 | R | 全属性小幅提升：`damageMul ×1.5`, `speedAdd +0.3`, `rangeAdd +0.5`, `shotSpeedAdd +0.1`, `luckAdd +1` | 以撒变大、头顶蘑菇帽 |
| 11 | 圣饼 | The Wafer | c108 | R | 无（乘算减伤） | **flag: DAMAGE_CAP=0.5**；所有伤害减至 0.5 心。**外观有变化（差异A·以 art-bible §2.1 为准）**：头顶白色薄饼环（rx=10 ry=3，描边2px） |
| 12 | 妈妈的刀 | Mom's Knife | c114 | L | `damageAdd +4.0`, `rangeAdd +3.0` | **flag: KNIFE**；发射近战飞刀不消耗（快） |
| 13 | 圣心 | Sacred Heart | c182 | L | `damageMul ×2.3`, `rangeAdd +1.0`, `shotSpeedAdd -0.4`, `luckAdd +2` | **flag: HOMING**；追踪巨型心形眼泪 |
| 14 | 科技 | Technology | c68 | L | `damageAdd +1.0`, `fireDelayAdd -1` | **flag: LASER（细）**；穿透激光直线 |
| 15 | 丘比特之箭 | Cupid's Arrow | c48 | R | 无 | **flag: PIERCING**；眼泪穿透敌人 |
| 16 | 变异蜘蛛 | Mutant Spider | c153 | L | `fireDelayAdd +6`, `damageAdd +1.0` | **flag: MULTISHOT×4**；四向散射 |
| 17 | 20/20 | 20/20 | c245 | R | `fireDelayAdd +2` | **flag: MULTISHOT×2**；双发平行 |
| 18 | 豆奶 | Soy Milk | c330 | L | `damageMul ×0.2`, `fireDelayMul ×0.25` | 极速小伤害；眼泪变小变白 |

> **核心 16 个（MVP 必做）**：1–16。17–18 为增强层候选（实现成本低，建议一并做以丰富 MultiShot 谱系）。
>
> **差异 A 裁定（v1.3 · 主理人游承峰裁决）**：道具的**角色外观变化**以 `design/art-bible.md` §2.1（以撒外观变体）为权威——用户核心需求明确要求道具改变「角色外观」。故 **c4 / c7 / c108** 从原「无外观」改为**有外观变化**（规格见上表，全部引用 art-bible §2.1 的量化参数）。此改动**纯视觉、零数值影响**，不影响平衡。其余道具有外观者同样以 art-bible §2.1 为准。

### 4.1 道具图标（交 art-director）
每个道具需要一个 **32×32 程序化图标**（Canvas path），风格与角色一致（粗黑描边 + 扁平填充）。图标语义：
- Sad Onion：紫洋葱圆 + 竖纹
- Brimstone：黑色恶魔头 + 红眼
- Ipecac：绿棕药瓶
- Magic Mushroom：红白斑点蘑菇
- Sacred Heart：粉色心形 + 光晕
- Mom's Knife：银灰刀片 + 棕柄
- …（详见 art-bible）

---

## 5. 眼泪变体系统（Tear Variant System · 本作最有辨识度的机制）

### 5.1 设计理念
不新增按键、不新增武器槽。**一个"发射"动作，按当前 `variant` 分发到不同投射物策略**。道具只是"换策略"，不是"加武器"。这正是原作 Build 化学的来源。

### 5.2 变体优先级与互斥
```js
// 优先级（高 → 低）。同一次拾取只保留最高优先级的"主变体"用于基础射击
// 但 MULTISHOT / HOMING / PIERCING 是"修饰器"，可与主变体叠加
PRIORITY = ['LASER', 'LOB', 'KNIFE', 'TEAR'];
MODIFIERS = ['MULTISHOT', 'HOMING', 'PIERCING'];
```
- **主变体互斥**：拿到 Brimstone（LASER）后再拿 Ipecac（LOB）→ 后者**覆盖**前者（LASER→LOB），或按"最后拾取者胜"（推荐，实现简单）。
- **修饰器可叠加**：`Brimstone + Inner Eye` = **三向激光**（原著名场面）；`Ipecac + Cupid's Arrow` = 穿透炸弹。

### 5.3 各变体规格
| 变体 | 生成物 | 速度 | 命中行为 | 特殊 |
|------|-------|------|---------|------|
| **TEAR** | 圆形态眼泪 | 320×shotSpeed px/s | 单体伤害，销毁 | 基础 |
| **LASER** | 矩形光束（宽 16px） | 瞬时（0.15s 显示） | 光束内所有敌**每帧**伤害 | 无视弹速；`range` 决定光束长度 = range×TILE px（TILE=32，见 `01-dungeon.md` §2.1） |
| **LOB** | 抛物线弹 | 初速 220 px/s + 重力 500 px/s² | 落地**爆炸**半径 48px，范围伤害 | 可摧毁岩石；贴脸自伤（玩家也在爆炸内则受伤） |
| **KNIFE** | 高速刀（宽 12px，长 40px） | 600 px/s | 穿透所有敌，每敌 1 次 | 射程极长；**回旋**属性可选（未来） |
| **HOMING（修饰）** | 在原变体上加追踪 | 原变体速度 | 每帧朝最近敌人转向（限 6°/帧） | 无敌人时直线 |
| **PIERCING（修饰）** | 原变体不销毁 | 原变体速度 | 穿透，每敌 1 次（hitSet） | 对同一敌不重复 |
| **MULTISHOT（修饰）** | 原变体 × N | 各发独立 | 每发独立结算 | 扇形夹角：N=2→0°（平行）、N=3→±8°、N=4→±12° |

### 5.4 关键组合示例（平衡验证）
| 组合 | 结果 | DPS 估算 | 是否失衡 |
|------|------|---------|---------|
| Sad Onion + Number One | fireDelay=(10-1-2)=7 帧 → 8.6发/s，range=5.5 | ~30 dmg/s | 否 |
| Brimstone + Inner Eye | 三向激光，单发 damage≈10.5×3 | 高爆发但 fireDelay≈31 帧 | 否（有代价） |
| Polyphemus + Cupid's Arrow | 巨型穿透泪 | 单发 17.5，穿透多敌 | 强但需精准 |
| Soy Milk + Ipecac | LOB 但 damage×0.2 且 fireDelay×0.25 | 连环小爆炸 | 有趣、非最强 |
| Brimstone + Sacred Heart + Magic Mushroom | 超大伤害追踪激光 | **潜在过强** | **标记：需实测，考虑给 LASER 加"无敌时间"或限制 length** |

> **设计红线检查**：Brimstone+Sacred Heart+Magic Mushroom 存在**主导策略**风险 → 建议对 LASER 加"每次发射后 0.1s 硬直"，或让 SACRED HEART 的 HOMING 对 LASER 不生效（激光本就有方向性）。**待用户裁决**（见第 9 节）。

---

## 6. 掉落系统（Drop Tables）

### 6.1 掉落类型
| 掉落物 | 说明 | 拾取效果 |
|--------|------|---------|
| 红心 | 恢复 1 红心（不超上限） | +1 HP |
| 硬币 | 增强层货币 | +1 coin |
| 钥匙 | 增强层开门 | +1 key |
| 道具 | 改变 Build | 拾取即生效 |
| 炸弹 | 增强层消耗品 | +1 bomb |

### 6.2 普通击杀掉落表
```
每次击杀掷骰（分母 = 100）：
  红心：   基础 6%，每 +1 luck 加 0.5%，上限 20%
  硬币：   基础 15%（增强层）
  钥匙：   基础 3%（增强层）
  道具：   基础 1%，每 +1 luck 加 0.1%（极稀有）
  无掉落： 其余
```
公式：
```js
p(item) = clamp(base + luck * perLuck, 0, cap)
// 例：红心 p = clamp(0.06 + luck*0.005, 0, 0.20)
```

### 6.3 Boss 掉落
```
击败 Boss 必掉：
  1) 1 个道具（从道具池按稀有度加权抽取，L 概率 40%，R 60%）
  2) 1 个红心（固定）
  3) 若为层末 Boss → 额外掉落"下楼梯"
```

### 6.4 宝箱房掉落
```
宝箱（增强层）：
  1 个道具（R 70% / L 30%）
  50% 追加 1 个红心
```

### 6.5 道具池去重
- 单局内每个道具 id **只掉落一次**；抽取时从"未出现池"中抽。
- 池耗尽时 → 改为掉落红心。

---

## 7. 边缘情况（Edge Cases）

1. **道具池耗尽**：→ 全部改掉红心（保证不空箱）。
2. **血量已满拾取红心**：不拾取（保留在地上），或转为"半心容器"（增强层）。
3. **Brimstone 蓄力期间受击**：激光照常发射（不中断），受击无敌帧给保护。
4. **Ipecac 爆炸伤己**：玩家在 48px 爆炸半径内 → 受 1 心伤害；无敌帧正常生效（不能靠连爆自杀无敌帧）。
5. **Wafer + 接触伤害**：接触伤害被减至 0.5 心 → 需支持"半心"显示（半红心）。
6. **LASER 与障碍物**：激光可穿透岩石（原作行为）；但被墙阻挡（墙壁不穿透）。
7. **KNIFE 回旋**：MVP 无回旋，刀飞至射程终点后**直接消失**（非返回）。
8. **MULTISHOT 与 LASER 同帧**：三向激光 = 3 束独立光束，各自 `range` 长度。
9. **同一帧拾取两道具**：按拾取顺序结算（加法段合并后统一算，结果与顺序无关，见 2.2）。
10. **属性钳制边界提示**：见 3.2-7。

---

## 8. 验收标准
- [ ] 六维公式给出确定值，示例：基础 damage=3.5，拾取 Cricket's Head → (3.5+0.5)×1.5 = 6.0。
- [ ] 属性结果与道具拾取顺序无关（可交换性测试）。
- [ ] Brimstone 单独拾取 DPS 略高于基础（有代价的爆发）。
- [ ] 三向激光（Brimstone+Inner Eye）可正常清房，无穿透 Bug。
- [ ] 掉落概率用固定 seed 可复现。
- [ ] 未出现道具不重复掉落。

## 9. 待用户审批项
1. **道具数量**：MVP 16 个是否足够？（建议含 17–18 = 18 个，成本低、谱系完整）。
2. **主导策略处理**：Brimstone+Sacred Heart+Magic Mushroom 组合是否需削弱？推荐方案见 5.4。
3. **幸运上限**：`luck` 上限 15 是否合适？影响掉落与未来房间生成。
4. **主动道具**：MVP 是否引入（如 The Battery c63 / 9 Volt c116 对应的主动道具槽）？默认 MVP 不做主动道具。

## 10. 依赖与接口
- **上游**：`02-combat.md`（公式、投射物接口）。
- **下游**：`04-enemies-boss.md`（掉落表引用 6.2/6.3）；`05-ux-flow.md`（HUD 显示六维 + 道具栏）。
- **接口契约（给程基岩）**：
  ```js
  const ITEMS = [ { id:'c118', name:'Brimstone', rarity:'L',
                    mods:{ damageMul:3.0, fireDelayAdd:21 },
                    flags:{ variant:'LASER' }, icon:'brimstone' }, ... ];
  function applyItem(player, item)   // 更新 player.mods 累加器 → 重算 stats
  function recomputeStats(base, mods) // 见 2.3 公式，纯函数
  function rollDrop(luck, kind)       // 见 6.2，返回掉落物或 null
  ```
