/**
 * verify-user-req.mjs — 主理人独立验收（针对用户明确要求但工程测试未覆盖的项）
 *
 * 覆盖：
 *   1. 死亡界面 + 三项统计（击杀数 / 拾取道具数 / 存活时间）
 *   2. 通关界面
 *   3. 移动端虚拟摇杆 + 射击按钮（窄视口，无触摸事件下的待机态）
 *   4. 桌面视口反例（不应出现虚拟摇杆）
 *
 * 用真实 Playwright（已验证可用），真实墙钟时间 + 真实键盘/触摸事件。
 * 注意：场景常量是小写字符串（'title'/'floorIntro'/'playing'/'dead'/'win'）。
 * 用法: node tests/verify-user-req.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests', 'screenshots');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
};

function startServer() {
  return new Promise((resolve) => {
    const srv = createServer(async (req, res) => {
      try {
        let p = decodeURIComponent(req.url.split('?')[0]);
        if (p === '/') p = '/index.html';
        const abs = path.join(ROOT, p);
        if (!abs.startsWith(ROOT)) { res.writeHead(403).end(); return; }
        const body = await readFile(abs);
        res.writeHead(200, { 'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream' });
        res.end(body);
      } catch { res.writeHead(404).end('404'); }
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

const errs = [];

async function main() {
  const { srv, port } = await startServer();
  const base = `http://127.0.0.1:${port}`;
  console.log(`[verify] 服务: ${base}\n`);
  const browser = await chromium.launch();

  /* ---------- 1. 死亡界面 ---------- */
  console.log('=== 1. 死亡界面 + 三项统计 ===');
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => errs.push('death: ' + e.message));
    await page.goto(base + '/?seed=4242', { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__ISAAC__, { timeout: 15000 });
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');           // 开始
    await page.waitForTimeout(2600);              // 过场结束，进入 PLAYING

    // 注意：SCENE 常量是小写字符串（'title' / 'floorIntro' / 'playing' / 'dead' / 'win'），
    // 不是对象键名的大写形式。之前的断言误用 'PLAYING'/'DEAD'，导致正确行为被判为失败。
    const sceneAfterStart = await page.evaluate(() => window.__ISAAC__.game.scene);
    check('能离开标题进入游戏',
      sceneAfterStart === 'playing' || sceneAfterStart === 'floorIntro',
      `scene=${sceneAfterStart}`);

    // 把玩家打死。注意两条真实约束（都会让"朴素写法"失败）：
    //   1. takeDamage() 有 1.0s 无敌帧（player.js:104,120）→ 连续快调只有第一下生效
    //   2. 死亡判定看 p.alive（game.js:389），不是 p.health
    // 因此：每次伤害前显式清掉 invuln，循环直到 alive === false。
    const killed = await page.evaluate(() => {
      const g = window.__ISAAC__.game;
      const p = g.player;
      if (!p) return { ok: false, why: 'NO_PLAYER' };
      if (typeof p.takeDamage !== 'function') return { ok: false, why: 'NO_takeDamage' };
      let hits = 0;
      for (let i = 0; i < 200 && p.alive; i++) {
        p.invuln = 0;            // 绕开无敌帧（测试用，模拟"隔 1 秒挨一下"）
        if (p.takeDamage(1)) hits++;
      }
      return { ok: !p.alive, hits, health: p.health, alive: p.alive };
    });
    check('找到致死路径并使玩家死亡', killed.ok === true,
      `hits=${killed.hits} health=${killed.health} alive=${killed.alive}${killed.why ? ' why=' + killed.why : ''}`);

    await page.waitForTimeout(1800);              // 等待死亡界面动画
    const sceneAfterDeath = await page.evaluate(() => window.__ISAAC__.game.scene);
    check('进入死亡场景 DEAD', sceneAfterDeath === 'dead', `scene=${sceneAfterDeath}`);

    const stats = await page.evaluate(() => {
      const g = window.__ISAAC__.game;
      const s = g.stats || {};
      return {
        kills: s.kills ?? null,
        items: s.itemsPicked ?? null,
        time: s.timeAlive ?? null,
        floorReached: s.floorReached ?? null,
        keys: Object.keys(s),
      };
    });
    check('统计含击杀数 kills', typeof stats.kills === 'number', `kills=${stats.kills}`);
    check('统计含拾取道具数 itemsPicked', typeof stats.items === 'number', `itemsPicked=${stats.items}`);
    check('统计含存活时间 timeAlive', typeof stats.time === 'number', `timeAlive=${stats.time}`);
    console.log(`      stats = ${JSON.stringify(stats)}`);

    await page.screenshot({ path: path.join(OUT, 'verify-01-death.png') });
    console.log('      📷 verify-01-death.png');
    await page.close();
  }

  /* ---------- 2. 通关界面 ---------- */
  console.log('\n=== 2. 通关界面 ===');
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => errs.push('win: ' + e.message));
    await page.goto(base + '/?seed=99', { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__ISAAC__, { timeout: 15000 });
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2600);

    const won = await page.evaluate(() => {
      const g = window.__ISAAC__.game;
      if (g.gotoScene && g.SCENE) { g.gotoScene(g.SCENE.WIN); return 'gotoScene(WIN)'; }
      const S = window.__ISAAC__.SCENE;
      if (g.gotoScene && S) { g.gotoScene(S.WIN); return 'gotoScene(SCENE.WIN)'; }
      return 'NO_API';
    });
    await page.waitForTimeout(1200);
    const sceneWin = await page.evaluate(() => window.__ISAAC__.game.scene);
    check('可到达通关场景 WIN', sceneWin === 'win', `scene=${sceneWin} via=${won}`);    await page.screenshot({ path: path.join(OUT, 'verify-02-win.png') });
    console.log('      📷 verify-02-win.png');
    await page.close();
  }

  /* ---------- 3. 移动端虚拟摇杆 ---------- */
  console.log('\n=== 3. 移动端虚拟摇杆 + 射击按钮 ===');
  {
    const page = await browser.newPage({
      viewport: { width: 420, height: 860 },
      hasTouch: true, isMobile: true, deviceScaleFactor: 2,
    });
    page.on('pageerror', (e) => errs.push('mobile: ' + e.message));
    await page.goto(base + '/?seed=7', { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__ISAAC__, { timeout: 15000 });
    await page.waitForTimeout(400);
    await page.tap('#game').catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForTimeout(3000);

    // hasTouch/isMobile 视口下，加载完成即应具备触摸能力（静态探测），
    // 无需任何实际触摸事件，虚拟摇杆就应处于可显示状态。
    // 这里查 Input.touchCapable（能力位）与 JoystickRenderer.enabled（最终显示位）。
    const js = await page.evaluate(() => {
      const g = window.__ISAAC__.game;
      const input = window.__ISAAC__.input;
      const joy = window.__ISAAC__.renderer && window.__ISAAC__.renderer.joystick;
      return {
        scene: g.scene,
        touchCapable: !!input.touchCapable,
        usingTouch: !!input.usingTouch,
        joyEnabled: joy ? !!joy.enabled : null,
        alphaMove: joy ? Number(joy.alphaMove.toFixed(3)) : null,
        alphaFire: joy ? Number(joy.alphaFire.toFixed(3)) : null,
        view: { w: innerWidth, h: innerHeight },
      };
    });
    check('窄视口下能进入游戏', js.scene !== 'title', `scene=${js.scene}`);
    check('设备被判定为具备触摸能力', js.touchCapable === true,
      `touchCapable=${js.touchCapable} usingTouch=${js.usingTouch}`);
    check('摇杆渲染器在无触摸事件时已启用', js.joyEnabled === true,
      `enabled=${js.joyEnabled} alphaMove=${js.alphaMove} alphaFire=${js.alphaFire}`);
    check('待机态摇杆有可见不透明度', (js.alphaMove ?? 0) > 0.1 && (js.alphaFire ?? 0) > 0.1,
      `alphaMove=${js.alphaMove} alphaFire=${js.alphaFire}`);

    // 像素级证据：摇杆固定位附近必须存在非背景像素（比肉眼截图更硬的判据）。
    const px = await page.evaluate(() => {
      const cv = document.getElementById('game');
      const ctx = cv.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const W = cv.clientWidth;
      const H = cv.clientHeight;
      // 采样左移动摇杆底盘区域（W*0.16, H*0.78）与右射击摇杆区域（W*0.84, H*0.78）
      const probe = (cx, cy) => {
        const r = Math.round(52 * dpr);
        const x = Math.max(0, Math.round(cx * dpr) - r);
        const y = Math.max(0, Math.round(cy * dpr) - r);
        const s = Math.min(cv.width - x, r * 2);
        const d = ctx.getImageData(x, y, s, s).data;
        const seen = new Set();
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) {
          seen.add(`${d[i] >> 3},${d[i + 1] >> 3},${d[i + 2] >> 3}`);
          sum += d[i] + d[i + 1] + d[i + 2];
        }
        return { distinct: seen.size, meanLum: Math.round(sum / (d.length / 4) / 3) };
      };
      return {
        left: probe(W * 0.16, H * 0.78),
        right: probe(W * 0.84, H * 0.78),
      };
    });
    check('左摇杆区域有五彩（非纯色）像素', px.left.distinct > 3,
      `distinct=${px.left.distinct} meanLum=${px.left.meanLum}`);
    check('右摇杆区域有五彩（非纯色）像素', px.right.distinct > 3,
      `distinct=${px.right.distinct} meanLum=${px.right.meanLum}`);

    await page.screenshot({ path: path.join(OUT, 'verify-03-mobile.png') });
    console.log('      📷 verify-03-mobile.png');
    await page.close();
  }

  /* ---------- 4. 桌面反例：不应显示虚拟摇杆 ---------- */
  console.log('\n=== 4. 桌面视口（反例：不应出现摇杆）===');
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => errs.push('desktop: ' + e.message));
    await page.goto(base + '/?seed=7', { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__ISAAC__, { timeout: 15000 });
    await page.waitForTimeout(1500);
    const d = await page.evaluate(() => {
      const input = window.__ISAAC__.input;
      const joy = window.__ISAAC__.renderer && window.__ISAAC__.renderer.joystick;
      return { touchCapable: !!input.touchCapable, joyEnabled: joy ? !!joy.enabled : null };
    });
    check('桌面视口不显示虚拟摇杆', d.joyEnabled === false,
      `touchCapable=${d.touchCapable} enabled=${d.joyEnabled}`);
    await page.close();
  }

  await browser.close();
  srv.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== 验收结果: ${results.length - failed.length}/${results.length} 通过 ===`);
  if (errs.length) { console.log('页面错误:'); errs.slice(0, 10).forEach((e) => console.log('  ✗ ' + e)); }
  if (failed.length) {
    console.log('未通过项:');
    failed.forEach((f) => console.log(`  ✗ ${f.name} — ${f.detail}`));
  }
  process.exit(failed.length || errs.length ? 1 : 0);
}

main().catch((e) => { console.error('verify 失败:', e); process.exit(1); });
