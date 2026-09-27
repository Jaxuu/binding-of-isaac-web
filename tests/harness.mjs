/**
 * harness.mjs — 无头浏览器验证工具
 *
 * 用途：Iteration 自测。加载页面 → 等待游戏就绪 → 模拟按键输入 → 截图 →
 *       收集控制台错误 → 输出结构化 JSON 结果。
 *
 * 为什么需要它：Canvas 游戏无法用纯 Node 单测验证「画面是否正确」。
 * 必须真跑一次浏览器，确认：无 import 错误、无 JS 异常、画面非全黑、
 * 且关键实体（玩家/敌人/子弹）确实被绘制。
 *
 * 用法：node tests/harness.mjs [scenario]
 *   scenario: smoke | combat | dungeon | items | boss | all
 *
 * 依赖：playwright 是**可选**验证工装，不在生产 manifest 中（项目定位零依赖）。
 *   首次使用请执行：npx playwright install chromium
 *   本脚本按需动态解析 playwright，缺失时给出明确提示而非崩溃。
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

/**
 * 按需解析 playwright（可选依赖）。返回 chromium 或 null。
 * @returns {Promise<import('playwright').BrowserType|null>}
 */
async function loadChromium() {
  try {
    const mod = await import('playwright');
    return mod.chromium;
  } catch {
    console.error(
      '[harness] 未找到可选依赖 playwright。\n' +
        '          本工具是可选验证工装，请先安装：\n' +
        '            npm i -D playwright && npx playwright install chromium\n' +
        '          （生产运行游戏无需任何依赖。）'
    );
    return null;
  }
}
const _require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'tests', 'screenshots');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8',
};

