import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..');
const directory = path.resolve(process.argv[2]);
const receipt = JSON.parse(await fs.readFile(path.join(directory, 'receipt.json')));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { status: 'RUNNING', externalRequests: [], errors: [], checks: [] };
const main = path.join(directory, 'review-main.cjs');
await fs.writeFile(main, `const { app, BrowserWindow } = require('electron');
app.setPath('userData', ${JSON.stringify(path.join(directory, 'inspection-profile'))});
app.whenReady().then(() => { const window = new BrowserWindow({ width: 1440, height: 1080,
webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
window.loadFile(${JSON.stringify(path.join(directory, 'review.html'))}); });`);
let app;
try {
    app = await electron.launch({ executablePath: await fs.realpath(path.join(root,
        'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')), args: [main], cwd: '/private/tmp' });
    const page = await app.firstWindow({ timeout: 60000 });
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('request', request => {
        if (/^https?:/.test(request.url())) report.externalRequests.push(request.url());
    });
    await page.waitForFunction(() => document.querySelectorAll('section').length === 3
        && [...document.images].every(image => image.complete && image.naturalWidth > 0));
    assert.equal(await page.locator('section').count(), 3);
    assert(await page.locator('body').innerText().then(text => text.includes('candidates have not been applied')));
    await page.screenshot({ path: path.join(directory, 'review-top-4x.png') });
    report.checks.push('Three complete comparison sections and embedded full-resolution images load offline.');
    await page.locator('#density').selectOption('2');
    await page.locator('#mode').selectOption('wipe');
    await page.locator('#background').selectOption('#d9e4ec');
    await page.locator('#scale').selectOption('native');
    await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
    const slider = page.locator('.slider').first();
    await slider.evaluate(element => { element.value = '35'; element.dispatchEvent(new Event('input')); });
    assert.equal(await page.locator('.wipe-new').first().evaluate(element => element.style.clipPath), 'inset(0px 65% 0px 0px)');
    assert(await page.locator('body').evaluate(element => element.classList.contains('native')));
    await page.screenshot({ path: path.join(directory, 'review-wipe-2x.png') });
    report.checks.push('2X/4X density, side-by-side/swipe, background and native-pixel controls work.');
    const animations = [];
    for (const section of await page.locator('section').all()) {
        const details = section.locator('.construction');
        await details.evaluate(element => { element.open = true; });
        const scrub = section.locator('.scrub');
        await scrub.evaluate(element => { element.value = element.max; element.dispatchEvent(new Event('input')); });
        await page.waitForFunction(identity => {
            const canvas = document.querySelector(`[data-identity="${identity}"] canvas`);
            return [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data]
                .some((value, index) => index % 4 === 3 && value > 0);
        }, await section.getAttribute('data-identity'));
        const before = Number(await scrub.inputValue());
        await section.locator('.reverse').click();
        assert.equal(await section.locator('.reverse').getAttribute('aria-pressed'), 'true');
        await section.locator('.play').click();
        await page.waitForFunction(identity => {
            const slider = document.querySelector(`[data-identity="${identity}"] .scrub`);
            return Number(slider.value) < Number(slider.max);
        }, await section.getAttribute('data-identity'));
        await section.locator('.play').click();
        animations.push({ identity: await section.getAttribute('data-identity'), lastFrame: before,
            reversedFrame: Number(await scrub.inputValue()), visible: true });
        await details.evaluate(element => { element.open = false; });
    }
    report.constructionReferences = animations;
    report.checks.push('All three current construction sheets draw, scrub and play in reverse.');
    for (const [file, hash] of Object.entries(receipt.protectedFiles)) {
        assert.equal(digest(await fs.readFile(path.join(root, file))), hash, file);
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []);
    report.htmlSha256 = digest(await fs.readFile(path.join(directory, 'review.html')));
    assert.equal(report.htmlSha256, receipt.html.sha256);
    report.currentResourcesChanged = 0; report.constructionAnimationChanges = 0;
    report.protectedFilesVerified = Object.keys(receipt.protectedFiles).length;
    report.userDecision = 'PENDING'; report.status = 'PASS_SELF_CONTAINED_SNOW_REVIEW_AND_UNCHANGED_SELECTED_RESOURCES';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
} finally {
    await app?.close().catch(() => {});
    await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report));
