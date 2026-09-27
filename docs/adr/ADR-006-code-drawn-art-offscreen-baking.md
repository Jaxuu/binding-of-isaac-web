# ADR-006 · 美术全代码绘制（先描边后填充） + 离屏画布预烘焙

- **状态**：已采纳（Accepted）
- **日期**：2025-09-27
- **决策者**：程基岩（技术总监）
- **关联需求**：用户需求「零图片素材，所有美术用代码绘制」「暗黑卡通风：粗黑描边 3px `#1a0d0d`、扁平+微渐变填充、低明度底 + 高饱和点缀」；design/art-bible.md
- **关联 ADR**：ADR-001（零依赖 → 无素材加载器）

---

## 1. 上下文（Context）

「零素材」约束下，所有视觉必须由 Canvas 2D 代码生成。同时 art-bible 规定了明确的视觉身份：

- 粗黑描边 = `3px`、颜色 `ink = #1a0d0d`。
- 扁平 + 微渐变填充。
- 低明度底 + 高饱和点缀。

两个技术挑战：
1. **一致性**：几十种实体（角色/3 敌人/Boss/道具/房间/UI）都要遵守同一描边与配色规范，靠手工调每处 `strokeStyle/lineWidth` 必然漂移。
2. **性能**：墙体砖缝、地砖纹理、道具图标若每帧重跑路径 + 上千次解析，60FPS 会崩。

## 2. 备选方案（Alternatives）

### 2.1 绘制风格

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| **A. 抽取绘制原语（先描边后填充 + 调色板）（选中）** | 描边/配色在一处收口，全项目统一；原语可组合出所有实体；改风格只改原语 | 需先设计原语 API | ✅ **采纳** |
| B. 每个实体各自写绘制代码 | 自由 | 描边粗细/颜色必然漂移；风格难统一 | ❌ |
| C. 生成 SVG/数据 URI 再 drawImage | 可复用浏览器矢量 | 仍属「外部资源生成」，且每帧需栅格化，不如直接画 | ❌ 绕远 |

### 2.2 性能

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| **A. 离屏预烘焙 + 每帧 drawImage（选中）** | 静态层（房间）只画一次；道具图标缓存；成本可测 | 需缓存失效策略（换层/换主题） | ✅ **采纳** |
| B. 每帧全量重画 | 实现简单 | 墙体上千 stroke 每帧重跑 → 掉帧 | ❌ |
| C. WebGL 批量渲染 | 性能上限高 | 违反零依赖；2D 像素风收益错配 | ❌ |

## 3. 决定（Decision）

### 3.1 绘制原语（`src/art/primitives.js`）

核心是 **`inkShape`：先 `stroke` 后 `fill`**，保证描边永远在外侧、不被填充覆盖，从而任何形状都有一致的外轮廓。

```js
// 伪代码语义
inkShape(ctx, pathFn, { fill, lineWidth = 3, stroke = PAL.ink }) {
  pathFn(ctx);          // 定义路径
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = stroke;
  ctx.stroke();         // 先描边
  ctx.fillStyle = fill;
  ctx.fill();           // 后填充
}
```

配套原语：
- 几何：`circle` / `ellipse` / `roundRect` / `polygon` / `star`
- 血肉质感：`blob`（不规则血肉团，用 `makeJitter` 扰动半径）、`radialHighlight`、`linearShade`
- 阴影：`groundShadow`（椭圆接地影）、`withShadow`（临时开启 ctx.shadow 的包装）
- 文字：`strokedText`（描边文字，全 UI 复用）

**调色板 `src/art/palette.js`**：`PAL` 是唯一颜色来源，`ink = '#1a0d0d'` 等。新实体加颜色只允许加到 `PAL`，不得内联十六进制（少数一次性高饱和点缀除外）。

### 3.2 离屏预烘焙（`src/art/cache.js`）

- `makeCanvas(w,h)`：优先 `OffscreenCanvas`，不支持则回退 `document.createElement('canvas')`（两者 2D 接口一致，`ctx2d` 统一取上下文）。
- `bake(key, w, h, painter)`：按 key 缓存「只画一次」的画面。
- `bakeSheet(key, frames, fw, fh, painter)`：把「帧号 → 绘制」烘焙成横向图集，运行时 `drawSheetFrame` 只做 `drawImage` 切片（供动画用）。
- `cacheClear(prefix)`：换层/换主题时按前缀失效。

**实际使用**：
- `renderer._ensureRoomBaked(room)`：房间地面 + 墙体纹理烘焙成一张 `worldW × worldH` 离屏图，每帧只 `drawImage` 一次（`renderer.js:162`）。
- 道具图标：按 `item.id` 烘焙。
- `WORLD_W = ROOM_COLS*TILE + WALL_T*2`，`WORLD_H = ROOM_ROWS*TILE + WALL_T*2`（含墙体）。

### 3.3 HiDPI
- `renderer.resize()` 用 `dpr = min(2, devicePixelRatio)`，`canvas.width = viewW * dpr` 并 `ctx.setTransform(dpr,0,0,dpr,0,0)`，保证在高分屏清晰、且逻辑坐标不变。

## 4. 后果（Consequences）

### 正面
- **风格强一致**：所有实体共用 `inkShape` 与 `PAL`，截图验证「真的像原作」（粗黑描边、扁平填充、暗底高饱和）。
- **性能可控**：房间静态层 O(1) 每帧；60FPS 稳定（`F3` 遥测显示 fps≈60）。
- **零素材**：无网络请求、无解码、无 CORS。
- **可复用**：`strokedText` 等原语同时服务 gameplay 与 UI。

### 负面 / 代价
- 首次进房有一次性烘焙开销（房间较大时约几毫秒）——可接受，因为只在进门时发生。
- 缓存失效必须手工管理（换层主题变化时 `cacheClear`），漏清会显示旧主题。
- 描边先于填充，若形状内部有镂空需注意（已由原语封装处理）。

### 缓解
- 烘焙 key 包含楼层/主题（`_ensureRoomBaked` 的 key 含 room 标识），换层自然失效。
- 保留 `cacheClear('room|')` 作为显式清理入口。

## 5. 验证方式（Verification）

- **截图美学**（`tests/screenshots/`）：
  - `01b-combat-room.png`：地砖方格 + 墙体砖缝 + 木门拱，Gaper/Pooter 血肉质感，HUD 心/金币/钥匙/炸弹。
  - `30-boss-fight.png`：Monstro 绿色大头 + 血肉大口 + 底部血条。
  - `00-title.png`：金/藏青标题 + 红按钮。
- **性能**：`tests/harness.mjs` 各组截图均 > 150KB（非空白），启动无 JS 错误；`F3` 显示 fps≈60。
- **零素材**：`src/` 无 `Image()` / `new Audio(src)` / 任何二进制资源引用。

## 6. 知识缺口

无。`OffscreenCanvas` 为现代浏览器标准，已提供 `document.createElement('canvas')` 回退。
