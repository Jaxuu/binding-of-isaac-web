# ADR-002 · 实体采用「轻量 OOP + 数据表驱动」，不引入 ECS

- **状态**：已采纳（Accepted）
- **日期**：2025-09-27
- **决策者**：程基岩（技术总监）
- **关联需求**：GDD 02-combat / 03-items / 04-enemies；用户需求 #6（3 种敌人 + 1 Boss）、#4（道具改变攻击/属性/外观）

---

## 1. 上下文（Context）

本作的实体类型很少且高度可枚举：

- **玩家**：1 个。
- **普通敌人**：3 种（Gaper 追击 / Pooter 飞行远程 / Horf 静止炮台）。
- **Boss**：1 种（Monstro，三阶段）。
- **投射物**：玩家弹 / 敌人弹 / 光束 / 爆炸（4 类）。
- **拾取物 / 掉落**：红心 / 魂心 / 黑心 / 金币 / 钥匙 / 炸弹 / 道具（7 类）。

每种实体有**少量共享属性**（x/y/vx/vy/radius/hp）与**少量独有行为**。且多数行为的差异可以用**数据**表达（敌人字段 `ai: 'chase' | 'flyShooter' | 'turret'`；道具字段 `mods` / `weapon` / `visual`）。

同时「零构建、零依赖」的约束下，任何 ECS 库都不可用，自研 ECS 又是一笔不小的基础设施成本。

## 2. 备选方案（Alternatives）

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| **A. 轻量 OOP 实体 + 数据表驱动（选中）** | 直白、可读、调试友好；`Enemy` 一个类 + `ai` 字段覆盖 3 种敌人；新增敌人只改数据表 | 共享逻辑靠约定，缺少编译期约束 | ✅ **采纳** |
| B. 完整 ECS（Entity-Component-System） | 数据/行为分离、缓存友好、易组合 | 对 3 种敌人是过度工程；`零依赖`下需自研，代码量翻倍；数组存储调试不直观；本作无上万实体压力 | ❌ 过度设计 |
| C. 每种实体一个类（GaperEnemy / PooterEnemy / HorfEnemy 各自成类） | 类型清晰 | 重复代码多；共享的移动/受击/死亡要抄 3 遍；新增敌人要新增类 | ❌ 重复 |
| D. 纯函数元组（对象字面量 + 大 switch） | 无类开销 | 字段散落、易拼错、无 `get hpRatio` 之类的派生属性便利 | ❌ 可维护性差 |

## 3. 决定（Decision）

**采用方案 A**，具体规则：

1. **共享基类/统一接口**：`Enemy` 一个类承载所有普通敌人；`Boss` 独立成一个类（因为它有三阶段状态机、跳跃抛物线等独占逻辑，且战斗系统按 `type === 'boss'` 特判）。
2. **行为数据化**：`ENEMY_DEFS`（`enemy.js`）是唯一的事实来源：
   ```js
   gaper: { hp, speed, contactDamage, radius, flying:false, ai:'chase', ... }
   pooter:{ hp, speed, radius, flying:true, ai:'flyShooter', shootInterval, projectile:{...}, keepDistance }
   horf:  { hp, speed:0, radius, flying:false, ai:'turret', shootInterval, projectile:{...} }
   ```
   新增敌人 = 加一条数据 + （若行为全新）在 `updateEnemyAI` 里加一个 `ai === 'xxx'` 分支。
3. **AI 写成纯函数**：`updateEnemyAI(e, dt, player, spawnBullet)` 只读 `e` 与上下文，**只写 `e` 的意图速度**（`e.vx/vy`）。移动积分、碰撞、边界钳制、互相分离由 `GameState._updateEnemies` 统一处理。好处：AI 可在 Node 里无 canvas 测试。
4. **道具同理**：`ITEM_POOL` 是数据表，`mods: { flat, mult }` 描述数值，`weapon: {...}` 描述投射物，`visual: { devil, crown, ... }` 描述外观。`applyItem()` 是唯一的应用入口。
5. **对象池**：高频创建/销毁的投射物、粒子用 `Pool` + `ActiveList`（见 ADR-005），而非每帧 `new`。

## 4. 后果（Consequences）

### 正面
- 敌人/道具的扩展成本 = 改数据 + 可能加一个分支，符合「短平快」迭代节奏。
- `Enemy` 只有一个类，89 项单测可对其行为做集中断言。
- 战斗系统按「有 `radius` 和 `takeDamage` 的对象」统一处理敌人与 Boss，`collectTargets()` 把 `room.boss` 并入目标列表即可，无需类型分支。

### 负面 / 代价
- 缺少接口约束：若实现新 AI 时忘记设置 `e.vx/vy`，会在运行期表现为「敌人不动」，无编译期报错。
- `updateEnemyAI` 长了会变成大 `switch`（当前 3 分支，可接受）。

### 缓解
- 单测直接断言「给定 def + 上下文，AI 产出的意图速度方向正确」。
- 明确的注释规约：AI 分支必须写 `e.vx/vy`（`enemy.js` 顶部注释已声明）。
- 若未来敌人种类 > 8 或出现「同一实体多种可组合行为」，届时再评估引入**组件化**（非完整 ECS）。

## 5. 验证方式（Verification）

- `tests/run-tests.mjs`：`ENEMY_DEFS` 完整性、`updateEnemyAI` 三类 AI 的速度方向、`applyItem` 的数值重算、道具改变武器与外观。
- `tests/harness.mjs combat`：真实浏览器里 3 种敌人都能被击杀、房间清空。
- 实测：`combat` 场景 `kills:3, remaining:0, cleared:true`。

## 6. 知识缺口

无。
