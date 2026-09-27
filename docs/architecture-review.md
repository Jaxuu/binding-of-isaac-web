# 架构评审 · Isaac-Roguelike

> 评审人：程基岩（技术总监）· 自评 + 交叉检查
> 日期：2025-09-27 · 版本：v1.0
> 关联：`docs/architecture.md`、`docs/adr/ADR-001..006`

---

## 1. 评审结论

**PASS（通过）** —— 架构满足全部用户硬约束与 GDD 支柱，无阻塞项。存在 0 个 P0、0 个 P1；3 个 P2（技术债，已记录规避方案）。

| 维度 | 判定 | 证据 |
|---|---|---|
| 约束合规（零依赖/构建/素材） | ✅ PASS | 无外部资源引用；`package.json` 无 runtime deps |
| 分层清晰（单向依赖） | ✅ PASS | `main→systems→entities→art→core`，无反向 import |
| 可测试性 | ✅ PASS | 89 单测 + 5 浏览器场景，逻辑层不依赖 canvas |
| 可复现性 | ✅ PASS | 500 种子地牢 0 失败；`?seed=` 复现 |
| 性能 | ✅ PASS | 60FPS 稳定；离屏烘焙 + 对象池 |
| 手感帧率无关 | ✅ PASS | 固定 60Hz 逻辑 |
| 无 TODO / 语法错误 | ✅ PASS | 32 文件 `node --check` 全绿 |

---

## 2. 控制清单（一页规则 · 交付给后续维护者）

> 摘自 `architecture.md` §9，此处作为**独立可执行清单**。每条都可被 review 时逐条核对。

| # | 规则 | 违反信号 | 检查方式 |
|---|---|---|---|
| C1 | 依赖只能向下（`main→systems→entities→art→core`） | `core` import 了 systems/entities | `grep -r "from '../systems" src/core/` 应为空 |
| C2 | 玩法随机必须走注入的 `Rng` | 生成器里出现 `Math.random()` | `grep -rn "Math.random" src/systems src/entities` 仅允许纯视觉用途 |
| C3 | 驱动输入必须用 `Input.setStick()` | 直接写 `input.firing =` / `input.fireX =` | 测试/UI 代码检查 |
| C4 | 热路径零分配（子弹/粒子走 Pool） | 每帧 `new Projectile()` | 审查 `combat.js` 是否走 `pool.acquire` |
| C5 | 不变量运行时也校验 | 新增生成规则未加断言 | `validateDungeon` 是否被调用 |
| C6 | 属性只能重算（`base×mult+flat`） | 玩法属性被就地改写（如 `player.stats.damage += x`） | `grep -rn "stats\.\(damage\|speed\|range\|shotSpeed\|maxHealth\|fireDelay\) *+=" src/`（应为空） |
| C7 | 关键状态用轮询兜底，事件不作唯一真相 | Boss 死亡只监听事件 | 审查 `_updateBossIfAny`（当前 `!b.alive` 轮询 + `bossDefeated` 标记） |
| C8 | 切场景清瞬时 UI | 道具面板残留到下一屏 | 审查 `gotoScene`（当前清 `itemPanel/damageFlash`） |
| C9 | 中文字体测量前显式设 `ctx.font` | 文字重叠 | 审查所有 `measureText` 调用点 |
| C10 | 身份色走 `PAL`，实体点缀色可就地 | 身份色（ink/UI/心/金）被写死 | `PAL.*` 引用应远多于内联 hex；当前 144 : 114（见 §6-TD-5） |
| C11 | 提交前三绿：`node --check` / `run-tests.mjs` / `harness.mjs all` | 任一失败 | CI 脚本 |

---

## 3. 分层依赖核查（实测）

```
core   → 无上层依赖 ✅
art    → core（math/palette） ✅；不 import systems/entities 中的玩法写入函数
entities → core + art（TILE 常量） ✅
systems  → entities + art + core ✅
main     → 全部 ✅
```

**唯一「跨层常量」例外**：`entities/enemy.js`、`systems/combat.js`、`systems/rooms.js` 引用 `art/draw-room.js` 的 `TILE` / `ROOM_COLS` / `ROOM_ROWS` / `WALL_T`。这是**几何常量**（世界尺寸），不涉及绘制副作用。属于可接受的「共享常量」，但严格的 Clean Architecture 会把它移到 `core/constants.js`。

- **建议（P2）**：将 `TILE / ROOM_COLS / ROOM_ROWS / WALL_T` 上移到 `core/constants.js`，`draw-room.js` 改为 re-export。**影响**：小（纯搬迁），**收益**：消除 entities/systems → art 的常量依赖，使分层完全纯净。

