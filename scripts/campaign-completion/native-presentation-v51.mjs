import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, returnCampaignHome, switchCampaignEdition, worldState } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], loading: [], libraries: [],
    scope: 'Public Campaign and Movies navigation; actual original edition introductions; actual Training01/02 loading screens. Loading percentages and window layouts are held presentation probes. Glyph samples use original localized labels on actual HUD canvases and do not change simulation. Synthetic inset checks are separately labeled.' };
let app, page, labels;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function skipIntroduction() {
    const intro = page.locator('[data-campaign-media$="-introduction"]');
    await intro.locator('video').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-campaign-media$="-introduction"] video')?.currentTime > .3);
    const state = await intro.locator('video').evaluate(video => ({ id: video.parentElement.dataset.campaignMedia,
        size: [video.videoWidth, video.videoHeight], duration: video.duration, time: video.currentTime, volume: video.volume }));
    await page.screenshot({ path: path.join(out, (state.id ?? 'introduction') + '.png') });
    (report.introductions ??= []).push(state); await intro.locator('button').click();
    await page.waitForSelector('[data-campaign-ready=true]');
}
async function campaignAgain() {
    await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).click();
    await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
    assert.equal(await page.locator('[data-campaign-media$="-introduction"]').count(), 0);
}
async function movies(edition, count) {
    await returnCampaignHome(page, labels);
    await page.getByRole('button', { name: labels['hd:menumovies'], exact: true }).click();
    await page.waitForSelector('[data-movie-library-ready=true]');
    assert.equal(await page.locator('[data-movie-id]').count(), count);
    await page.locator('[data-movie-id=a00_f00e]').click();
    await page.getByRole('button', { name: labels['hd:movieplay'], exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-campaign-media] video')?.currentTime > .3);
    const video = await page.locator('[data-campaign-media] video').evaluate(v => ({ width: v.videoWidth, height: v.videoHeight,
        duration: v.duration, time: v.currentTime, volume: v.volume }));
    assert(video.width > 0 && video.time > 0);
    await page.locator('[data-campaign-media] button').click(); await page.waitForSelector('[data-movie-library-ready=true]');
    await page.screenshot({ path: path.join(out, edition + '-movies.png') });
    report.libraries.push({ edition, entries: count, video });
    await page.getByRole('button', { name: labels['gui:back'], exact: true }).click(); await campaignAgain();
}
async function abortMission() {
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
    await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
    await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
}
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 4, observeIntroduction: async session => {
        page = session.page; app = session.app;
        await page.waitForFunction(() => document.querySelector('[data-campaign-media$="-introduction"] video')?.currentTime > .3);
        report.firstIntroduction = await page.locator('[data-campaign-media] video').evaluate(v => ({ size: [v.videoWidth, v.videoHeight], time: v.currentTime, duration: v.duration }));
        await page.screenshot({ path: path.join(out, 'ra2-first-introduction.png') });
    } }));
    assert.equal(report.campaignEntryIntroductions.length, 1); await movies('ra2', 80);
    await returnCampaignHome(page, labels);
    await page.getByRole('button', { name: labels['hd:menuedition'], exact: true }).click();
    await page.locator('[data-edition=yr]').click();
    await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).click();
    await skipIntroduction(); await movies('yr', 56);
    await switchCampaignEdition(page, labels, 'ra2');
    assert.equal(await page.locator('[data-campaign-media]').count(), 0);
    await page.evaluate(() => {
        const factory = window.__ra2debug.mainMenuController.screens.get(22).rootController.screens.get(1).loadingScreenApiFactory;
        const create = factory.create.bind(factory); factory.create = (...args) => {
            const api = create(...args), start = api.start.bind(api);
            api.start = async (...args) => { await start(...args); window.__heldLoading = api;
                await new Promise(resolve => window.__releaseLoading = resolve); };
            return api;
        };
    });
    for (const mission of ['trn01t.map', 'trn02t.map']) {
        await page.evaluate(mission => { window.__heldLoading = undefined;
            window.__ra2debug.mainMenuController.screens.get(22).launchPrepared(mission); }, mission);
        await page.waitForFunction(() => window.__heldLoading && document.querySelector('[data-campaign-loading]'), undefined, { timeout: 90000 });
        const foreground = await page.evaluate(() => {
            const p = window.__heldLoading.presentation, frame = p.sprites.mission.hdFrame, density = frame.width / 800;
            return { world: p.backdrop?.revision, size: [frame.width, frame.height],
                samples: [[700, 380], [484, 200]].map(([x, y]) => [...frame.data.subarray(
                    (Math.round(y * density) * frame.width + Math.round(x * density)) * 4,
                    (Math.round(y * density) * frame.width + Math.round(x * density)) * 4 + 4)]) };
        });
        assert(foreground.world.includes('interface-world-trn')); assert.equal(foreground.samples[0][3], 255);
        assert(foreground.samples[0].slice(0, 3).some(value => value > 20), 'The actual tactical photograph must be drawn');
        (report.trainingForeground ??= []).push({ mission, ...foreground });
        for (const layout of ['window', 'fullscreen']) {
            if (layout === 'window') await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSimpleFullScreen(false); w.setContentSize(1280, 800); });
            else await page.evaluate(() => window.desktopDisplay.set('fullscreen'));
            await page.waitForTimeout(500);
            const metrics = await page.evaluate(async () => {
                const root = document.querySelector('[data-campaign-loading]'), title = root.querySelector('[data-campaign-load-message]');
                return { source: root.dataset.campaignLoadingSource, density: root.dataset.campaignArtDensity,
                    title: title.getBoundingClientRect().toJSON(), protectedTop: Number(root.dataset.protectedTop),
                    display: await window.desktopDisplay.get(), ui: window.__ra2debug.uiArt.metrics() };
            });
            assert.equal(metrics.density, '2'); assert(metrics.ui.reservedBytes <= metrics.ui.budget);
            assert(metrics.title.top >= metrics.display.safeAreaTop - .5, JSON.stringify(metrics));
            let referencePaths, emptyPixels;
            for (const percent of [0, 4, 25, 62, 100]) {
                await page.evaluate(percent => { window.__heldLoading.percent = 0; window.__heldLoading.onLoadProgress(percent); }, percent);
                await page.waitForTimeout(80);
                const state = await page.locator('[data-campaign-loading-segments]').evaluate(node => ({
                    completed: Number(node.dataset.completedSegments), paths: [...node.querySelectorAll('[data-loading-segment]')].map(p => p.getAttribute('d')),
                    filled: node.querySelectorAll('[data-filled=true]').length,
                    dimensions: node.getBoundingClientRect().toJSON() }));
                assert.equal(state.completed, Math.floor(percent / 5)); assert.equal(state.filled, state.completed);
                if (referencePaths) assert.deepEqual(state.paths, referencePaths); else referencePaths = state.paths;
                const name = `${mission.slice(0, -4)}-${layout}-${percent}`;
                const pixels = await page.locator('[role=progressbar]').screenshot({ path: path.join(out, name + '-segments.png') });
                if (percent === 0) emptyPixels = pixels;
                if (percent === 4) assert.deepEqual(pixels, emptyPixels, 'No incomplete segment may light up');
                if ([25, 62, 100].includes(percent)) await page.screenshot({ path: path.join(out, name + '.png') });
                report.loading.push({ mission, layout, percent, ...metrics, ...state });
            }
            if (layout === 'window') {
                await page.evaluate(() => { document.documentElement.style.setProperty('--ra2-safe-top', '48px'); window.dispatchEvent(new Event('ra2-display-safe-area')); });
                await page.waitForTimeout(100);
                const top = await page.locator('[data-campaign-load-message]').evaluate(node => node.getBoundingClientRect().top);
                assert(top >= 48); report.syntheticInset48 = { status: 'PASS_SPECIALIZED_INSET_PROBE', titleTop: top };
                await page.evaluate(() => { document.documentElement.style.setProperty('--ra2-safe-top', '0px'); window.dispatchEvent(new Event('ra2-display-safe-area')); });
            }
        }
        await page.evaluate(() => window.__releaseLoading()); await waitWorld(page, mission);
        const state = await page.evaluate(() => { const d = window.__ra2debug, g = d.game;
            return { speedTier: g.gameOpts.gameSpeed, speed: g.speed.value, playTimeMs: g.campaign.playTime.elapsedMs }; });
        assert.equal(state.speedTier, 2); assert.equal(state.speed, 4.5);
        (report.trainingStarts ??= []).push({ mission, ...state });
        const before = await worldState(page);
        const glyphs = await page.evaluate(() => {
            const d = window.__ra2debug, hud = d.gameScreen.hud;
            hud.messages.drawMessages(false, [{ text: d.gameScreen.strings.get('Name:NACNST'), animate: false, color: '#ffff54', time: Date.now() }], Date.now());
            hud.superWeaponTimers.ctx.clearRect(0, 0, hud.superWeaponTimers.props.width, hud.superWeaponTimers.props.height);
            hud.superWeaponTimers.drawLine(d.gameScreen.strings.get('Name:NAMISL') + '  00:05:30', '#ffff54', 450);
            return [hud.messages, hud.superWeaponTimers].map(c => ({ logical: [c.props.width, c.props.height],
                raster: [c.ctx.canvas.width, c.ctx.canvas.height], font: c.ctx.font,
                png: c.ctx.canvas.toDataURL('image/png'), filter: c.texture.minFilter, mipmaps: c.texture.generateMipmaps }));
        });
        for (let i = 0; i < glyphs.length; i++) {
            assert(glyphs[i].raster[0] > glyphs[i].logical[0]); assert.equal(glyphs[i].mipmaps, false);
            await fs.writeFile(path.join(out, `${mission.slice(0, -4)}-${i ? 'timer' : 'message'}-glyphs.png`), Buffer.from(glyphs[i].png.split(',')[1], 'base64'));
            delete glyphs[i].png;
        }
        report.hudGlyphs = glyphs; assert.deepEqual(await worldState(page), before);
        await abortMission();
    }
    assert.equal(await page.locator('[data-campaign-loading],[data-campaign-media]').count(), 0);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_EDITION_INTROS_MOVIES_TRAINING_HD_SEGMENTS_SAFE_AREA_SPEED_AND_GLYPHS';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
