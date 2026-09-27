#!/usr/bin/env node
/**
 * build-standalone.mjs — 「双击即玩」单文件打包器（零依赖）
 *
 * 背景
 * ----
 * 本项目源码是原生 ES Modules（`index.html` 里 `<script type="module">`）。
 * 浏览器安全策略规定：**ES Module 不能通过 `file://` 加载**——
 * 双击打开时页面以 `origin 'null'` 发起请求，`src/main.js` 会被 CORS 拦死，
 * `window.__ISAAC__` 永不创建，canvas 停在默认 300x150 纯黑 → 用户看到黑屏。
 *
 * 本工具把整棵模块依赖图「打平」进一个自包含 HTML：
 *   - 所有 import / export 就地转成一个小型 CommonJS 风格运行时（`__defs` / `__req`）
 *   - 用**经典 `<script>`**（不带 type="module"）内联，`file://` 下零 CORS
 *   - CSS 内联进 `<style>`，**零外部引用**
 *
 * 约束
 * ----
 *   - 只用 Node 内置模块（fs / path / url）；不引入 esbuild / rollup 等。
 *   - **不修改 `src/**` 任何逻辑**，只读源码、生成产物。
 *
 * ⚠️ 构建期 fail-fast（重要）
 * --------------------------
 * 本工具用**正则**做语法转换，只能处理下面白名单内的形态。若贡献者写了
 * 白名单外的语法（如 `export default`），**必须立即 throw**，绝不能静默产出
 * 一个「能生成但运行时报错/功能缺失」的坏产物。因此本脚本在转换前执行：
 *   (a) import 形态白名单校验   —— 仅允许 `import { ... } from '...'`
 *   (b) export 形态白名单校验   —— 仅允许 function/const/let/var/class/{}（无 from）
 *   (c) 符号注入完整性断言       —— 每个导出符号必须在产物里出现 `exports.<name> =`
 *   (d) 悬空 import 断言         —— 每个说明符必须解析到真实文件
 *   并额外做「转换后不得残留 import/export 关键字」的兜底断言。
 * 任何一条不过 → 抛出含「文件路径 + 行号 + 原始语句」的错误并终止。
 *
 * 转换规则（只处理**行首**语句，避免误匹配 JSDoc 里的 `import('...')`）
 * ------------------------------------------------------------------
 *   | 原始                                   | 转换后                             |
 *   |----------------------------------------|------------------------------------|
 *   | `import { a, b as c } from './x.js';`  | `var { a, b: c } = __req('./x.js');` |
 *   | `export function f(...)`               | `function f(...)` + 末尾 `exports.f = f;` |
 *   | `export const x = ...`（含 let/var）    | 去掉 export + 末尾 `exports.x = x;` |
 *   | `export class C ...`                   | 去掉 export + 末尾 `exports.C = C;` |
 *   | `export { a, b as c };`                | `exports.a = a; exports.c = b;`     |
 *
 * ⚠️ 顺序陷阱：`export const` 若在声明处就地写 `exports.x = x` 会踩 TDZ
 *    （const 提升但未初始化）。因此**所有 `exports.X = X` 一律追加到模块体末尾**。
 *
 * 用法：
 *   node tools/build-standalone.mjs                          # 默认：src/main.js → dist/isaac-standalone.html
 *   node tools/build-standalone.mjs --src <dir> --entry ./main.js --out <file>   # 覆盖（供测试/复用）
 *
 * 本文件亦可作为模块被 import（此时不会自动执行构建），用于对校验逻辑做单元测试：
 *   import { build, collectModules, validateImports, validateExports } from './build-standalone.mjs';
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SRC = path.join(ROOT, 'src');
const DEFAULT_ENTRY = './main.js';
const DEFAULT_OUT = path.join(ROOT, 'dist', 'isaac-standalone.html');
const DEFAULT_CSS = path.join(ROOT, 'styles.css');

// ---------------------------------------------------------------------------
// 正则：**行首锚定**（`^` + `m` 标志）。
// 关键：`src/art/draw-room.js:57` 的 JSDoc 注释里含 `import('./draw-obstacles.js')`，
//       而该文件并不存在。若不正则行首锚定，会误把它当依赖 → 构建失败。
// 说明：`[\s\S]*?` 非贪婪 + `^import` 行首锚定，可兼容多行 import 块
//       （如 `src/art/renderer.js:23-26`）。
// ---------------------------------------------------------------------------
const IMPORT_STMT_RE = /^import\b[\s\S]*?;/gm;          // 行首 import 语句（到首个 ';'）
const IMPORT_OK_RE = /^import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]\s*;?$/; // 白名单形态
const IMPORT_RE = /^import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]\s*;?/gm;   // 转换用
const EXPORT_FN_RE = /^export\s+(function|class)\s+([A-Za-z0-9_$]+)/gm;
const EXPORT_VAR_RE = /^export\s+(const|let|var)\s+([A-Za-z0-9_$]+)/gm;
const EXPORT_LIST_RE = /^export\s*\{([^}]*)\}\s*;?/gm;

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------
/** 源码相对 src/ 的展示路径 */
function rel(id) {
  return 'src/' + id.replace(/^\.\//, '');
}

/** 字符下标 → 1 基行号 */
function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 构造带「文件 + 行号 + 原始语句」的构建错误 */
function buildError(kind, id, line, stmt, hint) {
  return new Error(
    `[build] ❌ ${kind}\n` +
    `  文件: ${rel(id)}:${line}\n` +
    `  语句: ${String(stmt).split('\n')[0].trim()}\n` +
    (hint ? `  提示: ${hint}\n` : '')
  );
}

// ---------------------------------------------------------------------------
// (a) import 形态白名单校验
// ---------------------------------------------------------------------------
function validateImports(src, id) {
  const re = new RegExp(IMPORT_STMT_RE.source, 'gm');
  let m;
  while ((m = re.exec(src)) !== null) {
    const stmt = m[0];
    const line = lineOf(src, m.index);
    const trimmed = stmt.trim();
    if (IMPORT_OK_RE.test(trimmed)) continue; // ✅ 白名单

    let kind = '不支持的 import 形态';
    if (/^import\s+[A-Za-z_$]/.test(trimmed)) kind = 'default import（import X from "..."）';
    else if (/^import\s*\*/.test(trimmed)) kind = 'namespace import（import * as NS from "..."）';
    else if (/^import\s*['"]/.test(trimmed)) kind = 'bare import（import "..."）';

    throw buildError(
      kind, id, line, trimmed,
      '仅支持: import { a, b as c } from "./x.js";'
    );
  }
}

// ---------------------------------------------------------------------------
// (b) export 形态白名单校验
// ---------------------------------------------------------------------------
function validateExports(src, id) {
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^export\b/.test(line)) continue; // 只看行首 export
    const ln = i + 1;
    const t = line.trim();

    if (/^export\s+default\b/.test(t)) {
      throw buildError('不支持的 export 形态', id, ln, t, '仅支持: export function/const/let/var/class/{}');
    }
    if (/^export\s+async\b/.test(t)) {
      throw buildError('不支持的 export 形态', id, ln, t, '白名单仅允许 export function（不支持 export async function）');
    }
    if (/^export\s+\*/.test(t)) {
      throw buildError('不支持的 export 形态', id, ln, t, '不支持 export * from（仅支持 export { ... } 无 from）');
    }
    if (/^export\s*\{/.test(t)) {
      // export { ... } 可能跨行：聚合到闭合的 '}'
      let j = i;
      let buf = '';
      while (j < lines.length && !buf.includes('}')) { buf += (buf ? ' ' : '') + lines[j].trim(); j++; }
      if (/\}\s*from\b/.test(buf)) {
        throw buildError('不支持的 export 形态', id, ln, buf, '不支持 re-export（export { ... } from "..."）');
      }
      if (!/\}\s*;?\s*$/.test(buf)) {
        throw buildError('不支持的 export 形态', id, ln, buf, 'export { ... } 未正常闭合（缺少 }）');
      }
      continue; // ✅ 白名单
    }
    if (/^export\s+(function|class|const|let|var)\s+[A-Za-z0-9_$]+/.test(t)) continue; // ✅ 白名单

    throw buildError('未知的 export 形态', id, ln, t, '仅支持: export function/const/let/var/class/{}');
  }
}

