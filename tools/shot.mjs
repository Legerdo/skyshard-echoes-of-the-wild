// Screenshot helper: node tools/shot.mjs <out-prefix> <waitMs> <url1> [url2 ...]
// Each URL is loaded in turn (fresh page) and saved as <out-prefix>_<n>.png
import { launch } from './browser.mjs';

const prefix = process.argv[2] || 'tools/out/shot';
const wait = Number(process.argv[3] || 3000);
const urls = process.argv.slice(4);
const browser = await launch({ width: 1280, height: 720 });
const seen = new Set();
let n = 0;
for (const url of urls) {
  const page = await browser.newPage();
  page.on('console', (m) => {
    const key = m.type() + m.text().slice(0, 120);
    if (seen.has(key) || m.type() === 'debug') return;
    seen.add(key);
    console.log('[page]', m.type(), m.text().slice(0, 400));
  });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(url, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, wait));
  const out = `${prefix}_${n++}.png`;
  await page.screenshot({ path: out });
  console.log('saved', out);
  await page.close();
}
await browser.close();
