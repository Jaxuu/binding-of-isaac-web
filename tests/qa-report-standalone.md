# QA-002 独立验收报告 —— 自包含单文件构建（FIX-001）

- **Task ID**：QA-002
- **验证者**：quality-lead-2（严守真，QA/测试工程师）—— **独立于 engineering-lead**
- **被验对象**：`dist/isaac-standalone.html`（295,365 bytes）
- **构建器**：`tools/build-standalone.mjs`（零依赖 DFS 后序打包器）
- **验证脚本**：`tests/qa-standalone-independent.mjs`（**自写，不 import / 不调用** `tests/verify-standalone.mjs`）
- **证据目录**：`tests/shots/`（截图 + `qa-independent-results.json`）
- **日期**：本次会话

---

## 0. 判定摘要

| 维度 | 结果 |
|---|---|
| 语义等价性（(a)，最高优先级） | ✅ 完全一致 |
| 静态完整性（(b)） | ✅ 导出符号零缺失、零外部引用 |
| 真实玩法扫掠（(c)，用户明确需求） | ✅ 7/7 项在**单文件产物**上成立 |
| 边界与错误路径（(d)） | ✅ 移动端双摇杆 / resize / 纯双击 / seed 复现 全部成立 |
| 既有门控零回归 | ✅ run-tests 89/89、run.cjs 39/39、lint PASS、smoke PASS、verify-standalone 6/6 |
| 工程自报的准确度 | ⚠️ 5 条"意外发现"中 4 条成立，1 条（claim 1 的**措辞**）不成立 |

> **最终判定：CONCERNS**
> **产品本身 PASS**（全部用户需求 + 语义等价性成立）；**唯一未通过项是工程自报的一处措辞失实**（非阻塞）。按任务书"仅非阻塞项 → CONCERNS"规则，总判定为 CONCERNS。**建议放行，但请工程订正该措辞**（详见 §4）。

---

## 1. 验证方法（我如何"用新眼睛"做，而非复跑工程的脚本）

| 角度 | 我的做法（与 `verify-standalone.mjs` 的差异） |
|---|---|
| 转换无损性 | 自建 ESM 依赖图（独立正则解析器），**逐模块核对每个导出符号**是否以 `exports.<name> =` 形式进入产物；并反向核对每个 `import` 的符号在目标模块确有导出。工程脚本完全没做这一层——它只证明"能启动"，而多数模块 3.5s 内根本不执行，"能启动"证明不了"转换无损"。 |
| 语义等价性 | **跨版本 A/B 对照**：同一 `seed` 下 `file://` 单文件 vs `HTTP` 模块版，一次性（同一 `evaluate` 内同步调用 `startGame` 后立即快照，杜绝帧间漂移）比较**整张地牢**（房间数/坐标/kind/depth/doors/start/boss/treasure）+ **玩家六维属性** + **逐房敌人种类分布**。 |
| 玩法扫掠 | 在**单文件产物**上用真实键盘事件（`KeyboardEvent`）驱动 WASD/方向键，并逐项断言清房开门/受伤/死亡界面/Boss/通关——用户需求必须在**产物**上成立，不能只在模块版成立。 |
| 边界 | 移动端 420×860+`hasTouch`（含**像素级**验证双摇杆真的画出来 + 桌面无触摸对照）、`resize` 自适应、纯双击、`?seed=` 复现。 |
| 证据 | 逐帧截图 + 逐项实际数值；关键界面（死亡/通关/Boss/移动端）我**亲自读取 PNG 目视确认**，不采信脚本措辞。 |

---

## 2. 逐项结论 + 实际数值

### (a) 语义等价性 —— 同一 seed=12345

`file://` 单文件 与 `HTTP` 模块版快照 **逐字节一致**（`JSON.stringify` 相等）：

- 地牢：`count=8`，`startKey="0,0"`，`bossKey="-3,-2"`，`treasureKey="-1,1"`
  房间坐标集：`0,0:start | -1,0:normal | -1,-1:normal | -1,1:treasure | -2,-1:normal | -1,-2:normal | -2,-2:normal | -3,-2:boss`
- 玩家六维属性：`{"damage":3.5,"fireDelay":0.38,"speed":168,"range":340,"shotSpeed":320,"maxHealth":6}`
- 敌人种类分布（全层）：`{"gaper":2,"horf":5,"pooter":1}`

→ **打包转换无损**（地牢生成消耗大量 rng，若任一导出/语义被破坏，二者必分叉）。

