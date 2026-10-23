import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(process.argv[2]);
assert(root.startsWith(path.resolve('.artifacts/m1-7') + path.sep));
const data = await fs.readFile(path.join(root, 'native-actions.webm'));
const html = path.join(root, 'video-check.html');
await fs.writeFile(html, '<!doctype html><meta charset="utf-8"><title>Native unit action recording</title><style>body{margin:0;background:#111}video{display:block}</style><video controls src="data:video/webm;base64,' + data.toString('base64') + '"></video>');
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const report = { status: 'FAIL', errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1491, height: 1080 } });
  await page.route('**/*', route => /^(file|data):/.test(route.request().url()) ? route.continue() : route.abort());
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto('file://' + html);
  await page.waitForFunction(() => document.querySelector('video').readyState >= 2);
  await page.evaluate(() => { const video = document.querySelector('video'); video.currentTime = 2; });
  await page.waitForFunction(() => { const v = document.querySelector('video'); return !v.seeking && v.readyState >= 2; });
  Object.assign(report, await page.evaluate(() => { const v = document.querySelector('video'); return { width:v.videoWidth, height:v.videoHeight, time:v.currentTime, error:v.error?.message ?? null, readyState:v.readyState }; }));
  assert(report.width === 1491 && report.height === 1080 && report.error === null);
  assert.deepEqual(report.errors, []);
  await page.evaluate(() => { document.querySelector('video').controls = false; });
  await page.waitForTimeout(250);
  await page.locator('video').screenshot({ path:path.join(root, 'video-frame-2s.png') });
  report.status = 'PASS_EMBEDDED_NATIVE_VIDEO_DECODE';
} catch(error) { report.failure=error.stack; process.exitCode=1; }
finally { await fs.writeFile(path.join(root, 'video-check.json'), JSON.stringify(report, null, 2) + '\n'); await browser.close(); }
console.log(report.status);
