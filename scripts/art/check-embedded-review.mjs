// Check embedded PNG/WebP and actual playable native footage with no remote requests.
import { webkit } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const [directory, output, only] = process.argv.slice(2);
await fs.mkdir(output, { recursive: false });
const browser = await webkit.launch({ headless: true });
const results = [];
try {
    const files = (await fs.readdir(directory)).filter(f => f.endsWith('-Buildup-Review.html') && (!only || f.startsWith(only)));
    for (const file of files) {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const errors = [], remote = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
        await page.goto(pathToFileURL(path.resolve(directory, file)).href);
        const options = await page.locator('#family option').allTextContents();
        const blockedSelections = [];
        for (let index = 0; index < options.length; index++) {
            await page.locator('#family').selectOption(String(index));
            for (const density of ['2', '4']) {
                await page.locator('#density').selectOption(density);
                const blocked = await page.evaluate(() => !!evidence[selected.key][$('density').value].blocked);
                if (blocked) blockedSelections.push({ sequence: options[index], density: Number(density) });
                await page.waitForFunction(blocked => ['original', 'before', 'candidate', ...(!blocked ? ['native-sheet'] : [])].every(id => {
                    const image = document.getElementById(id); return image.complete && image.naturalWidth > 0;
                }), blocked);
                for (const kind of blocked ? [] : ['build', 'sale']) {
                    const info = await page.evaluate(async kind => {
                        const video = document.getElementById('native-' + kind);
                        await video.play();
                        await new Promise(resolve => setTimeout(resolve, 220));
                        video.pause();
                        return { time: video.currentTime, width: video.videoWidth, error: video.error?.message };
                    }, kind);
                    assert(info.time > 0 && info.width > 0 && !info.error, JSON.stringify(info));
                }
                await page.locator('#next').click();
                assert.match(await page.locator('#label').textContent(), /^Phase \d+ \/ \d+$/);
            }
        }
        await page.locator('#direction').click();
        assert.equal(await page.locator('#direction').textContent(), 'Unbuild');
        await page.screenshot({ path: path.join(output, file.replace('.html', '.png')), fullPage: true });
        assert.deepEqual(errors, []); assert.deepEqual(remote, []);
        results.push({ file, options, densities: [2, 4], nativeVideos: 'PASS_AVAILABLE_PLAYBACK', blockedSelections, errors, remote });
        await page.close();
    }
    if (!only) {
        const expected = JSON.parse(await fs.readFile(path.join(directory, 'embedded-media.json'))).pages;
        assert.equal(results.length, expected);
        const page = await browser.newPage();
        await page.goto(pathToFileURL(path.resolve(directory, 'Buildup-Art-Review.html')).href);
        assert.equal(await page.locator('img.preview').count(), expected);
        await page.waitForFunction(() => [...document.querySelectorAll('img.preview')].every(i => i.complete && i.naturalWidth));
        await page.screenshot({ path: path.join(output, 'embedded-index.png') });
        await page.close();
    }
} finally { await browser.close(); }
await fs.writeFile(path.join(output, 'embedded-review-check.json'), JSON.stringify({
    status: 'PASS_EMBEDDED_IMAGES_AND_NATIVE_VIDEOS_OFFLINE', results,
}, null, 2) + '\n');
console.log(JSON.stringify({ status: 'PASS_EMBEDDED_IMAGES_AND_NATIVE_VIDEOS_OFFLINE', pages: results.length }));
