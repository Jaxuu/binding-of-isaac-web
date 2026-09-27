#!/usr/bin/env node
/**
 * qa-standalone-independent.mjs — 独立验收：自包含单文件产物（FIX-001）
 *
 * 作者：QA 严守真（quality-lead-2）
 * 立场：**独立验证者**。本脚本刻意 **不 import / 不调用** tests/verify-standalone.mjs，
 *       用不同的角度与不同的断言集复核 dist/isaac-standalone.html。
 *
 * 与工程自测脚本（verify-standalone.mjs）的关键区别：
 *   - 工程脚本只证明「能启动」（scene/fps/像素）；本脚本证明「转换无损 + 玩法真的能跑」。
 *   - 本脚本自建 ESM 依赖图（独立解析器），逐模块核对**每个导出符号**是否进了产物。
 *   - 本脚本做**跨版本一致性对照**：同一 seed 下 file:// 单文件 vs HTTP 模块版，
 *     比较地牢结构 / 玩家六维属性 / 敌人分布，任何差异都说明打包转换有语义损失。
 *   - 本脚本在**单文件产物上**逐项驱动核心玩法（移动/射击/清房/受伤/死亡/Boss/通关）。
 *
 * 用法：node tests/qa-standalone-independent.mjs
 * 退出码：0=PASS, 1=CONCERNS, 2=FAIL
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const BUNDLE = path.join(ROOT, 'dist', 'isaac-standalone.html');
const SHOTS = path.join(ROOT, 'tests', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const R = [];
const rec = (section, name, pass, detail) => R.push({ section, name, pass: !!pass, detail });
const J = (d) => (typeof d === 'object' && d !== null ? JSON.stringify(d) : String(d));

/* =========================================================================
 * PART A —— 静态完整性（完全独立的解析器，不看工程的脚本）
 * ========================================================================= */
function readAllSrc() {
  const files = fs.readdirSync(SRC, { recursive: true });
  const map = new Map(); // id './x/y.js' -> src
  for (const f of files) {
    const rel = String(f).replace(/\\/g, '/');
    if (!rel.endsWith('.js')) continue;
    const id = './' + rel;
    map.set(id, fs.readFileSync(path.join(SRC, rel), 'utf8'));
  }
  return map;
}

/** 行首锚定的命名 import（含跨行） */
const RE_IMPORT = /^[ \t]*import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/gm;
/** 非命名 import（default / namespace / 纯副作用）—— 打包器不支持，需检出 */
const RE_IMPORT_OTHER = /^[ \t]*import\s+(?!\{)/gm;
/** 打包器**不**支持的 export 形态（用于风险提示） */
const RE_EXPORT_ASYNC = /^[ \t]*export\s+async\s+function/gm;
const RE_EXPORT_DEFAULT = /^[ \t]*export\s+default/gm;

function resolveId(fromId, spec) {
  const dir = path.posix.dirname(fromId);
  let id = path.posix.normalize(path.posix.join(dir, spec));
  if (!id.startsWith('./')) id = './' + id;
  return id;
}

function extractImports(src, fromId) {
  const out = [];
  const re = new RegExp(RE_IMPORT.source, 'gm');
  let m;
  while ((m = re.exec(src)) !== null) {
    const names = m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((n) => {
        const as = n.split(/\s+as\s+/);
        return { imported: (as.length === 2 ? as[0] : n).trim(), local: (as.length === 2 ? as[1] : n).trim() };
      });
    out.push({ spec: m[2], resolved: resolveId(fromId, m[2]), names });
  }
  return out;
}

/** 源码中该模块导出的符号集合（独立提取，含 async / default 检测） */
function sourceExports(src) {
  const names = new Set();
  let m;
  const reFn = /^[ \t]*export\s+(?:async\s+)?(function|class)\s+([A-Za-z0-9_$]+)/gm;
  while ((m = reFn.exec(src)) !== null) names.add(m[2]);
  const reVar = /^[ \t]*export\s+(const|let|var)\s+([A-Za-z0-9_$]+)/gm;
  while ((m = reVar.exec(src)) !== null) names.add(m[2]);
  const reList = /^[ \t]*export\s*\{([^}]*)\}/gm;
  while ((m = reList.exec(src)) !== null) {
    for (const raw of m[1].split(',')) {
      const t = raw.trim();
      if (!t) continue;
      const as = t.split(/\s+as\s+/);
      names.add((as.length === 2 ? as[1] : as[0]).trim());
    }
  }
  return names;
}

