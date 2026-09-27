# 架构文档 · Isaac-Roguelike（《以撒的结合》核心玩法网页复刻）

> 作者：程基岩（Cheng Jiyan）· 技术总监／主程序
> 版本：v1.0 · 日期：2025-09-27
> 技术栈（锁定）：原生 HTML5 Canvas 2D + 原生 ES Modules JS · 零运行时依赖 · 零构建 · 零素材
> 关联：`design/gdd/*`、`design/art-bible.md`、`docs/adr/ADR-001..006`、`docs/framework-notes.md`

---

## 0. 一页速览

| 维度 | 结论 |
|---|---|
| 运行形态 | 纯静态站点，`python -m http.server` 即可跑 |
| 依赖 / 构建 | 0 依赖 / 0 构建（`package.json` 仅 `type: module` + 测试用 devDependency） |
| 素材 | 0 图片 / 0 音频文件；美术全 Canvas 2D 代码绘制；音效 Web Audio 合成 |
| 逻辑帧率 | 固定 60Hz（`FIXED_DT=1/60`），渲染跟随 rAF |
| 世界尺寸 | 房间内容区 `624×336`（13×7 格 × 48px），含墙 `676×388` |
| 分层 | `core`（引擎）→ `art`（渲染/绘制）→ `entities`（实体）→ `systems`（编排）→ `ui/main`（入口） |
| 关键抽象 | `EventBus`（同步）、`StateMachine`、`Pool`+`ActiveList`、`Input`（物理→逻辑）、`Rng`（可种子化） |
| 可复现 | `?seed=xxx` / `startGame(seed)`，地牢生成 100% 可复现 |
| 测试 | 89 项 Node 逻辑单测 + 5 场景 Playwright 无头截图验证 |

---

## 1. 技术需求抽取（从 GDD 与用户需求）

### 1.1 用户明确需求 → 技术落点

| # | 需求 | 技术实现 | 位置 |
|---|---|---|---|
| U1 | 俯视角，随机房间探索 | 房间格阵列 + 相机固定（单屏一房） | `systems/rooms.js`、`systems/dungeon.js` |
| U2 | 射击战斗；清房开门 | `Combat` 碰撞结算 + `Room.cleared` 状态机 | `systems/combat.js`、`systems/game.js` |
| U3 | 随机地牢 5–8 房 + 1 Boss 房 | 随机游走邻居生长 + 6 条不变量 | `systems/dungeon.js`（ADR-005） |
| U4 | 道具改变攻击/属性/外观 | `ITEM_POOL` 数据表 + `applyItem` + `visual` 标志 | `entities/items.js`、`entities/stats.js` |
| U5 | 属性系统（生命/攻击/射速/速度/射程/弹速） | `BASE_STATS × mult + flat` → clamp 重算模型 | `entities/stats.js` |
| U6 | 3 敌人 + 1 Boss | `ENEMY_DEFS`（gaper/pooter/horf）+ `MONSTRO` | `entities/enemy.js`、`entities/boss.js` |
| U7 | WASD 移动 + 方向键射击 + 移动端摇杆 | `Input` 物理→逻辑抽象层 | `core/input.js`（ADR-004） |
| U8 | 三界面（开始/死亡/通关） | 场景状态机 + UI 绘制 | `systems/game.js`（`SCENE`）、`art/ui.js` |

### 1.2 GDD 支柱 → 架构影响

- **P1 手感优先** → 固定步循环（帧率无关手感）；受击硬直/击退/闪白在同一帧结算。
- **P2 Build 化学** → 属性「重算而非累加」；武器变体正交组合（`weapon: { kind, homing, pierce, ... }`）。
- **P3 黑暗卡通** → `inkShape` + `PAL` 统一风格（ADR-006）。
- **P4 短局重开** → 场景状态机 + `startGame()` 干净重置（无残留状态）。

---

## 2. 分层架构

