// Decode every grouped-review image offline and check actual unscaled browser dimensions.
import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const [reviewDirectory, outputDirectory] = process.argv.slice(2).map(value => path.resolve(value));
await fs.mkdir(outputDirectory, { recursive: false });
const environment = JSON.parse(await fs.readFile(path.join(reviewDirectory, 'review-index.json')));
const terrain = JSON.parse(await fs.readFile(path.join(reviewDirectory, 'terrain-review-index.json')));
const expected = environment.families.flatMap(family => family.members.flatMap(member => Object.values(member.images)));
for (const density of [2, 4]) {
    const index = JSON.parse(await fs.readFile(path.join(reviewDirectory, `terrain-${density}x/index.json`)));
    expected.push(...index.records.map(record => ({ ...record, file: `terrain-${density}x/${path.basename(record.file)}` })));
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
for (const record of expected) assert.equal(sha(await fs.readFile(path.join(reviewDirectory, record.file))), record.sha256);
const report = { schema: 'm2-3-offline-review-qa-v1', reviewDirectory, mediaCount: expected.length,
    errors: [], networkRequests: [], pages: [],
    nativeSizeToleranceCssPixels: 1 / 64,
    sizePolicy: 'Native image dimensions, allowing only Chromium CSS layout quantization of 1/64 pixel.' };
const env = { ...process.env };
for (const name of ['RA2_DESKTOP_USER_DATA', 'RA2_DESKTOP_NO_DISCOVERY', 'RA2_UI_RESOURCE_ROOT']) delete env[name];
const app = await electron.launch({
    executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [path.resolve('scripts/m2/showcase-review-shell.mjs'), path.join(reviewDirectory, 'index.html'),
        `--review-profile=${path.join(outputDirectory, 'Review-Profile')}`],
    cwd: '/private/tmp', env, timeout: 60000,
});
try {
    const page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.stack));
    page.on('request', request => { if (/^(https?|wss?):/i.test(request.url())) report.networkRequests.push(request.url()); });
    await page.context().setOffline(true);
    for (const [file, filter, count] of [['index.html', '#kind', 155], ['terrain.html', '#set', 151]]) {
        await page.goto(`file://${path.join(reviewDirectory, file)}`);
        await page.waitForSelector('main img');
        const result = { file, densities: [], categories: [] };
        report.pages.push(result);
        for (const density of ['2', '4']) {
            await page.selectOption('#density', density);
            await page.selectOption(filter, '');
            const images = await page.locator('main img').evaluateAll(async images => {
                images.forEach(image => { image.loading = 'eager'; });
                await Promise.all(images.map(image => image.decode()));
                return images.map(image => ({ file: image.getAttribute('src'),
                    natural: [image.naturalWidth, image.naturalHeight],
                    displayed: [image.getBoundingClientRect().width, image.getBoundingClientRect().height],
                    maxWidth: getComputedStyle(image).maxWidth }));
            });
            assert.equal(images.length, count);
            for (const image of images) {
                assert(image.displayed.every((size, axis) => Math.abs(size - image.natural[axis]) <= 1 / 64));
                assert.equal(image.maxWidth, 'none');
            }
            result.densities.push({ density: Number(density), images });
        }
        const options = await page.locator(`${filter} option`).evaluateAll(options => options.map(option => option.value));
        for (const value of options.filter(Boolean)) {
            await page.selectOption(filter, value);
            const images = await page.locator('main img').evaluateAll(async images => {
                images.forEach(image => { image.loading = 'eager'; });
                await Promise.all(images.map(image => image.decode()));
                return images.length;
            });
            assert(images > 0);
            result.categories.push({ value, images });
            await page.screenshot({ path: path.join(outputDirectory, `${file.replace('.html', '')}-${value}.png`) });
        }
    }
    assert.equal(report.errors.length, 0);
    assert.equal(report.networkRequests.length, 0);
    assert.equal(expected.length, 612);
    assert.equal(terrain.records.length, 302);
    report.status = 'PASS_ALL_612_OFFLINE_MEDIA_AND_FILTERS';
    report.userVisualAcceptance = false;
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; throw error; }
finally {
    await fs.writeFile(path.join(outputDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app.close();
}
console.log(JSON.stringify({ status: report.status, mediaCount: report.mediaCount }));
