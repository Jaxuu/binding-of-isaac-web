# 07 · 内容扩展规格（12 层 / 12 Boss / 19 小怪 / 58 道具）

> 本文档记录本次内容扩展的设计规格，作为实现与验收的**单一事实来源**。
> 设计参考：《以撒的结合：重生 / 忏悔》的章节体系、怪物原型与道具命名（联网检索，
> 见文末「参考资料」）。
>
> 代码落点：`src/systems/floors.js`（楼层）、`src/entities/boss.js`（Boss）、
> `src/entities/enemy.js`（小怪）、`src/entities/items.js`（道具）。

---

## 1. 设计原则

| 原则 | 说明 |
|------|------|
| **主题区分度** | 每层地板/墙体/环境光/装饰母题/障碍材质各不相同，玩家不看 HUD 也能靠视觉判断所处章节 |
| **Boss 专属** | 每层一个 Boss，模型、技能池、弹幕外观、阶段曲线均独立，不使用换色复用 |
| **行为原型** | 小怪按「追击 / 射击 / 冲锋 / 跳跃 / 召唤 / 伏击 / 激光 / 爆炸 / 分裂 / 重生」十大原型归并，同类共用 AI 骨架但参数与外观不同 |
| **属性覆盖** | 道具必须覆盖攻击力、攻速（射速）、血量、移速、射程、弹速六大属性，外加攻击方式改写类 |
| **数值可控** | 所有属性经 `stats.js` 的 `base×mult+flat` 模型重算，并有硬上下限，避免叠爆 |

---

## 2. 楼层（12 层）

顺序参照原作章节：地下室 → 地窖 → 洞穴 → 地下墓穴 → 深处 → 大墓地 →
子宫 → 子宫内 → 阴间 → 大教堂 → 宝箱 → 黑暗房间。

| # | id | 名称 | 视觉主题 | 装饰母题 | 障碍材质 | 专属 Boss | 血量倍率 |
|---|----|------|----------|----------|----------|-----------|----------|
| 1 | basement | 地下室 Basement | 暖褐砖地 | 碎石骨堆 | rock / poop | Monstro | ×1.00 |
| 2 | cellar | 地窖 Cellar | 深褐昏暗 | 碎石骨堆 | rock / poop | Larry Jr. | ×1.18 |
| 3 | caves | 洞穴 Caves | 土黄岩地 | 碎石骨堆 | rock / bone | Chub | ×1.36 |
| 4 | catacombs | 地下墓穴 Catacombs | 灰白石室 | 头骨骸骨 | bone / rock | Gurdy | ×1.54 |
| 5 | depths | 深处 Depths | 冷蓝石地 | 碎石骨堆 | bone / rock | The Duke of Flies | ×1.72 |
| 6 | necropolis | 大墓地 Necropolis | 紫色墓室 | 头骨骸骨 | bone / rock | Fistula | ×1.90 |
| 7 | womb | 子宫 Womb | 暗红肉膜 | 肉膜血管 | flesh / rock | Mom | ×2.08 |
| 8 | utero | 子宫内 Utero | 深红血肉 | 肉膜血管 | flesh / rock | Mom's Heart | ×2.26 |
| 9 | sheol | 阴间 Sheol | 暗红岩浆 | 裂缝火光 | bone / rock | Satan | ×2.44 |
| 10 | cathedral | 大教堂 Cathedral | 白灰圣殿 | 金色圣光 | bone / rock | Isaac | ×2.62 |
| 11 | chest | 宝箱 Chest | 暗金宝库 | 金色圣光 | rock / poop | ??? (Blue Baby) | ×2.80 |
| 12 | darkroom | 黑暗房间 Dark Room | 浓黑幽暗 | 头骨骸骨 | bone / rock | The Lamb | ×3.00 |

**每层敌人池**（值为抽取权重，见 `floors.js`）：