```
┌──────────────────────────────────────────────────────────────┐
│  main.js（引导装配：canvas / bus / audio / input / game /      │
│           renderer / joystick / GameLoop）                     │
├──────────────────────────────────────────────────────────────┤
│  systems/    ── 编排层（无渲染、可 Node 测）                    │
│    game.js       GameState：中央编排器 + 场景状态机            │
│    dungeon.js    地牢生成 + 6 不变量校验                       │
│    rooms.js      Room 运行时对象 + 内容生成                    │
│    combat.js     射击/碰撞/爆炸/接触伤害结算                   │
├──────────────────────────────────────────────────────────────┤
│  entities/   ── 实体层（数据 + 行为，可 Node 测）              │
│    player.js  enemy.js  boss.js  projectile.js  items.js      │
│    stats.js（属性重算模型）                                    │
├──────────────────────────────────────────────────────────────┤
│  art/        ── 表现层（Canvas 2D 绘制，无玩法逻辑）           │
│    palette.js  primitives.js  cache.js                        │
│    draw-player/enemies/boss/room/projectiles/items.js         │
│    particles.js  ui.js  renderer.js                           │
├──────────────────────────────────────────────────────────────┤
│  core/       ── 引擎层（通用、零游戏知识）                     │
│    loop.js  input.js  events.js  state.js  pool.js  rng.js    │
│    math.js  audio.js                                          │
└──────────────────────────────────────────────────────────────┘
```

**依赖方向单向向下**：`main → systems → entities → art → core`。`art` 只读状态不写玩法；`core` 不知道任何游戏概念。**这条规则是架构完整性的核心**（见 §9 控制清单）。

### 2.1 模块清单（32 个 src 文件）

| 层 | 文件 | 职责一句话 |
|---|---|---|
| core | `loop.js` | 固定步游戏循环 + FPS 遥测 |
| core | `input.js` | 物理输入 → 逻辑动作（键盘/摇杆统一） |
| core | `events.js` | 同步事件总线（异常隔离 + 延迟增删） |
| core | `state.js` | 通用有限状态机 |
| core | `pool.js` | 对象池 + ActiveList（swap-remove） |
| core | `rng.js` | mulberry32 + FNV-1a（可种子化） |
| core | `math.js` | clamp/lerp/dist/aabb/circleRect/snapTo4/8… |
| core | `audio.js` | Web Audio 程序化音效合成 |
| art | `palette.js` | 全局调色板 `PAL` |
| art | `primitives.js` | 绘制原语（`inkShape` 等） |
| art | `cache.js` | 离屏预烘焙 + 精灵表 |
| art | `draw-*.js` | 各类实体的绘制函数 |
| art | `particles.js` | 粒子/飘字系统 |
| art | `ui.js` | HUD + 全屏界面 |
| art | `renderer.js` | 渲染编排（读 GameState 状态） |
| entities | `stats.js` | 属性重算模型（base×mult+flat, clamp） |
| entities | `player.js` | 玩家实体 + 道具修正 |
| entities | `enemy.js` | 3 种敌人 + 通用 AI |
| entities | `boss.js` | Monstro + 三阶段状态机 |
| entities | `projectile.js` | 投射物/光束/爆炸 |
| entities | `items.js` | 19 道具数据表 + 应用逻辑 |
| systems | `dungeon.js` | 地牢生成 + 校验 |
| systems | `rooms.js` | Room 对象 + 内容填充 |
| systems | `combat.js` | 战斗结算 |
| systems | `game.js` | GameState 中央编排 |
| ui | `joystick.js` | 虚拟摇杆渲染 |
| 入口 | `main.js` | 装配 + 主循环 + 事件绑定 |

---

## 3. 游戏循环（`core/loop.js`，ADR-003）

```js
// 固定步 + 累加器；渲染最新状态（不插值）
rAF(now) {
  let dt = min((now - last)/1000, MAX_FRAME_DT); // 0.25s 硬上限
  acc += dt;
  let steps = 0;
  while (acc >= FIXED_DT && steps++ < MAX_STEPS) {   // 最多 5 步
    update(FIXED_DT);                                 // 逻辑：固定 60Hz
    acc -= FIXED_DT;
  }
  render(0);                                          // 渲染：跟随刷新率
}
```

- **为什么固定步**：手感（弹速/追击/硬直）必须与刷新率无关（ADR-003）。
- **为什么上限 5 步**：切后台回来时防止「追帧」把主线程卡死。
- **为什么不插值**：像素风俯视 2D，插值无视觉收益、徒增状态。

