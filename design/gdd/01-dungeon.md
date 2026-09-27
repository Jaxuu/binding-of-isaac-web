# 01 · 地牢生成系统 GDD

> 项目：Isaac-Roguelike
> 作者：文策渊（Vince Coyer）· 设计战略师
> 版本：v1.0
> 依赖：`00-concept.md`（P4 短局循环）、`docs/framework-notes.md`（整数缩放约束）
> 被依赖：`04-enemies-boss.md`（刷新波）、`05-ux-flow.md`（小地图布局）

---

## 1. 系统概述（Overview）

本系统负责**每一层的程序化地牢生成**：在逻辑网格上随机放置 5–8 个普通房 + 1 个 Boss 房，保证全图连通、消除死胡同、Boss 房距离起点最远，并为每个房间生成门、障碍物与敌人刷怪点。

**设计目标**：
- 每局不同，但始终"可读、可解析、可预测地公平"。
- 出生房固定安全，Boss 房固定最远 → 保证探索弧线。
- 生成结果**确定性可复现**（给定种子 seed → 相同地图），便于测试与调试。

---

## 2. 尺寸规格（Sizing Spec）

### 2.1 分辨率与缩放（关键决策 · 影响全项目渲染）
> **v1.2 跨成员对齐（权威来源：`design/art-bible.md`）**：tile 尺寸与美术圣经的绘制配方**必须一致**——美术圣经 §2.5 定义地砖/尖刺/坑洞均为 **32×32 tile**。故本文档将 tile 尺寸从 v1.1 的 40px **改为 32px**，tile 数以整数填满画布为准。美术圣经为准（见 `06-consistency-review.md` §跨成员对齐）。

| 参数 | 值 | 说明 |
|------|-----|------|
| 逻辑画布尺寸 | **1280 × 720**（16:9） | 所有游戏逻辑在此坐标系计算 |
| 单 tile 像素 | **32 × 32 px** | 与 art-bible §2.5 地砖/尖刺/坑洞配方一致 |
| 单房间 tile 网格 | **32 列 × 18 行** | 32×32=1024，18×32=576（可玩区） |
| 房间可玩区域 | **1024 × 576 px** | 居中对齐；四周留 (1280−1024)/2=128px 横、(720−576)/2=72px 纵 |
| 墙体厚度 | **1 tile（32px）** 视觉 + 门框内嵌 | 与 art-bible 墙面配方（顶面 22px + 侧面 18px ≈ 40px 视觉高）共存：逻辑墙 = 32px，美术可绘制到 ~40px 视觉高度 |
| 缩放策略 | 整数缩放（1× / 1.5× / 2×）优先适配，非整数用时 letterbox | Canvas `imageSmoothingEnabled`：sprite 缩放时 `false`，渐变/角色时 `true`（art-bible §3.3） |

> **与原作 13×7 的关系**：原作房间为 13×7 格。本作在 1280×720 下采用 32×18 逻辑格，保持"宽房间"手感且 32px 为整数；**美术圣经提及的"13×7 格"指地砖视觉密度示意，不代表本作逻辑格数** —— 逻辑格数唯一权威为本文档 `32×18`。

**常量定义（供编码直接使用 · 已与 art-bible 对齐）**：
```js
const TILE = 32;                 // px per tile —— 与 art-bible §2.5 地砖配方一致
const ROOM_COLS = 32;            // tiles wide
const ROOM_ROWS = 18;            // tiles tall
const ROOM_W = TILE * ROOM_COLS; // 1024
const ROOM_H = TILE * ROOM_ROWS; // 576
const ROOM_X0 = (1280 - ROOM_W) / 2; // 128（房间左上角在画布中的偏移）
const ROOM_Y0 = (720  - ROOM_H) / 2; // 72
const WALL_THICK = TILE;         // 1 tile 厚墙体（可玩区四周留 1 tile 边界）
const PLAYER_RADIUS = 14;        // px（见 02-combat.md）
```

