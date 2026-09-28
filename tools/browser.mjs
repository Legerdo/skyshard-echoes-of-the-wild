// Shared helper to launch the locally installed Chrome for automated verification.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

export async function launch({ headless = true, width = 1280, height = 720 } = {}) {
  const executablePath = CANDIDATES.find((p) => fs.existsSync(p));
  if (!executablePath) throw new Error('No Chrome/Edge executable found');
  const browser = await puppeteer.launch({
    executablePath,
    headless: headless ? 'new' : false,
    defaultViewport: { width, height },
    args: [
      '--ignore-gpu-blocklist',
      '--enable-gpu',
      '--use-angle=d3d11',
      '--enable-webgl',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      `--window-size=${width},${height}`,
    ],
  });
  return browser;
}