/** 极简静态服务器（等价于 python -m http.server 的行为） */
function startServer(port = 0) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const filePath = path.join(ROOT, urlPath);
      // 防目录穿越
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end(`404 Not Found: ${urlPath}`);
          return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Cache-Control': 'no-store', // 避免浏览器缓存旧 JS，导致测试结果与源码不一致
        });
        res.end(data);
      });
    });
    server.listen(port, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

/** 判断截图是否「基本非空」（不是纯黑/纯白一片） */
function analyzeScreenshot(buf) {
  // 用 PNG 解码需要依赖；这里改为「按字节熵」的粗略判断：
  // 纯色 PNG 压缩率极高，文件会非常小。真实画面（大量渐变/描边）会显著更大。
  const size = buf.length;
  return {
    bytes: size,
    likelyBlank: size < 12000, // 经验阈值：624×336 的复杂画面 PNG > 30KB
  };
}

const SCENARIOS = {
  async smoke(page, shot) {
    // 标题界面
    await shot('00-title');
    const titleInfo = await page.evaluate(() => {
      const g = window.__ISAAC__?.game;
      return { scene: g?.scene, hasCanvas: !!document.getElementById('game') };
    });
    // 桌面 1280×720（hasTouch=false）：虚拟摇杆必须**不显示**，防误伤桌面
    const desktopProbe = await page.evaluate(() => {
      const inp = window.__ISAAC__.input;
      const js = window.__ISAAC__.renderer.joystick;
      return {
        touchCapable: !!inp.touchCapable,
        usingTouch: !!inp.usingTouch,
        joystickEnabled: !!js.enabled,
      };
    });
    return { titleInfo, desktopProbe };
  },

  async combat(page, shot) {
    // 开始游戏
    await page.evaluate(() => window.__ISAAC__.game.startGame(12345));
    await page.waitForTimeout(2400); // 等层过渡 + 敌人就绪
    await shot('01-iteration1-room');

    // 起点房无敌人（设计如此）→ 传送到一个普通房进行战斗测试
    await page.evaluate(() => {
      const g = window.__ISAAC__.game;
      const combatRoom = g.dungeon.rooms.find((r) => r.kind === 'normal');
      const room = g.roomsByKey[combatRoom.key];
      room.visited = true;
      room.enterGrace = 0;
      g.currentRoom = room;
      g.visitedRooms.add(room.key);
      g.player.x = 624 / 2;
      g.player.y = 336 / 2;
      g.player.invuln = 3; // 测试期间免伤，聚焦射击逻辑
    });
    await page.waitForTimeout(600);
    await shot('01b-combat-room');

    // 移动（WASD）
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(400);
    await page.keyboard.up('KeyD');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(300);
    await page.keyboard.up('KeyW');
    const afterMove = await page.evaluate(() => ({
      x: Math.round(window.__ISAAC__.game.player.x),
      y: Math.round(window.__ISAAC__.game.player.y),
      enemies: window.__ISAAC__.game.currentRoom.enemies.length,
      roomKind: window.__ISAAC__.game.currentRoom.kind,
    }));
    await shot('02-after-move');

    // 射击（方向键）——真实键盘输入，验证 Input 层
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(500);
    await shot('03-firing');
    const firing = await page.evaluate(() => ({
      bullets: window.__ISAAC__.game.combat.playerBullets.length,
      facing: Math.round(window.__ISAAC__.game.player.facing * 100) / 100,
    }));
    await page.keyboard.up('ArrowRight');

    // 用「自动瞄准 + 直接开火」把房间打空（绕过随机性，验证完整击杀链路）
    //
    // 重要：必须通过「物理输入源」驱动，不能直接写 g.input.fireX/firing。
    // 原因：Input.update() 每帧都会根据物理输入（键盘 keys / 摇杆 stickFire）
    // 重新计算逻辑动作，直接写逻辑字段会在下一帧被覆盖。
    // 这里写 stickFire 通道（持久物理源），并让 update() 走「摇杆自动持续射击」分支，
    // 从而真正走通 Input → GameState._updatePlayerShooting → Combat 的完整链路。
    let kills = 0;
    let aimAngle = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      aimAngle = await page.evaluate(() => {
        const g = window.__ISAAC__.game;
        const p = g.player;
        const room = g.currentRoom;
        p.invuln = 3;
        // 瞄准最近的敌人
        let best = null;
        let bd = Infinity;
        const targets = room.enemies.filter((e) => !e.isDead);
        if (room.boss && !room.boss.isDead) targets.push(room.boss);
        for (const e of targets) {
          const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
          if (d < bd) { bd = d; best = e; }
        }
        if (!best) {
          // 没有目标：松开射击摇杆
          g.input.setStick('fire', 0, 0, false);
          return 0;
        }
        const a = Math.atan2(best.y - p.y, best.x - p.x);
        // 写入物理摇杆通道（持久），Input.update 会据此置 firing=true
        g.input.setStick('fire', Math.cos(a), Math.sin(a), true);
        return a;
      });
      await page.waitForTimeout(150);
      kills = await page.evaluate(() => window.__ISAAC__.game.stats.kills);
      const remaining = await page.evaluate(() => window.__ISAAC__.game.currentRoom.enemyCount);
      if (remaining === 0) break;
    }
    // 松开射击摇杆，避免残留输入影响后续截图
    await page.evaluate(() => window.__ISAAC__.game.input.setStick('fire', 0, 0, false));
    await page.waitForTimeout(500);
    await shot('04-after-kill');
    const clearState = await page.evaluate(() => {
      const g = window.__ISAAC__.game;
      return {
        kills: g.stats.kills,
        cleared: g.currentRoom.cleared,
        remaining: g.currentRoom.enemyCount,
        doorCount: Object.values(g.currentRoom.doors).filter(Boolean).length,
      };
    });
    return { afterMove, firing, clearState };
  },

  async dungeon(page, shot) {
    // 用多个种子验证地牢生成的不变量
    const results = await page.evaluate(async () => {
      const out = [];
      const mod = await import('/src/systems/dungeon.js');
      for (let s = 1; s <= 60; s++) {
        const d = mod.generateDungeon(s, { minRooms: 5, maxRooms: 8, floor: 1 });
        const v = mod.validateDungeon(d);
        out.push({
          seed: s,
          count: d.count,
          rooms: d.rooms.length,
          ok: v.ok,
          errors: v.errors,
          bossKey: d.bossKey,
          treasureKey: d.treasureKey,
          bossDepth: d.byKey[d.bossKey].depth,
          maxDepth: Math.max(...d.rooms.map((r) => r.depth)),
        });
      }
      return out;
    });
    const bad = results.filter((r) => !r.ok);
    const countMin = Math.min(...results.map((r) => r.count));
    const countMax = Math.max(...results.map((r) => r.count));

    // 视觉：生成一局并画出小地图
    await page.evaluate(() => window.__ISAAC__.game.startGame(777));
    await page.waitForTimeout(2200);
    await shot('10-dungeon-minimap');

    return { bad, countMin, countMax, sample: results.slice(0, 5) };
  },

  /**
   * BUG-004 验证：首层必须出现全部 3 种普通敌人（gaper / pooter / horf）。
   * 通过页面内直接调用 populateRoom，按楼层大量采样统计类型分布。
   */
  async enemies(page, shot) {
    const dist = await page.evaluate(async () => {
      const rooms = await import('/src/systems/rooms.js');
      const { Rng } = await import('/src/core/rng.js');
      const mkRoom = (key) => ({
        kind: 'normal', key, doors: {}, cleared: false,
        enemies: [], obstacles: [], pickups: [], itemDrops: [], chests: [], spikes: [],
        bossSpawned: false, boss: null, spawnKinds: [],
        hitsObstacle: () => false, isCellBlocked: () => false,
      });
      const out = {};
      for (let floor = 1; floor <= 5; floor++) {
        const seen = {};
        for (let s = 1; s <= 200; s++) {
          const room = mkRoom(`e${floor}_${s}`);
          rooms.populateRoom(room, new Rng(s * 7919 + floor), { floor });
          for (const e of room.enemies || []) seen[e.type] = (seen[e.type] || 0) + 1;
        }
        out['floor' + floor] = seen;
      }
      return out;
    });
    const floor1Types = Object.keys(dist.floor1).filter((t) => dist.floor1[t] > 0).sort();

    // 视觉：进一局首层，截一张含敌人的房间图
    await page.evaluate(() => {
      const g = window.__ISAAC__.game;
      g.startGame(4242);
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const g = window.__ISAAC__.game;
      g.sceneT = 999;
      g.transitionT = 999;
    });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      const g = window.__ISAAC__.game;
      const combatRoom = g.dungeon.rooms.find((r) => r.kind === 'normal');
      const room = g.roomsByKey[combatRoom.key];
      room.visited = true;
      room.enterGrace = 0;
      g.currentRoom = room;
      g.visitedRooms.add(room.key);
      g.player.x = 624 / 2;
      g.player.y = 336 / 2;
      g.player.invuln = 5;
    });
    await page.waitForTimeout(700);
    await shot('50-floor1-enemies');
    const liveTypes = await page.evaluate(() => {
      const g = window.__ISAAC__.game;
      return g.currentRoom.enemies.map((e) => e.type);
    });
    return { dist, floor1Types, floor1HasAllThree: floor1Types.length >= 3, liveTypes };
  },

  async items(page, shot) {
    // 应用所有道具，验证属性计算与外观变体
    const before = await page.evaluate(async () => {
      const g = window.__ISAAC__.game;
      g.startGame(999);
      const mod = await import('/src/entities/items.js');
      const p = g.player;
      const snapshot = { stats: { ...p.stats }, visuals: { ...p.visual } };
      // 逐个应用全部道具
      const applied = [];
      for (const item of mod.ITEM_POOL) {
        mod.applyItem(p, item, p.weapon);
        applied.push(item.id);
      }
      return {
        baseline: snapshot,
        applied,
        after: { stats: { ...p.stats }, visuals: { ...p.visual } },
        weapon: { ...p.weapon },
        itemCount: p.items.length,
        modifiers: p.modifiers.length,
      };
    });

    // 触发道具面板显示 + 截图
    await page.evaluate(async () => {
      const g = window.__ISAAC__.game;
      const mod = await import('/src/entities/items.js');
      g.startGame(555);
      await new Promise((r) => setTimeout(r, 1800));
      const item = mod.ITEM_BY_ID['brimstone'];
      g._grantItem('brimstone', g.player.x, g.player.y);
      // 立刻充满蓄力并开火，展示光束
      g.player.charging = true;
      g.player.chargeTime = g.player.chargeMax;
    });
    await page.waitForTimeout(300);
    await shot('20-item-panel');

    // Brimstone 光束视觉
    await page.evaluate(() => {
      const g = window.__ISAAC__.game;
      g.itemPanel = null;
      g.combat.playerFireCharged(g.player, 0, g.player.weapon, g.player.stats, 1);
    });
    await page.waitForTimeout(120);
    await shot('21-brimstone-beam');

    return before;
  },

  async boss(page, shot) {
    // 跳到 Boss 房并强制生成 Boss
    await page.evaluate(() => {
      const g = window.__ISAAC__.game;
      g.startGame(2024);
    });
    await page.waitForTimeout(2000);

    await page.evaluate(async () => {
      const g = window.__ISAAC__.game;
      const mod = await import('/src/systems/dungeon.js');
      // 找到 boss 房并直接传送
      const bossRoom = g.roomsByKey[g.dungeon.bossKey];
      bossRoom.visited = true;
      bossRoom.cleared = true;
      bossRoom.enterGrace = 0;
      g.currentRoom = bossRoom;
      g.visitedRooms.add(bossRoom.key);
      // 触发 boss 生成
      g.player.x = 624 / 2;
      g.player.y = 336 - 60;
    });
    // 让 boss AI 跑几秒（生成 + 吐弹）
    await page.waitForTimeout(4200);
    const bossInfo = await page.evaluate(() => {
      const g = window.__ISAAC__.game;
      const b = g.currentRoom.boss;
      return {
        spawned: !!b,
        hp: b ? b.hp : 0,
        maxHp: b ? b.maxHp : 0,
        state: b ? b.state : null,
        phase: b ? b.phase : null,
        enemyBullets: g.combat.enemyBullets.length,
      };
    });
    await shot('30-boss-fight');

    // 打到二阶段
    await page.evaluate(() => {
      const g = window.__ISAAC__.game;
      const b = g.currentRoom.boss;
      if (b) {
        b.entering = 0;
        b.takeDamage(b.maxHp * 0.45, 0, 0, 0);
      }
    });
    await page.waitForTimeout(900);
    const phase2 = await page.evaluate(() => {
      const b = window.__ISAAC__.game.currentRoom.boss;
      return { phase: b.phase, rage: b.rage, hpRatio: b.hpRatio };
    });
    await shot('31-boss-phase2');

    // 打死 boss → 应触发通关或下一层
    await page.evaluate(() => {
      const g = window.__ISAAC__.game;
      const b = g.currentRoom.boss;
      if (b) {
        b.entering = 0;
        b.invuln = 0;
        b.takeDamage(99999, 0, 0, 0);
      }
    });
    // 等待：死亡动画(~1.2s) + 切层延迟(1.6s) + 层过渡
    await page.waitForTimeout(4200);
    const afterKill = await page.evaluate(() => {
      const g = window.__ISAAC__.game;
      return { scene: g.scene, floor: g.floor, kills: g.stats.kills };
    });
    await shot('32-floor-transition');

    return { bossInfo, phase2, afterKill };
  },

  /**
   * 移动端虚拟摇杆恒定显示验证：窄视口 + 触摸设备，**不发送任何触摸事件**，
   * 应能在截图中看到左右两个待机摇杆底盘。
   * 附加：桌面视口下不应出现摇杆（防误伤）。
   */
  async mobile(page, shot) {
    await page.evaluate(() => window.__ISAAC__.game.startGame(7));
    await page.waitForTimeout(800);
    // 快进楼层标题动画（FLOOR_INTRO 在 transitionT>1.8 后自动进入 PLAYING）
    await page.evaluate(() => {
      const g = window.__ISAAC__.game;
      g.sceneT = 999;
      g.transitionT = 999;
    });
    await page.waitForTimeout(1200);

    const probe = await page.evaluate(() => {
      const inp = window.__ISAAC__.game.input;
      const js = window.__ISAAC__.renderer.joystick;
      return {
        scene: window.__ISAAC__.game.scene,
        touchCapable: !!inp.touchCapable,
        usingTouch: !!inp.usingTouch,
        stickMoveActive: !!inp.stickMove.active,
        stickFireActive: !!inp.stickFire.active,
        joystickEnabled: !!js.enabled,
        alphaMove: +js.alphaMove.toFixed(3),
        alphaFire: +js.alphaFire.toFixed(3),
      };
    });
    await shot('40-mobile-idle-joysticks');

    // 触摸 → 松手 后，摇杆应回到待机固定位（而非停在原点 0,0）
    await page.evaluate(() => {
      const g = window.__ISAAC__.game;
      g.input.setStick('move', 0.6, -0.4, true);
      g.input.setStick('fire', 0.5, 0.5, true);
    });
    await page.waitForTimeout(300);
    await shot('41-mobile-active-joysticks');
    await page.evaluate(() => {
      const g = window.__ISAAC__.game;
      // 模拟松手：Input._handlePointerUp 会复位 origin 为 0
      g.input.stickMove.active = false;
      g.input.stickFire.active = false;
      g.input.stickMove.originX = 0;
      g.input.stickMove.originY = 0;
      g.input.stickFire.originX = 0;
      g.input.stickFire.originY = 0;
      g.input.stickMove.x = 0;
      g.input.stickMove.y = 0;
      g.input.stickFire.x = 0;
      g.input.stickFire.y = 0;
    });
    await page.waitForTimeout(500);
    const afterRelease = await page.evaluate(() => {
      const js = window.__ISAAC__.renderer.joystick;
      return { alphaMove: +js.alphaMove.toFixed(3), alphaFire: +js.alphaFire.toFixed(3) };
    });
    await shot('42-mobile-after-release');
    return { probe, afterRelease };
  },

  /**
   * 横屏矮视口（860×420）：摇杆应缩小半径至 42 并上移至 0.72H，
   * 不与属性条面板 / Boss 血条重叠（spec §4）。
   */
  async 'mobile-landscape'(page, shot) {
    await page.evaluate(() => window.__ISAAC__.game.startGame(7));
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const g = window.__ISAAC__.game;
      g.sceneT = 999;
      g.transitionT = 999;
    });
    await page.waitForTimeout(1200);
    const probe = await page.evaluate(() => {
      const inp = window.__ISAAC__.input;
      const js = window.__ISAAC__.renderer.joystick;
      return {
        scene: window.__ISAAC__.game.scene,
        touchCapable: !!inp.touchCapable,
        joystickEnabled: !!js.enabled,
        vw: innerWidth,
        vh: innerHeight,
      };
    });
    await shot('43-mobile-landscape');
    return { probe };
  },
};

