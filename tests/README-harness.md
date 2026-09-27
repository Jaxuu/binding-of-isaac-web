# 试玩验证工具链 (Test Harness)

## 0. Playwright 无头验证 —— `tests/harness.mjs`（可选工装）

`node tests/harness.mjs [smoke|combat|dungeon|items|boss|mobile|mobile-landscape|all]`

真跑一次 Chromium：加载页面 → 模拟按键/触摸 → 截图 → 收集控制台错误 → 输出 JSON。
用于验证「画面是否正确、有无 JS 异常」，这是纯 Node 单测覆盖不到的。

**playwright 是可选依赖，不在生产 manifest 中**（项目定位零依赖零构建）。
首次使用请安装：

```bash
npm i -D playwright && npx playwright install chromium
```

脚本按需动态解析 playwright，缺失时给出明确提示（退出码 2），不会崩溃。

场景：`smoke`（标题 + 桌面无摇杆）、`combat`、`dungeon`、`enemies`（首层三敌采样）、
`items`、`boss`、`mobile`（420×860 触摸视口，**不发送触摸事件**验证待机摇杆可见）、
`mobile-landscape`（860×420 矮视口，验证半径 42 / 纵位 0.72H 自适应）。

移动端摇杆视觉规格见 `design/mobile-controls-spec.md`（林绘澄）：
待机态 alpha=0.42、仅底盘+外圈+十字（不画摇杆头）、暗色底衬 `rgba(10,8,8,0.34)`、
H<560 自适应半径 42 + 上移 0.72H。

### 已知限制（Accepted Limitation）

> **横屏 860×420 下，属性条面板（DMG/RATE/SPD/RNG/SHOT）与左下移动摇杆有视觉重叠。**
>
> 属**已知限制**，经 team-lead 裁决不修复：用户需求的窄竖屏场景（420×860）**已无冲突**
> （见 `screenshots/40-mobile-idle-joysticks.png`）；横屏为次要场景，改动属性条会波及
> 桌面端主场景的信息布局，风险收益不成比例。
>
> 参考：`design/mobile-controls-spec.md` §4 也将「属性条是否改」列为**玩法 UI 取舍**
> （非纯视觉），交由策划/程序决定。本作维持现状。

---

环境限制：本机 **无 Playwright / Puppeteer**（npx 沙箱被拒绝），但系统装有
Chrome 与 Edge。因此备用方案是 **Chrome `--headless=new` 原生截图**，零依赖。

## 1. 静态截图 —— `tests/shoot.sh`

```bash
bash tests/shoot.sh <url> <out.png> [width] [height] [virtualTimeMs]
```

- 自动定位 Chrome（回退 Edge）
- 处理 Windows 路径（`cygpath`）
- 用 `--virtual-time-budget` 让 rAF/animation 快进到指定虚拟时间后再截帧
  —— 这样单帧截图也能截到"动画进行到 N ms"的状态，而不是永远停在 t=0

## 2. 脚本化试玩 —— `tests/playtest.sh`

用 URL 查询参数把"模拟输入脚本"传给游戏，游戏侧读取后自动执行按键序列，
再配合多次截图，就能在无人值守下验证：移动、射击、敌人行为、房间切换。

```bash
bash tests/playtest.sh <url-base> <shot-dir> <scenario>
```

场景（scenario）在游戏侧实现（`src/core/autoplay.js`）：
| 场景 | 验证目标 |
|---|---|
| `idle` | 渲染基线：无黑屏、HUD 正确 |
| `move` | 移动手感：四方向 + 对角线归一化 + 撞墙 |
| `shoot` | 射击：四方向发射、子弹存活/射程衰减 |
| `combat` | 战斗：敌人追击、被击中、玩家受伤、敌人死亡 |
| `clear` | 清房开门 → 切换房间 |
| `boss` | Boss 战全阶段 |
| `item` | 道具拾取 → 属性变化 → 外观变化 |

## 3. 逻辑单测（无浏览器）—— `tests/run.cjs`

纯 Node 跑的算法级验证（地牢连通性、属性叠加边界、碰撞、掉落分布），
用 `node tests/run.cjs`，不依赖任何浏览器。