// ---------------------------------------------------------------------------
// (c) 符号注入完整性断言（转换后）
// ---------------------------------------------------------------------------
function assertExportsInjected(id, body, pairs) {
  for (const [exp] of pairs) {
    const re = new RegExp('exports\\.' + escapeRe(exp) + '\\s*=');
    if (!re.test(body)) {
      throw new Error(
        `[build] ❌ 符号注入缺失\n` +
        `  文件: ${rel(id)}\n` +
        `  期望产物含: exports.${exp} = ...  （但未找到）\n` +
        `  提示: 导出符号未能正确注入运行时，产物会缺功能。`
      );
    }
  }
  // 兜底：转换后不得残留行首 import/export 关键字
  if (/^\s*import\b/m.test(body)) {
    const idx = body.search(/^\s*import\b/m);
    throw buildError('转换后仍残留 import 关键字', id, lineOf(body, idx), body.match(/^\s*import\b.*/m)[0], '语法未被完全转换');
  }
  if (/^\s*export\b/m.test(body)) {
    const idx = body.search(/^\s*export\b/m);
    throw buildError('转换后仍残留 export 关键字', id, lineOf(body, idx), body.match(/^\s*export\b.*/m)[0], '语法未被完全转换');
  }
}

// ---------------------------------------------------------------------------
// 模块 ID 规范：相对 `src/` 的 POSIX 路径，带 `./` 前缀
//   例：'./core/rng.js'、'./art/draw-room.js'
// 必须与 import 说明符解析结果严格一致。
// ---------------------------------------------------------------------------
function resolveId(fromId, spec) {
  const dir = path.posix.dirname(fromId); // './art/renderer.js' -> './art'
  let id = path.posix.normalize(path.posix.join(dir, spec));
  if (!id.startsWith('./')) id = './' + id;
  return id;
}

