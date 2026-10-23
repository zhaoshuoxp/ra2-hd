import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.artifacts/allied-buildings/review-v1');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 });
    await page.goto('file://' + path.join(root, 'Allied-Buildings-Representative-Review.html'));
    const result = await page.evaluate(async () => {
        await Promise.all([...document.images].map(image => image.decode()));
        return {
            images: document.images.length,
            failed: [...document.images].filter(image => !image.naturalWidth).length,
            overflow: document.documentElement.scrollWidth > innerWidth,
            articles: document.querySelectorAll('article').length,
        };
    });
    await page.screenshot({ path: path.join(root, 'html-desktop.png') });
    await page.locator('#GAAIRC-SNOW').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(root, 'html-snow.png') });
    if (result.failed || result.overflow) throw Error(JSON.stringify(result));
    await fs.writeFile(path.join(root, 'browser-check.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
} finally {
    await browser.close();
}