### 2.2 房间逻辑坐标
> 坐标一律为**房间局部坐标**（房间左上角 = (0,0)），渲染时加 `ROOM_X0/ROOM_Y0` 偏移。
- **玩家可达区**：`x ∈ [32+PLAYER_RADIUS, 992-PLAYER_RADIUS]`，`y ∈ [32+PLAYER_RADIUS, 544-PLAYER_RADIUS]`。
  即"玩家中心点"可活动的范围；墙体内侧边界为 x=32 / x=992 / y=32 / y=544，玩家圆不可越过。
- **门 tile（位于墙体内，与可达区不重叠）**（每边中点，1 tile 宽 = 32px）：
  - 上：`x ∈ [496, 528], y ∈ [0, 32]`
  - 下：`x ∈ [496, 528], y ∈ [544, 576]`
  - 左：`x ∈ [0, 32], y ∈ [272, 304]`
  - 右：`x ∈ [992, 1024], y ∈ [272, 304]`
- **穿门判定**：玩家中心点进入某门 tile 且该门 `open` → 触发房间切换。
  （门 tile 在墙体外侧，玩家可达区止于 x=1000，故不会"误触发"。）

### 2.3 地图网格（Meta-Grid）
房间在地图层面用一个紧凑网格寻址，保证不重叠且房间间高度邻接（提高生成成功率）：
```js
const MAP_COLS = 5;   // 最大 5 列
const MAP_ROWS = 5;   // 最大 5 行（共 25 槽位，放 9 房 → 占用率 36%）
const START_CELL = { x: 2, y: 2 };  // 出生房固定在地图中心
const MAX_ROOMS = 9;  // 含出生房 + Boss 房
```
> **修订说明（v1.1）**：原为 9×8=72 槽位，占用率仅 12.5%，会让房间散布到互不相邻处、频繁触发"30 次重试"甚至保底生成器。收紧为 5×5=25 槽位后，随机扩张算法成功率大幅提升。`MAX_ROOMS=9` 需满足 `MAP_COLS*MAP_ROWS >= MAX_ROOMS`，25 ≥ 9 ✅。

---

## 3. 生成算法（Generation Algorithm）

### 3.1 总流程（步骤化）
```
Step 1. 初始化种子 RNG（seed）
Step 2. 放置出生房（起始房）于 MAP 中心（建议 (4,4)），标记为已占用
Step 3. 随机游走 / 房间槽位扩张，生成 N 个房间槽位（N ∈ [6,9]，含出生与 Boss）
Step 4. 建立邻接图（只连接地图网格上正交相邻的房间）
Step 5. 连通性校验（BFS）；不连通则重新生成（最多重试 30 次）
Step 6. 死胡同消除（见 3.4）
Step 7. 选定 Boss 房 = 距出生房"地图距离"最大的房间（见 3.5）
Step 8. 为每对相邻房间生成门（按相对朝向，两侧各一个）
Step 9. 为每个非出生房生成障碍物布局（岩石/坑洞）
Step 10. 输出 Dungeon 数据结构
```

### 3.2 房间槽位生成（Step 3 细节）
采用**随机扩张（Random Expansion）**算法：
```js
function generateSlots(rng, targetCount):  // targetCount ∈ [6,9]
  slots = [ {x:4, y:4, id:0} ]            // 出生房
  frontier = neighborsOf(start)            // 4 邻域候选
  while slots.length < targetCount:
    cell = pickRandom(frontier, rng)
    remove cell from frontier
    if isOccupied(cell): continue
    add cell to slots
    for n in neighborsOf(cell):
      if !isOccupied(n) and !inFrontier(n): frontier.push(n)
  return slots
```
- **可选偏差**：以距出生房的**切比雪夫距离**加权，让房间倾向"向外扩散"而非贴成一团，视觉更像地下城分支。

