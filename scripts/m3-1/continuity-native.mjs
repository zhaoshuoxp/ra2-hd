import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.resolve(process.argv[2]);
const checkpointFile = path.resolve(process.argv[3]);
const checkpoint = JSON.parse(await fs.readFile(checkpointFile, 'utf8'));
const legacyKeys = { Zs: 'HealthTrait', ws: 'GarrisonTrait', qs: 'DeployerTrait', Fc: 'HarvesterTrait', R: 'PowerTrait' };
const canonicalWorld = value => Array.isArray(value) ? value.map(canonicalWorld) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'traits'
        ? Object.fromEntries(Object.entries(item).map(([name, state]) => [legacyKeys[name] ?? name, canonicalWorld(state)])) : canonicalWorld(item)])) : value;
await fs.mkdir(out, { recursive: false });
const profile = path.join(out, 'profile'); await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.resolve(root, '../ra2-hd/.local') }));
const report = { status: 'RUNNING', platform: process.platform + '-' + process.arch,
    scope: 'Assisted saved-world reconstruction and 300-tick continuation at Original, 2X and 4X; menu restart/return/reentry. Not a normal-input victory run.',
    runtime: JSON.parse(await fs.readFile(path.join(root, '.artifacts/m3-1/review-runtime/package.json'), 'utf8')),
    harnessSha256: createHash('sha256').update(await fs.readFile(import.meta.filename)).digest('hex'),
    checkpoint: { path: path.relative(root, checkpointFile), tick: checkpoint.tick, checksum: checkpoint.checksum },
    cases: [], screenshots: [], errors: [], consoleErrors: [], failedResources: [] };
