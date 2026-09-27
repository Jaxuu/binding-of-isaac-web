# ADR-004 · 输入抽象层：物理输入 → 逻辑动作（桌面/移动统一）

- **状态**：已采纳（Accepted）
- **日期**：2025-09-27
- **决策者**：程基岩（技术总监）
- **关联需求**：用户需求 #7（WASD 移动 + 方向键发射 + 移动端虚拟摇杆 + 射击按钮）
- **关联 ADR**：ADR-003（固定步循环中每帧调用 `input.update()`）

---

## 1. 上下文（Context）

同一套玩法代码必须在**桌面键盘**与**移动触屏**上都能跑：

- 桌面：WASD 八向移动 + 方向键四向独立发射（双摇杆式，移动与射击方向解耦）。
- 移动：左半屏拖动 = 移动摇杆，右半屏拖动 = 射击摇杆（推离死区即持续射击）。

若玩法代码直接读 `keydown` 事件或读 `TouchEvent`，就必然出现两套分支逻辑，且无法测试。

**本 ADR 的一个关键教训（来自 Iteration 1 自测）**：测试脚本曾试图直接写 `game.input.firing = true` 来驱动自动开火，结果**失效**——因为 `Input.update()` 每帧根据物理输入重新计算逻辑动作，直接写派生字段会在下一帧被覆盖。这从反面**证明了**本抽象层的正确性：逻辑动作是「物理输入的纯函数」，不是可随意注入的可变状态。

## 2. 备选方案（Alternatives）

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| **A. 物理输入 → 逻辑动作 的归一化层（选中）** | 玩法只读 `moveX/moveY/fireX/fireY/firing`；两套设备共用逻辑；可测；模拟输入有明确入口 | 多一层间接 | ✅ **采纳** |
| B. 玩法直接读 DOM 事件 | 无中间层 | 到处是设备分支；逻辑不可测；事件与固定步循环节奏错配 | ❌ |
| C. 把键盘按键映射成「虚拟按钮」，统一走摇杆向量 | 单一通道 | 键盘是数字量、摇杆是模拟量，混合后手感/吸附逻辑更绕 | ❌ |
| D. 每个设备写一个 Input 子类，玩法持有接口 | 多态清晰 | 本作仅 2 类输入，抽象成本 > 收益 | ❌ 现阶段过度 |

## 3. 决定（Decision）

**采用方案 A**（`src/core/input.js`）。

### 3.1 输出契约（玩法只依赖这些）
| 逻辑动作 | 类型 | 含义 |
|---|---|---|
| `moveX` / `moveY` | −1..1 | 归一化移动向量（长度 > 1 时归一化；键盘为 ±1，摇杆保留模拟量） |
| `fireX` / `fireY` | −1..1 | 发射方向向量（键盘吸附 4 向，摇杆吸附 8 向） |
| `firing` | bool | 是否正在发射 |
| `usingTouch` | bool | UI 是否显示触屏摇杆 |

### 3.2 物理输入源（可被覆盖/驱动）
- `keys: Set<string>`：物理按键 code 集合（键盘）。
- `stickMove` / `stickFire`：`{x, y, active, originX, originY}` 两路摇杆状态。**这是持久化的物理源**：`update()` 只读它，不写它。
- 公开 `setStick(which, x, y, active)`（及内部 `claimPointer` / `_setStick`）：**唯一的模拟输入注入口**，供虚拟摇杆 UI 与自动化测试使用。

### 3.3 优先级与吸附
- 移动：键盘 WASD **优先**；无键盘输入时读 `stickMove`。
- 发射：方向键**优先**（吸附 4 向）；无按键时读 `stickFire`（吸附 8 向，`snapTo8`）；摇杆推离死区（> 0.28）即 `firing = true`（自动持续射击）。
- 指针分流：`pointerdown` 时按 `px < width/2` 判定左半屏 = `move`，右半屏 = `fire`，用 `pointerId → which` 映射支持**多点触控**（左右手同时操作）。

### 3.4 边沿检测
- `_pressed` / `_prevKeys`：每帧 `update()` 计算「本帧刚按下」的按键集合，供菜单 `pressed('Space')` 等边沿语义使用（避免长按连触发）。

### 3.5 生命周期
- 窗口 `blur` 时清空按键与摇杆（防止切窗口后「按键卡住」）。
- `destroy()` 解绑全部监听。

## 4. 后果（Consequences）

### 正面
- 玩法层（`GameState._updatePlayerMovement/_updatePlayerShooting`）完全不感知设备，一份代码两端跑。
- **可测**：测试通过 `setStick('fire', cos, sin, true)` 注入射击，走完整链路（`Input.update → _updatePlayerShooting → Combat`）。
- 防「卡键」：`blur` 清空 + 边沿检测，避免「按住即连击」的菜单误触。

### 负面 / 代价
- 逻辑动作是派生值，**不可直接注入**（必须走物理源）。这对不熟悉的人是个坑（见 §1 教训）。
- 键盘/摇杆混合时的优先级规则需要文档化，否则行为不直观。

### 缓解
- 在 `input.js` 顶部注释明确「物理源 vs 逻辑动作」的二分，并在 `setStick` 处注明「模拟输入唯一入口」。
- 在 `architecture.md` 控制清单里写入「测试/UI 驱动输入必须走 `setStick`，禁止写 `fireX/firing`」。

## 5. 验证方式（Verification）

- `tests/harness.mjs combat`：真实键盘 `keydown('KeyD')` → 玩家位移生效（`afterMove: {x:379,y:122}`）；`keydown('ArrowRight')` → 子弹生成、`facing=0`。
- 同一场景用 `setStick('fire', ...)` 自动瞄准完成清房：`kills:3, remaining:0, cleared:true`（**这条正好验证了物理源驱动链路**）。
- 移动端：`tests/playtest.html` 手动触屏验证（左移动/右射击），指针分流 + 多点触控。

## 6. 知识缺口

无。Pointer Events 为稳定标准 API（Chromium/Safari/Firefox 均支持多点触控）。