### 3.3 邻接图与连通性（Step 4–5）
- **邻接规则**：两个房间槽位**正交相邻**（曼哈顿距离 = 1）即自动建边。
- **连通性校验**：从出生房做 BFS，若访问节点数 < `slots.length` → 丢弃重生成。
- **边数下限**：为防"一条线走廊"，要求 `edges ≥ slots.length - 1`（树）且**至少 1 个环**（`edges ≥ slots.length`）；不满足则重新放置 1 个槽位再试。
- **重试上限**：30 次。仍失败则回退到"必定连通"的蛇形生成器（保底，见 3.6）。

### 3.4 死胡同消除（Step 6）
死胡同 = 度数（degree）= 1 的节点（除出生房与 Boss 房外）。
```
循环直到无死胡同：
  找度=1 的节点 d（非出生房、非 Boss 房）
  若 d 存在未占用的相邻空格 c → 在 c 新增一个房间，连边 d-c（d 度变 2）
  否则 → 删除 d（从 slots 移除），同时移除其唯一邻接房间的对应边
  每次改动后重跑连通性校验
```
- **例外**：允许**最多 1 个**死胡同作为"宝箱房"候选（增强层功能）；MVP 阶段要求 0 个死胡同（保证每间房都是通路，避免玩家迷路）。

### 3.5 Boss 房选取（Step 7 · 硬性规则）
> **用户需求（硬约束）：Boss 房必须最远（距起点距离最大）。**

```
1. 从出生房对全部房间做 BFS，得到最短路径步数 dist[r]
2. 令 maxDist = max(dist.values())
3. 候选集 C = { r | dist[r] == maxDist and r != 出生房 }
4. Boss 房 = 从 C 中用 seed 随机选 1 个
5. 若 maxDist < 3 → 重新生成（保证 Boss 房至少隔 3 步，避免开局即遇 Boss）
```
- **距离度量统一用 BFS 步数**（非欧氏距离），因为玩家实际移动受门连接约束。
- **验证断言（可测试）**：`assert(bossRoom.dist === maxDist) && assert(maxDist >= 3)`。

### 3.6 保底生成器（Fallback）
若 30 次重试全失败：生成**蛇形（Snake）路径**——从出生房出发，按 "右→下→左→下→右…" 走满 N 个房间，末位即 Boss 房。必然连通、必然有唯一最远终点。

---

## 4. 门系统（Door System）

### 4.1 门朝向
每个房间在四边中，**仅在与相邻房间相接的边**上生成门；相邻房间在相对边生成同 id 的配对门。

```js
// 门对象
{ side: 'N'|'S'|'E'|'W',    // 所在边
  targetRoomId: number,      // 通往的房间
  state: 'closed'|'open'|'locked',
  roomClear: boolean }       // 对应房间是否已清
```

### 4.2 门状态机
```
            ┌──────────────────────────────────────┐
            │                                      │
   [closed] │  玩家进入房间且房内有敌人时 → closed   │
            │  房内敌人全灭              → open    │
            │  特殊房条件未满足           → locked  │
            └──────────────────────────────────────┘

状态转移表：
  当前状态         触发条件                     新状态
  ---------       ----------------------       ---------
  closed          room.enemyCount === 0        open
  open            玩家穿过门(到达目标房)         (目标房门状态)
  locked          条件满足(如付金币/用钥匙)       open
  locked          条件不满足                     locked（保持）
  open            玩家离开后目标房有敌人          closed（进入时由目标房决定）
```

- **MVP**：仅 `closed` / `open` 两态。`locked` 用于增强层（商店/恶魔房）。
- **重要交互**：门状态由**所在房间**决定。玩家站在房中，门反映的是当前房间是否已清。
- **穿门规则**：玩家中心点进入门 tile 且门为 `open` 时，触发房间切换；切换时玩家从目标房对侧门"走出"，给予 0.3s 的"移动中不可受击"保护（防止对向飞行弹贴脸）。

### 4.3 门视觉状态（交美术，见 art-bible）
| 状态 | 视觉 |
|------|------|
| closed | 深棕木门 + 粗黑描边，紧闭 |
| open | 门洞开，露出黑色/暗红背景 |
| locked | 门上加金色锁/铁链 |