async function main() {
  const scenarioName = process.argv[2] || 'smoke';
  const scenarios = scenarioName === 'all' ? Object.keys(SCENARIOS) : [scenarioName];

  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const chromiumType = await loadChromium();
  if (!chromiumType) process.exit(2);

  const { server, port } = await startServer(0);
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[harness] 静态服务器: ${baseUrl}`);

  const browser = await chromiumType.launch({
    args: ['--no-sandbox'],
  });
  const report = { scenario: scenarioName, url: baseUrl, errors: [], warnings: [], shots: [], results: {} };

  try {
    for (const name of scenarios) {
      // mobile 系场景：触摸设备 + 窄/横视口（不发送任何触摸事件）
      const isMobileScenario = name === 'mobile' || name === 'mobile-landscape';
      const isLandscape = name === 'mobile-landscape';
      const page = await browser.newPage({
        viewport: isLandscape
          ? { width: 860, height: 420 }
          : isMobileScenario
            ? { width: 420, height: 860 }
            : { width: 1280, height: 720 },
        deviceScaleFactor: 1,
        hasTouch: isMobileScenario,
        isMobile: isMobileScenario,
      });

      const consoleErrors = [];
      const pageErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
        if (msg.type() === 'warning') report.warnings.push(`[${name}] ${msg.text()}`);
      });
      page.on('pageerror', (err) => pageErrors.push(String(err && err.stack ? err.stack : err)));

      console.log(`\n=== 场景: ${name} ===`);
      await page.goto(baseUrl, { waitUntil: 'load' });
      // 等待模块加载与 boot
      await page.waitForFunction(() => !!window.__ISAAC__, { timeout: 15000 });
      await page.waitForTimeout(400);

      const shot = async (label) => {
        const file = path.join(SHOT_DIR, `${label}.png`);
        const buf = await page.screenshot({ path: file, fullPage: false });
        const info = analyzeScreenshot(buf);
        report.shots.push({ label, file: path.relative(ROOT, file), ...info });
        console.log(`  📷 ${label}  ${(info.bytes / 1024).toFixed(1)} KB${info.likelyBlank ? '  ⚠️ 疑似空白' : ''}`);
        return buf;
      };

      const fn = SCENARIOS[name];
      if (!fn) {
        console.error(`未知场景: ${name}`);
        continue;
      }
      const result = await fn(page, shot);
      report.results[name] = result;

      if (pageErrors.length) {
        report.errors.push(...pageErrors.map((e) => `[${name}] ${e}`));
        console.log(`  ❌ 页面异常 ${pageErrors.length} 条`);
        pageErrors.slice(0, 3).forEach((e) => console.log('     ' + e.split('\n')[0]));
      }
      const realConsoleErrors = consoleErrors.filter((t) => !/favicon|DevTools/i.test(t));
      if (realConsoleErrors.length) {
        report.errors.push(...realConsoleErrors.map((e) => `[${name}] console.error: ${e}`));
        console.log(`  ❌ console.error ${realConsoleErrors.length} 条`);
        realConsoleErrors.slice(0, 5).forEach((e) => console.log('     ' + e));
      }
      if (!pageErrors.length && !realConsoleErrors.length) {
        console.log('  ✅ 无 JS 错误');
      }

      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  const outFile = path.join(ROOT, 'tests', `last-run-${scenarioName}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n[harness] 报告: ${path.relative(ROOT, outFile)}`);
  console.log(`[harness] 截图目录: ${path.relative(ROOT, SHOT_DIR)}`);

  if (report.errors.length > 0) {
    console.log(`\n❌ 共 ${report.errors.length} 个错误`);
    process.exitCode = 1;
  } else {
    console.log('\n✅ 无错误');
  }
}

main().catch((err) => {
  console.error('[harness] 致命错误:', err);
  process.exit(1);
});
