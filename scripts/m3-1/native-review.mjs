// Historical diagnostic-build harness; use input-native.mjs for current formal mission validation.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.resolve(process.argv[2] || path.join(root, '.artifacts/m3-1/native-' + Date.now()));
await fs.mkdir(out, { recursive: false });
const profile = path.join(out, 'profile'); await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.resolve(root, '../ra2-hd/.local') }));
const report = { status: 'RUNNING', platform: process.platform + '-' + process.arch,
    scope: 'Diagnostic mission entry and media lifecycle. No normal gameplay completion, original failure or full-world save claim.',
    errors: [], consoleErrors: [], cases: [], screenshots: [] };
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let app, page;
await save();
async function shot(name) { await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); await save(); }
try {
    app = await electron.launch({ executablePath: await fs.realpath(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')),
        args: [path.join(root, '.artifacts/m3-1/review-runtime')], cwd: '/private/tmp', timeout: 60000,
        env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1',
            RA2_CAMPAIGN_RESOURCE_ROOT: path.join(root, '.local/campaign') } });
    app.process().stdout?.on('data', chunk => { void fs.appendFile(path.join(out, 'electron.log'), chunk); });
    app.process().stderr?.on('data', chunk => { void fs.appendFile(path.join(out, 'electron.log'), chunk); });
    page = await app.firstWindow({ timeout: 30000 });
    page.on('pageerror', error => { report.errors.push(error.stack); void save(); });
    page.on('console', message => { if (message.type() === 'error') { report.consoleErrors.push(message.text()); void save(); } });
    await page.locator('[data-edition=ra2]').click({ timeout: 60000 });
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController && document.querySelector('.hd-menu-scene'), undefined, { timeout: 90000 });
    report.language = await page.evaluate(() => document.documentElement.lang);
    const retail = JSON.parse(await fs.readFile(path.join(root, `public/res/locale/retail-ra2-${report.language}.json`), 'utf8'));
    const labels = { ...retail.labels, ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/${report.language}.json`), 'utf8')) };
    await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug.mainMenuController.screens.get(22)?.prepared, undefined, { timeout: 30000 });
    await shot('01-campaign-menu');
    assert.equal(await page.getByRole('button', { name: labels['gui:load'], exact: true }).getAttribute('aria-disabled'), 'true');
    // Direct preview calls are diagnostic media probes; presentation-native.mjs covers actual logo navigation.
    await page.evaluate(() => { void window.__ra2debug.mainMenuController.screens.get(22).preview('fullscreen-intro'); });
    await page.waitForFunction(() => { const video = document.querySelector('[data-campaign-media] video'); return video?.currentTime > .3 && video?.videoWidth > 0; }, undefined, { timeout: 15000 });
    report.intro = await page.evaluate(() => {
        const v = document.querySelector('[data-campaign-media] video');
        return { width: v.videoWidth, height: v.videoHeight, duration: v.duration, muted: v.muted,
            audioDecodedBytes: v.webkitAudioDecodedByteCount, objectFit: getComputedStyle(v).objectFit, currentTime: v.currentTime };
    });
    assert.deepEqual([report.intro.width, report.intro.height], [640, 480]);
    assert(report.intro.audioDecodedBytes > 0); assert.equal(report.intro.objectFit, 'contain'); assert.equal(report.intro.muted, false);
    await shot('02-original-intro');
    await page.locator('[data-campaign-media] button').click();
    await page.waitForSelector('[data-campaign-media]', { state: 'detached' });
    await page.evaluate(() => { void window.__ra2debug.mainMenuController.screens.get(22).preview('transmission-candidate'); });
    await page.waitForFunction(() => { const v = document.querySelector('[data-campaign-media] video'); return v?.currentTime > .3; });
    report.transmission = await page.evaluate(() => {
        const v = document.querySelector('[data-campaign-media] video');
        return { width: v.videoWidth, height: v.videoHeight, duration: v.duration, audioDecodedBytes: v.webkitAudioDecodedByteCount };
    });
    await shot('03-transmission-candidate');
    await page.waitForSelector('[data-campaign-media]', { state: 'detached', timeout: 20000 });
    report.mediaOutcomes = await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).media.outcomes);
    assert.deepEqual(report.mediaOutcomes.map(row => row.outcome), ['skipped', 'ended']);
    await page.evaluate(() => {
        const screen = window.__ra2debug.mainMenuController.screens.get(22);
        window.__m3CancelledMedia = screen.media;
        window.__m3MediaPromises = [screen.preview('transmission-candidate'), screen.preview('transmission-candidate')];
    });
    await page.waitForFunction(() => window.__m3CancelledMedia.current && window.__m3CancelledMedia.queue.length === 1);
    await page.evaluate(() => window.__ra2debug.mainMenuController.goToScreenBlocking(0));
    report.mediaCancellation = await page.evaluate(async () => {
        await Promise.all(window.__m3MediaPromises);
        return { outcomes: window.__m3CancelledMedia.outcomes.slice(-2), elementsRemaining: document.querySelectorAll('[data-campaign-media]').length };
    });
    assert.deepEqual(report.mediaCancellation.outcomes.map(item => item.outcome), ['cancelled', 'cancelled']);
    assert.equal(report.mediaCancellation.elementsRemaining, 0);
    await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug.mainMenuController.screens.get(22)?.prepared);
    await page.evaluate(() => {
        const d = window.__ra2debug; d.generalOptions.graphics.hdEnabled.value = false;
        d.generalOptions.graphics.renderResolution.value = 'native';
    });
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic());
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1 && document.querySelector('[data-campaign-diagnostic]'), undefined, { timeout: 90000 });
    await page.waitForFunction(() => window.__ra2debug.game.campaign.failure, undefined, { timeout: 10000 });
    const scene = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, c = g.campaign;
        return { tick: g.currentTick, failure: c.failure, map: g.gameOpts.mapName, source: c.launch.sourceSha256,
            diagnostic: c.launch.diagnostic, result: c.result ?? null, botCount: g.botManager.bots.size,
            houses: [...c.houses].map(([id, p]) => ({ id, country: p.country.name, neutral: p.isNeutral, ai: p.isAi, credits: p.credits,
                objects: p.getOwnedObjects(true).map(o => ({ name: o.name, type: o.type, x: o.tile?.rx, y: o.tile?.ry })) })),
            player: d.localPlayer.name, objects: g.world.getAllObjects().length,
            houseRelationsMatch: [...c.definition.houses.values()].every(house => JSON.stringify(
                g.alliances.getAllies(c.houses.get(house.id)).map(player => player.name).sort()) === JSON.stringify(house.allies.filter(id => id !== house.id).sort())),
            playerTechLevel: d.localPlayer.production.maxTechLevel,
            required: c.issues.map(issue => ({ section: issue.section, key: issue.key, index: issue.index, reason: issue.reason })) };
    });
    assert.equal(scene.map, 'sov01t.map'); assert.equal(scene.player, 'Player House'); assert.equal(scene.botCount, 0);
    assert.equal(scene.houses.length, 8); assert.equal(scene.result, null);
    assert.equal(scene.houseRelationsMatch, true); assert.equal(scene.playerTechLevel, 2);
    assert(scene.failure.includes('[Actions] 0BB24A9C:0') || scene.failure.includes('unsupported action'));
    assert.equal(scene.houses.find(house => house.id === 'Player House').credits, 5500);
    report.cases.push({ density: 1, scene }); await shot('04-original-initial-scene');
    await page.waitForFunction(() => window.__ra2debug.game.campaign.pendingMedia.length === 0, undefined, { timeout: 45000 });
    report.initialSpeech = await page.evaluate(() => window.__ra2debug.game.campaign.speechOutcomes);
    const checkpoint = await page.evaluate(async () => {
        const g = window.__ra2debug.game;
        window.__m3CheckpointWorld = g;
        return g.campaign.journal.capture(g);
    });
    await fs.writeFile(path.join(out, 'diagnostic-checkpoint.json'), JSON.stringify(checkpoint));
    await page.getByRole('button', { name: labels['hd:campaignreturn'], exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-campaign-selection]') && !document.querySelector('[data-campaign-diagnostic]'), undefined, { timeout: 30000 });
    report.returnAndRelease = { diagnosticPanelRemoved: true };
    await page.waitForFunction(() => window.__ra2debug.mainMenuController.screens.get(22)?.prepared);
    const readCheckpoint = JSON.parse(await fs.readFile(path.join(out, 'diagnostic-checkpoint.json'), 'utf8'));
    await page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(checkpoint), readCheckpoint);
    await page.waitForFunction(() => window.__ra2debug?.game?.campaign?.failure && document.querySelector('[data-campaign-diagnostic]'), undefined, { timeout: 90000 });
    report.checkpoint = await page.evaluate(expected => {
        const g = window.__ra2debug.game;
        return { freshWorld: g !== window.__m3CheckpointWorld, tick: g.currentTick, worldHash: g.getHash(),
            worldHashMatches: g.getHash() === expected.expected.worldHash,
            missionStateMatches: JSON.stringify(g.campaign.checkpointState()) === JSON.stringify(expected.expected.mission),
            rngMatches: JSON.stringify(g.prng.snapshot()) === JSON.stringify(expected.expected.rng),
            disclosure: 'Restores the frozen diagnostic world at tick 1. This is not mid-mission continuity acceptance.' };
    }, readCheckpoint);
    assert.equal(report.checkpoint.freshWorld, true); assert.equal(report.checkpoint.worldHashMatches, true);
    assert.equal(report.checkpoint.missionStateMatches, true); assert.equal(report.checkpoint.rngMatches, true);
    await shot('05-reconstructed-diagnostic-world');
    await page.getByRole('button', { name: labels['hd:campaignreturn'], exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-campaign-selection]') && !document.querySelector('[data-campaign-diagnostic]'));
    for (const density of [2, 4]) {
        await page.waitForFunction(() => window.__ra2debug.mainMenuController.screens.get(22)?.prepared);
        await page.evaluate(density => {
            const graphics = window.__ra2debug.generalOptions.graphics;
            graphics.hdEnabled.value = true; graphics.hdDensity.value = density;
        }, density);
        await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic());
        await page.waitForFunction(() => window.__ra2debug?.game?.campaign?.failure && document.querySelector('[data-campaign-diagnostic]'), undefined, { timeout: 90000 });
        const worldHash = await page.evaluate(() => window.__ra2debug.game.getHash());
        assert.equal(worldHash, readCheckpoint.expected.worldHash, 'HD density must not change the initial simulation');
        await page.getByRole('button', { name: labels['hd:campaignreveal'], exact: true }).click();
        await page.waitForFunction(density => {
            const d = window.__ra2debug, object = d.game.world.getAllObjects().find(object => object.name === 'CAWA2D');
            const renderable = d.renderableManager.getRenderableByGameObject(object);
            return renderable?.mainObj?.builder?.hdOverride?.identity.endsWith('/' + density);
        }, density, { timeout: 30000 });
        const bindings = await page.evaluate(() => {
            const d = window.__ra2debug;
            return ['CAWA2A', 'CAWA2B', 'CAWA2C', 'CAWA2D'].map(name => {
                const object = d.game.world.getAllObjects().find(object => object.name === name);
                const renderable = d.renderableManager.getRenderableByGameObject(object);
                const override = renderable.mainObj?.builder?.hdOverride;
                return { name, density: override ? Number(override.identity.match(/\/([24])(?:\||$)/)?.[1] ?? 1) : 1,
                    identity: override?.identity ?? 'ORIGINAL', pages: override?.pages.length ?? 0,
                    tile: [object.tile.rx, object.tile.ry], health: object.healthTrait.health };
            });
        });
        report.cases.push({ density, worldHash, bindings, scope: 'Explicit diagnostic reveal and unchanged initial simulation; not original mission progression.' });
        await shot(`06-pentagon-${density}x-diagnostic-reveal`);
        await page.getByRole('button', { name: labels['hd:campaignreturn'], exact: true }).click();
        await page.waitForFunction(() => document.querySelector('[data-campaign-selection]') && !document.querySelector('[data-campaign-diagnostic]'));
    }
    assert.equal(report.errors.length, 0, report.errors.join('\n'));
    assert.equal(report.consoleErrors.length, 0, report.consoleErrors.join('\n'));
    report.status = 'PASS_DIAGNOSTIC_ONLY';
} catch (error) {
    report.status = 'FAIL'; report.failure = error.stack;
    if (page && !page.isClosed()) await shot('failure').catch(() => {});
    throw error;
} finally { await save(); await app?.close(); console.log(out); }
