// Check the additive delivery entry while reusing the completed 612-image review QA.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const [folder, output] = process.argv.slice(2).map(value => path.resolve(value));
await fs.mkdir(output, { recursive: false });
const report = { schema: 'm2-3-delivery-entry-qa-v1', errors: [], networkRequests: [],
    groupedReviewQaReused: '.artifacts/m2-3/grouped-review-qa-v2/report.json' };
const app = await electron.launch({
    executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [path.resolve('scripts/m2/showcase-review-shell.mjs'), path.join(folder, 'M2.3-REVIEW.html'),
        `--review-profile=${path.join(output, 'Review-Profile')}`], cwd: '/private/tmp', timeout: 60000,
});
try {
    const page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.stack));
    page.on('request', request => { if (/^(https?|wss?):/i.test(request.url())) report.networkRequests.push(request.url()); });
    await page.context().setOffline(true);
    await page.goto(`file://${path.join(folder, 'M2.3-REVIEW.html')}`);
    report.links = await page.locator('a').evaluateAll(links => links.map(link => link.getAttribute('href')));
    for (const link of report.links) assert((await fs.stat(path.resolve(folder, link))).isFile());
    report.images = await page.locator('img').evaluateAll(async images => {
        images.forEach(image => { image.loading = 'eager'; });
        await Promise.all(images.map(image => image.decode()));
        return images.map(image => ({ file: image.getAttribute('src'),
            natural: [image.naturalWidth, image.naturalHeight],
            displayed: [image.getBoundingClientRect().width, image.getBoundingClientRect().height],
            maxWidth: getComputedStyle(image).maxWidth }));
    });
    assert.equal(report.images.length, 19);
    for (const image of report.images) {
        assert(image.displayed.every((size, axis) => Math.abs(size - image.natural[axis]) <= 1 / 64));
        assert.equal(image.maxWidth, 'none');
    }
    await page.screenshot({ path: path.join(output, 'review-entry.png') });
    await page.getByRole('link', { name: 'Environment review', exact: true }).click();
    await page.waitForSelector('#kind');
    await page.selectOption('#kind', 'smudge');
    await page.selectOption('#density', '2');
    assert.equal(await page.locator('main img').count(), 24);
    assert.equal(report.errors.length, 0); assert.equal(report.networkRequests.length, 0);
    report.status = 'PASS_ADDITIVE_ENTRY_LINKS_19_NATIVE_IMAGES_AND_REVIEW_NAVIGATION';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; throw error; }
finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app.close(); }
console.log(JSON.stringify({ status: report.status, nativeImages: report.images.length }));
