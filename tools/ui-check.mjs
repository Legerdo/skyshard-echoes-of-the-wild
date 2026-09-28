// UI verification: menus/screens screenshots + Music/SFX toggles (independence, audio buses, persistence),
// language switch, graphics preset, and the hero preview page. Uses a checkpoint save + Continue.
// usage: node tools/ui-check.mjs [url] --from=save.json
import { launch } from './browser.mjs';
import fs from 'node:fs';

const url = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4173/';
const from = process.argv.find((a) => a.startsWith('--from='))?.slice(7);
const out = 'tools/out/ui';
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, info = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`);
};

const browser = await launch({ headless: true, width: 1280, height: 720 });
const page = await browser.newPage();
let pageErrors = 0;
page.on('pageerror', (e) => {
  pageErrors++;
  console.log('[pageerror] ' + e.message);
});
await page.goto(url, { waitUntil: 'load' });
await page.evaluate((j) => {
  localStorage.removeItem('skyshard.settings.v1');
  if (j) localStorage.setItem('skyshard.save.v1', j);
}, from ? fs.readFileSync(from, 'utf8') : null);
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__sky && window.__sky.state() === 'title', { timeout: 90000 });
await sleep(1500);
await page.evaluate(() => window.__sky.game.screens.revealTitleMenu?.());
await sleep(600);
await page.screenshot({ path: `${out}/title_menu.png` });
if (from) {
  await page.evaluate(() => window.__sky.clickTitle('continue'));
} else {
  // no checkpoint: start a new game and advance the intro with the virtual controller
  await page.evaluate(() => window.__sky.clickTitle('new'));
  await page.evaluate(async () => {
    const S = window.__sky;
    S.enableVirtual(true);
    for (let i = 0; i < 400 && S.state() !== 'play'; i++) {
      if (S.state() === 'intro' || S.state() === 'dialog') S.press('interact');
      await new Promise((r) => setTimeout(r, 150));
    }
    S.enableVirtual(false);
  });
}
await page.waitForFunction(() => window.__sky.state() === 'play', { timeout: 60000 });
await sleep(1500);
// a user gesture so the AudioContext may start (autoplay policy is relaxed in the test browser anyway)
await page.mouse.click(640, 360);
await sleep(300);

for (const tab of ['pause', 'party', 'items', 'journal', 'map', 'settings']) {
  await page.evaluate((tb) => {
    const g = window.__sky.game;
    if (g.state === 'menu') g.closeMenu();
    g.openMenu(tb);
  }, tab);
  await sleep(700);
  const st = await page.evaluate(() => ({ state: window.__sky.state(), tab: window.__sky.game.menus.tab }));
  check(`menu ${tab} opens`, st.state === 'menu' && st.tab === tab, JSON.stringify(st));
  await page.screenshot({ path: `${out}/menu_${tab}.png` });
}

// --- audio toggles (settings tab is open)
const audio = () => page.evaluate(() => {
  const g = window.__sky.game;
  const a = g.audio;
  const saved = JSON.parse(localStorage.getItem('skyshard.settings.v1') || '{}');
  return { music: g.settings.musicOn, sfx: g.settings.sfxOn, am: a.musicOn, as: a.sfxOn, mg: a.musicBus ? a.musicBus.gain.value : null, sg: a.sfxBus ? a.sfxBus.gain.value : null, ctx: a.ctx ? a.ctx.state : 'none', savedMusic: saved.musicOn, savedSfx: saved.sfxOn };
});
const a0 = await audio();
check('audio starts with music+sfx on', a0.music && a0.sfx && a0.am && a0.as, JSON.stringify(a0));
await page.click('[data-tog="musicOn"]');
await sleep(900);
const a1 = await audio();
check('music toggle off leaves sfx on', !a1.music && !a1.am && a1.sfx && a1.as && a1.savedMusic === false && a1.savedSfx === true, JSON.stringify(a1));
check('music bus silent after toggle', a1.mg === null || a1.mg < 0.02, `musicBus gain ${a1.mg}`);
await page.click('[data-tog="sfxOn"]');
await sleep(900);
const a2 = await audio();
check('sfx toggle off (music still off)', !a2.sfx && !a2.as && !a2.music && a2.savedSfx === false, JSON.stringify(a2));
check('sfx bus silent after toggle', a2.sg === null || a2.sg < 0.02, `sfxBus gain ${a2.sg}`);
await page.click('[data-tog="musicOn"]');
await sleep(900);
const a3 = await audio();
check('music back on while sfx stays off', a3.music && a3.am && !a3.sfx && (a3.mg === null || a3.mg > 0.05), JSON.stringify(a3));
await page.screenshot({ path: `${out}/settings_toggled.png` });

// --- persistence across reload
const before = await page.evaluate(() => {
  const g = window.__sky.game;
  g.closeMenu();
  g.saveGame(true);
  return { step: window.__sky.step(), level: g.party.level, unlocked: [...g.party.unlocked].sort().join(',') };
});
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__sky && window.__sky.state() === 'title', { timeout: 90000 });
const persisted = await page.evaluate(() => ({ music: window.__sky.game.settings.musicOn, sfx: window.__sky.game.settings.sfxOn }));
check('audio settings persist after reload', persisted.music === true && persisted.sfx === false, JSON.stringify(persisted));
await page.evaluate(() => window.__sky.clickTitle('continue'));
await page.waitForFunction(() => window.__sky.state() === 'play', { timeout: 30000 });
await sleep(1200);
const after = await page.evaluate(() => {
  const g = window.__sky.game;
  return { step: window.__sky.step(), level: g.party.level, unlocked: [...g.party.unlocked].sort().join(',') };
});
check('Continue restores the saved game', JSON.stringify(before) === JSON.stringify(after), `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);

