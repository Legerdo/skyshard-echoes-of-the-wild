// End-to-end playtest runner: New Game -> ... -> Victory, driven by tools/bot.js + tools/route.js
// through virtual controller input only. Includes a save -> reload -> Continue check mid-run.
// usage: node tools/play.mjs [url] [--headed] [--from=save.json] [--until=stepId] [--out=dir]
//   --from   start from a checkpoint save (written by earlier runs to <out>/saves) via Continue
//   --until  stop successfully once this quest step is reached
import { launch } from './browser.mjs';
import fs from 'node:fs';

const url = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:5173/';
const headed = process.argv.includes('--headed');
const trace = process.argv.includes('--trace');
const argOf = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? null;
const fromSave = argOf('from');
const untilStep = argOf('until');
const outDir = argOf('out') || 'tools/out/e2e';
fs.mkdirSync(`${outDir}/saves`, { recursive: true });
const logFile = fs.createWriteStream(`${outDir}/log.txt`);
const out = (s) => {
  console.log(s);
  logFile.write(s + '\n');
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launch({ headless: !headed, width: 1280, height: 720 });
const page = await browser.newPage();
const seen = new Set();
let pageErrors = 0;
page.on('console', (m) => {
  const txt = m.text();
  if (txt.startsWith('[bot]')) return; // collected via the log array
  const k = m.type() + txt.slice(0, 160);
  if (seen.has(k) || m.type() === 'debug') return;
  seen.add(k);
  out(`[page:${m.type()}] ${txt.slice(0, 600)}`);
});
page.on('error', (e) => out(`[page crashed] ${e.message}`));
page.on('close', () => out('[page closed]'));
browser.on('disconnected', () => out('[browser disconnected]'));
page.on('pageerror', (e) => {
  pageErrors++;
  out(`[pageerror] ${e.message} ${(e.stack || '').split('\n').slice(0, 5).join(' | ')}`);
});

const botSrc = fs.readFileSync('tools/bot.js', 'utf8');
const routeSrc = fs.readFileSync('tools/route.js', 'utf8');
const darkSrc = process.argv.includes('--darkcheck') ? fs.readFileSync('tools/darkcheck.js', 'utf8') : null;
const inject = async (initial) => {
  await page.evaluate((init) => {
    window.__bot = Object.assign({ log: [], events: {}, shots: [], done: false, error: null }, init || {});
  }, initial);
  await page.evaluate(botSrc);
  await page.evaluate(routeSrc);
  if (darkSrc) await page.evaluate(darkSrc);
};

const t0 = Date.now();
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => {
  localStorage.removeItem('skyshard.save.v1');
  localStorage.removeItem('skyshard.save.v1.bak');
});
if (fromSave) {
  const json = fs.readFileSync(fromSave, 'utf8');
  await page.evaluate((j) => localStorage.setItem('skyshard.save.v1', j), json);
}
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__sky && window.__sky.state() === 'title', { timeout: 90000 });
out(`title ready after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await page.screenshot({ path: `${outDir}/00_title.png` });
if (fromSave) {
  out(`[runner] continuing from ${fromSave}`);
  await sleep(800);
  await page.evaluate(() => window.__sky.clickTitle('continue'));
  await page.waitForFunction(() => window.__sky.state() === 'play', { timeout: 30000 });
  await sleep(1000);
  await inject({ reloadDone: true, trace });
} else {
  await page.evaluate(() => window.__sky.clickTitle('new'));
  await sleep(2500);
  await page.screenshot({ path: `${outDir}/00_intro.png` });
  await inject({ trace });
}

let logIdx = 0;
const events = {};
let lastStep = '';
let lastProgress = Date.now();
let lastStatus = 0;
const stepTimes = [];
const perf = [];
let result = 'unknown';
const deadline = Date.now() + 40 * 60 * 1000;
while (true) {
  await sleep(250);
  let st;
  try {
    st = await page.evaluate((i) => {
      const B = window.__bot;
      const S = window.__sky;
      const shots = B.shots.splice(0);
      const ft = S.frameTimes.slice(-240);
      const avg = ft.reduce((a, b) => a + b, 0) / Math.max(1, ft.length);
      const sorted = [...ft].sort((a, b) => a - b);
      return {
        lines: B.log.slice(i),
        n: B.log.length,
        shots,
        done: B.done,
        error: B.error,
        reload: !!B.reloadRequested,
        events: B.events,
        step: S.step(),
        state: S.state(),
        p: S.player(),
        lvl: S.level(),
        party: S.party().filter((m) => m.unlocked).map((m) => `${m.id}:${Math.round(m.hp)}/${m.max}`).join(' '),
        foes: S.enemies().length,
        near: (() => {
          const p = S.player();
          const e = S.enemies().map((q) => ({ ...q, d: Math.hypot(q.x - p.x, q.z - p.z) })).sort((a, b) => a.d - b.d)[0];
          return e && e.d < 40 ? `${e.id}(${Math.round(e.hp)}/${Math.round(e.max)} ${e.state} d=${e.d.toFixed(0)} dy=${(e.y - p.y).toFixed(0)}${e.shield ? ' shield' + e.shield.elem : ''}${e.immune ? ' immune' : ''})` : '-';
        })(),
        fps: 1000 / avg,
        p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
        errors: S.errors.slice(),
      };
    }, logIdx);
  } catch (e) {
    out('[runner] evaluate failed: ' + e.message);
    await sleep(1000);
    continue;
  }
  for (const l of st.lines) out('[bot] ' + l);
  logIdx = st.n;
  Object.assign(events, st.events);
  for (const name of st.shots) {
    await page.screenshot({ path: `${outDir}/${name}.png` });
    out(`[shot] ${name}`);
  }
  if (st.step !== lastStep) {
    stepTimes.push([st.step, ((Date.now() - t0) / 1000).toFixed(0)]);
    lastStep = st.step;
    lastProgress = Date.now();
    perf.push([st.step, st.fps.toFixed(0), st.p95.toFixed(1)]);
    // checkpoint: the game autosaves on every quest step; keep a copy for targeted re-runs
    const saved = await page.evaluate(() => localStorage.getItem('skyshard.save.v1')).catch(() => null);
    if (saved) fs.writeFileSync(`${outDir}/saves/${String(stepTimes.length).padStart(2, '0')}_${st.step}.json`, saved);
    if (untilStep && st.step === untilStep) {
      out(`[runner] reached --until step ${untilStep}`);
      result = 'until';
      await page.screenshot({ path: `${outDir}/zz_until.png` });
      break;
    }
  }
  if (Date.now() - lastStatus > 15000) {
    lastStatus = Date.now();
    out(`[status] t=${((Date.now() - t0) / 1000).toFixed(0)}s step=${st.step} state=${st.state} pos=(${st.p.x.toFixed(0)},${st.p.y.toFixed(0)},${st.p.z.toFixed(0)}) ${st.p.state} lvl=${st.lvl} ${st.party} foes=${st.foes} near=${st.near} fps=${st.fps.toFixed(0)} p95=${st.p95.toFixed(1)}ms`);
  }
  if (st.reload) {
    out('[runner] save -> reload -> Continue test');
    const snap = await page.evaluate(() => window.__bot.snapshot);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__sky && window.__sky.state() === 'title', { timeout: 90000 });
    await sleep(800);
    await page.screenshot({ path: `${outDir}/reload_title.png` });
    await page.evaluate(() => window.__sky.clickTitle('continue'));
    await page.waitForFunction(() => window.__sky.state() === 'play', { timeout: 30000 });
    await sleep(1200);
    const got = await page.evaluate(() => {
      const S = window.__sky;
      return { main: S.save().main, shards: [...S.save().shards], unlocked: [...S.game.party.unlocked], level: S.game.party.level, glimmer: S.save().inv.glimmer, chests: S.save().chests.length };
    });
    const same = JSON.stringify(snap) === JSON.stringify(got);
    out(`[runner] CONTINUE ${same ? 'OK' : 'MISMATCH'} before=${JSON.stringify(snap)} after=${JSON.stringify(got)}`);
    events['save_continue_' + (same ? 'ok' : 'mismatch')] = 1;
    await page.screenshot({ path: `${outDir}/reload_continue.png` });
    await inject({ reloadDone: true, events, trace });
    logIdx = 0;
    continue;
  }
  if (st.error) {
    out('[runner] BOT ERROR: ' + st.error);
    await page.screenshot({ path: `${outDir}/zz_error.png` });
    result = 'error';
    break;
  }
  if (st.done) {
    result = 'victory';
    await page.screenshot({ path: `${outDir}/zz_final.png` });
    break;
  }
  if (Date.now() - lastProgress > 8 * 60 * 1000) {
    out('[runner] no step progress for 8 minutes');
    await page.screenshot({ path: `${outDir}/zz_stuck.png` });
    result = 'stuck';
    break;
  }
  if (Date.now() > deadline) {
    result = 'timeout';
    break;
  }
}
const summary = await page.evaluate(() => {
  const S = window.__sky;
  const s = S.save();
  return { step: S.step(), state: S.state(), playTime: S.game.playTime, level: S.game.party.level, stats: s.stats, chests: s.chests.length, discovered: s.discovered.length, reactions: [...S.game.combat.discoveredReactions], errors: S.errors };
});
out('[runner] RESULT ' + result);
out('[runner] steps ' + JSON.stringify(stepTimes));
out('[runner] perf ' + JSON.stringify(perf));
out('[runner] events ' + JSON.stringify(Object.keys(events)));
out('[runner] summary ' + JSON.stringify(summary));
out('[runner] page errors: ' + pageErrors);
if (darkSrc) {
  const dark = await page.evaluate(() => window.__bot.dark || []).catch(() => []);
  out(`[runner] dark frames: ${dark.length}${dark.length ? ' ' + JSON.stringify(dark.slice(0, 6)) : ''}`);
}
logFile.end();
await browser.close();
process.exit(result === 'victory' || result === 'until' ? 0 : 1);