/** 扫描某模块的行首 import，返回依赖列表（含行号，供悬空报错定位） */
function extractDeps(src, id) {
  const re = new RegExp(IMPORT_STMT_RE.source, 'gm');
  const deps = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const stmt = m[0];
    const parsed = stmt.trim().match(/^import\s*\{[\s\S]*?\}\s*from\s*['"]([^'"]+)['"]\s*;?$/);
    if (!parsed) continue; // 已在 validateImports 里拦下，这里只做安全跳过
    deps.push({ id: resolveId(id, parsed[1]), line: lineOf(src, m.index), spec: parsed[1], stmt: stmt.trim() });
  }
  return deps;
}

/**
 * 把一个 ESM 模块源码转换成 `function (exports, __req) { ... }` 的模块体。
 * @returns {{ body: string, pairs: Array<[string,string]> }} pairs = [导出名, 本地名]
 */
function transformModule(src, id) {
  const pairs = []; // [exportName, localName]
  let body = src;

  // 1) import { ... } from 'spec';  ->  var { ... } = __req('resolved');
  body = body.replace(IMPORT_RE, (_full, names, spec) => {
    const depId = resolveId(id, spec);
    const converted = names
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((n) => {
        // 'b as c'  ->  'b: c'（解构重命名）
        const asMatch = n.split(/\s+as\s+/);
        return asMatch.length === 2 ? `${asMatch[0].trim()}: ${asMatch[1].trim()}` : n;
      })
      .join(', ');
    return `var { ${converted} } = __req(${JSON.stringify(depId)});`;
  });

  // 2) export function / export class  ->  去 export，记名
  body = body.replace(EXPORT_FN_RE, (_full, kw, name) => {
    pairs.push([name, name]);
    return `${kw} ${name}`;
  });

  // 3) export const / let / var  ->  去 export，记名
  body = body.replace(EXPORT_VAR_RE, (_full, kw, name) => {
    pairs.push([name, name]);
    return `${kw} ${name}`;
  });

  // 4) export { a, b as c };  ->  删除，记 [导出名, 本地名]
  body = body.replace(EXPORT_LIST_RE, (_full, list) => {
    for (const raw of list.split(',')) {
      const n = raw.trim();
      if (!n) continue;
      const asMatch = n.split(/\s+as\s+/);
      if (asMatch.length === 2) pairs.push([asMatch[1].trim(), asMatch[0].trim()]);
      else pairs.push([n, n]);
    }
    return '';
  });

  // 5) 所有 exports.X = X 追加到模块体**末尾**（规避 const/class 的 TDZ）
  if (pairs.length) {
    const tail = pairs.map(([exp, local]) => `exports.${exp} = ${local};`).join('\n  ');
    body = body.trimEnd() + `\n\n  /* ---- exports ---- */\n  ${tail}\n`;
  }

  // (c) 断言符号确实注入
  assertExportsInjected(id, body, pairs);

  return { body, pairs };
}