// --- language switch + graphics preset via the settings UI
await page.evaluate(() => window.__sky.game.openMenu('settings'));
await sleep(500);
const lang0 = await page.evaluate(() => window.__sky.game.settings.lang);
await page.select('[data-sel="lang"]', lang0 === 'ko' ? 'en' : 'ko');
await sleep(600);
const lang1 = await page.evaluate(() => ({ lang: window.__sky.game.settings.lang, title: document.querySelector('.set-h')?.textContent }));
check('language switches live', lang1.lang !== lang0, JSON.stringify(lang1));
await page.screenshot({ path: `${out}/settings_lang_${lang1.lang}.png` });
await page.select('[data-sel="lang"]', lang0);
await sleep(300);
await page.select('[data-sel="quality"]', 'low');
await sleep(800);
const low = await page.evaluate(() => {
  const g = window.__sky.game;
  return { q: g.settings.quality, scale: g.pipe.renderScale, shadows: g.pipe.renderer.shadowMap.enabled, post: g.pipe.postfx };
});
check('low preset applies (scale/shadows/postfx)', low.q === 'low' && low.scale < 0.8 && !low.shadows && !low.post, JSON.stringify(low));
await page.evaluate(() => window.__sky.game.closeMenu());
await sleep(1500);
await page.screenshot({ path: `${out}/quality_low.png` });
await page.evaluate(() => {
  window.__sky.game.openMenu('settings');
});
await sleep(300);
await page.select('[data-sel="quality"]', 'high');
await sleep(600);
await page.evaluate(() => {
  const g = window.__sky.game;
  g.settings.sfxOn = true;
  g.applySettings();
  g.closeMenu();
});

// --- hero preview page
await page.goto(url.replace(/\/?$/, '/') + '?preview=heroes', { waitUntil: 'load' });
await sleep(4000);
await page.screenshot({ path: `${out}/hero_preview.png` });
check('hero preview renders without page errors', pageErrors === 0, `pageErrors=${pageErrors}`);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
