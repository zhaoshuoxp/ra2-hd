// Render the portable review in the repository's isolated native Electron shell.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const [folderArgument, outputArgument] = process.argv.slice(2);
const folder = path.resolve(folderArgument), output = path.resolve(outputArgument);
await fs.mkdir(output, { recursive: false });
const manifest = JSON.parse(await fs.readFile(path.join(folder, 'review-manifest.json')));
const allPages = process.argv.includes('--all-pages');
const report = { schema: 'm2-3-native-offline-review-rendering-v2', errors: [], requests: [], pages: [], links: [] };
const app = await electron.launch({
    executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [path.resolve('scripts/m2/showcase-review-shell.mjs'), path.join(folder, manifest.entry),
        `--review-profile=${path.join(output, 'Profile')}`], cwd: '/private/tmp', timeout: 60000,
});
let failure;
try {
    const page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.stack));
    page.on('request', request => { if (/^(https?|wss?):/i.test(request.url())) report.requests.push(request.url()); });
    await page.context().setOffline(true);
    await page.waitForLoadState('domcontentloaded');
    const selected = allPages ? [manifest.entry, ...manifest.pages.map(row => row.file)] : [manifest.entry, ...manifest.pages.filter(row =>
        /edges-(ctairp|ctnewy18|cttexs08|cthosp|cttech01|ctbarn02)\.shp\.html$/.test(row.file)).map(row => row.file),
    ...manifest.pages.filter(row => /native-owners-.*-CAAIRP\.html$/.test(row.file)).map(row => row.file)];
    for (const file of selected) {
        const url = `file://${path.join(folder, file)}`;
        if (allPages && file !== manifest.entry) {
            await page.goto(`file://${path.join(folder, manifest.entry)}`);
            await page.locator(`a[href="${file}"]`).click();
            await page.waitForURL(url);
            await page.waitForLoadState('load');
            report.links.push({ file, status: 'PASS_RELATIVE_ENTRY_LINK' });
        } else if (page.url() === url) await page.waitForLoadState('load');
        else await page.goto(url);
        const pictures = await page.locator('img').evaluateAll(async images => {
            images.forEach(image => { image.loading = 'eager'; });
            await Promise.all(images.map(image => image.decode()));
            return images.map(image => ({ embedded: image.getAttribute('src').startsWith('data:image/png;base64,'),
                natural: [image.naturalWidth, image.naturalHeight],
                displayed: [image.getBoundingClientRect().width, image.getBoundingClientRect().height],
                maxWidth: getComputedStyle(image).maxWidth }));
        });
        let phaseComparison;
        if (file === 'phases.html') {
            await page.waitForFunction(() => window.phaseReviewState?.ready === true);
            phaseComparison = [];
            for (const density of ['2', '4']) for (const state of ['0', '1']) {
                await page.locator('#density').selectOption(density);
                await page.locator('#state').selectOption(state);
                const frames = [];
                for (let phase = 0; phase < 32; phase++) {
                    const sample = await page.evaluate(n => {
                        const slider = document.querySelector('#phase');
                        slider.value = n; slider.dispatchEvent(new Event('input'));
                        return { state: window.phaseReviewState, canvases: ['original', 'r16'].map(id => {
                            const canvas = document.getElementById(id);
                            return { size: [canvas.width, canvas.height], png: canvas.toDataURL() };
                        }) };
                    }, phase);
                    assert.equal(sample.state.phase, phase);
                    assert.equal(sample.state.density, Number(density));
                    assert.equal(sample.state.state, Number(state));
                    assert(sample.canvases.every(c => c.png.startsWith('data:image/png;base64,') && c.png.length > 1000));
                    assert(sample.canvases.every(c => c.size[0] === 166*Number(density) && c.size[1] === 122*Number(density)));
                    frames.push(sample.canvases.map(c => c.png));
                }
                assert.equal(new Set(frames.map(f => f[0])).size, 32);
                assert.equal(new Set(frames.map(f => f[1])).size, 32);
                phaseComparison.push({ density: Number(density), state: Number(state), uniquePhases: 32 });
            }
            await page.locator('#next').click();
            assert.equal(await page.evaluate(() => window.phaseReviewState.phase), 0);
            await page.locator('#prev').click();
            assert.equal(await page.evaluate(() => window.phaseReviewState.phase), 31);
            await page.locator('#play').click();
            await page.waitForFunction(() => window.phaseReviewState.phase !== 31);
            await page.locator('#play').click();
            await page.screenshot({ path: path.join(output, 'phase-comparison.png') });
        } else assert(pictures.length);
        for (const picture of pictures) {
            assert(picture.embedded && picture.natural.every(Boolean));
            assert(picture.displayed.every((size, axis) => Math.abs(size-picture.natural[axis])<=1/64));
            assert.equal(picture.maxWidth, 'none');
        }
        const videos = await page.locator('video').evaluateAll(async elements => {
            return await Promise.all(elements.map(async video => {
                if (video.readyState < 1) await new Promise((resolve, reject) => {
                    video.addEventListener('loadedmetadata', resolve, { once: true });
                    video.addEventListener('error', () => reject(Error('Embedded video failed')), { once: true });
                });
                video.muted = true;
                await video.play();
                await new Promise(resolve => setTimeout(resolve, 250));
                const sample = { embedded: video.getAttribute('src').startsWith('data:video/webm;base64,'),
                    natural: [video.videoWidth, video.videoHeight], duration: video.duration,
                    advancing: video.currentTime > 0, error: video.error?.message };
                video.pause();
                return sample;
            }));
        });
        for (const video of videos) {
            assert(video.embedded && video.advancing && !video.error);
            assert.deepEqual(video.natural, [720, 640]);
            assert(video.duration >= 4);
        }
        report.pages.push({ file, pictures, videos, phaseComparison });
        if (file === manifest.entry) await page.screenshot({ path: path.join(output, 'review-entry.png') });
    }
    assert.equal(report.errors.length, 0);
    assert.equal(report.requests.length, 0);
    report.status = 'PASS_OFFLINE_NATIVE_HTML_RENDERING_EMBEDDED_IMAGES_ACTUAL_DIMENSIONS';
    report.allPagePixelBytesValidation = manifest.status;
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; failure = error; }
finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)+'\n'); await app.close(); }
if (failure) throw failure;
console.log(JSON.stringify({ status: report.status, pages: report.pages.length,
    pictures: report.pages.reduce((sum, page) => sum+page.pictures.length, 0) }));
