#!/usr/bin/env node
/**
 * build-failfast.mjs — 打包器「构建期守卫」的常驻单测
 *
 * 为什么存在
 * ----------
 * `tools/build-standalone.mjs` 用**正则**做 ESM→单文件转换，只能处理白名单形态；
 * 它内置了 4 类构建期断言（import/export 白名单、符号注入、悬空 import）来防止
 * 静默产出坏产物。但**守卫本身没有被测试**——若有人重构时误删/改坏某个断言，
 * 将没有任何东西报警，守卫会静默失效。本文件就是「守卫的守卫」。
 *
 * 覆盖
 * ----
 *   A. 7 个**反例**：每种不支持形态都必须 throw，且报错含**正确行号**。
 *   B. 1 个**正向对照**：一个合法模块图必须构建成功，且产物含预期的
 *      `__defs["..."] = function` 与 `exports.<name> =`。
 *      —— 没有正向对照的 fail-fast 测试不可信：一个「永远 throw」的打包器
 *         也能让 7 个反例全过。正向对照专门堵这个假绿。
 *
 * 实现方式
 * --------
 * 直接调用打包器导出的可测接口 `build({ srcDir, entry, outFile, quiet })`，
 * 在**系统临时区**（os.tmpdir()）搭最小模块图，逐个驱动。
 *
 * 清理
 * ----
 * 临时目录用 `mv`（renameSync）移走，**不用 rm**（受限沙箱会拦批量删除）。
 * 且**全程不往仓库里写任何临时文件**。
 *
 * 用法：node tests/build-failfast.mjs
 * 退出码：0 = 全部通过，1 = 有失败
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from '../tools/build-standalone.mjs';

// ---------------------------------------------------------------------------
// 临时工作区（在系统临时区，不在仓库内）
// ---------------------------------------------------------------------------
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'isaac-build-failfast-'));

function writeCase(name, files) {
  const dir = path.join(TMP_ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf8');
  }
  return dir;
}

/** 跑一次构建，返回 { threw, message, html } */
function runBuild(dir, entry = './main.js') {
  try {
    const res = build({ srcDir: dir, entry, outFile: path.join(dir, '__out.html'), quiet: true });
    return { threw: false, message: '', html: res.html };
  } catch (e) {
    return { threw: true, message: String(e && e.message ? e.message : e), html: '' };
  }
}

// ---------------------------------------------------------------------------
// A. 反例定义
//    每个反例把「非法语句」放在已知行号（前置注释补足行数），以便断言行号准确。
// ---------------------------------------------------------------------------
const negatives = [
  {
    name: '#1 export default',
    files: { 'main.js': '// neg: export default\n// (line 2 comment)\nexport default function foo() {}\n' },
    line: 3,
    keyword: 'export',
  },
  {
    name: '#2 default import',
    files: { 'main.js': "// neg: default import\nimport X from './x.js';\nexport const ok = 1;\n" },
    line: 2,
    keyword: 'default import',
  },
  {
    name: '#3 namespace import',
    files: { 'main.js': "// neg: namespace import\nimport * as NS from './x.js';\nexport const ok = 1;\n" },
    line: 2,
    keyword: 'namespace',
  },
  {
    name: '#4 bare import',
    files: { 'main.js': "// neg: bare import\nimport './x.js';\nexport const ok = 1;\n" },
    line: 2,
    keyword: 'bare import',
  },
  {
    name: '#5 dangling import',
    files: { 'main.js': "// neg: dangling import\n// (line 2 comment)\nimport { a } from './missing.js';\nexport const ok = 1;\n" },
    line: 3,
    keyword: '悬空',
    extra: 'missing.js', // 报错应含期望文件路径线索
  },
  {
    name: '#6 re-export',
    files: { 'main.js': "// neg: re-export\n// (line 2 comment)\nexport { a } from './y.js';\n" },
    line: 3,
    keyword: 're-export',
  },
  {
    name: '#7 export async function',
    files: { 'main.js': '// neg: export async\n// (line 2 comment)\nexport async function foo() {}\n' },
    line: 3,
    keyword: 'async',
  },
];