| 层 | 敌人池 |
|----|--------|
| 1 | gaper 3 / pooter 3 / horf 1 / attackFly 1.2 |
| 2 | gaper 2 / pooter 2 / attackFly 2 / trite 2 / charger 1.2 |
| 3 | charger 2 / clotty 2 / hopper 1.6 / boomFly 1.4 / maggot 2 |
| 4 | horf 2 / clotty 2 / mulligan 1.6 / boomFly 1.6 / spitty 1.6 / bone 1.4 |
| 5 | attackFly 3 / mulligan 2 / maw 1.6 / host 1.4 / globin 1.6 / bone 1.2 |
| 6 | charger 2.2 / hopper 2 / maw 2 / vis 1.4 / boomFly 1.8 / bone 1.6 |
| 7 | maggot 3 / globin 2 / mulligan 2 / sucker 1.8 / trite 2 |
| 8 | globin 2.4 / maw 2 / trite 2.4 / vis 1.8 / sucker 2.2 |
| 9 | mulliboom 2.4 / sucker 2.4 / vis 2 / charger 2 / globin 2.2 / bone 1.6 |
| 10 | host 2.4 / maw 2.4 / vis 2.2 / spitty 2.2 / attackFly 2.4 / bone 1.4 |
| 11 | gaper 3 / attackFly 3 / mulliboom 2.4 / vis 2.2 / maw 2.4 / sucker 2.4 / globin 2.2 |
| 12 | charger 3 / mulliboom 3 / vis 2.6 / globin 2.6 / sucker 2.6 / trite 2.6 / bone 2 |

**难度曲线**：敌人血量按 `hpScale` 逐层放大（B1 ×1.0 → B12 ×3.0），速度倍率 1.0 → 1.26
（上限保护）。房间数 5–8，随层数递增敌人数量（上限 8）。

---

## 3. 专属 Boss（12 个）

技能白名单：`spread` 扇形散射 · `radial` 环形弹幕 · `spiral` 旋转螺旋 ·
`homing` 追踪弹 · `jump` 跳跃砸地 · `stomp` 阴影踩踏 · `charge` 突进冲撞 ·
`laser` 光束扫射 · `summon` 召唤小怪。

| Boss | 楼层 | 造型 | 技能池 | 特色机制 |
|------|------|------|--------|----------|
| **Monstro** 怪物 | B1 | 绿色粘液肉块，米黄大肚皮，巨嘴 | spread / jump | 跳跃落地冲击波；血量越低弹幕越密 |
| **Larry Jr.** 小拉里 | B2 | 橙色分节蠕虫，头部双角 | charge / radial / spread | 贴身高速追击 + 突进冲撞 |
| **Chub** 胖虫 | B3 | 粉红肥硕分节巨虫 | charge / radial / summon | 突进 + 召唤蛆虫 |
| **Gurdy** 格蒂 | B4 | 坐桩巨型肉块，身上多个吐弹孔 | spread / summon / radial | 坐桩不动，多孔齐射 + 召唤苍蝇 |
| **The Duke of Flies** 蝇公爵 | B5 | 暗紫肉团，戴王冠，周身环绕苍蝇 | summon / radial / spread | 苍蝇群召唤为核心压迫 |
| **Fistula** 瘘管 | B6 | 灰绿多泡肉团，附属小泡搏动 | radial / jump / summon | 环形弹幕 + 跳跃 + 召唤 |
| **Mom** 妈妈 | B7 | 巨足与高跟鞋，裙摆隐入画面外 | stomp / spread / summon | **阴影踩踏**：地面锁定玩家位置后巨足砸落 |
| **Mom's Heart** 妈妈的心脏 | B8 | 搏动巨型心脏，血管与脸 | spiral / radial / summon | **旋转螺旋弹幕**持续 2.4s |
| **Satan** 撒旦 | B9 | 山羊腿恶魔，双角，发光眼 | stomp / laser / spread / charge | 踩踏 + 光束扫射 + 突进 |
| **Isaac** 以撒 | B10 | 白袍哭泣男孩，头顶光环 | spread / radial / homing / laser | 追踪泪弹 + 圣光光束 |
| **??? (Blue Baby)** 蓝婴 | B11 | 蓝白婴儿大头，死眼，泪滴环绕 | homing / spread / radial / summon | 高密度追踪弹 |
| **The Lamb** 羔羊 | B12 | 白色卷角羔羊，红眼 | charge / summon / radial / spread | 高速突进 + 苍蝇群，最终 Boss |