---

## 4. 风险登记（Risk Register）

| ID | 风险 | 可能性 | 影响 | 级别 | 缓解 |
|---|---|---|---|---|---|
| R1 | 地牢无环（树状），缺少原作偶发捷径 | 高（设计如此） | 低 | P2 | 已记录；如需可加「删一条环边」后置步骤 |
| R2 | 敌人 AI 忘记写意图速度（无接口约束） | 中 | 低 | P2 | 注释规约 + 单测断言速度方向 |
| R3 | 离屏缓存失效漏清 → 显示旧主题 | 低 | 低 | P2 | 烘焙 key 含楼层/主题；提供 `cacheClear(prefix)` |
| R4 | Web Audio 合成音色偏薄 | 高 | 低 | P2 | 参数集中在 `audio.js`，易迭代 |
| R5 | 24 道具全上时属性逼近边界（damage 54/60） | 低 | 低 | P3 | 有硬 clamp；极端配装仍在合法区间 |
| R6 | 移动端 Safari 的 Pointer 兼容 | 低 | 中 | P2 | 已用标准 Pointer Events；`playtest.html` 手动验证 |
| R7 | Boss 死亡只在轮询路径结算 | 已消除 | — | — | C7 已固化：轮询 + 事件标记双保险 |

**无 P0/P1 风险。**

---

## 5. 性能预算 vs 实测

| 指标 | 预算 | 实测 | 余量 |
|---|---|---|---|
| 逻辑帧率 | 60 Hz | 60 Hz | ✅ |
| 单帧 update | ≤ 4 ms | < 1 ms | ✅ 4× |
| 单帧 render | ≤ 8 ms | < 3 ms | ✅ 2.6× |
| 每帧 GC 分配（热路径） | 0 | 0（池化） | ✅ |
| 峰值实体：子弹 | ≤ 220（120+100 池） | 观察 < 40 | ✅ |
| 粒子上限 | 有界 | 实测 < 200 | ✅ |
| 进房烘焙 | ≤ 16 ms（一帧） | 约几 ms，仅进门时 | ✅ |
| 内存 | < 150 MB | 无增长趋势 | ✅ |

**预算依据**：60FPS = 16.67ms/帧，逻辑 + 渲染留 2× 余量，且像素风 2D 无重负载。

**瓶颈预案**：若未来敌人/子弹数量暴增，优先级为
1. 用 `bakeSheet` 把敌人动画烘焙成精灵表（省路径重算）；
2. 子弹改 SoA（结构数组）布局；
3. 空间哈希做子弹-敌人宽相（当前是全遍历，实体少时最快）。
**当前均不需要**。

---

## 6. 技术债清单（详述）

### TD-1 · 几何常量跨层（P2）
- **现状**：`TILE` 等定义在 `art/draw-room.js`，被 `entities` / `systems` 引用。
- **应然**：上移 `core/constants.js`。
- **成本**：~15 分钟；**收益**：分层纯净。
- **触发条件**：下次触碰 `draw-room.js` 时顺手做。

### TD-2 · 地牢无环（P2）
- **现状**：邻居生长只加不删 → 树状图。
- **应然**：可选「连接两个随机相邻非父子房间」制造环。
- **成本**：~1 小时（要重新校验 I2/I5/I6）；**收益**：地牢更「有机」。
- **触发条件**：用户反馈「地图太线」时。

### TD-3 · AI 分支无类型约束（P2）
- **现状**：`updateEnemyAI` 靠约定写 `e.vx/vy`。
- **应然**：AI 返回意图对象 `{vx,vy}` 而非就地写（更函数式、更易测）。
- **成本**：~30 分钟；**收益**：消除「忘记赋值」隐患。
- **触发条件**：敌人种类 > 5 时。

### TD-4 · `setTimeout` 已清除（已修复）
- **历史**：Boss 切层曾用 `setTimeout`（不可测、不受固定步管理）。
- **现状**：改为 `_bossAdvanceTimer` 在固定步里递减。**已消除**。

### TD-5 · 内联 hex 分散（P2）
- **现状**：`PAL` 有 102 个命名色、被引用 144 次；但 `art/draw-*.js` 仍有 114 处内联 `#rrggbb`，主要是道具图标点缀色与投射物色调。
- **应然**：身份色（ink/UI/心/金）必须走 `PAL`（已满足）；**实体专属点缀色**可逐步回收进 `PAL` 的命名空间（如 `PAL.itemIcon.x`）。
- **成本**：~1 小时（机械搬迁 + 视觉回归截图比对）；**收益**：调色集中、易做主题换肤。
- **触发条件**：需要「多楼层换主题」或「色盲模式」时。