---

## 5. 房间内容生成（Room Content）

### 5.1 障碍物（岩石 / 坑洞）
每个非出生、非Boss房，按房间"角色"生成障碍：
```js
rockDensity = rng.range(0.02, 0.06);   // 占可玩 tile 比例
pitDensity  = rng.range(0.00, 0.03);
```
- **岩石（Rock）**：阻挡移动与子弹；可被 Ipecac 爆炸摧毁（增强层）。
- **坑洞（Pit）**：阻挡地面单位；飞行单位（含 Lord of the Pit 后玩家）可越过。
- **生成约束**：
  1. 不覆盖门 tile 及其前后 2 tile（保证通行）。
  2. 不覆盖出生/入场刷怪安全区（房间中心 6×4 tile 保持空旷）。
  3. 障碍物不形成"完全阻断"——放置后做一次玩家从中心到四门的 BFS，若不可达则移除阻挡该路径的障碍。
  4. 岩石成簇生成（每次放 2–4 格），避免孤点显得随机。
- **Boss 房**：**不生成**静态障碍物（留出完整竞技场），仅 Boss 自身作为障碍。

### 5.2 刷怪点（Spawn Points）
- **普通房**：从"安全刷怪点池"（房间内距门 ≥ 3 tile、不重叠障碍的 tile）按敌人数随机取点。
- **刷怪时序**：玩家进门后 **0.4s** 延迟开始刷怪（给玩家看清房间的一瞬）；或直接预置（推荐预置，进入即战，节奏更快）。
- **Boss 房**：Monstro 固定在房间中线偏上 `(centerX, y=0.3*H)` 出生。

### 5.3 房间类型（MVP/增强）
| 类型 | 出现概率 | 说明 | 阶段 |
|------|---------|------|------|
| 普通战斗房 | 剩余房间的 100% | 清房得掉落 | MVP |
| 出生房 | 恒定 1 个 | 无敌人、无掉落 | MVP |
| Boss 房 | 恒定 1 个 | 最远房间 | MVP |
| 宝箱房 | 增强：每层 40% | 有宝箱，无敌人 | 增强 |
| 商店 | 增强：每层 50% | 付金币买道具/心 | 增强 |
| 恶魔房 | 增强：每层 30% | 用血量换强力道具 | 增强 |

---

## 6. 数据与公式

### 6.1 房间数量公式
> **口径已锁定（v1.1，默认方案 A）**：用户需求"随机地牢 5–8 房 + Boss 房"中 "5–8 房" = 含出生房与 Boss 房的**总房数**。若用户后续改为"5–8 普通房"，仅需把 `rng.int(3,6)` 改回 `rng.int(4,7)`（见第 8 节）。

```js
// 每层普通房数量（不含出生房与 Boss 房）
normalRoomCount = rng.int(3, 6);        // 方案 A：总房 = 5 ~ 8
totalRooms = 1 (出生) + normalRoomCount + 1 (Boss)
           = 5 ~ 8 房                    // ✅ 严格对齐"5–8 房"
```
- 方案 A 下 `totalRooms ∈ [5,8]`，恒满足 `totalRooms ≤ MAX_ROOMS(9)`。
- **唯一权威公式**：本节为本项目房间数的唯一来源，`00-concept.md` 与 `05-ux-flow.md` 的引用均以此为准。

### 6.2 随机数（确定性 RNG）
```js
// mulberry32 —— 零依赖、可复现
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
```
- 所有生成随机数**必须**来自该 RNG 实例，禁止 `Math.random()`（保证同种子同地图）。

### 6.3 输出数据结构
```js
Dungeon = {
  seed: number,
  rooms: [{
    id: number,
    gridX: number, gridY: number,        // 在 MAP_COLS×MAP_ROWS 中的位置
    type: 'start'|'normal'|'boss'|'treasure'|'shop'|'devil',
    distFromStart: number,               // BFS 步数
    doors: [Door],                       // 见 4.1
    obstacles: [{tileX, tileY, kind:'rock'|'pit'}],
    spawnPoints: [{x, y}],               // 房间内世界坐标
    cleared: boolean
  }],
  adjacency: { [roomId]: roomId[] },     // 邻接表
  bossRoomId: number,
  startRoomId: number
}
```

