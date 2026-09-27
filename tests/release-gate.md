# 发布前烟雾门控清单（Release Pre-flight Smoke Gate）

> 项目：`case-yisa`（The Binding of Isaac 核心玩法网页复刻）
> 作者：严守真（Yan Soujin）· 游戏质量保障与测试工程师
> 版本：v1.1（增列 **G6 单文件产物门控**，FIX-001）· 用途：**发布/交付前逐项打勾**；任一 ❌ = **未达 QA，禁止发布**。
> 性质：**建议性门控（advisory）**——QA 给判定，最终放行由用户决定。

---

## 0. 一页速查（发布前 5 分钟版）

```bash
# ① 启动本地 HTTP（模块版 index.html 必须走 HTTP；file:// 会 CORS 白屏）
cd <项目根>
python -m http.server 8099 --bind 127.0.0.1 &

# ② 烟雾门控（真实墙钟）—— 必须 PASS / exit 0
node tests/smoke.mjs ; echo "EXIT=$?"        # 期望：判定 PASS，EXIT=0

# ③ 逻辑 + ESM
node tests/run.cjs                            # 期望：全通过（39/39）
node tests/lint-esm.cjs src                   # 期望：PASS，0 缺失导出

# ④ 三种敌人可生成
node tests/_diag-horf.mjs                     # 期望：gaper/pooter/horf 均 > 0（按楼层采样）

# ⑤ 人工看图（真实墙钟截图）
#    tests/shots/qa-smoke.png → 战斗房、HUD 红心、六维条、角色完整、敌人

# ⑥ 单文件产物（用户「双击即玩」路径）—— 构建 + file:// 验证
node tools/build-standalone.mjs               # 期望：OK，产出 dist/isaac-standalone.html（295,365 bytes）
node tests/verify-standalone.mjs              # 期望：PASS 6/6（真实 file:// 路径，无 HTTP 服务）
node tests/qa-standalone-independent.mjs      # 期望：PASS（语义等价 A/B + 玩法扫掠 + 边界；exit 0）
```

---

## 1. 门控项（逐项打勾）

### G1 — 能加载、不白屏、无报错

| # | 检查 | 通过标准 | 结果 |
|---|------|---------|------|
| G1.1 | HTTP 加载 `index.html` | 页面非白屏；`window.__ISAAC__` 存在 | ☐ |
| G1.2 | 控制台无 JS 错误 | 无 SyntaxError/TypeError/undefined；仅允许 AudioContext autoplay 警告 | ☐ |

### G2 — 能进入 PLAYING（**真实墙钟路径**）

| # | 检查 | 通过标准 | 结果 |
|---|------|---------|------|
| G2.1 | 从 TITLE → FLOOR_INTRO → PLAYING | `game.scene === 'playing'`（真实墙钟 ~2.0s 内） | ☐ |
| G2.2 | HUD 出现 | 左上红心 + 左下六维属性条（DMG/RATE/SPD/RNG/SHOT）可见 | ☐ |
| G2.3 | 角色完整绘制 | 头 + 躯干 + 双脚，无水平切割 | ☐ |
| G2.4 | FPS 合理 | `loop.fps ≥ 30`（基线 60） | ☐ |

> ⚠️ **路径纪律**：G2 **只能**在真实墙钟路径（Playwright，`tests/smoke.mjs`）判读。
> 严禁用系统 Chrome `--virtual-time-budget` 判"是否进入 PLAYING"——该路径在加载期饿死 rAF，会**误报卡死**。

### G3 — 核心玩法可达（人工看图 + 探针）