---

## 4. 数据流（每帧）

```
rAF
 └─ GameLoop.update(FIXED_DT)
     └─ GameState.update(dt)
         ├─ input.update()                 // 物理→逻辑（每帧一次）
         ├─ 震屏/闪屏/道具面板计时衰减
         ├─ switch(scene):
         │   TITLE       → 确认键 → startGame()
         │   FLOOR_INTRO → 1.8s → gotoScene(PLAYING)
         │   PLAYING     → _updatePlaying(dt)
         │   PAUSED/DEAD/WIN → 菜单输入
         └─ _updateHover()                 // UI 按钮命中
 └─ Renderer.render(0)                      // 只读 GameState
```

### 4.1 `_updatePlaying` 的内部顺序（**顺序即正确性**）

```
1  timeAlive += dt
2  暂停键检测（P/ESC）
3  玩家移动（输入 → 平滑加速 → 分轴障碍碰撞）
4  玩家射击（冷却 / 蓄力）           → Combat.playerFire / playerFireCharged
5  敌人 AI（updateEnemyAI）           → 意图速度
6  Boss AI（updateBoss）
7  Boss 击败延迟切层（_tickBossAdvance）
   ⇢ 若场景已改变：return（防止用旧房间引用继续跑）
8  战斗结算（combat.update：子弹/光束/爆炸）
9  接触伤害 + 尖刺
10 拾取物 / 宝箱
11 清房检测 → _clearRoom（开门 + 奖励）
12 玩家出界 / 门传送
13 边界钳制
14 粒子更新
15 死亡检测 → gotoScene(DEAD)
16 玩家动画状态 tick
```

> **第 7 步的 early-return 是关键修复**（Iteration 4）：Boss 被打死的那一帧会立即切层，若不 return，第 10-12 步会用**旧房间引用**继续跑，导致「道具面板残留到楼层过渡界面」。

---

## 5. 关键子系统

### 5.1 事件总线（`core/events.js`）

- **同步派发**：同一帧内监听者看到一致状态，便于测试。
- **异常隔离**：单个 handler 抛错不影响其余 handler 与主循环（`try/catch` 包裹）。
- **延迟增删**：派发中若增删订阅，缓冲到本帧结束执行（`_depth` + `_deferred`），避免迭代器失效。
- **热路径例外**：每帧高频的「子弹碰撞」**不走总线**，直接函数调用（避免热路径分配）。

事件表：`ENEMY_DAMAGED/ENEMY_DIED/PLAYER_DAMAGED/PLAYER_DIED/ROOM_ENTERED/ROOM_CLEARED/FLOOR_CHANGED/BOSS_SPAWNED/BOSS_DIED/ITEM_PICKED/STATS_CHANGED/GAME_STARTED/GAME_OVER/GAME_WON/SCENE_CHANGED`。

**设计权衡（Iteration 4 教训）**：Boss 死亡曾**只**依赖 `EVT.ENEMY_DIED`（由 Combat 发出）。但任何非 Combat 路径的致死（如爆炸、调试直调）都不会发这个事件 → 击杀不统计、不切层。修复：在 `_updateBossIfAny` 里**轮询 Boss 生命周期**（`!boss.alive` → 结算），事件只作为标记。**原则：关键状态用轮询兜底，事件仅做解耦通知，不作为唯一真相。**

### 5.2 属性系统（`entities/stats.js`，U5）

**模型：重算而非累加。**

```js
// modifiers 为「已拾取道具」列表，每次拾取后从 base 重算
final = clamp( base[key] * Π(mult) + Σ(flat), MIN, MAX )
```

- **为什么不累加**：累加有顺序依赖 + 浮点漂移 + 无法「卸载」道具。
- **硬边界**：`STAT_LIMITS`（如 `speed [70,380]`、`damage [0.5,60]`），UI 与手感不会被非法值破坏。
- **验证**：items 场景应用全部 24 个道具后，`damage 3.5 → 54`、`maxHealth 6 → 12`，且全部在边界内。

### 5.3 武器变体（U4）

