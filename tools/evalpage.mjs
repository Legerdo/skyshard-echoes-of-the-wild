// Diagnostics: load the game (title screen, or a save via --from=save.json + Continue) and evaluate a
// JS file in the page, printing its result.
// usage: node tools/evalpage.mjs <script.js> [url] [--from=save.json]
// The script is evaluated as an (async) function body with `S` (= window.__sky) and `G` (= game) in scope.
import { launch } from './browser.mjs';
import fs from 'node:fs';

const file = process.argv[2];
const url = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4173/';
const from = process.argv.find((a) => a.startsWith('--from='))?.slice(7);
const body = fs.readFileSync(file, 'utf8');
const browser = await launch({ headless: true });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror] ' + e.message));
await page.goto(url, { waitUntil: 'load' });
if (from) {
  const json = fs.readFileSync(from, 'utf8');
  await page.evaluate((j) => localStorage.setItem('skyshard.save.v1', j), json);
  await page.reload({ waitUntil: 'load' });
}
await page.waitForFunction(() => window.__sky && window.__sky.state() === 'title', { timeout: 90000 });
if (from) {
  await new Promise((r) => setTimeout(r, 800));
  await page.evaluate(() => window.__sky.clickTitle('continue'));
  await page.waitForFunction(() => window.__sky.state() === 'play', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1000));
}
const res = await page.evaluate((src) => {
  const S = window.__sky;
  const G = S.game;
  const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
  return new AsyncFn('S', 'G', src)(S, G);
}, body);
console.log(typeof res === 'string' ? res : JSON.stringify(res, null, 1));
await browser.close();