> 备注：任务书列的"六维"含 `luck`，但本实现 `STAT_KEYS` 为 `damage/fireDelay/speed/range/shotSpeed/maxHealth`，**不存在 luck 属性**。我对照的是实际存在的六维。（这是既有设计事实，非 FIX-001 缺陷。）

### (b) 静态完整性

| 检查 | 实际值 |
|---|---|
| 产物模块工厂 `__defs["<id>"] = function(exports,__req){` | **31** |
| 自建解析器可达模块数 | **31**（与产物一致） |
| 逐模块导出符号缺失 | **0**（核对 31 模块全部导出） |
| 产物多余导出符号 | **0** |
| import 符号悬空（目标未导出） | **0** |
| 循环依赖 | 无 |
| `type="module"` | **0** 处 |
| 本地 `src=`/`href=` 外部引用 | **0** 处 |
| `http(s)://` URL | **0** 处 |
| `</script>` 闭合标签 | **1**（唯一） |
| import 语句总数 | **80**（自建解析器） |
| 多行 import | **1** 处：`src/art/renderer.js`（4 行，23–26） |

> ⚠️ 任务书建议"统计 `__defs['` 应 = 31" —— 该式在产物中恒为 **0**，因为打包器用 `JSON.stringify(id)` 产出**双引号**（`__defs["./main.js"]`）。**不能用单引号式判定**；正确的核对式是 `__defs["..."] = function`。

### (c) 真实玩法扫掠（全部在 `file://` 单文件产物上）

| # | 需求 | 实际数值 | 结论 |
|---|---|---|---|
| c1 | WASD 移动 | D:dx=+62.3, A:dx=-59.5, W:dy=-59.5, S:dy=+59.5 | ✅ |
| c2 | 方向键射击 | 按住 ArrowRight 350ms → `playerBullets.length=2` | ✅ |
| c3 | 清空房间敌人→开门 | 房 `-1,0`：`cleared false→true`，`hasLiveEnemies false` | ✅ |
| c4 | 玩家受伤→红心下降 | `health 6→4`（`takeDamage(2)` 返回 true） | ✅ |
| c5 | 打死玩家→死亡界面+三项统计 | `scene="dead"`；`_deadButtons=["retry","title"]`；`stats={kills:3,itemsPicked:1,timeAlive:12.5}`；**截图目视确认**"击杀数 3 / 拾取道具 1 / 存活时间 0:12" | ✅ |
| c6 | 强制进 Boss 房→Boss+血条 | Boss `Monstro` 存活 `hpRatio=1`；底部血条红色像素 `1855`；**截图目视确认**血条 + "MONSTRO" 标签 | ✅ |
| c7 | 强制通关→win | `scene="win"`；`_winButtons=["retry","title"]`；**截图目视确认** VICTORY + 通关统计 | ✅ |

### (d) 边界与错误路径

| 项 | 实际数值 | 结论 |
|---|---|---|
| 移动端 420×860 + hasTouch | `touchCapable=true`、`joystick.enabled=true`、`alphaMove/Fire=0.42`；双摇杆亮像素 `move=3557 / fire=1886`，对照区 `0`；**截图目视确认**左右双摇杆 | ✅ |
| 桌面无触摸（对照） | `touchCapable=false`、`enabled=false`（不误显示摇杆） | ✅ |
| resize 1280×720→900×480 | canvas `1280→900`，`scale 1.655→1.036`，`scene` 保持 playing，`uniqueColors=245`，0 错误 | ✅ |
| 纯双击（无 query） | `scene="title"`、`location.search=""`、`uniqueColors=139`、`avgLum=13.9`、**0 真实错误** | ✅ |
| `?seed=12345` on `file://` | `location.search="?seed=12345"` 保留；自动开局 → `scene="playing"`，`game.seed="12345"` | ✅ |
| 全程真实错误 | 各场景均 **0**（仅 AudioContext autoplay 类豁免） | ✅ |

### 既有门控零回归（我独立执行，非采信自报）

- `node tests/run-tests.mjs` → **89 通过 / 0 失败**
- `node tests/run.cjs` → **39 通过 / 0 失败**
- `node tests/lint-esm.cjs` → **PASS**（扫描 32 模块，无缺失模块/未导出符号/默认导出误用）
- `node tests/smoke.mjs` → **PASS**（真实墙钟，scene=playing，fps=60）
- `node tests/verify-standalone.mjs`（工程脚本，仅作对照）→ **PASS 6/6**（uniqueColors=402、avgLum=54.6、fps=60）

---

## 3. 与工程自报的一致 / 不一致清单

### 一致（独立复核成立）

