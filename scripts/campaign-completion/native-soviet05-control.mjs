import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';
import { namedSaveRestart } from './named-save-restart.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [],
    scope: 'Fresh original Soviet 05 control, source selected-unit hint, radar movies and named-save restart. UI selection methods and ordinary serialized move orders assist validation. Source map, ownership, rules, triggers, objectives, health and RNG are not edited. This is not full mission completion or public-route acceptance.' };
let app, page, labels;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 0 }));
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('sov05u.map'));
    let waiting = true;
    const startupErrors = async () => {
        while (waiting) {
            try { const error = JSON.parse(await fs.readFile(path.join(out, 'profile/game-error-latest.json')));
                throw Error('Native source startup failed: ' + error.error.message); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    };
    try { await Promise.race([waitWorld(page, 'sov05u.map'), startupErrors()]); }
    finally { waiting = false; }
    report.initial = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, c = g.campaign;
        const unit = c.houses.get('Other3 House').getOwnedObjects().find(unit => unit.name === 'SHK');
        d.worldInteraction.unitSelectionHandler.selectSingleUnit(unit);
        const tile = g.map.tiles.getByMapCoords(unit.tile.rx + 3, unit.tile.ry);
        return { launch: c.launch, issues: c.issues, localAiTriggers: c.definition.aiTriggers.size,
            controllers: g.localPlayer.campaignControlledPlayers.map(owner => owner.name),
            unit: { id: unit.id, owner: unit.owner.name, name: unit.name, from: [unit.tile.rx, unit.tile.ry], to: [tile.rx, tile.ry] } };
    });
    assert.equal(report.initial.launch.sourceSha256, '31c6883ce678c0bcede293c571a610d355319a7cd729d45560183ced152a5629');
    assert.equal(report.initial.launch.semanticsVersion, 7); assert.deepEqual(report.initial.issues, []);
    assert.equal(report.initial.localAiTriggers, 0);
    assert.deepEqual(report.initial.controllers, ['Player House', 'BadGuy3 House', 'Other3 House']);
    await stepWorld(page, 45);
    report.selectedHint = await page.evaluate(() => { const c = window.__ra2debug.game.campaign;
        return { selectedFired: c.machine.states.get('087D3A80').fired, voiceFired: c.machine.states.get('0915F590').fired,
            actions: c.trace.filter(action => action.key === '0915F590') }; });
    assert(report.selectedHint.selectedFired > 0 && report.selectedHint.voiceFired > 0);
    await page.evaluate(unit => window.__ra2debug.actionsApi.orderUnits([unit.id], 0, ...unit.to), report.initial.unit);
    await stepWorld(page, 150);
    report.movement = await page.evaluate(id => { const g = window.__ra2debug.game, unit = g.getObjectById(id);
        return { tick: g.currentTick, owner: unit.owner.name, to: [unit.tile.rx, unit.tile.ry],
            selected: g.campaign.machine.states.get('087D3A80').fired, journal: g.campaign.journal.commands }; }, report.initial.unit.id);
    assert.equal(report.movement.owner, 'Other3 House'); assert.notDeepEqual(report.movement.to, report.initial.unit.from);
    await page.waitForFunction(() => document.querySelector('[data-campaign-media=s05_p01e] video')?.currentTime > .3
        && document.querySelector('[data-campaign-movie-subtitle=s05_p01e]')?.textContent.trim(), undefined, { timeout: 30000 });
    report.firstMovie = await page.evaluate(() => { const d = window.__ra2debug, video = document.querySelector('[data-campaign-media=s05_p01e] video');
        return { size: [video.videoWidth, video.videoHeight], text: document.querySelector('[data-campaign-movie-subtitle=s05_p01e]').textContent,
            music: d.music.getPlaybackState(), source: d.game.campaign.trace.filter(action => action.key === '0B00823C') }; });
    assert(report.firstMovie.source.some(action => action.opcode === 100));
    await page.locator('[data-campaign-media=s05_p01e] button').click();
    await page.waitForFunction(() => !document.querySelector('[data-campaign-media=s05_p01e]'));
    await page.evaluate(() => { const d = window.__ra2debug, ivan = d.game.localPlayer.getOwnedObjects().find(unit => unit.name === 'IVAN');
        d.worldInteraction.unitSelectionHandler.selectSingleUnit(ivan); });
    await stepWorld(page, 1);
    await page.waitForFunction(() => document.querySelector('[data-campaign-media=s10_p01e] video')?.currentTime > .3
        && document.querySelector('[data-campaign-movie-subtitle=s10_p01e]')?.textContent.trim(), undefined, { timeout: 30000 });
    report.ivanMovie = await page.evaluate(() => { const d = window.__ra2debug;
        return { text: document.querySelector('[data-campaign-movie-subtitle=s10_p01e]').textContent,
            fired: d.game.campaign.machine.states.get('08DFF090').fired, media: d.game.campaign.captureMedia() }; });
    assert(report.ivanMovie.fired > 0);
    await page.screenshot({ path: path.join(out, 'native-original-soviet05-ivan-hint.png') });
    ({ app, page, labels } = await namedSaveRestart({ app, page, labels }, out, report, 'Original Soviet 05 controlled troops and radar communications'));
    report.restoredControl = await page.evaluate(id => { const g = window.__ra2debug.game, unit = g.getObjectById(id);
        return { owner: unit.owner.name, controller: unit.owner.campaignController.name, failure: g.campaign.failure,
            source: g.campaign.launch, pendingMedia: g.campaign.captureMedia() }; }, report.initial.unit.id);
    assert.equal(report.restoredControl.owner, 'Other3 House'); assert.equal(report.restoredControl.controller, 'Player House');
    assert(!report.restoredControl.failure);
    await page.screenshot({ path: path.join(out, 'native-original-soviet05-restored-control.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_SOVIET05_CONTROL_HINT_MOVIES_AND_RESTART_NOT_FULL_OBJECTIVE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