**通用机制**：三阶段血量阈值切阶段（切阶段短暂无敌 + 停顿 + 震屏）；
坐桩型（Gurdy / Mom / Mom's Heart）`keepDistance=999` 不移动；弹幕颜色/半径按 Boss 区分。

---

## 4. 小怪（19 种）

| # | id | 名称 | 行为原型 | 攻击方式 | 特点 |
|---|----|------|----------|----------|------|
| 1 | gaper | 呆滞者 | 追击 | 接触伤害 | 直线追击，带轻微摇摆 |
| 2 | pooter | 飘浮射手 | 悬空射击 | 单发直线弹 | 保持距离 + 横向游走 |
| 3 | horf | 静止炮台 | 固定炮台 | 有前摇的弹 | 原地不动 |
| 4 | attackFly | 攻击苍蝇 | 飞行追击 | 接触伤害 | 高速、小体积 |
| 5 | boomFly | 轰炸蝇 | 对角飞行 | 接触伤害 + **死亡爆炸** | 撞墙反弹，死亡时炸开 |
| 6 | charger | 冲撞者 | 冲锋 | 接触伤害 | 游走→锁定→高速冲刺 |
| 7 | clotty | 血块 | 游走射击 | **十字四连弹** | 随机游走 |
| 8 | mulligan | 呆瓜 | 召唤 | 接触伤害 | 逃避玩家，**死亡召唤 2 只苍蝇** |
| 9 | hopper | 跳蚤 | 跳跃 | 接触伤害 | 连续小跳，带随机偏角 |
| 10 | trite | 蜘蛛怪 | 跳跃 | 接触伤害 | 单次长距离跳跃 |
| 11 | host | 宿主 | 伏击 | **三连散射** | 潜伏期**无敌**，玩家靠近才抬头 |
| 12 | vis | 激光眼 | 激光 | **蓄力光束** | 蓄力 0.85s 后发射穿透光束 |
| 13 | maw | 巨口 | 追踪射击 | **追踪弹** | 漂浮逼近，弹会转向 |
| 14 | globin | 血球蛋白 | 追击 + 重生 | 接触伤害 | **死亡后复活一次**（半血） |
| 15 | mulliboom | 自爆呆瓜 | 爆炸 | **接触自爆** | 高速追击，接触即引爆 |
| 16 | maggot | 蛆虫 | 追击 | 接触伤害 | 分节躯体，缓慢爬行 |
| 17 | spitty | 吐痰者 | 游走射击 | 单发弹 | 缓慢游走 |
| 18 | sucker | 吸盘怪 | 爆炸 | **死亡爆炸** | 缓慢飞行逼近 |
| 19 | bone | 白骨兵 | 抛掷 | **骨弹** | 保持距离抛掷骨弹 |

**AI 骨架复用**：`chase / flyChase / flyShooter / turret / wanderShooter / slowShooter /
homingShooter / boneThrower / charger / jumper / leaper / summoner / ambusher / laser /
exploder / slowExploder / diagonalFlyer`。

---

## 5. 道具（58 件）

覆盖六类属性 + 攻击方式改写。稀有度 `common / rare / boss` 决定掉落权重。