| 工程说法 | 我的独立复核 |
|---|---|
| 打包 **31** 个模块，lint 扫描 **32** 个 | ✅ 产物 `__defs` 工厂=31；lint 自报扫描 32；`src/` 共 32 个 `.js` |
| import 语句 **80** 条 | ✅ 自建解析器 = 80（主理人先前 79 为漏计） |
| **1 处**多行 import（`renderer.js:23-26`，从 `ui.js` 导 9 符号跨 4 行） | ✅ 确认 4 行，唯一一处 |
| `file://` 下 Chromium **保留 query string**，`?seed=12345` 能自动开局 | ✅ `location.search` 保留且自动进入 playing |
| 纯双击（无 query）→ `scene=title`、0 错误（非黑屏） | ✅ scene/errors 完全吻合（见下 uniqueColors 差异） |
| 产物 295,365 bytes | ✅ 精确一致 |
| 既有门控零回归 | ✅ 全部复现 |

### 不一致（需工程订正）

| # | 工程说法 | 实测 | 性质 |
|---|---|---|---|
| **D1** | 「`src/core/state.js`（StateMachine）是死代码，**全库无任何 import 引用它**」 | **结论对、理由错**：`state.js` 确实从 `main.js` 不可达、未被打包（✅ 正确）；但**全库存在 import 引用**——`tests/run-tests.mjs:17` `import { StateMachine } from '../src/core/state.js'`（且 `src/entities/boss.js:10` 注释提及）。准确表述应为「从 `main.js` 入口不可达」而非「全库无 import」。 | **Minor**（自报措辞失实，非产品缺陷） |
| **D2** | 纯双击 `uniqueColors=171` | 我实测 **139**（avgLum=13.9） | 非缺陷：标题页有脉动/浮动动画，采样帧相位不同即不同；双方均 >3，结论（非黑屏）一致 |

> 其余 3 条"意外发现"（80 条 import、1 处多行 import、file:// 保留 query）**全部成立**。

---

## 4. 新发现的缺陷（分级）

- **Blocker / Major**：**无**。未发现导出符号缺失、语义损失或任一用户需求在产物上不成立。
- **Minor（1）**：工程自报 claim 1 措辞失实（D1）。不影响产物，但会误导后续读者以为 `state.js` 可安全删除——**实际上它被单测依赖**，删掉会破坏 `run-tests.mjs`。
- **Minor（2，前瞻性/非当前缺陷）**：打包器是**正则文本转换**，对以下形态会**静默失效**（当前 `src/` 恰好全部规避，故现在无害）：
  - `import X from '...'`（default）、`import * as ns from '...'`（namespace）、`import '...'`（纯副作用）—— 打包器的 `IMPORT_RE` 只认 `import { ... } from`；
  - `export default ...`、`export async function ...` —— 打包器的 export 正则不覆盖。
  - 我已静态确认当前 `src/` **0 处**此类形态，故**本次构建无影响**；但建议给打包器加一道**构建期断言**（发现不支持的 import/export 形态即 fail-fast），避免未来新增模块时"悄悄少打包一个导出"。

> ⚠️ 另有一处**复验陷阱**（与任务书建议的核对式直接相关，主理人本人已踩坑）——已升级为**独立醒目条目** → 见 **§6**。

---

## 5. 最终判定：**CONCERNS**

- **产品维度：PASS。** FIX-001 的目标——"双击即玩、无 CORS、无外部依赖、转换无损、用户全部玩法需求在单文件上成立"——**逐项以实际数值与截图证据达成**。语义等价性（最重要检验）完全一致，导出符号零缺失，玩法扫掠 7/7 通过。
- **报告准确度维度：CONCERNS。** 工程自报 claim 1 的**理由**失实（`state.js` 被单测 import）。
- **综合：CONCERNS**（唯一未通过项为非阻塞的措辞问题）。

**建议给主理人**：
1. 放行 FIX-001 交付（产品可用性已获独立证实）。
2. 请 engineering-lead 订正 claim 1 措辞为「从 `main.js` 入口不可达」，并**保留 `src/core/state.js`**（单测依赖它）。
3. （可选，低优先）给打包器加不支持的 import/export 形态的 fail-fast 断言。

---

## 6. ⚠️ 复验者必读陷阱 —— `__defs` 计数（主理人已踩坑）

**背景**：主理人先前的核对式是「统计产物中 `__defs['`（**单引号**）的出现次数，确认 = 31」。
**该式在本产物上恒为 0**，一度让人怀疑"打包器根本没注册任何模块"。