---

## 7. 边缘情况（Edge Cases）

1. **生成失败**：30 次重试仍无合法地图 → 使用保底蛇形生成器（3.6）。**验收**：任何 seed 都能在 100ms 内产出合法地图。
2. **Boss 房不唯一最远**：多个房间同距 → 随机取 1 个（3.5 Step 4），不影响规则正确性。
3. **房间数 = 最小值**：当 `normalRoomCount=3`（总房 5，方案 A 下限）时，仍须满足 `maxDist ≥ 3`；若地图太小无法满足 → 允许 `maxDist ≥ 2` 并记录警告（不阻塞）。
4. **障碍封死通路**：5.1 约束 3 的 BFS 校验必须通过，否则移除障碍重试（最多 10 次，仍失败则该房不放障碍）。
5. **门配对不同步**：A 房有东门 → B 房必须有西门且 `targetRoomId` 互指。**断言校验**：`∀ door in A.doors: B.doors 存在 side 对立且 target 反向`。
6. **玩家卡在门 tile**：进房时若出生点与门重叠 → 强制把玩家推到房间中心方向 ≥ 1.5 tile 处。
7. **Boss 房与其他房间相邻**：允许（Boss 房也可以有多门），但 Boss 房的门在 Boss 存活时锁死（`closed`），击败后 `open`。
8. **极端种子（如全 0）**：mulberry32(0) 会产生固定序列 → 确保重试逻辑不依赖"必然不同"，仅依赖合法性断言。

---

## 8. 待用户审批项
1. **房间计数口径**：本文档 v1.1 已按**方案 A 锁定**："5–8 房" = 含出生与 Boss 的**总房数**（`normalRoomCount = rng.int(3,6)`）。若用户实为"5–8 普通房"（方案 B），改回 `rng.int(4,7)`（总房 6–9）即可。**请用户确认 A 或 B。**
2. **tile 尺寸**：**已与 art-bible 对齐锁定为 32px / 32×18 格**（见 §2.1 v1.2 说明），不再需要用户在 40px/80px 间裁决。如美术后续调整 art-bible 地砖尺寸，本文档须同步。
3. **死胡同**：MVP 是否允许 1 个死胡同房间（宝箱房候选）？默认不允许。
4. **地图栅格**：已从 9×8 收紧为 5×5（占用率 12.5%→36%，提升生成成功率）。如用户偏好更"舒展"的地图可放宽为 6×6。

## 9. 依赖与接口
- **上游依赖**：`00-concept.md`（层循环、范围）。
- **下游依赖**：
  - `04-enemies-boss.md`：本系统的 `spawnPoints` 与房间难度分层（6.2 节奏表）为刷怪波提供输入。
  - `05-ux-flow.md`：小地图渲染需 `room.gridX/Y` 与 `adjacency`。
  - `02-combat.md`：房间坐标常量、玩家半径、门坐标。
- **给实现者（程基岩）的接口契约**：见 6.3 `Dungeon` 结构；`generateDungeon(seed, opts)` 纯函数，无副作用。

## 10. 验收标准（Acceptance Criteria）
- [ ] `generateDungeon(seed)` 对任意 seed 返回 `rooms.length ∈ [6,9]` 且全图连通。
- [ ] `bossRoom.distFromStart === max(distFromStart)` 恒成立，且 `bossRoom.distFromStart ≥ 3`。
- [ ] 无孤立门、无单向门、门状态随 `cleared` 正确切换。
- [ ] 每个非起始房从中心到所有门 BFS 可达。
- [ ] 相同 seed 两次生成结果字节一致。
- [ ] 生成耗时 < 100ms（含最多 30 次重试）。
