import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const [folderArg, outputArg] = process.argv.slice(2);
const folder = path.resolve(folderArg), output = path.resolve(outputArg);
await fs.mkdir(output, { recursive: false });
const browser = await chromium.launch({ headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
const report = { status: 'RUNNING', folder, errors: [], externalRequests: [], layouts: [] };
page.on('pageerror', error => report.errors.push(error.stack));
page.on('request', request => { if (/^https?:/i.test(request.url())) report.externalRequests.push(request.url()); });
try {
    await page.goto(pathToFileURL(path.join(folder, 'Review/Open-Review.html')).href, { waitUntil: 'load' });
    await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth));
    assert((await page.title()).includes('v0.2'));
    const links = await page.locator('a').evaluateAll(elements => elements.map(element => element.href));
    for (const href of links) {
        const file = fileURLToPath(href);
        assert(file.startsWith(folder + path.sep));
        await fs.access(file);
    }
    report.localHtmlLinks = [];
    for (const name of await fs.readdir(path.join(folder, 'Review'))) {
        if (!name.endsWith('.html')) continue;
        const file = path.join(folder, 'Review', name), markup = await fs.readFile(file, 'utf8');
        for (const match of markup.matchAll(/<(?:a|script|link|iframe)\b[^>]*?\b(?:href|src)=["']([^"']+)/gi)) {
            const href = match[1];
            if (/^(?:data:|https?:|#|javascript:)/i.test(href)) continue;
            const target = fileURLToPath(new URL(href, pathToFileURL(file)));
            assert(target.startsWith(folder + path.sep));
            await fs.access(target);
            report.localHtmlLinks.push({ page: name, href });
        }
    }
    for (const width of [1440, 768]) {
        await page.setViewportSize({ width, height: 1000 });
        const layout = await page.evaluate(() => ({ width: innerWidth,
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
            images: document.images.length,
            externalImages: [...document.images].filter(image => !image.src.startsWith('data:')).length }));
        assert(!layout.horizontalOverflow && !layout.externalImages && layout.images === 3);
        report.layouts.push(layout);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: path.join(output, 'final-summary.png') });
    const accepted = JSON.parse(await fs.readFile('docs/m2-4-result-lettering-r5-20261022.json'));
    const pin = accepted.files.find(row => row.file === 'M2.4-Result-Lettering-R5-Embedded.html');
    const review = path.join(folder, 'Review/Accepted-R5-Lettering-and-Hover-Embedded.html');
    const checksum = createHash('sha256').update(await fs.readFile(review)).digest('hex');
    assert.equal(checksum, pin.sha256);
    report.acceptedR5ExactHash = checksum;
    await page.goto(pathToFileURL(review).href, { waitUntil: 'load' });
    await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth));
    report.acceptedR5Images = await page.locator('img').count();
    assert.equal(report.acceptedR5Images, 27);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []);
    report.status = 'PASS_FINAL_OFFLINE_SUMMARY_AND_EXACT_ACCEPTED_R5_PAYLOAD';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; process.exitCode = 1; console.error(error); }
finally { await browser.close(); }
await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, images: report.acceptedR5Images, layouts: report.layouts.length }));