// ---------------------------------------------------------------------------
// DFS 后序拓扑排序：依赖先于依赖者
// ---------------------------------------------------------------------------
function collectModules(srcDir = DEFAULT_SRC, entry = DEFAULT_ENTRY) {
  const sources = new Map(); // id -> src
  const order = [];          // 后序：依赖在前
  const visiting = new Set();
  const visited = new Set();
  const cycles = [];

  function visit(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) { cycles.push(id); return; }
    visiting.add(id);

    const file = path.join(srcDir, id);
    if (!fs.existsSync(file)) {
      throw new Error(`[build] ❌ 模块不存在: ${id}\n  期望路径: ${file}`);
    }
    const src = fs.readFileSync(file, 'utf8');
    sources.set(id, src);

    // (a)(b) 语法白名单校验（转换前）
    validateImports(src, id);
    validateExports(src, id);

    // (d) 悬空 import 断言 + 递归
    for (const dep of extractDeps(src, id)) {
      const depFile = path.join(srcDir, dep.id);
      if (!fs.existsSync(depFile)) {
        throw buildError(
          `悬空 import（解析到的模块不存在）`, id, dep.line, dep.stmt,
          `"${dep.spec}" 解析为 ${dep.id} → 期望文件 ${depFile}`
        );
      }
      visit(dep.id);
    }

    visiting.delete(id);
    visited.add(id);
    order.push(id);
  }

  visit(entry);
  return { sources, order, cycles };
}

// ---------------------------------------------------------------------------
// 生成运行时
// ---------------------------------------------------------------------------
function buildRuntime(sources, order, entry = DEFAULT_ENTRY) {
  const defs = [];
  for (const id of order) {
    const { body } = transformModule(sources.get(id), id);
    defs.push(`  __defs[${JSON.stringify(id)}] = function (exports, __req) {\n${body}\n  };`);
  }

  return `(function () {
  'use strict';
  var __defs = {};
  var __cache = {};
  function __req(id) {
    if (__cache[id]) return __cache[id].exports;
    var m = { exports: {} };
    __cache[id] = m;
    var factory = __defs[id];
    if (typeof factory !== 'function') throw new Error('[standalone] 未注册的模块: ' + id);
    // 注意：以「值调用」而非「方法调用」执行，保证模块内顶层 this === undefined
    //（与原生 ESM 语义一致）。
    factory(m.exports, __req);
    return m.exports;
  }

  /* ===== 模块注册表（DFS 后序：依赖先于依赖者） ===== */
${defs.join('\n\n')}

  /* ===== 入口 ===== */
  __req(${JSON.stringify(entry)});
})();`;
}