let app, page, labels;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function shot(name) { await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); await save(); }
async function state() {
    return await page.evaluate(() => { const g = window.__ra2debug.game;
        return JSON.parse(JSON.stringify({ tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot(), mission: g.campaign.checkpointState(),
            world: g.debugGetState(), pendingCallbacks: g.afterTickCallbacks.length }));
    });
}
async function menu() {
    await page.evaluate(() => window.__ra2debug.gameScreen.pointer.unlock(true)); await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__ra2debug.gameScreen.menu.getCurrentScreen());
}
async function leave() {
    await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
    await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug.mainMenuController.screens.get(22)?.prepared);
}
try {
    app = await electron.launch({ executablePath: await fs.realpath(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')),
        args: [path.join(root, '.artifacts/m3-1/review-runtime')], cwd: '/private/tmp', timeout: 60000,
        env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1', RA2_CAMPAIGN_RESOURCE_ROOT: path.join(root, '.local/campaign'), RA2_CAMPAIGN_FROZEN_TERRAIN: '1' } });
    app.process().stdout?.on('data', chunk => { void fs.appendFile(path.join(out, 'electron.log'), chunk); });
    app.process().stderr?.on('data', chunk => { void fs.appendFile(path.join(out, 'electron.log'), chunk); });
    page = await app.firstWindow({ timeout: 30000 });
    page.on('pageerror', error => report.errors.push(error.stack));
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) report.failedResources.push({ url: response.url(), status: response.status() }); });
    await page.locator('[data-edition=ra2]').click({ timeout: 60000 });
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController && document.querySelector('.hd-menu-scene'), undefined, { timeout: 90000 });
    const window = await app.browserWindow(page);
    await window.evaluate(window => { window.setFullScreen(false); window.unmaximize(); window.setContentSize(1280, 960); });
    const language = await page.evaluate(() => document.documentElement.lang);
    labels = { ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/retail-ra2-${language}.json`), 'utf8')).labels,
        ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/${language}.json`), 'utf8')) };
    await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).click();
    await page.waitForFunction(() => {
        const menu = window.__ra2debug.mainMenu;
        return document.querySelector('[data-campaign-ready=true]')
            && [...document.querySelectorAll('[data-campaign-selection] canvas')].length === 4
            && [...document.querySelectorAll('[data-campaign-selection] canvas')].every(canvas => canvas.dataset.frame === '0')
            && !menu.sidebarCollapsed && menu.sidebarSlots.every(slot => slot.getAnimationRunner().isStopped());
    });
    report.factionMenu = await page.evaluate(() => {
        const presentation = window.__ra2debug.mainMenuController.screens.get(22).presentation;
        window.__m3ExpectedLoadingPixels = presentation.sprites.mission.frames[0].data.slice();
        return [...document.querySelectorAll('[data-campaign-selection] canvas')].map(canvas => {
            const sprite = Object.values(presentation.sprites).find(sprite => sprite.image === canvas.dataset.campaignSprite);
            const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            return { image: canvas.dataset.campaignSprite, frame: canvas.dataset.frame,
                sourcePixelsMatch: pixels.every((byte, index) => byte === sprite.frames[0].data[index]) };
        });
    });
    assert(report.factionMenu.every(sprite => sprite.sourcePixelsMatch));
    await shot('01-ready-original-faction-menu');
    await page.locator('[data-campaign-faction=soviet]').hover();
    await page.waitForFunction(() => Number(document.querySelector('[data-campaign-faction=soviet] canvas').dataset.frame) > 0);
    await shot('02-original-soviet-selection-animation');
    await page.mouse.move(10, 10);
    let reference;
    for (const density of [1, 2, 4]) {
        await page.evaluate(density => { const graphics = window.__ra2debug.generalOptions.graphics;
            graphics.hdEnabled.value = density !== 1; graphics.hdDensity.value = density === 1 ? 4 : density;
        }, density);
        const launching = page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22).launchMission(checkpoint), checkpoint);
        if (density === 4) {
            await page.waitForFunction(() => document.querySelector('[data-campaign-loading] canvas[data-campaign-sprite="ls800s01.shp"]')?.dataset.frame === '0');
            report.loading = await page.evaluate(() => {
                const node = document.querySelector('[data-campaign-loading]');
                const canvas = node.querySelector('canvas[data-campaign-sprite="ls800s01.shp"]');
                const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
                return { source: node.dataset.campaignLoadingSource, percent: Number(node.dataset.percent),
                    title: node.querySelector('[data-campaign-load-message]').textContent,
                    sourcePixelsMatch: pixels.every((byte, index) => byte === window.__m3ExpectedLoadingPixels[index]),
                    scope: 'Actual ordinary loading, with no resource gate or product delay.' };
            });
            assert(report.loading.sourcePixelsMatch); assert.equal(report.loading.source, 'ls800s01.shp');
            await shot('03-actual-soviet01-loading');
        }
        await launching;
        await page.waitForFunction(tick => window.__ra2debug.gameScreen?.menu?.getCurrentScreen() && window.__ra2debug.game.currentTick === tick,
            checkpoint.tick, { timeout: 180000 });
        const restored = await state();
        assert.equal(restored.hash, checkpoint.expected.worldHash);
        assert.deepEqual(restored.rng, checkpoint.expected.rng); assert.deepEqual(restored.mission, checkpoint.expected.mission);
        assert.deepEqual(restored.world, canonicalWorld(checkpoint.expected.world)); assert.equal(restored.pendingCallbacks, checkpoint.expected.pendingCallbacks);
        if (density === 4) {
            const stableCheckpoint = await page.evaluate(() => window.__ra2debug.game.campaign.journal.capture(window.__ra2debug.game));
            await fs.writeFile(path.join(out, 'stable-identity-checkpoint.json'), JSON.stringify(stableCheckpoint, null, 2) + '\n');
            await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
            await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
            await page.waitForFunction(() => window.__ra2debug.mainMenuController.screens.get(22)?.prepared);
            await page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22).launchMission(checkpoint), stableCheckpoint);
            await page.waitForFunction(tick => window.__ra2debug.gameScreen?.menu?.getCurrentScreen() && window.__ra2debug.game.currentTick === tick,
                stableCheckpoint.tick, { timeout: 180000 });
            assert.deepEqual(await state(), restored);
            report.stableIdentitySave = { tick: stableCheckpoint.tick, checksum: stableCheckpoint.checksum, fullFreshWorldMatch: true };
        }
        await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.menu.close(); d.gameScreen.gameTurnMgr.setCampaignPaused(true);
            d.gameScreen.pointer.unlock(true); d.worldInteraction.minimapHandler.panToTile([...d.localPlayer.buildings].find(o => o.name === 'NACNST').tile);
        });
        await page.waitForTimeout(1200);
        await page.evaluate(() => {
            const d = window.__ra2debug, statue = d.game.getAllPlayers().flatMap(p => p.getOwnedObjects(true)).find(o => o.name === 'CAWASH19');
            d.worldInteraction.minimapHandler.panToTile(statue.tile);
        });
        await page.waitForTimeout(500);
        const memorial = await page.evaluate(async density => {
            const d = window.__ra2debug, statue = d.game.getAllPlayers().flatMap(p => p.getOwnedObjects(true)).find(o => o.name === 'CAWASH19');
            const renderable = d.renderableManager.getRenderableByGameObject(statue);
            const parts = [renderable?.mainObj, ...[...(renderable?.animObjects?.values?.() ?? [])].flat()].filter(Boolean).map(model => {
                const builder = model.builder, page = builder?.getHdPage?.(), mesh = model.getShapeMesh?.();
                return { image: builder?.shpFile?.filename, identity: builder?.hdOverride?.identity ?? 'ORIGINAL',
                    frames: builder?.hdOverride?.frames?.length ?? 0, frame: builder?.frameNo,
                    material: mesh?.material?.type, gpuHd: !!page && mesh?.material?.type === 'HdSpriteMaterial' && mesh.material.map === page.base,
                    visible: model.get3DObject?.().visible };
            });
            const selected = await (await fetch('/local-terrain/urban/selection.json')).json();
            const repaired = new Set(['proad06.urb', 'proad08.urb', 'proad03.urb', 'proad14.urb', 'proad07.urb', 'proad09.urb',
                'proad04.urb', 'proad05.urb', 'proadc13.urb', 'proadc14.urb', 'prslpe01.urb', 'prslpe02.urb',
                'rough03.urb', 'rough01.urb', 'rough02.urb', 'rough06.urb']);
            const roadGroups = d.terrainHd.groups.filter(group => group.status === 'PUBLISHED'
                && group.entries.some(entry => repaired.has(entry.member))).map(group => ({
                    id: group.id, sha256: group.sha256, members: [...new Set(group.entries.map(entry => entry.member))],
                    selectedHashMatches: selected.groups.find(candidate => candidate.id === group.id)?.variants
                        .find(variant => variant.density === density)?.sha256 === group.sha256 }));
            return { tile: [statue.tile.rx, statue.tile.ry], parts, roadGroups, terrainRevision: selected.revision,
                family: structuredClone(d.environmentHd.families['campaign-sov01-memorial']),
                terrain: structuredClone(d.terrainHd), glError: d.renderer.renderer.getContext().getError() };
        }, density);
        report.activeMemorial = { density, family: memorial.family, parts: memorial.parts, roadGroups: memorial.roadGroups };
        await save();
        assert.equal(memorial.glError, 0);
        if (density !== 1) {
            assert.equal(memorial.family.density, density);
            assert(memorial.parts.some(part => part.gpuHd && part.frames === 52 && part.frame < 4), 'Statue must use its actual HD aggregate material');
            assert(memorial.parts.some(part => part.gpuHd && part.frames === 52 && part.frame >= 4 && part.frame < 52),
                'Animated flag must use its actual HD aggregate material');
            assert.equal(memorial.terrainRevision, 'urban-road-markings-v5');
            assert(memorial.roadGroups.length > 0 && memorial.roadGroups.every(group => group.selectedHashMatches));
        }
        await shot('memorial-' + density + 'x');
        const bindings = await page.evaluate(() => { const d = window.__ra2debug;
            return { actors: ['NACNST', 'NAPOWR', 'NAHAND', 'NAREFN', 'HARV', 'E2', 'SENGINEER'].map(name => {
                const object = d.localPlayer.getOwnedObjects().find(o => o.name === name && o.isSpawned);
                const r = object && d.renderableManager.getRenderableByGameObject(object);
                const models = [r?.mainObj, r?.shpRenderable, ...[...(r?.animObjects?.values?.() ?? [])].flat()].filter(Boolean);
                return { name, id: object?.id, tile: object?.tile && [object.tile.rx, object.tile.ry], vxlActive: !!r?.unitVxlHd?.active,
                    vxlIdentities: r?.unitVxlHd?.family?.parts.map(p => p.override.identity),
                    parts: models.filter(m => m.builder).map(m => { const b = m.builder, page = b.getHdPage?.(), mesh = m.getShapeMesh?.();
                        return { image: b.shpFile?.filename, hd: b.hdOverride?.identity ?? 'ORIGINAL',
                            gpuHd: !!page && mesh?.material?.type === 'HdSpriteMaterial' && mesh.material.map === page.base,
                            visible: m.get3DObject?.().visible }; }) };
            }), terrain: structuredClone(d.terrainHd), environment: structuredClone(d.environmentHd), demand: structuredClone(d.sovietUnitsHd),
                prepared: { bytes: d.preparedHdCache.bytes, pendingBytes: d.preparedHdCache.pendingBytes },
                glError: d.renderer.renderer.getContext().getError() };
        });
        assert.equal(bindings.glError, 0);
        if (density !== 1) {
            for (const actor of bindings.actors.filter(a => a.id !== undefined)) assert(actor.vxlActive || actor.parts.some(p => p.gpuHd), actor.name + ' must bind an actual HD material');
            assert(bindings.prepared.bytes + bindings.prepared.pendingBytes <= 128 * 1024 * 1024);
        }
        await shot('base-' + density + 'x');
        await page.evaluate(() => { const d = window.__ra2debug, g = d.game, manager = d.gameScreen.gameTurnMgr;
            manager.setCampaignPaused(false); try { for (let i = 0; i < 300 && !g.campaign.failure && !g.campaign.result; i++) manager.doGameTurn(performance.now()); }
            finally { manager.setCampaignPaused(true); }
        });
        const continued = await state();
        if (reference) assert.deepEqual(continued, reference); else reference = continued;
        report.cases.push({ density, tick: restored.tick, worldHash: restored.hash, fullStateMatches: true, bindings, memorial,
            continuationTick: continued.tick, continuationHash: continued.hash,
            continuationDigest: createHash('sha256').update(JSON.stringify(continued)).digest('hex') });
        delete report.activeMemorial;
        await save(); console.log('density', density, 'restored', restored.hash, 'continued', continued.hash);
        if (density === 4) {
            const capture = await page.evaluate(async () => {
                const d = window.__ra2debug, canvas = d.renderer.getCanvas(), g = d.game;
                const stream = canvas.captureStream(12), chunks = [], startTick = g.currentTick;
                const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
                const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4000000 });
                recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
                const stopped = new Promise(resolve => recorder.onstop = resolve);
                recorder.start(); d.gameScreen.gameTurnMgr.setCampaignPaused(false);
                await new Promise(resolve => setTimeout(resolve, 8000));
                recorder.stop(); await stopped; stream.getTracks().forEach(track => track.stop());
                d.gameScreen.gameTurnMgr.setCampaignPaused(true);
                return { bytes: [...new Uint8Array(await new Blob(chunks, { type: mime }).arrayBuffer())], mime,
                    width: canvas.width, height: canvas.height, startTick, endTick: g.currentTick,
                    scope: 'Actual native 4X canvas capture after the matched checkpoint comparison; silent, eight seconds, requested 12 capture frames/s. Not an FPS benchmark.' };
            });
            assert(capture.bytes.length > 1000); const bytes = Buffer.from(capture.bytes);
            await fs.writeFile(path.join(out, 'native-4x-playback.webm'), bytes);
            report.video = { ...capture, bytes: bytes.length, path: path.relative(root, path.join(out, 'native-4x-playback.webm')),
                sha256: createHash('sha256').update(bytes).digest('hex') }; await save();
        }
        await menu();
        if (density === 4) {
            await page.evaluate(() => { window.__m3RestartWorld = window.__ra2debug.game; });
            await page.getByRole('button', { name: labels['hd:campaignrestart'], exact: true }).click();
            await page.waitForFunction(() => window.__ra2debug.gameScreen && window.__ra2debug.game !== window.__m3RestartWorld
                && window.__ra2debug.game.status === 1, undefined, { timeout: 180000 });
            report.restart = await page.evaluate(() => { const d = window.__ra2debug, g = d.game;
                g && d.gameScreen.gameTurnMgr.setCampaignPaused(true);
                return { freshWorld: g !== window.__m3RestartWorld, tick: g.currentTick, result: g.campaign.result ?? null,
                    failure: g.campaign.failure ?? null, commands: g.campaign.journal.commands.length,
                    paused: !!d.gameScreen.menu?.getCurrentScreen(), variables: [...g.campaign.machine.variables] };
            });
            assert(report.restart.tick < checkpoint.tick); assert.equal(report.restart.commands, 0);
            await shot('restart-original-opening'); await menu();
        }
        await leave();
    }
    report.reentry = { campaignMenuPresent: await page.locator('[data-campaign-selection]').count() === 1 };
    assert(report.reentry.campaignMenuPresent); assert.equal(report.errors.length, 0); assert.equal(report.consoleErrors.length, 0);
    assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_MATCHED_ORIGINAL_2X_4X_CONTINUITY_AND_RESTART';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; await shot('failure').catch(() => {}); }
finally { await save(); await app?.close(); console.log(out); }
