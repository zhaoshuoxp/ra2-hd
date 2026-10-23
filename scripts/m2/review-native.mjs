import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const [mode, receiptFile, output] = process.argv.slice(2);
assert(['default', 'html', 'video'].includes(mode));
const receipt = JSON.parse(await fs.readFile(receiptFile));
const errors = [], result = { mode, errors };
const env = { ...process.env };
for (const key of ['RA2_DESKTOP_USER_DATA', 'RA2_DESKTOP_NO_DISCOVERY', 'RA2_UI_RESOURCE_ROOT']) delete env[key];
const options = mode === 'default' ? {
    executablePath: path.join(receipt.app, 'Contents/MacOS/RA2 HD Editions'), args: [], env,
} : {
    executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [path.resolve('scripts/m2/review-shell.mjs'), path.resolve(receipt.review)], env,
};
const app = await electron.launch({ ...options, cwd: '/private/tmp', timeout: 60000 });
try {
    const page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.stack));
    await page.waitForLoadState('domcontentloaded');
    if (mode === 'default') {
        result.userData = await app.evaluate(({ app }) => app.getPath('userData'));
        assert.equal(result.userData, path.join(path.dirname(receipt.app), 'M2.1-Review-Profile'));
        await page.locator('[data-edition=yr]').click({ timeout: 60000 });
        await page.waitForFunction(() => window.__ra2debug?.generalOptions && window.__ra2debug.uiArt?.revision,
            undefined, { timeout: 90000 });
        result.ui = await page.evaluate(() => window.__ra2debug.uiArt.metrics());
        assert.equal(result.ui.revision, 'yuri-emblem-ui-v1');
        await page.evaluate(() => {
            const graphics = window.__ra2debug.generalOptions.graphics;
            graphics.hdEnabled.value = true; graphics.hdDensity.value = 4; graphics.renderResolution.value = '1080p';
            for (const edition of ['ra2', 'yr']) {
                for (const [key, value] of Object.entries({ _r_lastMap: (edition === 'yr' ? 'X' : '') + 'MP03T4.map',
                    _r_lastMode: '1', _r_lastCountry: '0', _r_lastColor: '1', _r_lastStartPos: '0', _r_lastTeam: '0',
                    _r_hostOpts: '6;10000;0;1;1;0;1;0;;0;1;0;0',
                    _r_lastBots: JSON.stringify([null, null, null, { d: 4, c: 5, co: 2, s: 3, t: 1 }, null, null, null, null]),
                })) localStorage.setItem(`_edition:${edition}:${key}`, value);
            }
        });
        await page.waitForTimeout(300);
        result.registration = JSON.parse(await fs.readFile(path.join(result.userData, 'resource-registration.json')));
        assert.equal(result.registration.directory, receipt.resources);
        await page.screenshot({ path: output + '.png' });
    } else {
        if (mode === 'html') {
            result.frames = [];
            const scenes = await page.locator('#scene option').evaluateAll(options => options.map(option => option.value));
            const densities = await page.locator('[data-density]').evaluateAll(buttons => buttons.map(button => Number(button.dataset.density)));
            for (const scene of scenes) {
                await page.selectOption('#scene', scene);
                for (const density of densities) {
                    if (await page.locator(`[data-density="${density}"]`).isDisabled()) continue;
                    await page.locator(`[data-density="${density}"]`).click();
                    await page.waitForFunction(() => document.querySelector('#sceneImage').complete);
                    const image = await page.locator('#sceneImage').evaluate(img => ({ width: img.naturalWidth,
                        height: img.naturalHeight, display: img.getBoundingClientRect().width }));
                    assert.equal(await page.evaluate(({ scene, density }) => document.querySelector('#sceneImage').src
                        === new URL(images[scene][density], location.href).href, { scene, density }), true);
                    assert.deepEqual([image.width, image.height], [1489, 1080]);
                    assert(Math.abs(image.display - 1241.3793103448277) < 1);
                    result.frames.push({ scene, density, ...image });
                }
            }
            await page.selectOption('#scene', 'mixed'); await page.locator('[data-density]').last().click();
            await page.locator('#pixels').click();
            assert.equal(await page.locator('#sceneImage').evaluate(img => img.getBoundingClientRect().width), 1489);
            await page.locator('#pixels').click(); await page.locator('#fit').click();
            result.fit = await page.evaluate(() => ({ image: document.querySelector('#sceneImage').getBoundingClientRect().width,
                viewport: document.querySelector('#viewport').clientWidth }));
            assert(Math.abs(result.fit.image - result.fit.viewport) < 1);
            await page.locator('#fit').click();
            if (await page.locator('#coverageButton').count()) {
                await page.selectOption('#scene', receipt.coverageScene ?? 'cliff-center');
                await page.locator('#coverageButton').click();
                result.coverage = await page.locator('#coverage').evaluate(svg => ({
                    shown: !svg.hasAttribute('hidden') && getComputedStyle(svg).display !== 'none',
                    markers: svg.children.length,
                    authored: [...svg.children].filter(e => e.getAttribute('fill') === '#27edee').length,
                    original: [...svg.children].filter(e => e.getAttribute('fill') === '#ffab54').length,
                }));
                assert(result.coverage.shown && result.coverage.authored > 0 && result.coverage.original > 0);
                assert.equal(result.coverage.markers, result.coverage.authored + result.coverage.original);
                await page.screenshot({ path: output + '-coverage.png' });
                await page.locator('#coverageButton').click();
                result.masters = [];
                for (const master of await page.locator('img.master').all()) {
                    await master.evaluate(img => { img.loading = 'eager'; return img.decode(); });
                    const dimensions = await master.evaluate(img => [img.naturalWidth, img.naturalHeight]);
                    if (receipt.reviewMasterSizes) assert.deepEqual(dimensions, receipt.reviewMasterSizes[result.masters.length]);
                    else assert(dimensions.every(n => n > 1000));
                    result.masters.push(dimensions);
                }
                assert.equal(result.masters.length, receipt.reviewMasters ?? 5);
                const references = await page.locator('img.nativeReference').all();
                if (references.length) {
                    assert.equal(references.length, receipt.originalReferences ?? 5);
                    result.originalReferences = [];
                    for (const reference of references) {
                        await reference.evaluate(img => { img.loading = 'eager'; return img.decode(); });
                        const dimensions = await reference.evaluate(img => [img.naturalWidth, img.naturalHeight]);
                        assert.deepEqual(dimensions, [1254, 1254]);
                        result.originalReferences.push(dimensions);
                    }
                }
            }
        }
        await page.locator('details').first().evaluate(e => { e.open = true; });
        result.videos = [];
        const clips = await page.locator('video').all();
        assert.equal(clips.length, 3);
        for (const video of clips) {
            await video.evaluate(e => { e.preload = 'metadata'; e.load(); });
            await video.evaluate(e => new Promise((resolve, reject) => {
                e.onloadedmetadata = resolve; e.onerror = reject;
                if (e.readyState >= 1) resolve();
            }));
            const data = await video.evaluate(e => new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(Error('Panning clip did not finish')), 15000);
                e.onended = () => {
                    clearTimeout(timer);
                    resolve({ width: e.videoWidth, height: e.videoHeight, completed: true,
                        playedSeconds: e.currentTime, duration: Number.isFinite(e.duration) ? e.duration : null,
                        durationMetadata: Number.isFinite(e.duration) ? 'FINITE' : 'UNINDEXED_NATIVE_MEDIARECORDER_STREAM' });
                };
                e.onerror = () => { clearTimeout(timer); reject(Error('Panning clip playback failed')); };
                e.muted = true; e.currentTime = 0; e.play().catch(error => { clearTimeout(timer); reject(error); });
            }));
            assert.deepEqual([data.width, data.height], [1489, 1080]);
            assert(data.completed && data.playedSeconds > 5 && data.playedSeconds < 12);
            result.videos.push(data);
        }
        await page.screenshot({ path: output + '.png' });
    }
    assert.equal(errors.length, 0); result.status = 'PASS';
} catch (error) { result.status = 'FAIL'; result.failure = error.stack; throw error; }
finally { await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n'); await app.close(); }