/** 产物中每个 __defs["id"] 工厂体内出现的 exports.<name> 集合 */
function bundleModuleExports(html) {
  const out = new Map();
  const defRe = /__defs\["([^"]+)"\]\s*=\s*function\s*\(exports,\s*__req\)\s*\{/g;
  const marks = [];
  let m;
  while ((m = defRe.exec(html)) !== null) marks.push({ id: m[1], start: m.index, bodyStart: defRe.lastIndex });
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].start : html.length;
    const body = html.slice(marks[i].bodyStart, end);
    const set = new Set();
    const exRe = /exports\.([A-Za-z0-9_$]+)\s*=/g;
    let x;
    while ((x = exRe.exec(body)) !== null) set.add(x[1]);
    out.set(marks[i].id, set);
  }
  return out;
}

function runStaticAnalysis() {
  const srcMap = readAllSrc();
  const html = fs.readFileSync(BUNDLE, 'utf8');

  // ---- A1: 可达性（自建 DFS 后序）----
  const reachable = [];
  const visited = new Set();
  const visiting = new Set();
  const cycles = [];
  const importIndex = new Map(); // id -> [{resolved, names}]
  const missingFiles = [];
  function visit(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) { cycles.push(id); return; }
    visiting.add(id);
    const src = srcMap.get(id);
    if (src === undefined) { missingFiles.push(id); visiting.delete(id); visited.add(id); return; }
    const imps = extractImports(src, id);
    importIndex.set(id, imps);
    for (const im of imps) visit(im.resolved);
    visiting.delete(id);
    visited.add(id);
    reachable.push(id);
  }
  visit('./main.js');

  // ---- A2: 每个被引用模块的导出符号 vs 产物 ----
  const bundleExp = bundleModuleExports(html);
  const missingSymbols = [];
  const extraSymbols = [];
  for (const id of reachable) {
    const want = sourceExports(srcMap.get(id));
    const got = bundleExp.get(id) || new Set();
    for (const w of want) if (!got.has(w)) missingSymbols.push(`${id}::${w}`);
    for (const g of got) if (!want.has(g)) extraSymbols.push(`${id}::${g}`);
  }

  // ---- A3: 每个 import 的符号，目标模块是否真的导出 ----
  const brokenImports = [];
  for (const [id, imps] of importIndex) {
    for (const im of imps) {
      const targetSrc = srcMap.get(im.resolved);
      if (targetSrc === undefined) { brokenImports.push(`${id} -> ${im.resolved} (模块缺失)`); continue; }
      const tExports = sourceExports(targetSrc);
      for (const n of im.names) {
        if (!tExports.has(n.imported)) brokenImports.push(`${id} imports {${n.imported}} from ${im.resolved} — 目标未导出`);
      }
    }
  }

  // ---- A4: 打包器不支持的 import/export 形态（风险面） ----
  const unsupportedImport = [];
  const unsupportedExport = [];
  for (const [id, src] of srcMap) {
    if (RE_IMPORT_OTHER.test(src)) unsupportedImport.push(id);
    if (RE_EXPORT_ASYNC.test(src)) unsupportedExport.push(`${id} (export async function)`);
    if (RE_EXPORT_DEFAULT.test(src)) unsupportedExport.push(`${id} (export default)`);
    RE_IMPORT_OTHER.lastIndex = 0;
    RE_EXPORT_ASYNC.lastIndex = 0;
    RE_EXPORT_DEFAULT.lastIndex = 0;
  }

  // ---- A5: 产物里的模块数 & 外部引用 ----
  const defCount = (html.match(/__defs\["[^"]+"\]\s*=\s*function\s*\(exports,\s*__req\)/g) || []).length;
  const singleQuoteDefCount = (html.match(/__defs\['/g) || []).length;
  const typeModule = (html.match(/type\s*=\s*["']module["']/g) || []).length;
  const localRefs = html.match(/(?:src|href)\s*=\s*["'][^"']+["']/g) || [];
  const httpUrls = html.match(/https?:\/\/[^"'\s)]+/g) || [];
  const scriptClose = (html.match(/<\/script/gi) || []).length; // 应为 1（唯一闭合标签）

  // ---- A6: state.js 可达性复核 ----
  const stateInBundle = [...bundleExp.keys()].includes('./core/state.js');
  const stateReachableFromMain = reachable.includes('./core/state.js');
  const stateReferencedInSrc = [...srcMap.entries()]
    .filter(([id, s]) => id !== './core/state.js' && /^[ \t]*import[^\n]*state\.js/m.test(s))
    .map(([id]) => id);
  // 全仓库（含 tests/）是否有 import 引用 state.js
  const repoFiles = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(mjs|cjs|js|html)$/.test(e.name)) repoFiles.push(p);
    }
  })(ROOT);
  const repoStateRefs = [];
  for (const f of repoFiles) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    if (rel === 'src/core/state.js') continue;
    const txt = fs.readFileSync(f, 'utf8');
    if (/^[ \t]*import[^\n]*state\.js/m.test(txt) || /require\([^)]*state\.js/.test(txt)) repoStateRefs.push(rel);
  }

  rec('A 静态', 'A1 可达模块数（自建解析器）', reachable.length === defCount,
    `自建可达=${reachable.length}，产物 __defs 工厂=${defCount}，一致=${reachable.length === defCount}`);
  rec('A 静态', 'A1b 循环依赖', cycles.length === 0, cycles.length ? cycles.join(', ') : '无');
  rec('A 静态', 'A1c 依赖模块全部存在', missingFiles.length === 0, missingFiles.length ? missingFiles.join(', ') : 'OK');
  rec('A 静态', 'A2 导出符号无缺失（逐模块）', missingSymbols.length === 0,
    missingSymbols.length ? `缺失 ${missingSymbols.length} 个: ${missingSymbols.join(', ')}` : `核对 ${reachable.length} 模块，全部导出符号均在产物中出现`);
  rec('A 静态', 'A2b 产物无多余导出符号', extraSymbols.length === 0,
    extraSymbols.length ? extraSymbols.join(', ') : '无');
  rec('A 静态', 'A3 所有 import 符号都被目标导出', brokenImports.length === 0,
    brokenImports.length ? brokenImports.join(' | ') : `核对全部 import 符号，无悬空引用`);
  rec('A 静态', 'A4 无非命名 import（default/namespace/bare）', unsupportedImport.length === 0,
    unsupportedImport.length ? unsupportedImport.join(', ') : '全部为命名 import，打包器覆盖');
  rec('A 静态', 'A4b 无打包器不支持的 export 形态', unsupportedExport.length === 0,
    unsupportedExport.length ? unsupportedExport.join(', ') : '无 export default / export async');
  rec('A 静态', 'A5 产物模块数 == 31', defCount === 31, `__defs["..."] 工厂数=${defCount}`);
  rec('A 静态', 'A5b 单引号 __defs[\' 计数（主理人建议的核对式）', true,
    `单引号式 __defs[' = ${singleQuoteDefCount}（产物用 JSON.stringify → 双引号，故该式恒为 0，不能据此判定）`);
  rec('A 静态', 'A5c 0 个 type="module"', typeModule === 0, `type="module" 出现 ${typeModule} 次`);
  rec('A 静态', 'A5d 0 处本地 src/href 外部引用', localRefs.length === 0,
    localRefs.length ? localRefs.join(', ') : '无 src=/href= 本地引用');
  rec('A 静态', 'A5e 0 处 http(s) URL', httpUrls.length === 0, httpUrls.length ? httpUrls.join(', ') : '无');
  rec('A 静态', 'A5f 仅 1 个 </script> 闭合', scriptClose === 1, `</script> 出现 ${scriptClose} 次`);

  rec('A 静态', 'A6 state.js 未被 main.js 可达（=未打包）', !stateReachableFromMain && !stateInBundle,
    `可达=${stateReachableFromMain}，产物内=${stateInBundle}`);
  rec('A 静态', 'A6b state.js 在 src/ 内无 import 引用', stateReferencedInSrc.length === 0,
    stateReferencedInSrc.length ? stateReferencedInSrc.join(', ') : 'src/ 内确实无 import 引用（boss.js 仅有注释提及，非 import）');
  rec('A 静态', 'A6c 「全库无任何 import 引用 state.js」的说法', repoStateRefs.length === 0,
    repoStateRefs.length
      ? `**证伪**：全仓库存在 import 引用 → ${repoStateRefs.join(', ')}`
      : '成立');

  // ---- A7: import 语句统计（复核工程「80 条 / 1 处多行」的说法） ----
  let importStmtCount = 0;
  const multilineImports = [];
  for (const [id, src] of srcMap) {
    const re = new RegExp(RE_IMPORT.source, 'gm');
    let m;
    while ((m = re.exec(src)) !== null) {
      importStmtCount++;
      const nl = (m[0].match(/\n/g) || []).length;
      if (nl >= 1) multilineImports.push(`${id} (${nl + 1} 行)`);
    }
  }
  rec('A 静态', 'A7 import 语句总数（自建解析器）', importStmtCount === 80,
    `自建解析器统计 = ${importStmtCount} 条（工程自报 80，主理人先前统计 79）`);
  rec('A 静态', 'A7b 多行 import 数量', multilineImports.length === 1,
    multilineImports.length ? `共 ${multilineImports.length} 处：${multilineImports.join(', ')}` : '无');

  return { reachable, defCount, missingSymbols, extraSymbols, brokenImports, repoStateRefs, stateReferencedInSrc };
}

/* =========================================================================
 * PART B —— 真实浏览器（Playwright，真实墙钟）
 * ========================================================================= */
const EXEMPT = /AudioContext|autoplay|user gesture|Web Audio|DevTools|GPU|gpu|vulkan|dawn|gl_|sandbox/i;
const fileUrl = (q = '') => 'file:///' + BUNDLE.replace(/\\/g, '/') + q;

const SNAPSHOT_FN = () => {
  const I = window.__ISAAC__;
  const g = I.game;
  g.startGame('12345');
  const rooms = g.dungeon.rooms.map((r) => ({
    gx: r.gx, gy: r.gy, kind: r.kind, key: r.key, depth: r.depth,
    doors: { up: !!r.doors.up, down: !!r.doors.down, left: !!r.doors.left, right: !!r.doors.right },
  }));
  const enemyByRoom = {};
  for (const [k, rm] of Object.entries(g.roomsByKey)) {
    enemyByRoom[k] = rm.enemies.map((e) => e.type).sort();
  }
  const s = g.player.stats;
  return {
    count: g.dungeon.count,
    startKey: g.dungeon.startKey,
    bossKey: g.dungeon.bossKey,
    treasureKey: g.dungeon.treasureKey,
    rooms,
    stats: { damage: s.damage, fireDelay: s.fireDelay, speed: s.speed, range: s.range, shotSpeed: s.shotSpeed, maxHealth: s.maxHealth },
    enemyByRoom,
    seed: g.seed,
    floor: g.floor,
  };
};

function startServer() {
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png' };
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let u = decodeURIComponent(req.url.split('?')[0]);
      if (u === '/') u = '/index.html';
      const f = path.join(ROOT, u);
      if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(f, (e, d) => {
        if (e) { res.writeHead(404); res.end('404'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
        res.end(d);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function main() {
  const staticInfo = runStaticAnalysis();

  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless: true });

  async function makePage(ctxOpts = {}) {
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
    return { ctx, page, errs };
  }
  const realErrors = (errs) => errs.filter((e) => !EXEMPT.test(e));

  try {
    /* ---------- B1: 语义等价性（file:// 单文件 vs HTTP 模块版，同 seed） ---------- */
    {
      const A = await makePage({ viewport: { width: 1280, height: 720 } }); // file:// standalone
      const B = await makePage({ viewport: { width: 1280, height: 720 } }); // http index.html
      await A.page.goto(fileUrl(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await B.page.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await A.page.waitForFunction(() => !!window.__ISAAC__, { timeout: 15000 }).catch(() => {});
      await B.page.waitForFunction(() => !!window.__ISAAC__, { timeout: 15000 }).catch(() => {});
      const snapA = await A.page.evaluate(SNAPSHOT_FN);
      const snapB = await B.page.evaluate(SNAPSHOT_FN);

      const jA = JSON.stringify(snapA);
      const jB = JSON.stringify(snapB);
      const equal = jA === jB;

      rec('B1 语义等价', 'B1 同 seed 地牢/属性/敌人分布完全一致', equal,
        equal
          ? `完全一致：count=${snapA.count}, start=${snapA.startKey}, boss=${snapA.bossKey}, treasure=${snapA.treasureKey}`
          : '不一致！差异定位如下');
      if (!equal) {
        rec('B1 语义等价', 'B1a 差异明细', false, diffObjects(snapA, snapB));
      } else {
        rec('B1 语义等价', 'B1a 地牢房间坐标集合', true,
          `房间=${snapA.count}，坐标=[${snapA.rooms.map((r) => `${r.gx},${r.gy}:${r.kind}`).join(' | ')}]`);
        rec('B1 语义等价', 'B1b 玩家六维属性', true, JSON.stringify(snapA.stats));
        const dist = {};
        for (const arr of Object.values(snapA.enemyByRoom)) for (const t of arr) dist[t] = (dist[t] || 0) + 1;
        rec('B1 语义等价', 'B1c 敌人种类分布', true, JSON.stringify(dist));
      }
      await A.ctx.close();
      await B.ctx.close();
    }

    /* ---------- B2: 纯双击（无 query） ---------- */
    {
      const P = await makePage({ viewport: { width: 1280, height: 720 } });
      await P.page.goto(fileUrl(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await P.page.waitForFunction(() => !!window.__ISAAC__, { timeout: 15000 }).catch(() => {});
      await P.page.waitForTimeout(2500);
      const st = await P.page.evaluate(() => {
        const I = window.__ISAAC__;
        const c = document.getElementById('game');
        const ctx = c.getContext('2d');
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        const set = new Set(); let lum = 0, n = 0;
        for (let i = 0; i < d.length; i += 4 * 397) {
          set.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
          lum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++;
        }
        return { scene: I.game.scene, search: location.search, hasIsaac: !!I, uniqueColors: set.size, avgLum: +(lum / Math.max(1, n)).toFixed(1) };
      });
      await P.page.screenshot({ path: path.join(SHOTS, 'qa-independent-title-nofile.png') });
      rec('B2 纯双击', 'B2 无 query 时进入 title（非黑屏）', st.scene === 'title',
        `scene=${st.scene}, location.search=${JSON.stringify(st.search)}, uniqueColors=${st.uniqueColors}, avgLum=${st.avgLum}`);
      rec('B2 纯双击', 'B2a 无 query 时 0 真实错误', realErrors(P.errs).length === 0,
        `硬错误=${P.errs.length}, 未豁免=${realErrors(P.errs).length}${realErrors(P.errs).length ? ' | ' + realErrors(P.errs).slice(0, 3).join(' || ') : ''}`);
      await P.ctx.close();
    }

    /* ---------- B3: ?seed=12345 在 file:// 下是否保留并复现 ---------- */
    {
      const P = await makePage({ viewport: { width: 1280, height: 720 } });
      await P.page.goto(fileUrl('?seed=12345'), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await P.page.waitForFunction(() => !!window.__ISAAC__, { timeout: 15000 }).catch(() => {});
      const search = await P.page.evaluate(() => location.search);
      const entered = await P.page.waitForFunction(() => window.__ISAAC__ && window.__ISAAC__.game.scene === 'playing', { timeout: 8000 }).then(() => true).catch(() => false);
      const seedNow = await P.page.evaluate(() => window.__ISAAC__ && window.__ISAAC__.game.seed);
      rec('B3 seed 复现', 'B3 file:// 保留 query string', search === '?seed=12345', `location.search=${JSON.stringify(search)}`);
      rec('B3 seed 复现', 'B3a ?seed=12345 自动开局进入 playing', entered,
        `scene=${entered ? 'playing' : await P.page.evaluate(() => window.__ISAAC__.game.scene)}, game.seed=${JSON.stringify(seedNow)}`);
      await P.ctx.close();
    }

    /* ---------- B4: 真实玩法扫掠（单文件产物） ---------- */
    {
      const P = await makePage({ viewport: { width: 1280, height: 720 } });
      await P.page.goto(fileUrl(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await P.page.waitForFunction(() => !!window.__ISAAC__, { timeout: 15000 }).catch(() => {});
      await P.page.evaluate(() => window.__ISAAC__.game.startGame('12345'));
      await P.page.waitForFunction(() => window.__ISAAC__.game.scene === 'playing', { timeout: 10000 }).catch(() => {});

      // (1) WASD 移动
      const moveRes = await P.page.evaluate(async () => {
        const I = window.__ISAAC__;
        const p = I.game.player;
        p.x = 312; p.y = 168; p.vx = 0; p.vy = 0; // 房中心
        const out = {};
        for (const [k, ax] of [['KeyD', 'x+'], ['KeyA', 'x-'], ['KeyW', 'y-'], ['KeyS', 'y+']]) {
          p.x = 312; p.y = 168; p.vx = 0; p.vy = 0;
          const before = { x: p.x, y: p.y };
          window.dispatchEvent(new KeyboardEvent('keydown', { code: k, bubbles: true }));
          await new Promise((r) => setTimeout(r, 400));
          window.dispatchEvent(new KeyboardEvent('keyup', { code: k, bubbles: true }));
          out[k] = { dx: +(p.x - before.x).toFixed(1), dy: +(p.y - before.y).toFixed(1) };
          await new Promise((r) => setTimeout(r, 60));
        }
        return out;
      });
      const moved = Object.values(moveRes).some((v) => Math.hypot(v.dx, v.dy) > 25);
      rec('B4 玩法', 'B4a WASD 移动 → 玩家坐标变化', moved, JSON.stringify(moveRes));

      // (2) 方向键射击 → 产生子弹
      const fireRes = await P.page.evaluate(async () => {
        const I = window.__ISAAC__;
        const c = I.game.combat;
        c.playerBullets.clear();
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }));
        await new Promise((r) => setTimeout(r, 350));
        const during = c.playerBullets.length;
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight', bubbles: true }));
        return { during, totalCreated: c.playerBullets.created ?? 'n/a' };
      });
      rec('B4 玩法', 'B4b 方向键射击 → 子弹对象产生', fireRes.during > 0, JSON.stringify(fireRes));

      // (3) 清空房间敌人 → 门打开（room.cleared）
      const clearRes = await P.page.evaluate(async () => {
        const I = window.__ISAAC__;
        const g = I.game;
        // 找一个有敌人的普通房
        let target = null;
        for (const rm of Object.values(g.roomsByKey)) {
          if (rm.kind === 'normal' && rm.enemies.length > 0) { target = rm; break; }
        }
        if (!target) return { ok: false, reason: '未找到含敌人的普通房' };
        target.visited = true;
        target.enterGrace = 0;
        g.currentRoom = target;
        const before = { cleared: target.cleared, enemies: target.enemies.length };
        for (const e of target.enemies) { e.isDead = true; e.dead = 1; e.alive = false; }
        await new Promise((r) => setTimeout(r, 300));
        return { ok: true, room: target.key, before, after: { cleared: target.cleared, hasLive: target.hasLiveEnemies } };
      });
      rec('B4 玩法', 'B4c 清空房间敌人 → 房间进入 cleared', clearRes.ok && clearRes.after && clearRes.after.cleared === true,
        JSON.stringify(clearRes));

      // (4) 玩家受伤 → 红心下降
      const hurtRes = await P.page.evaluate(() => {
        const p = window.__ISAAC__.game.player;
        p.invuln = 0; p.health = p.maxHealth;
        const h0 = p.health;
        const applied = p.takeDamage(2);
        return { h0, h1: p.health, applied };
      });
      rec('B4 玩法', 'B4d 玩家受伤 → 红心数下降', hurtRes.applied === true && hurtRes.h1 === hurtRes.h0 - 2,
        JSON.stringify(hurtRes));

      // (5) 打死玩家 → scene=dead + 死亡界面三项统计
      const deathRes = await P.page.evaluate(async () => {
        const I = window.__ISAAC__;
        const g = I.game;
        g.stats.kills = 3; g.stats.itemsPicked = 1; g.stats.timeAlive = 12.5;
        const p = g.player;
        p.invuln = 0; p.health = 0; p.soulHearts = 0; p.blackHearts = 0; p.alive = false;
        await new Promise((r) => setTimeout(r, 400));
        const btns = (g._deadButtons || []).map((b) => b.id);
        return {
          scene: g.scene,
          deadButtons: btns,
          stats: { kills: g.stats.kills, itemsPicked: g.stats.itemsPicked, timeAlive: g.stats.timeAlive },
        };
      });
      await P.page.screenshot({ path: path.join(SHOTS, 'qa-independent-dead.png') });
      rec('B4 玩法', 'B4e 打死玩家 → scene === "dead"', deathRes.scene === 'dead', `scene=${deathRes.scene}`);
      rec('B4 玩法', 'B4f 死亡界面渲染（drawDeathScreen 执行）', Array.isArray(deathRes.deadButtons) && deathRes.deadButtons.includes('retry'),
        `_deadButtons=${JSON.stringify(deathRes.deadButtons)}`);
      rec('B4 玩法', 'B4g 死亡统计三项（击杀/道具/存活时间）', typeof deathRes.stats.kills === 'number' && typeof deathRes.stats.itemsPicked === 'number' && typeof deathRes.stats.timeAlive === 'number',
        JSON.stringify(deathRes.stats));

      // (6) 强制进入 Boss 房 → Boss 存在 + 血条
      const bossRes = await P.page.evaluate(async () => {
        const I = window.__ISAAC__;
        const g = I.game;
        const bk = g.dungeon.bossKey;
        const room = g.roomsByKey[bk];
        // 让玩家存活并回到 playing
        const p = g.player;
        p.alive = true; p.health = p.maxHealth; p.invuln = 0;
        g.gotoScene('playing');
        room.visited = true; room.enterGrace = 0; room.bossSpawned = false; room.boss = null;
        g.currentRoom = room;
        // 等 Boss 生成
        for (let i = 0; i < 40 && !room.boss; i++) await new Promise((r) => setTimeout(r, 50));
        // 等出场无敌结束（entering <= 0.5）以便血条出现
        for (let i = 0; i < 40 && room.boss && room.boss.entering > 0.5; i++) await new Promise((r) => setTimeout(r, 50));
        // 采样血条像素（底部条带找红色横条）
        const c = document.getElementById('game');
        const ctx = c.getContext('2d');
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        let barRed = 0;
        const y0 = Math.max(0, c.height - 80), y1 = c.height;
        for (let y = y0; y < y1; y++) for (let x = 0; x < c.width; x += 2) {
          const i = (y * c.width + x) * 4;
          if (d[i] > 150 && d[i + 1] < 100 && d[i + 2] < 100) barRed++;
        }
        return {
          exists: !!room.boss,
          alive: room.boss ? room.boss.alive : false,
          name: room.boss ? room.boss.name : null,
          hpRatio: room.boss ? +room.boss.hpRatio.toFixed(2) : null,
          entering: room.boss ? +room.boss.entering.toFixed(2) : null,
          scene: g.scene,
          barRedPx: barRed,
        };
      });
      await P.page.screenshot({ path: path.join(SHOTS, 'qa-independent-boss.png') });
      rec('B4 玩法', 'B4h 强制进入 Boss 房 → Boss 存在且存活', bossRes.exists && bossRes.alive, JSON.stringify(bossRes));
      rec('B4 玩法', 'B4i Boss 血条出现（底部红色横条像素）', bossRes.barRedPx > 50, `barRedPx=${bossRes.barRedPx}`);

      // (7) 强制通关 → scene=win
      const winRes = await P.page.evaluate(async () => {
        const I = window.__ISAAC__;
        const g = I.game;
        const room = g.currentRoom;
        if (!room.boss) return { ok: false, reason: 'Boss 未生成' };
        g.floor = 5; // 最后一层 → 击败 Boss 即通关
        room.boss.alive = false; room.boss.isDead = true; room.boss.dead = 1;
        await new Promise((r) => setTimeout(r, 400));
        return { ok: true, scene: g.scene, winButtons: (g._winButtons || []).map((b) => b.id) };
      });
      await P.page.screenshot({ path: path.join(SHOTS, 'qa-independent-win.png') });
      rec('B4 玩法', 'B4j 强制通关 → scene === "win"', winRes.ok && winRes.scene === 'win', JSON.stringify(winRes));

      rec('B4 玩法', 'B4k 玩法扫掠全程 0 真实错误', realErrors(P.errs).length === 0,
        `未豁免错误=${realErrors(P.errs).length}${realErrors(P.errs).length ? ' | ' + realErrors(P.errs).slice(0, 3).join(' || ') : ''}`);
      await P.ctx.close();
    }

    /* ---------- B5: 移动端视口 + 双摇杆 ---------- */
    {
      const P = await makePage({ viewport: { width: 420, height: 860 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      await P.page.goto(fileUrl(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await P.page.waitForFunction(() => !!window.__ISAAC__, { timeout: 15000 }).catch(() => {});
      await P.page.evaluate(() => window.__ISAAC__.game.startGame('12345'));
      await P.page.waitForFunction(() => window.__ISAAC__.game.scene === 'playing', { timeout: 10000 }).catch(() => {});
      await P.page.waitForTimeout(900);
      const mob = await P.page.evaluate(() => {
        const I = window.__ISAAC__;
        const j = I.renderer.joystick;
        const c = document.getElementById('game');
        const ctx = c.getContext('2d');
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        const dpr = I.renderer.dpr || 1;
        const W = I.renderer.viewW, H = I.renderer.viewH;
        const stickY = H < 560 ? H * 0.72 : H * 0.78;
        const moveC = { x: W * 0.16 * dpr, y: stickY * dpr };
        const fireC = { x: W * 0.84 * dpr, y: stickY * dpr };
        const countBright = (cx, cy, rad) => {
          let n = 0;
          const x0 = Math.max(0, Math.round(cx - rad)), x1 = Math.min(c.width, Math.round(cx + rad));
          const y0 = Math.max(0, Math.round(cy - rad)), y1 = Math.min(c.height, Math.round(cy + rad));
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const i = (y * c.width + x) * 4;
            const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            if (lum > 48) n++;
          }
          return n;
        };
        // 对照区：两摇杆之间的空白地面
        const ctrl = countBright(W * 0.5 * dpr, stickY * dpr, 30 * dpr);
        return {
          touchCapable: I.input.touchCapable,
          enabled: j.enabled,
          alphaMove: +j.alphaMove.toFixed(2),
          alphaFire: +j.alphaFire.toFixed(2),
          canvasW: c.width,
          canvasH: c.height,
          moveStickBright: countBright(moveC.x, moveC.y, 56 * dpr),
          fireStickBright: countBright(fireC.x, fireC.y, 56 * dpr),
          controlBright: ctrl,
        };
      });
      await P.page.screenshot({ path: path.join(SHOTS, 'qa-independent-mobile.png') });
      rec('B5 移动端', 'B5 触摸设备识别 + 摇杆启用', mob.touchCapable === true && mob.enabled === true, JSON.stringify(mob));
      rec('B5 移动端', 'B5a 双摇杆待机 alpha 已升起', mob.alphaMove > 0.3 && mob.alphaFire > 0.3,
        `alphaMove=${mob.alphaMove}, alphaFire=${mob.alphaFire}`);
      rec('B5 移动端', 'B5b 双摇杆实际绘制（左右两处亮像素远多于对照区）',
        mob.moveStickBright > 150 && mob.fireStickBright > 150 && mob.controlBright < 50,
        `moveStickBright=${mob.moveStickBright}, fireStickBright=${mob.fireStickBright}, controlBright=${mob.controlBright}`);
      rec('B5 移动端', 'B5c 移动端 0 真实错误', realErrors(P.errs).length === 0,
        `未豁免错误=${realErrors(P.errs).length}`);
      await P.ctx.close();

      // 对照：桌面（无触摸）不应显示摇杆
      const D = await makePage({ viewport: { width: 1280, height: 720 }, hasTouch: false });
      await D.page.goto(fileUrl(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await D.page.waitForFunction(() => !!window.__ISAAC__, { timeout: 15000 }).catch(() => {});
      await D.page.evaluate(() => window.__ISAAC__.game.startGame('12345'));
      await D.page.waitForFunction(() => window.__ISAAC__.game.scene === 'playing', { timeout: 10000 }).catch(() => {});
      await D.page.waitForTimeout(500);
      const desk = await D.page.evaluate(() => ({ touchCapable: window.__ISAAC__.input.touchCapable, enabled: window.__ISAAC__.renderer.joystick.enabled }));
      rec('B5 移动端', 'B5d 桌面无触摸时不显示摇杆（对照）', desk.touchCapable === false && desk.enabled === false, JSON.stringify(desk));
      await D.ctx.close();
    }

    /* ---------- B6: resize 自适应 ---------- */
    {
      const P = await makePage({ viewport: { width: 1280, height: 720 } });
      await P.page.goto(fileUrl(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await P.page.waitForFunction(() => !!window.__ISAAC__, { timeout: 15000 }).catch(() => {});
      await P.page.evaluate(() => window.__ISAAC__.game.startGame('12345'));
      await P.page.waitForFunction(() => window.__ISAAC__.game.scene === 'playing', { timeout: 10000 }).catch(() => {});
      const before = await P.page.evaluate(() => ({ w: document.getElementById('game').width, scale: window.__ISAAC__.renderer.scale }));
      await P.page.setViewportSize({ width: 900, height: 480 });
      await P.page.waitForTimeout(500);
      const after = await P.page.evaluate(() => {
        const I = window.__ISAAC__;
        const c = document.getElementById('game');
        const ctx = c.getContext('2d');
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        const set = new Set();
        for (let i = 0; i < d.length; i += 4 * 397) set.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
        return { w: c.width, h: c.height, scale: +I.renderer.scale.toFixed(3), viewW: I.renderer.viewW, scene: I.game.scene, uniqueColors: set.size };
      });
      rec('B6 resize', 'B6 resize 后无崩溃、画布自适应', after.scene === 'playing' && after.w !== before.w && after.uniqueColors > 3,
        `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
      rec('B6 resize', 'B6a resize 后 0 真实错误', realErrors(P.errs).length === 0, `未豁免错误=${realErrors(P.errs).length}`);
      await P.ctx.close();
    }
  } catch (e) {
    rec('HARNESS', 'harness 异常', false, e.message);
  } finally {
    await browser.close();
    server.close();
  }

  // ---------- 汇总 ----------
  const sections = [...new Set(R.map((r) => r.section))];
  console.log('\n================ QA-002 独立验收：自包含单文件产物 ================');
  for (const s of sections) {
    console.log(`\n[${s}]`);
    for (const r of R.filter((x) => x.section === s)) {
      console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  —  ${J(r.detail)}`);
    }
  }
  const fails = R.filter((r) => !r.pass);
  // 判定规则（依 QA-002 任务书）：
  //   FAIL    —— 语义等价性(B1) 不成立 / 导出符号缺失(A2) / (c) 任一用户明确需求(B4a–B4j) 不成立
  //   CONCERNS —— 仅非阻塞项（含工程自报的准确性问题）
  //   PASS    —— 全部成立
  const isBlocking = (name) =>
    name.startsWith('B1 同 seed') || name.startsWith('A2 导出符号') || /^B4[a-j] /.test(name);
  const critical = fails.some((f) => isBlocking(f.name));
  const verdict = fails.length === 0 ? 'PASS' : critical ? 'FAIL' : 'CONCERNS';
  console.log(`\n总计: ${R.length - fails.length}/${R.length} 通过`);
  if (fails.length) console.log('未通过:\n' + fails.map((f) => `  - ${f.name}: ${J(f.detail)}`).join('\n'));
  console.log(`\n判定: ${verdict}`);

  const out = { verdict, generatedAt: new Date().toISOString(), results: R, staticInfo: { reachable: staticInfo.reachable, defCount: staticInfo.defCount } };
  fs.writeFileSync(path.join(SHOTS, 'qa-independent-results.json'), JSON.stringify(out, null, 2));
  process.exit(verdict === 'PASS' ? 0 : verdict === 'CONCERNS' ? 1 : 2);
}

function diffObjects(a, b) {
  const diffs = [];
  for (const k of Object.keys(a)) {
    const ja = JSON.stringify(a[k]);
    const jb = JSON.stringify(b[k]);
    if (ja !== jb) diffs.push(`${k}: file://=${ja} | http=${jb}`);
  }
  return diffs.join('  ||  ') || '（无明显字段差异，可能是键序）';
}

main();
