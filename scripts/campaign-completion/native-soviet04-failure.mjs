import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], samples: [],
    scope: 'Fresh original Soviet 04, ordinary exploratory moves and no defensive assistance. Source enemies destroy the real human force; no resign, assigned result, health edit, trigger edit or objective substitution.' };
let app, page;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
try {
    ({ app, page } = await campaignSession(out, report, { density: 0 }));
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('sov04s.map'));
    await waitWorld(page, 'sov04s.map');
    report.initial = await page.evaluate(() => { const d = window.__ra2debug, g = d.game;
        const mcv = g.localPlayer.getOwnedObjects().find(unit => unit.name === 'SMCV');
        const submarine = g.localPlayer.getOwnedObjects().find(unit => unit.name === 'SUB');
        d.actionsApi.orderUnits([mcv.id], 0, 114, 52);
        d.actionsApi.orderUnits([submarine.id], 0, 131, 68);
        return { launch: g.campaign.launch, options: g.gameOpts, gameId: g.id, timestamp: g.startTimestamp,
            moves: [{ unit: mcv.id, to: [114, 52] }, { unit: submarine.id, to: [131, 68] }] }; });
    let state;
    for (let i = 0; i < 160; i++) {
        await stepWorld(page, 450);
        state = await page.evaluate(() => { const g = window.__ra2debug.game, c = g.campaign;
            return { tick: g.currentTick, hash: g.getHash(), result: c.result, failure: c.failure,
                owned: g.localPlayer.getOwnedObjects(true).filter(unit => !unit.isDestroyed).map(unit => ({ id: unit.id, name: unit.name,
                    health: unit.healthTrait.health, tile: [unit.tile.rx, unit.tile.ry], insignificant: unit.rules.insignificant })),
                sourceAiTrace: c.teams.sourceAi.trace.slice(-4), goalFired: c.machine.states.get('095078B0').fired,
                defeatActions: c.trace.filter(action => action.opcode === 2) }; });
        report.samples.push(state); await save();
        if (state.result) break;
    }
    assert.equal(state.result, 'defeat'); assert(!state.failure); assert(state.goalFired > 0 && state.defeatActions.length);
    const journal = await page.evaluate(() => window.__ra2debug.game.campaign.journal.commands);
    await fs.writeFile(path.join(out, 'applied-command-journal.json'), JSON.stringify(journal));
    await page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setCampaignPaused(false));
    await page.waitForSelector('[data-campaign-result=defeat][data-score-phase=complete]', { timeout: 120000 });
    report.score = await page.locator('body').innerText();
    await page.screenshot({ path: path.join(out, 'native-original-soviet04-defeat-score.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_SOVIET04_FAILURE_AND_SCORE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