### 5.1 攻击方式改写（15 件）
`brimstone` 硫磺火（蓄力穿透光束）、`ipecac` 吐根糖浆（抛物线爆炸）、
`moms_knife` 妈妈的刀（蓄力投掷）、`technology` 科技（激光束）、
`inner_eye` 内在之眼（三连发）、`mutant_spider` 变异蜘蛛（四连发）、
`loki_horns` 洛基之角（四方向）、`spoon_bender` 弯汤匙（追踪）、
`my_reflection` 我的倒影（回旋）、`polyphemus` 独眼巨人（巨型穿透）、
`spectral` 幽灵之泪（穿墙）、`cupids_arrow` 丘比特之箭（穿透）、
`dead_onion` 死洋葱（穿墙穿透）、`sagittarius` 射手座（穿透加弹速）、
`the_wafer` 圣饼（减伤 + 弹速）。

### 5.2 攻击力（13 件）
`crickets_head` 蟋蟀头颅、`damage_up` 悲伤洋葱、`stigmata` 圣痕、
`blood_of_martyr` 殉道者之血、`pentagram` 五芒星、`halo` 光环、`crown` 母亲之冠、
`magic_mushroom` 魔法蘑菇、`steven` 史蒂文、`deaths_touch` 死亡之触、
`lord_of_the_pit` 深渊之主、`sacred_heart` 神圣之心、`the_mark` 恶魔印记。

### 5.3 攻速 / 射速（7 件）
`number_one` 一号、`fire_rate_up` 悲伤炸弹、`squeezy` 挤压、
`soy_milk` 豆奶（射速极快 / 单发极低）、`bloody_lust` 浴血、
`tough_love` 严厉的爱、`jesus_juice` 圣果汁。

### 5.4 血量（12 件）
`lunch` 午餐、`breakfast` 早餐、`dinner` 晚餐、`dessert` 甜点、
`blood_bag` 血袋、`less_than_three` <3、`moms_pearls` 母亲之珠、
`old_bandage` 旧绷带、`raw_liver` 生肝、`bucket_of_lard` 一桶猪油、
`rosary` 念珠、`cube_of_meat` 肉块立方。

### 5.5 移速（5 件）
`speed_up` 速度之环、`wings` 蝇之王、`the_belt` 腰带、
`speed_ball` 速度球、`thunder_thighs` 雷霆大腿。

### 5.6 射程 / 弹速（6 件）
`range_up` 诡异蘑菇、`moms_underwear` 母亲的内衣、`the_peeper` 窥视者、
`growth_hormones` 生长激素、`lard` 猪油、`lil_gurdy` 小格蒂。

**平衡约束**：所有属性经 `STAT_LIMITS` 硬约束（伤害 ≤60、移速 ≤380、射速间隔 ≥0.075s 等），
且 `base×mult+flat` 重算模型保证顺序无关、不会因拾取顺序产生数值漂移。

---

## 6. 验收标准（已通过）

| 项 | 标准 | 实测 |
|----|------|------|
| 楼层数 | ≥ 10 且主题互不相同 | 12 层 ✅ |
| 专属 Boss | 每层 1 个、模型/技能独立 | 12 个 ✅ |
| 小怪 | ≥ 15 且各有行为与攻击 | 19 种 ✅ |
| 道具 | ≥ 50 且覆盖多类属性 | 58 件 ✅ |
| 运行稳定性 | 全量绘制 / AI 跑帧 / 逐层生成无异常 | 0 错误 ✅ |
| 平衡 | 全道具叠加后属性在合法范围内 | 通过 ✅ |

验证方式：`node tests/run-tests.mjs`（107 项逻辑断言）+
`node tests/_verify-expansion.mjs`（真实 Chromium 端到端）。

---

## 7. 参考资料

- Chapters / Floors — *The Binding of Isaac: Rebirth Wiki*（章节与楼层顺序）
- Monsters / Bestiary — 同上（怪物行为原型：追击 / 冲锋 / 跳跃 / 射击 / 飞行 / 爆炸 / 召唤 / 伏击）
- Bosses — 同上（各章节 Boss 归属与标志性技能）
