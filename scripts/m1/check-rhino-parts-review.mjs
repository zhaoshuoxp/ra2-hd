import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(process.argv[2]);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
    for (const width of [1440, 600]) {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 2, javaScriptEnabled: false });
        const page = await context.newPage(); const external = [];
        page.on('request', req => { if (/^https?:/.test(req.url())) external.push(req.url()); });
        await page.goto('file://' + root + '/review.html');
        await page.locator('details').evaluateAll(nodes => nodes.forEach(n => n.open = true));
        const images = await page.locator('img').evaluateAll(imgs => imgs.map(i => ({ width: i.width, height: i.height,
            actualWidth: i.getBoundingClientRect().width, naturalWidth: i.naturalWidth, loaded: i.complete })));
        assert.equal(images.length, 40);
        for (const i of images.slice(0, 36)) { assert.equal(i.width, 300); assert.equal(i.height, 220); assert.equal(i.actualWidth, 300); assert(i.loaded && i.naturalWidth >= 300); }
        for (const href of await page.locator('a').evaluateAll(a => a.map(a => a.getAttribute('href')))) await fs.access(path.resolve(root, href));
        assert.deepEqual(external, []); await context.close();
    }
    console.log('PASS: native 300x220 CSS review at wide/narrow viewports; all images/links; no external requests; JavaScript disabled.');
} finally { await browser.close(); }
