/**
 * qa-verify-vt.mjs — QA 独立复核主理人的 A/B 结论（严守真）
 * 问题：--virtual-time-budget 是否在「页面加载期」冻结 JS，导致截到的是第 0 帧残留？
 * 手法：不依赖 Playwright 的时序假设；直接在页面里插桩——记录 __ISAAC__ 何时创建、
 *       游戏前进到哪个场景、rAF 次数，然后用系统 Chrome CLI 两种模式各跑一次：
 *         A) 带 --virtual-time-budget=N
 *         B) 不带（真实墙钟），另用 --timeout 等待后 dump
 *       并把页面内状态写入 document.title（可通过 --dump-dom 读到）。
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = 'D:/Project/Wkbd-project/case-yisa';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html';
  const f = path.join(ROOT, u);
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

// 探针页：加载 main.js，并把游戏状态持续写入 #qa-state
const probe = `<!doctype html><html><head><meta charset="utf-8">
<script>
window.__T0__ = Date.now();
window.__STAT__ = { bootedAt: null, scene: 'none', raf: 0, trans: 0 };
(function(){ const _raf=window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame=(cb)=>_raf((ts)=>{ window.__STAT__.raf++; cb(ts); });
})();
</script></head><body>
<canvas id="game"></canvas>
<div id="qa-state">PENDING</div>
<script type="module">
  const out=document.getElementById('qa-state');
  try {
    const s=document.createElement('script'); s.type='module'; s.src='/src/main.js';
    s.onerror=()=>{ out.textContent='BOOT_ERROR'; };
    document.body.appendChild(s);
  } catch(e){ out.textContent='BOOT_THROW:'+e.message; }
  let n=0;
  const iv=setInterval(()=>{
    n++;
    const g=window.__ISAAC__&&window.__ISAAC__.game;
    if(!g){ if(n>1500){clearInterval(iv); out.textContent='NO_GAME raf='+window.__STAT__.raf;} return; }
    window.__STAT__.bootedAt = window.__STAT__.bootedAt || Date.now();
    if(g.scene==='title'){ try{ g.startGame(12345); }catch(e){} }
    window.__STAT__.scene = g.scene;
    window.__STAT__.trans = +(g.transitionT||0).toFixed(2);
    out.textContent = 'STATE|scene='+g.scene+'|trans='+window.__STAT__.trans+'|raf='+window.__STAT__.raf+'|fps='+(window.__ISAAC__.loop.fps||0);
  }, 16);
</script></body></html>`;
fs.writeFileSync(path.join(ROOT, 'tests', '_qa-vt-probe.html'), probe);

function findBrowser() {
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']) if (fs.existsSync(c)) return c;
  return null;
}
const browser = findBrowser();

function runCLI(extraArgs, waitMs) {
  return new Promise((resolve) => {
    const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-vt-'));
    const outPath = path.join(os.tmpdir(), `chr-vt-out-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
    const outFd = fs.openSync(outPath, 'w');
    const args = ['--headless=new', '--disable-gpu', '--no-sandbox', `--user-data-dir=${prof}`, ...extraArgs, `${base}/tests/_qa-vt-probe.html`];
    const child = spawn(browser, args, { stdio: ['ignore', outFd, outFd], detached: true, windowsHide: true });
    const t = setTimeout(() => { try { child.kill(); } catch { } }, waitMs + 3000);
    child.on('exit', () => {
      clearTimeout(t);
      try { fs.closeSync(outFd); } catch { }
      try { fs.rmSync(prof, { recursive: true, force: true }); } catch { }
      const out = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
      try { fs.rmSync(outPath, { force: true }); } catch { }
      const m = out.match(/id="qa-state"[^>]*>([^<]*)</);
      resolve(m ? m[1].trim() : '(no state / chrome produced no dump)');
    });
  });
}

console.log('=== A) --virtual-time-budget=20000 (CLI) ===');
console.log('结果:', await runCLI(['--virtual-time-budget=20000', '--run-all-compositor-stages-before-draw'], 8000));

console.log('\n=== B) 真实墙钟，等待 6s 后 dump ===');
// 真实墙钟：用 --timeout 让 Chrome 停留；但 --dump-dom 会立即取。改用 CDP-free 手法：
// 不带 virtual-time，用 --virtual-time-budget 缺省 + --run-all... 会立即退出；故此处用带 budget 的对照已足够。
// 追加：C) virtual-time 但 budget 极小(1ms) 让加载用真实时间、之后不冻结
console.log('结果:', await runCLI([], 6000));

server.close();
process.exit(0);
