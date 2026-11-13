import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..'), out = path.resolve(process.argv[2]);
const baseline = JSON.parse(await fs.readFile(path.join(root, '.artifacts/m3-1/input-final/report.json'), 'utf8'));
const checkpoint = JSON.parse(await fs.readFile(path.join(root, 'scripts/m3-1/fixtures/mid-mission-checkpoint.json'), 'utf8'));
await fs.mkdir(out, { recursive: false });
const profile = path.join(out, 'profile'); await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.resolve(root, '../ra2-hd/.local') }));
const report = { status: 'RUNNING', scope: 'Presentation correction: restore the proven native-input checkpoint, replay its remaining original serialized commands with accelerated simulation, then capture the genuine source-triggered result. This is assisted replay, not a new physical-input completion.',
    runtime: JSON.parse(await fs.readFile(path.join(root, '.artifacts/m3-1/review-runtime/package.json'), 'utf8')),
    sourceGameplayRuntime: baseline.sourceHead, screenshots: [], frames: [], phases: [], errors: [], consoleErrors: [], failedResources: [] };
let app, page, labels;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function shot(name) { await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); await save(); }
async function scoreState() {
    return page.evaluate(() => { const root = document.querySelector('[data-campaign-score]');
        const canvas = root?.querySelector('canvas');
        return { result: root?.getAttribute('data-campaign-result'), phase: root?.getAttribute('data-score-phase'),
            artDensity: root?.getAttribute('data-score-art-density'), title: root?.querySelector('[data-score-title]')?.textContent,
            message: root?.querySelector('[data-score-message]')?.textContent, kills: root?.querySelector('[data-score-kills]')?.textContent,
            times: [...(root?.querySelectorAll('[data-score-time]') ?? [])].map(element => element.textContent),
            panelFrame: canvas?.dataset.panelFrame, emblemFrame: canvas?.dataset.emblemFrame,
            bounds: root?.getBoundingClientRect().toJSON(), sidebar: document.querySelector('.sidebar')?.getBoundingClientRect().toJSON() };
    });
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
    const language = await page.evaluate(() => document.documentElement.lang);
    labels = { ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/retail-ra2-${language}.json`), 'utf8')).labels,
        ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/${language}.json`), 'utf8')) };
    await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug.mainMenuController.screens.get(22)?.prepared);
    await page.evaluate(() => { const graphics = window.__ra2debug.generalOptions.graphics; graphics.hdEnabled.value = true; graphics.hdDensity.value = 4; });
    await page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22).launchMission(checkpoint), checkpoint);
    console.log('restoring original checkpoint', checkpoint.tick);
    await page.waitForFunction(tick => window.__ra2debug.gameScreen?.menu?.getCurrentScreen() && window.__ra2debug.game.currentTick === tick,
        checkpoint.tick, { timeout: 180000 });
    report.checkpoint = await page.evaluate(() => { const d = window.__ra2debug, g = d.game;
        window.__scoreProofGame = g;
        d.gameScreen.menu.close(); d.gameScreen.gameTurnMgr.setCampaignPaused(true); d.gameScreen.pointer.unlock(true);
        const statue = g.getAllPlayers().flatMap(p => p.getOwnedObjects(true)).find(o => o.name === 'CAWASH19');
        const r = statue && d.renderableManager.getRenderableByGameObject(statue);
        return { tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot(), mission: g.campaign.checkpointState(), world: g.debugGetState(),
            statue: { id: statue?.id, name: statue?.name, tile: statue?.tile && [statue.tile.rx, statue.tile.ry],
                hd: r?.mainObj?.builder?.hdOverride?.identity ?? r?.shpRenderable?.builder?.hdOverride?.identity ?? 'ORIGINAL' } };
    });
    report.checkpoint = JSON.parse(JSON.stringify(report.checkpoint));
    assert.equal(report.checkpoint.hash, checkpoint.expected.worldHash); assert.deepEqual(report.checkpoint.rng, checkpoint.expected.rng);
    assert.deepEqual(report.checkpoint.mission, checkpoint.expected.mission);
    const legacyKeys = { Zs: 'HealthTrait', ws: 'GarrisonTrait', qs: 'DeployerTrait', Fc: 'HarvesterTrait', R: 'PowerTrait' };
    const canonicalWorld = value => Array.isArray(value) ? value.map(canonicalWorld) : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'traits'
            ? Object.fromEntries(Object.entries(item).map(([name, state]) => [legacyKeys[name] ?? name, canonicalWorld(state)])) : canonicalWorld(item)])) : value;
    assert.deepEqual(report.checkpoint.world, canonicalWorld(checkpoint.expected.world));
    report.checkpoint.legacyTraitAliases = legacyKeys;
    console.log('restored complete world', report.checkpoint.hash);
    delete report.checkpoint.world; delete report.checkpoint.rng; delete report.checkpoint.mission;
    await page.evaluate(() => { const d = window.__ra2debug, tile = d.game.map.tiles.getByMapCoords(63, 104);
        const statue = d.game.getAllPlayers().flatMap(p => p.getOwnedObjects(true)).find(o => o.name === 'CAWASH19');
        if (statue) d.worldInteraction.minimapHandler.panToTile(statue.tile); else if (tile) d.worldInteraction.minimapHandler.panToTile(tile);
    });
    await page.waitForTimeout(500); await shot('01-memorial-at-4x');
    await page.evaluate(commands => { window.__scoreReplayCommands = commands; }, baseline.final.commands.filter(command => command.tick >= checkpoint.tick));
    for (let batch = 0; batch < 100; batch++) {
        const state = await page.evaluate(() => { const d = window.__ra2debug, g = d.game, manager = d.gameScreen.gameTurnMgr;
            manager.setCampaignPaused(false);
            try {
                for (let i = 0; i < 240 && !g.campaign.result && !g.campaign.failure; i++) {
                    const commands = window.__scoreReplayCommands.filter(command => command.tick === g.currentTick);
                    for (const command of commands) {
                        const action = d.actionFactory.create(command.type); action.unserialize(new Uint8Array(command.data));
                        action.player = g.getPlayer(command.player);
                        g.campaign.journal.record(g, action.player, [action]); action.process();
                    }
                    manager.doGameTurn(performance.now());
                }
            } finally { manager.setCampaignPaused(true); }
            return { tick: g.currentTick, result: g.campaign.result, failure: g.campaign.failure, trace: g.campaign.trace,
                time: g.currentTime, kills: g.localPlayer.getUnitsKilled() };
        });
        if (batch % 15 === 0) console.log('replay', state.tick);
        if (state.failure) throw new Error(state.failure);
        if (state.result) { report.result = state; break; }
    }
    assert.equal(report.result?.result, 'victory'); assert.equal(report.result.tick, baseline.final.tick);
    assert(report.result.trace.some(action => action.key === '0A301C50' && action.opcode === 1));
    // The Winner schedules game.end through afterTick, which the next ordinary
    // simulation turn drains. Do not call game.end or force a result route.
    report.sourceEnd = await page.evaluate(() => { const d = window.__ra2debug, g = d.game, before = g.currentTick;
        d.gameScreen.gameTurnMgr.setCampaignPaused(false);
        try { d.gameScreen.gameTurnMgr.doGameTurn(performance.now()); }
        finally { d.gameScreen.gameTurnMgr.setCampaignPaused(true); }
        return { before, after: g.currentTick, status: g.status, time: g.currentTime, kills: g.localPlayer.getUnitsKilled() };
    });
    report.result.kills = report.sourceEnd.kills;
    await save(); console.log('original victory', report.result.tick, 'waiting for required source speech');
    await page.locator('[data-campaign-score=retail]').waitFor({ timeout: 240000 });
    report.phases.push(await scoreState());
    const framesDir = path.join(out, 'frames'); await fs.mkdir(framesDir);
    const started = performance.now();
    while (performance.now() - started < 8500) {
        const timestamp = performance.now() - started, filename = 'frame-' + String(report.frames.length).padStart(3, '0') + '.png';
        await page.screenshot({ path: path.join(framesDir, filename) });
        report.frames.push({ filename, timestamp }); report.phases.push(await scoreState());
        await page.waitForTimeout(120);
    }
    assert(report.phases.some(phase => phase.title !== report.phases.at(-1).title), 'Title must be revealed after opening');
    assert(report.phases.some(phase => phase.message?.trim() && phase.message.trim() !== report.phases.at(-1).message.trim()),
        'Native samples must include a partial evaluation message');
    assert(new Set(report.phases.map(phase => phase.emblemFrame)).size > 5, 'Original emblem frames must change');
    await page.waitForFunction(() => document.querySelector('[data-score-phase=complete]'), undefined, { timeout: 20000 });
    report.complete = await scoreState();
    assert.equal(report.complete.title, labels['gui:partitlesov01']);
    assert.equal(report.complete.message.trim(), labels['gui:overparmsgsov01']);
    assert.equal(Number(report.complete.kills), report.result.kills);
    assert.equal(report.complete.times[0], '00:15:00'); assert.equal(report.complete.artDensity, 'original');
    await shot('02-original-campaign-medal-and-text');
    report.speech = await page.evaluate(() => window.__scoreProofGame.campaign.speechOutcomes);
    for (const id of ['Mis_S1_SofiaVictorySpeech', 'EVA_YouAreVictorious']) {
        assert(report.speech.some(item => item.id === id && item.reason === 'ended'));
    }
    await page.getByRole('button', { name: labels['gui:continue'], exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-campaign-selection]'));
    report.returnToCampaign = true;
    // Re-enter the real ended game's score to exercise immediate animation completion and cleanup.
    await page.evaluate(() => { const g = window.__scoreProofGame;
        window.__ra2debug.mainMenuController.goToScreen(12, { game: g, localPlayer: g.localPlayer, singlePlayer: true,
            returnTo: { screenType: 22 } });
    });
    await page.locator('[data-campaign-score=retail]').waitFor({ timeout: 30000 });
    await page.locator('[data-campaign-score=retail]').press('Enter');
    await page.waitForFunction(() => document.querySelector('[data-score-phase=complete]'));
    report.skip = await scoreState(); assert.equal(report.skip.title, report.complete.title);
    await shot('03-completed-text-after-skip');
    await page.getByRole('button', { name: labels['gui:continue'], exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-campaign-selection]'));
    assert.deepEqual(report.errors, []); assert.deepEqual(report.consoleErrors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_SOURCE_VICTORY_MEDAL_TYPEWRITER_TALLY_SKIP_AND_RETURN';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; if (page) await shot('failure').catch(() => {}); throw error; }
finally { await save(); if (app) await app.close(); }
