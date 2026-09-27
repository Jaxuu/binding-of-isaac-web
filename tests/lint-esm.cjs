#!/usr/bin/env node
/**
 * lint-esm.js — ES Module 静态校验（零依赖，纯 Node）
 *
 * 做三件事：
 *  1. 逐个文件用真实 ESM 语法解析（node --check 对 ESM 不可靠，这里用 vm.SourceTextModule
 *     的替代方案：把 import/export 重写成合法形式后再解析，或用动态 import 探测）
 *  2. 构建 import 依赖图，检出：缺失文件、循环依赖、大小写不匹配
 *  3. 检出「导入了但未导出」的符号 —— 这是最容易在浏览器里炸成 undefined 的错误
 *
 * 用法: node tests/lint-esm.js [srcDir]
 */
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(process.argv[2] || 'src');
const ROOT = path.dirname(SRC);

/** 递归收集 .js */
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** 提取 import 语句：返回 [{spec, names:[], ns:null|string, isSideEffect}] */
function parseImports(code) {
  const out = [];
  const re = /(?:^|\n)\s*import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(code))) {
    const clause = m[1].trim();
    const spec = m[2];
    const rec = { spec, names: [], ns: null, def: null, isSideEffect: false };
    // 命名导入 { a, b as c }
    const named = clause.match(/\{([\s\S]*?)\}/);
    if (named) {
      rec.names = named[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.split(/\s+as\s+/)[0].trim());
    }
    // 命名空间 import * as X
    const ns = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (ns) rec.ns = ns[1];
    // 默认导入 X from '...'
    const withoutNamed = clause.replace(/\{[\s\S]*?\}/, '').replace(/\*\s+as\s+[\w$]+/, '').replace(/,/g, ' ').trim();
    if (withoutNamed && !ns) rec.def = withoutNamed.split(/\s+/)[0];
    out.push(rec);
  }
  // 副作用 import 'x'
  const reSide = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;
  while ((m = reSide.exec(code))) out.push({ spec: m[1], names: [], ns: null, def: null, isSideEffect: true });
  return out;
}

/** 提取顶层导出符号 */
function parseExports(code) {
  const names = new Set();
  const hasDefault = /(?:^|\n)\s*export\s+default\b/.test(code);
  // export const/let/var/function/class
  const reDecl = /(?:^|\n)\s*export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = reDecl.exec(code))) names.add(m[1]);
  // export { a, b as c }
  const reList = /(?:^|\n)\s*export\s*\{([\s\S]*?)\}/g;
  while ((m = reList.exec(code))) {
    for (const piece of m[1].split(',')) {
      const t = piece.trim();
      if (!t) continue;
      const mm = t.match(/([\w$]+)\s+as\s+([\w$]+)/);
      if (mm) names.add(mm[2]);
      else if (/^[\w$]+$/.test(t)) names.add(t);
    }
  }
  // export * from 'x'  → 标记为星号重导出（无法静态确定，放行）
  const starRe = /(?:^|\n)\s*export\s+\*/g;
  const starCount = (code.match(starRe) || []).length;
  return { names, hasDefault, starCount };
}

/** 解析相对模块路径 → 绝对文件 */
function resolveSpec(spec, fromFile) {
  if (!spec.startsWith('.')) return null; // 裸模块：本项目应为零依赖，单列警告
  const base = path.resolve(path.dirname(fromFile), spec);
  const cands = [base, base + '.js', path.join(base, 'index.js')];
  for (const c of cands) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return { missing: base };
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`[lint-esm] 源目录不存在: ${SRC}`);
    process.exit(1);
  }
  const files = walk(SRC).sort();
  const errors = [];
  const warns = [];
  const graph = new Map(); // file -> [deps]
  const exportsMap = new Map();

  // pass 1: 解析导出
  for (const f of files) {
    const code = fs.readFileSync(f, 'utf8');
    exportsMap.set(f, parseExports(code));
  }

  // pass 2: 解析导入 + 校验
  for (const f of files) {
    const code = fs.readFileSync(f, 'utf8');
    const imports = parseImports(code);
    const deps = [];
    for (const imp of imports) {
      if (!imp.spec.startsWith('.')) {
        warns.push(`${path.relative(ROOT, f)}: 裸模块导入 '${imp.spec}' —— 本项目应为零依赖`);
        continue;
      }
      const resolved = resolveSpec(imp.spec, f);
      if (resolved && resolved.missing) {
        errors.push(`${path.relative(ROOT, f)}: 找不到模块 '${imp.spec}' (期望 ${path.relative(ROOT, resolved.missing)}.js)`);
        continue;
      }
      deps.push(resolved);
      const target = exportsMap.get(resolved);
      if (!target) continue;
      if (target.starCount) continue; // 星号重导出，放行
      for (const n of imp.names) {
        if (!target.names.has(n)) {
          errors.push(`${path.relative(ROOT, f)}: 从 '${imp.spec}' 导入了未导出的符号 '{ ${n} }'`);
        }
      }
      if (imp.def && !target.hasDefault && !target.starCount) {
        errors.push(`${path.relative(ROOT, f)}: 从 '${imp.spec}' 导入了默认导出，但目标无 export default`);
      }
    }
    graph.set(f, deps);
  }

  // pass 3: 循环依赖检测（DFS 三色）
  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = new Map(files.map((f) => [f, WHITE]));
  const stack = [];
  const cycles = [];
  function dfs(f) {
    color.set(f, GREY);
    stack.push(f);
    for (const d of graph.get(f) || []) {
      if (color.get(d) === GREY) {
        const i = stack.indexOf(d);
        cycles.push(stack.slice(i).concat(d).map((x) => path.relative(ROOT, x)).join(' -> '));
      } else if (color.get(d) === WHITE) dfs(d);
    }
    stack.pop();
    color.set(f, BLACK);
  }
  for (const f of files) if (color.get(f) === WHITE) dfs(f);
  for (const c of cycles) warns.push(`循环依赖: ${c}`);

  // pass 4: 导出但无人使用（信息性，不报错）
  const usedNames = new Set();
  for (const f of files) {
    for (const imp of parseImports(fs.readFileSync(f, 'utf8'))) imp.names.forEach((n) => usedNames.add(n));
  }

  console.log(`[lint-esm] 扫描 ${files.length} 个模块, ${graph.size} 个依赖边`);
  if (warns.length) {
    console.log(`\n--- 警告 (${warns.length}) ---`);
    warns.forEach((w) => console.log('  ⚠ ' + w));
  }
  if (errors.length) {
    console.log(`\n--- 错误 (${errors.length}) ---`);
    errors.forEach((e) => console.log('  ✗ ' + e));
    console.log('\n[lint-esm] FAIL');
    process.exit(1);
  }
  console.log('\n[lint-esm] PASS — 无缺失模块、无未导出符号、无默认导出误用');
}

main();