`weapon` 对象是**正交标志的组合**，不是枚举分支：

```js
weapon = { kind:'tear'|'brimstone'|'ipecac'|'knife'|'tech',
           charge, shots, spread, pierce, homing, explosive, ballistic,
           spectral, curving, tearScale, beamWidth, beamDuration, ... }
```

- `applyItem` 只「打补丁」（`Object.assign` 语义）到 `weapon`。
- `Combat.playerFire` 只**读**这些标志决定生成什么（子弹/光束/飞刀）。
- 结果：Brimstone + Inner Eye + Technology 自然组合出「三向追踪激光」——P2 Build 化学由此涌现。

### 5.4 战斗结算（`systems/combat.js`）

- 4 类对象池：`playerBullets / enemyBullets / beams / explosions`。
- 子弹：位移 → 射程耗尽 → 房间边界 → 障碍 → 命中敌人（`hasHit(id)` 去重，支持穿透）。
- 光束：**点到线段距离**（`pointToSegment`）做命中，每 0.09s 结算一次 tick。
- 爆炸：`collectTargets` 收集所有目标 + 距离衰减。
- 接触伤害 / 尖刺伤害单独函数，仅在玩家存活时调用。

### 5.5 地牢生成（`systems/dungeon.js`，ADR-005）

随机游走邻居生长 + BFS 定深 + 宝箱死路优先 + **6 条不变量**（I1–I6，测试与运行时共用 `validateDungeon`）。

### 5.6 渲染（`art/renderer.js`，ADR-006）

- `_ensureRoomBaked(room)`：房间地面/墙体按 key 烘焙到离屏画布，每帧 `drawImage` 一次。
- HiDPI：`dpr = min(2, devicePixelRatio)`。
- 绘制顺序：房间静态层 → 地面装饰 → 拾取物/宝箱 → 敌人 → Boss → 玩家 → 投射物 → 粒子 → 覆盖层（HUD/摇杆/道具面板/全屏界面/FPS）。

---

## 6. 场景状态机（U8）

```
TITLE ──确认──▶ FLOOR_INTRO ──1.8s──▶ PLAYING ──死亡──▶ DEAD ──确认──▶（重开）
                                        │  ▲                  
                                    P/ESC │  │ P/ESC           
                                        ▼  │                  
                                      PAUSED                  
                                        │                     
                                   击败 Boss（第 5 层）         
                                        ▼                     
                                       WIN ──确认──▶（重开）    
```

- `SCENE = { TITLE, PLAYING, PAUSED, DEAD, WIN, FLOOR_INTRO }`。
- 切场景时 `gotoScene()` 统一清瞬时 UI（道具面板/伤害闪屏），避免残留。
- 三个需求界面：开始（TITLE）、死亡（DEAD，显示击杀/拾取/存活时间）、通关（WIN）。

---

## 7. 性能预算与实测

| 指标 | 预算 | 实测 |
|---|---|---|
| 逻辑帧率 | 稳定 60Hz | 60（`F3` 遥测） |
| 单帧逻辑耗时 | < 4ms | < 1ms（`updateMs`） |
| 渲染耗时 | < 8ms | < 3ms（离屏房间层） |
| 每帧分配 | 热路径 0 分配（对象池） | 投射物/粒子全程池化 |
| 房间实体上限 | 敌人 ≤ 7 + Boss 1 + 子弹 ~120 + 粒子 | 生成器已设上限 |
| 浏览器内存 | < 150MB | 无泄漏（池化 + 缓存有界） |

**优化手段**：离屏预烘焙（房间）、对象池（投射物/粒子）、复用目标数组（`collectTargets._buf`）、避开热路径事件总线、`Math.random` 仅用于纯视觉抖动。

---

## 8. 测试策略

| 层 | 工具 | 覆盖 |
|---|---|---|
| 纯逻辑 | `node tests/run-tests.mjs`（89 项） | RNG 确定性、数学、地牢 6 不变量（500 种子）、属性重算、道具应用、玩家、敌人 AI、战斗数学（点到线段等）、事件总线、状态机、对象池 |
| 端到端渲染 | `node tests/harness.mjs <scenario>`（Playwright 无头） | smoke / combat / dungeon / items / boss / all，截图 + JS 错误收集 + 结构化 JSON |
| 手动 | `tests/playtest.html` | 移动端触屏摇杆 |

