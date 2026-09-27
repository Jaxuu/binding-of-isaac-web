# ADR-001 · 采用原生 HTML5 Canvas 2D + 原生 ES Modules，零运行时依赖

- **状态**：已采纳（Accepted）
- **日期**：2025-09-27
- **决策者**：程基岩（技术总监）
- **关联需求**：用户锁定技术栈（"原生 HTML5 Canvas 2D + 原生 ES Modules JS，零运行时依赖、零构建步骤、零图片素材"）

---

## 1. 上下文（Context）

用户明确要求本作是一个**可直接被 `python -m http.server` 托管的纯静态站点**：双击 `index.html`（或起个静态服务器）就能玩，不允许 `npm install`、不允许打包、不允许引外部 CDN、不允许加载任何图片/音频文件。

这排除了：
- 任何游戏引擎（Phaser / PixiJS / Three.js）——它们是「运行时依赖」。
- 任何构建工具（Vite / Webpack / Rollup）——违反「零构建」。
- 任何美术资产（.png / .jpg / .wav / .mp3）——违反「零素材」，美术必须**用代码画出来**。

任务书中还额外要求「美术必须真的用代码画出来像原作」。

## 2. 备选方案（Alternatives）

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| **A. 原生 Canvas 2D + ES Modules（选中）** | 零依赖、零构建、离线可跑、源码即产物、调试直观；ES Modules 提供模块化与类型可读性 | 需自己写循环/输入/碰撞/对象池/音频；无引擎生态 | ✅ **采纳** |
| B. Phaser 3 | 自带循环、物理、场景、Tween、素材加载 | 违反「零依赖/零构建」硬约束；包体 1MB+；用不到其 90% 能力 | ❌ 排除（违约） |
| C. PixiJS（仅渲染库） | WebGL 批量渲染，性能强 | 仍是运行时依赖、需 CDN/打包；2D 像素风用不上 WebGL 收益 | ❌ 排除（违约束 + 收益错配） |
| D. 原生 Canvas + 自写模块，但用 `<script src>` 全局脚本 | 无需模块服务器 | 全局命名污染、无显式依赖图、难测试、加载顺序脆弱 | ❌ 排除（可维护性差） |

## 3. 决定（Decision）

**采用方案 A**：

1. **渲染**：单一 `<canvas id="game">`，`getContext('2d')`。所有视觉（角色、敌人、Boss、房间、UI、特效）通过 Canvas 2D 的路径 / 填充 / 描边 / 渐变 / 离屏画布预烘焙绘制。
2. **模块化**：全部源码为原生 ES Modules（`import` / `export`），`package.json` 设 `"type": "module"`。浏览器直接 `import`，无需打包。
3. **运行方式**：`index.html` 用 `<script type="module" src="src/main.js">`；通过任意静态服务器托管（Python / Node 内建服务器）。
4. **音频**：用 Web Audio API **程序化合成**（振荡器 + 噪声 + 滤波器），零音频文件。
5. **测试**：逻辑层用 Node 原生跑（`node tests/run-tests.mjs`），渲染层用 Playwright 无头浏览器截图验证。

## 4. 后果（Consequences）

### 正面
- 交付物 = 源码，任意环境可跑，评审零门槛。
- 无依赖 = 无供应链风险、无版本腐坏、无审计负担。
- 强迫模块化边界（core / art / entities / systems），架构更清晰。
- 「代码绘制」倒逼出可复用的绘制原语库（`primitives.js`），一致性强。

### 负面 / 代价
- 需自研全部基础设施（见 ADR-003 循环、ADR-004 输入、ADR-005 对象池/事件）。
- 无引擎编辑器：关卡/数值需手写数据表（`items.js` / `enemy.js` 的 `*_DEFS`）。
- 性能靠自觉：无引擎的批处理，需自己用离屏预烘焙（见 ADR-006）。

### 缓解
- 用 `tests/run-tests.mjs`（89 项）覆盖纯逻辑，降低「无引擎」带来的回归风险。
- 用 `tests/harness.mjs` 做端到端渲染冒烟，弥补「无编辑器所见即所得」的缺失。

## 5. 验证方式（Verification）

- `index.html` 不含任何外部 URL，`src/` 下无 `http(s)://` 资源引用（仅注释中的文档链接）。
- `tests/harness.mjs` 自建静态服务器加载页面，无 404、无跨域、无 JS 错误。
- 浏览器控制台无「failed to load resource」。

## 6. 知识缺口

无。Canvas 2D / Web Audio / ES Modules 均为长期稳定标准 API。