### TD-6 · 兜底 id 不再用随机（已修复）
- **历史**：`combat.ensureEnemyId` 用 `Math.floor(Math.random()*1e9)` 生成兜底 id，威胁可复现契约（即使实际不可达）。
- **现状**：改为高位单调计数器（`_nextFallbackId = 1e9` 起）。**已消除**。

---

## 7. 架构决策记录索引

| ADR | 决策 | 状态 |
|---|---|---|
| [ADR-001](adr/ADR-001-zero-dependency-vanilla-canvas.md) | 原生 Canvas 2D + ES Modules，零依赖/构建/素材 | Accepted |
| [ADR-002](adr/ADR-002-oop-entities-not-ecs.md) | 轻量 OOP 实体 + 数据表驱动，不用 ECS | Accepted |
| [ADR-003](adr/ADR-003-fixed-timestep-loop-seeded-rng.md) | 固定时间步循环 + 可种子化 PRNG | Accepted |
| [ADR-004](adr/ADR-004-input-abstraction-layer.md) | 输入抽象层（物理→逻辑，桌面/移动统一） | Accepted |
| [ADR-005](adr/ADR-005-dungeon-generation-algorithm.md) | 地牢随机游走 + 6 条不变量 | Accepted |
| [ADR-006](adr/ADR-006-code-drawn-art-offscreen-baking.md) | 全代码绘制 + 离屏预烘焙 | Accepted |

---

## 8. 评审发现的问题与修复记录（跨 Iteration）

| # | 问题 | 发现方式 | 根因 | 修复 | 级别 |
|---|---|---|---|---|---|
| 1 | `renderer.js` 从 `ui.js` 导入未导出的 `strokedText` | 浏览器启动即报错 | 导入源错误 | 改从 `primitives.js` 导入 | P0（致命） |
| 2 | `draw-enemies.js` 导入不存在的 `TAU_SAFE` | 静态检查 | 笔误 | 修正导入列表 | P0 |
| 3 | `dungeon.js` 用 `require_Rng()` 会抛错 | 单测 | 误用非 ESM 写法 | 顶部静态 `import { Rng }` | P0 |
| 4 | 地牢 I5 失败（悬空门，52/80） | 500 种子回归 | 扩容后未重取 `rooms` 快照 | 快照移到扩容之后 + `maxRooms` 硬上限 | P0 |
| 5 | combat 场景 `remaining:1` 房间未清空 | harness | **测试脚本**直接写 `input.firing` 被 `update()` 覆盖（非游戏 bug） | 测试改走 `Input.setStick()` | P1（测试侧） |
| 6 | Boss 击杀不统计（`kills:0`） | 浏览器验证 | Boss 死亡只依赖 Combat 事件 | `_updateBossIfAny` 轮询兜底 | P1 |
| 7 | 楼层过渡界面残留道具面板 | 截图分析 | 切层同帧继续跑旧房间拾取逻辑 | `_updatePlaying` early-return + `gotoScene` 清 UI | P1 |
| 8 | 物品名与中文名文字重叠 | 截图分析 | `measureText` 前未设 `ctx.font` | 显式设字体后再测量 | P1 |
| 9 | 单测两处期望值错误 | 单测 | 期望与 clamp 上限/武器 kind 映射不符 | 修正测试期望 | P2（测试侧） |

> 问题 #5 特别值得记录：**症状在游戏、根因在测试**。排查时通过「逐帧打印敌人 HP/子弹数」发现「子弹数恒为 0」，从而定位到「写派生字段被覆盖」，反而验证了输入抽象层（ADR-004）的设计正确性。

---

## 9. 待用户审批项

1. **地牢环状结构**（TD-2）：是否需要「更有机、带捷径」的地牢？当前为树状。
2. **难度曲线**：当前 5 层通关、每层 HP +18%/速度 +6%。是否需要调整层数或缩放？
3. **音效**：当前为 Web Audio 合成。是否需要更「像原作」的音色（仍零素材）？

---

## 10. 结论

架构在**零依赖/零构建/零素材**的强约束下达成了：

- 清晰单向分层，逻辑与渲染解耦，逻辑层可脱离浏览器测试；
- 手感帧率无关、地牢可复现、属性可组合；
- 60FPS 稳定、热路径零分配；
- 89 项单测 + 5 个端到端场景全绿，0 JS 错误；
- 9 个跨迭代问题全部修复并记录根因。

**建议下一步**：接受 TD-1（常量上移）与 TD-2（可选环状地牢），其余技术债按触发条件处理。