// ---------------------------------------------------------------------------
// 组装 HTML
// ---------------------------------------------------------------------------
function buildHtml(runtimeJs, css) {
  // 安全性：内联 <script> 里若出现字面量 `</script` 会提前闭合脚本。
  // 本项目源码经核实无此序列；这里做一次防御性断言。
  if (/<\/script/i.test(runtimeJs)) {
    throw new Error('[build] 运行时 JS 含 `</script` 字面量，需转义后再内联。');
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#0a0709">
<meta name="description" content="The Binding of Isaac 核心玩法网页复刻版 — 原生 Canvas 2D 代码绘制，零依赖零构建。本文件为「双击即玩」自包含单文件产物。">
<title>The Binding of Isaac · Web</title>
<!-- 由 tools/build-standalone.mjs 自动生成，请勿手工编辑。源码见 src/。 -->
<style>
${css}
</style>
</head>
<body>
  <!-- 唯一的 Canvas：所有美术（角色/敌人/道具/UI）都用 Canvas 2D 路径与渐变代码绘制 -->
  <canvas id="game" aria-label="以撒的结合 网页版游戏画面"></canvas>

  <!-- 无脚本提示 -->
  <noscript>
    <div class="noscript">本游戏需要启用 JavaScript 才能运行。</div>
  </noscript>

  <!-- 自包含启动脚本：经典 script（非 module），file:// 下无 CORS 限制 -->
  <script>
${runtimeJs}
  </script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// 构建编排（可被 import 调用；默认参数 = 项目真实路径）
// ---------------------------------------------------------------------------
function build({
  srcDir = DEFAULT_SRC,
  entry = DEFAULT_ENTRY,
  outFile = DEFAULT_OUT,
  cssFile = DEFAULT_CSS,
  quiet = false,
} = {}) {
  const { sources, order, cycles } = collectModules(srcDir, entry);

  if (cycles.length) {
    console.warn(`[build] ⚠️ 检测到循环依赖（懒加载仍可运行，但拓扑序无法完美）：${[...new Set(cycles)].join(', ')}`);
  }

  const runtimeJs = buildRuntime(sources, order, entry);
  const css = fs.readFileSync(cssFile, 'utf8');
  const html = buildHtml(runtimeJs, css);

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html, 'utf8');

  const bytes = Buffer.byteLength(html, 'utf8');
  if (!quiet) {
    console.log('=== build-standalone ===');
    console.log(`入口          : ${entry}`);
    console.log(`打包模块数    : ${order.length}`);
    console.log(`模块清单      : ${order.join('  ')}`);
    console.log(`CSS 字节      : ${Buffer.byteLength(css, 'utf8')}`);
    console.log(`JS  字节      : ${Buffer.byteLength(runtimeJs, 'utf8')}`);
    console.log(`产物          : ${path.relative(ROOT, outFile).replace(/\\/g, '/')}  (${bytes} bytes)`);
    console.log('构建期校验    : import 白名单 ✓ / export 白名单 ✓ / 符号注入 ✓ / 悬空 import ✓');
    console.log('OK');
  }
  return { order, bytes, outFile, html };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--src') opts.srcDir = path.resolve(argv[++i]);
    else if (a === '--entry') opts.entry = argv[++i];
    else if (a === '--out') opts.outFile = path.resolve(argv[++i]);
    else if (a === '--quiet') opts.quiet = true;
  }
  return opts;
}

function main() {
  build(parseArgs(process.argv.slice(2)));
}

// 仅在「直接执行」时运行；被 import 时只暴露函数（供单元测试驱动）
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) main();

export {
  build,
  collectModules,
  transformModule,
  validateImports,
  validateExports,
  assertExportsInjected,
  extractDeps,
  resolveId,
  DEFAULT_SRC,
  DEFAULT_ENTRY,
  DEFAULT_OUT,
  DEFAULT_CSS,
};