`harness.mjs` 自建静态服务器（等价 `python -m http.server`），`Cache-Control: no-store` 防缓存导致测试与源码不一致。

---

## 9. 控制清单（程序员一页规则 · 立即执行）

> 这些是**硬规则**，违反即架构腐化。

1. **依赖只能向下**：`main → systems → entities → art → core`。禁止 `core` 反向依赖任何上层；禁止 `art` 写玩法状态（只读）。
2. **玩法随机必须走 `Rng`**：新生成逻辑接受注入的 `Rng`；禁止 `Math.random()`，**唯一例外**是纯视觉抖动（震屏/粒子角度）。
3. **测试/UI 驱动输入必须走 `Input.setStick()`**：禁止直接写 `input.fireX/firing`（会被 `update()` 覆盖）。
4. **热路径零分配**：每帧创建/销毁的对象（子弹/粒子）必须走 `Pool`；复用目标数组。
5. **不变量运行时也校验**：地牢生成后调 `validateDungeon`；新增不变量同时加到测试。
6. **属性只能重算**：加道具 → 追加 `modifier` → `recalcStats()`；禁止就地改写玩法属性（`player.stats.damage += n`）。注意：`stats.timeAlive += dt` 这类**计数器**不属此列。
7. **关键状态用轮询兜底**：Boss/清房等关键状态不得只依赖事件（见 §5.1 教训）。
8. **切场景清瞬时 UI**：`gotoScene()` 里统一清 `itemPanel/damageFlash`。
9. **中文字体测量前必须设 `ctx.font`**：`strokedText` 内部 save/restore 不保留 font，`measureText` 前要显式设字体（Iteration 3 教训：物品名与中文名重叠 bug）。
10. **身份色走 `PAL`**：ink / UI / 心 / 金等身份色必须定义在 `PAL`；实体专属点缀色可少量就地（如道具图标），新实体优先复用 `inkShape` 描边。
11. **无 TODO 占位**：提交前 `node --check` 全绿 + `node tests/run-tests.mjs` 全绿 + `node tests/harness.mjs all` 无 JS 错误。

---

## 10. 风险与技术债

| 项 | 级别 | 说明 | 缓解 |
|---|---|---|---|
| 地牢为树状图（无环） | 低 | 少了原作偶发的环形捷径 | 已记录；后续可加「删除一条环边」策略 |
| 敌人 AI 缺接口约束 | 低 | 忘记写 `e.vx/vy` 运行时才暴露 | 注释规约 + 单测 |
| 缓存失效手工管理 | 低 | 换主题漏清会显示旧图 | 烘焙 key 含楼层/主题 |
| 无音频文件 → 合成音色偏薄 | 低 | Web Audio 合成不如原创音效 | 参数已在 `audio.js` 集中，易调 |
| 场景切换 used `setTimeout`（已改） | 已修 | 早期 Boss 切层用 `setTimeout`，不可测 | 改为固定步 `_bossAdvanceTimer` |
| 无存档/进度持久化 | 信息 | 需求未要求 | 不做 |

---

## 11. 知识缺口与版本说明

- **引擎**：本项目不使用游戏引擎（ADR-001），因此无「引擎 API 版本超训练数据」的风险。
- **目标平台**：现代 Chromium/Firefox/Safari。使用 API：Canvas 2D、Web Audio、Pointer Events、ES Modules、`requestAnimationFrame`、`OffscreenCanvas`（有回退）、`performance.now`。均为长期稳定标准。
- **无网络依赖**：不在运行时请求任何外部资源。

---

## 12. 交付物索引

- **架构**：本文档 + `docs/adr/ADR-001..006` + `docs/architecture-review.md`
- **实现**：`src/`（32 文件）+ `index.html` + `styles.css`
- **测试**：`tests/run-tests.mjs`（89 单测）、`tests/harness.mjs`（5 场景）、`tests/screenshots/`（15 张）、`tests/qa-report.md`
- **运行**：`README.md`
