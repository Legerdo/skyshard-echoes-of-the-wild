// Smoke test: load the game, reach the title, start a new game, skip the intro, take screenshots.
// usage: node tools/smoke.mjs [url]
import { launch } from './browser.mjs';

const url = process.argv[2] || 'http://localhost:5173/';
const browser = await launch({ width: 1280, height: 720 });
const page = await browser.newPage();
const seen = new Set();
page.on('console', (m) => {
  const k = m.type() + m.text().slice(0, 140);
  if (seen.has(k) || m.type() === 'debug') return;
  seen.add(k);
  console.log('[page]', m.type(), m.text().slice(0, 500));
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__sky && window.__sky.state() === 'title', { timeout: 60000 });
console.log('title after', ((Date.now() - t0) / 1000).toFixed(1), 's');
await sleep(1500);
await page.screenshot({ path: 'tools/out/p_title.png' });
await page.evaluate(() => window.__sky.clickTitle('new'));
await sleep(3000);
await page.screenshot({ path: 'tools/out/p_intro.png' });
await page.evaluate(() => window.__sky.game.story.skipIntro());
await page.waitForFunction(() => window.__sky.state() === 'play', { timeout: 20000 });
await sleep(1500);
await page.screenshot({ path: 'tools/out/p_play.png' });
const info = await page.evaluate(() => {
  const s = window.__sky;
  const ft = s.frameTimes.slice(-120);
  const avg = ft.reduce((a, b) => a + b, 0) / Math.max(1, ft.length);
  return { state: s.state(), step: s.step(), player: s.player(), fps: 1000 / avg, errors: s.errors, calls: s.game.pipe.renderer.info.render.calls, tris: s.game.pipe.renderer.info.render.triangles };
});
console.log(JSON.stringify(info));
await browser.close();