// ---------------------------------------------------------------------------
// B. 正向对照：合法模块图
// ---------------------------------------------------------------------------
const positive = {
  name: '+ 正向对照（合法模块应构建成功）',
  files: {
    'util.js': "export const VERSION = '1.0';\nexport function greet() {\n  return 'hi';\n}\n",
    'main.js': "import { greet, VERSION } from './util.js';\n\nexport function run() {\n  return greet() + VERSION;\n}\n",
  },
  expect: [
    '__defs["./util.js"] = function',
    '__defs["./main.js"] = function',
    'exports.VERSION = VERSION;',
    'exports.greet = greet;',
    'exports.run = run;',
    '__req("./main.js");',
  ],
};

// ---------------------------------------------------------------------------
// 执行
// ---------------------------------------------------------------------------
const results = [];

// --- A. 反例 ---
for (const c of negatives) {
  const dir = writeCase(c.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase(), c.files);
  const r = runBuild(dir);
  const threwOk = r.threw === true;
  const kwOk = r.message.includes(c.keyword);
  const lineOk = r.message.includes(`src/main.js:${c.line}`);
  const extraOk = c.extra ? r.message.includes(c.extra) : true;
  const pass = threwOk && kwOk && lineOk && extraOk;

  results.push({
    name: c.name,
    pass,
    expected: `throw + 含「${c.keyword}」 + 含行号 src/main.js:${c.line}${c.extra ? ` + 含「${c.extra}」` : ''}`,
    actual: threwOk
      ? `throw ✓ | 关键词${kwOk ? '✓' : '✗'} | 行号${lineOk ? '✓' : '✗'}${c.extra ? ` | 路径${extraOk ? '✓' : '✗'}` : ''}`
      : '未抛出（no throw）',
    raw: r.message.split('\n').slice(0, 4).join(' / '),
  });
}

// --- B. 正向对照 ---
{
  const dir = writeCase('positive-valid', positive.files);
  const r = runBuild(dir);
  const builtOk = r.threw === false && r.html.length > 0;
  const missing = builtOk ? positive.expect.filter((s) => !r.html.includes(s)) : positive.expect;
  const pass = builtOk && missing.length === 0;
  results.push({
    name: positive.name,
    pass,
    expected: `构建成功 + 产物含 ${positive.expect.length} 个预期片段`,
    actual: builtOk
      ? (missing.length === 0 ? `构建成功 ✓ | 产物片段 ${positive.expect.length}/${positive.expect.length} ✓` : `构建成功 ✓ | 缺失片段: ${missing.join(' , ')}`)
      : `构建失败: ${r.raw}`,
    raw: r.threw ? r.message.split('\n').slice(0, 4).join(' / ') : `html ${r.html.length} bytes`,
  });
}

// ---------------------------------------------------------------------------
// 清理：用 mv（renameSync）移走，不用 rm
// ---------------------------------------------------------------------------
function dispose() {
  try {
    const dst = `${TMP_ROOT}-disposed-${Date.now()}`;
    fs.renameSync(TMP_ROOT, dst);
  } catch {
    /* 移走失败不影响判定（目录本就在系统临时区） */
  }
}
dispose();

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------
console.log('\n=== BUILD FAIL-FAST UNIT TESTS ===');
console.log(`临时工作区: ${TMP_ROOT}  （已 mv 移走）\n`);
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
  console.log(`      期望: ${r.expected}`);
  console.log(`      实际: ${r.actual}`);
  if (!r.pass && r.raw) console.log(`      报错: ${r.raw}`);
}

const failed = results.filter((r) => !r.pass);
const passed = results.length - failed.length;
console.log(`\n结果: ${passed} 通过, ${failed.length} 失败, 共 ${results.length}`);
process.exit(failed.length === 0 ? 0 : 1);