**真因**：打包器用 `__defs[${JSON.stringify(id)}]` 生成键名，`JSON.stringify` 产出的是**双引号**：

```js
// tools/build-standalone.mjs:181
defs.push(`  __defs[${JSON.stringify(id)}] = function (exports, __req) {\n${body}\n  };`);
// 实际产物形态：  __defs["./main.js"] = function (exports, __req) { ... };
```

**正确判据**：

| 判据 | 值 | 说明 |
|---|---|---|
| `__defs["<id>"] = function`（**双引号**，唯一匹配） | **31** | = 真实模块数（与自建依赖图可达数一致） |
| `__defs[` 出现总次数 | **32** | 31 个模块赋值 + **1** 处运行时动态查找 `var factory = __defs[id];`（`__req` 内，用变量 `id`，**不是**模块） |
| `__defs['`（单引号） | **0** | 恒为 0，**不得**据此判定"模块没注册" |

**给复验者的口诀**：
> 数模块请数 `__defs["…"] = function`（=31）；
> 看到第 32 处 `__defs[` 别慌——那是 `__req` 里的 `__defs[id]` 动态查找。
> **永远不要用单引号 `__defs['` 做判据。**

（本条已同步固化进 `tests/release-gate.md` §G6 判据纪律与 §4 排雷表。）

---

## 7. 哈希等价性留档（FIX-002 加固重建后）

**结论：加固后重建的产物与 QA-002 验收时的产物 SHA256 完全一致，故本报告 §2 的 A/B 语义等价性与 (c) 玩法 7/7 结论对**当前**产物继续成立，无需复跑。**

| 项 | 值 |
|---|---|
| 产物 | `dist/isaac-standalone.html` |
| **SHA256** | `2de9e46199179f296043ea604a0b501afafa5cf1f072e4540a74c834ac85ac40` |
| size | **295,365 bytes** |
| 三方一致性 | ✅ 主理人独立复算 = 工程复算 = QA-002 验收时记录（我验收时的 mtime 16:57:42 与重建后 17:12:10，**内容逐字节相同**） |

**依据与说明**：
- FIX-002 **只新增构建期校验**（打包器 11,136 → 19,706 bytes），**未触碰任何转换/模板逻辑**，因此产物逐字节不变。
- 连续两次构建哈希相同 → 构建**幂等**。
- 因产物内容未变，QA-002 的全部结论（语义等价、导出符号 0 缺失、玩法 7/7、边界）**继续有效**；`qa-standalone-independent.mjs` 无需对同一产物重复执行。

> 留档意义：这条把"加固动作"与"验收有效性"解耦——**只要产物哈希不变，验收证据就持续有效**；若未来哈希变化，则必须对**新**产物重跑 §2 的 A/B 等价性与玩法扫掠。

---

## 8. 测试有效性方法论（前瞻：FIX-003 反例 fail-fast）

> 本节为**方法论记录**（待 FIX-003 `tests/build-failfast.mjs` 落地后以其实际结果为准），作为「测试有效性」的范例。

**原则：只有"反例"是不够的——必须配"正向对照 + 反向验证"。**

- **反例（negative cases）**：喂给打包器 7 种"应当被拒绝"的非法输入（如 default import、`export default`、缺模块等），断言构建**抛错**。
- **陷阱**：一个**"永远 throw"的打包器**也能让 7 个反例**全部通过**——反例全绿并不能证明打包器正确。
- **正向对照（positive control）**：必须同时喂一份**合法**输入，断言构建**成功**。否则"全 throw"的假实现会漏网。
- **反向验证（mutation check）**：**故意注释掉某条断言**，证明该断言对应的测试会**因此 FAIL**。若注释掉后测试仍全绿，说明该断言根本没被真正检验（"测试自己没被测过"）。

**可信的 fail-fast 测试 = 反例（该拒的拒）+ 正向对照（该过的过）+ 反向验证（断言确实有效）。** 三者缺一，门控就可能是"纸糊的"。

（此原则同样适用于本项目的其它门控：`smoke.mjs`/`verify-standalone.mjs` 的"PASS"也需有可证伪的反例支撑，而非只看绿灯。）

---

### 附：可复现命令

```
node tests/qa-standalone-independent.mjs   # 本报告全部结论的生成器（退出码 0=PASS/1=CONCERNS/2=FAIL）
node tests/run-tests.mjs && node tests/run.cjs && node tests/lint-esm.cjs && node tests/smoke.mjs
```

证据：`tests/shots/qa-independent-{title-nofile,dead,boss,win,mobile}.png`、`tests/shots/qa-independent-results.json`。