| # | 检查 | 通过标准 | 结果 |
|---|------|---------|------|
| G3.1 | 地牢生成 | 5–8 房、全连通、Boss 房最远；`validateDungeon().ok` | ☐ |
| G3.2 | 移动 / 射击 | WASD 位移正确；四向发射产生子弹 | ☐ |
| G3.3 | 清房开门 | 敌人全灭 → "房间已清空!"，门可穿行 | ☐ |
| G3.4 | **三种普通敌人** | `_diag-horf.mjs` 中 gaper/pooter/**horf** 均出现（首层权重 3:3:1） | ☐ |
| G3.5 | Boss · Monstro 三阶段 | 血条出现；phase 0/1/2 可达；击杀→通关 | ☐ |
| G3.6 | 道具三改变 | 至少各有一道具改变 ①攻击方式 ②属性 ③外观 | ☐ |
| G3.7 | 三界面 | 开始 / 死亡（3 项统计）/ 通关 均可达 | ☐ |

### G4 — 自动测试全绿

| # | 检查 | 通过标准 | 结果 |
|---|------|---------|------|
| G4.1 | 逻辑单测 `run.cjs` | 全通过（**39/39**；OBS-01 误报已由主理人修正正则并复核） | ☐ |
| G4.2 | ESM 依赖图 `lint-esm.cjs` | PASS，0 缺失导出（32 模块） | ☐ |
| G4.3 | 烟雾门控 `smoke.mjs` | **PASS**（exit 0） | ☐ |

### G5 — 未决 Bug 状态

| # | 检查 | 通过标准 | 结果 |
|---|------|---------|------|
| G5.1 | 无 Blocker / Critical | 已决/已关闭 | ☐ |
| G5.2 | BUG-004（Horf）已修并复验 | 60 seed 三型齐全 | ☐ |
| G5.3 | 遗留项已被接受 | BUG-005/006（P2 建议）、OBS-01（测试正则）**非阻塞** | ☐ |

### G6 — 单文件产物门控（file:// 双击即玩）· FIX-001

> **为什么单列 G6**：用户的核心痛点是「双击 `index.html` 黑屏」——根因是 **ES Module 在 `file://` 下被 CORS 拦死**（`origin 'null'`）。
> 交付形态必须是**自包含单文件** `dist/isaac-standalone.html`。**G6 任一 ❌ ⇒ 🔴 FAIL**（等价于用户痛点复发）。

| # | 检查 | 通过标准 | 结果 |
|---|------|---------|------|
| G6.1 | 产物存在且**自包含** | `dist/isaac-standalone.html` 存在；**0** 外部 `src=`/`href=` 引用、**0** `http(s)://` URL、**0** `type="module"`；模块注册表 `__defs["…"] = function` 计 **31** 个真实模块 | ☐ |
| G6.2 | `file://` 下产物可玩 | `node tests/verify-standalone.mjs` 判定 **PASS 6/6**（0 控制台错误 / `__ISAAC__` 存在 / `scene=playing` / canvas 非纯黑 / fps≥30 / 截图落盘） | ☐ |
| G6.3 | 纯双击（无 query）非黑屏 | 真实 `file://` 双击无 query → `scene="title"` 且 **0 真实错误**（**不得**停在黑屏） | ☐ |
| G6.4 | `?seed=<n>` 复现 | `file://` 下 `location.search` 保留；`?seed=<n>` 自动开局进入 `playing`，`game.seed` 与 URL 一致 | ☐ |
| G6.5 | **语义等价性**（打包无损） | 同一 seed 下 `file://` 单文件 与 `HTTP` 模块版，**地牢结构 / 玩家六维属性 / 逐房敌人分布完全一致**；且逐模块**每个导出符号**均以 `exports.<name>=` 形式进入产物（0 缺失） | ☐ |

> **判据纪律（排雷）**：核对模块注册表请用 **`__defs["<id>"] = function`**（双引号，计 **31**）。
> **不要**用 `__defs['`（单引号）——产物由 `JSON.stringify(id)` 生成，单引号式**恒为 0**，据此会误判"模块没注册"。
> 产物中第 32 处 `__defs[` 是 `__req` 内的动态查找 `__defs[id]`，**不是**模块。
> 复核脚本：`tests/qa-standalone-independent.mjs`（独立于 `verify-standalone.mjs`，覆盖 G6.1/G6.3/G6.4/G6.5）。

---

## 2. 判定规则

| 情形 | 判定 |
|------|------|
| G1、G2、**G6**、G4.3 全部 ✅ 且 G3/G5 无 ❌ | 🟢 **PASS** — 可提交用户放行 |
| 仅非阻塞项（P2/建议项）未满足 | 🟡 **CONCERNS** — 可放行，但须记录跟进项 |
| G1 / G2 / G4.3 / **G6** 任一 ❌，或存在 Blocker/Critical | 🔴 **FAIL** — **禁止发布** |

> **G6 为什么是硬门**：用户痛点即「双击打不开」。`dist/isaac-standalone.html` 是**面向最终用户的交付物**——
> 若它自包含性被破坏（引入外部引用）或 `file://` 下不可玩/不可复现/打包丢符号，则**等于交付了一个打不开的游戏**，故判 FAIL。

---

## 3. 当前基线（Iteration 1 · v2.0 判定）

| 门控 | 结果 |
|------|------|
| G1 加载/无报错 | ✅ PASS |
| G2 进入 PLAYING | ✅ PASS（`scene=playing`、fps=60、HUD 红心 61px、角色完整） |
| G3 核心玩法 | ✅ PASS（地牢/战斗/清房/三敌人/Monstro/道具/三界面） |
| G4 自动测试 | ✅ PASS（`smoke.mjs` PASS · ESM PASS · 逻辑 **39/39**） |
| G5 未决 Bug | ✅ PASS（无 Blocker/Critical；BUG-004 已修复复验） |
| G6 单文件产物（file:// 双击即玩） | ✅ PASS（QA-002 独立实测：自包含 0 外部引用；`verify-standalone` 6/6；纯双击 `title`+0 错误；`?seed` 复现；同 seed 语义等价 **逐字节一致**；玩法 7/7） |
| **总判定** | 🟢 **PASS（建议放行）** |

> 遗留（非阻塞）：移动端摇杆需真机端到端、Boss 落地震动/弹幕逐帧、掉落概率分布、真人 Playtest —— 见 `tests/qa-report.md` §5。

---

## 4. 常见误报与排雷

| 现象 | 真因 | 处置 |
|------|------|------|
| 截图停在 "B1 / Basement" 过场、角色半截 | `--virtual-time-budget` 饿死 rAF（首帧残留） | **换真实墙钟路径复现**；勿据此判 Blocker |
| 截图纯黑 | 同上（3s 预算连首帧都未稳） | 同上 |
| 白屏 | **模块版** `index.html` 走了 `file://`（ESM 被 CORS 拦死，`origin 'null'`） | 改走 HTTP；**或改用自包含单文件 `dist/isaac-standalone.html`（双击即玩）** |
| 以为"打包器没注册模块" | 用 `__defs['`（单引号）匹配 → 恒为 0 | 改用 **`__defs["<id>"] = function`（双引号）= 31**；第 32 处 `__defs[id]` 是动态查找，非模块 |
| 逻辑单测 1 项"ctx 未定义" | 测试正则不识别类方法形参 | **已修正**（正则覆盖类方法签名，6 组真假阳性用例验证后 39/39） |
| 截图偶发玩家缺失 | 进房淡入瞬态 | 真实墙钟复现确认；非稳定缺陷 |
