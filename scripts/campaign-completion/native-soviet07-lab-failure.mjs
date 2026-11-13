import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], samples: [],
    scope: 'Intentional original Soviet 07 lab-destroyed failure. Initial player infantry use normal serialized friendly force-attacks against the real protected lab. No resign, assigned result, source/rule/trigger/health/ownership or RNG edit. The unsellable lab and linked spied/captured/destroyed triggers remain intact. This is a failure branch, not a victory.' };
let app, page;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
try {
    ({ app, page } = await campaignSession(out, report, { density: 0 }));
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('sov07s.map'));
    await waitWorld(page, 'sov07s.map');
    report.initial = await page.evaluate(() => { const d = window.__ra2debug, g = d.game;
        const lab = g.localPlayer.getOwnedObjects().find(unit => unit.name === 'NATECH');
        const infantry = g.localPlayer.getOwnedObjects().filter(unit => unit.name === 'E2');
        d.actionsApi.orderUnits(infantry.map(unit => unit.id), 3, lab.id);
        return { launch: g.campaign.launch, target: lab.id, unsellable: lab.rules.unsellable, infantry: infantry.map(unit => unit.id) };
    });
    assert(report.initial.unsellable);
    let state;
    for (let i = 0; i < 80; i++) {
        await stepWorld(page, 120);
        state = await page.evaluate(() => { const g = window.__ra2debug.game, c = g.campaign;
            return { tick: g.currentTick, hash: g.getHash(), result: c.result, failure: c.failure,
                lab: g.localPlayer.getOwnedObjects().find(unit => unit.name === 'NATECH')?.healthTrait.health,
                buildings: g.localPlayer.buildings.size,
                branches: ['096C4DF0', '096C55C0', '0A7F6220'].map(id => ({ id, fired: c.machine.states.get(id).fired })),
                defeat: c.trace.filter(action => action.opcode === 2) };
        });
        report.samples.push(state); await save(); if (state.result) break;
    }
    assert(!state.failure); assert.equal(state.result, 'defeat'); assert.equal(state.lab, undefined); assert(state.buildings > 0);
    assert(state.branches.find(branch => branch.id === '0A7F6220').fired > 0);
    assert(state.branches.filter(branch => branch.id !== '0A7F6220').every(branch => branch.fired === 0));
    assert(state.defeat.some(action => action.key === '0A7F6220')); report.final = state;
    await fs.writeFile(path.join(out, 'applied-command-journal.json'), JSON.stringify(await page.evaluate(() => window.__ra2debug.game.campaign.journal.commands)));
    await page.evaluate(() => { const m = window.__ra2debug.gameScreen.gameTurnMgr; m.setCampaignPaused(false); m.doGameTurn(performance.now()); });
    await page.waitForSelector('[data-campaign-result=defeat][data-score-phase=complete]', { timeout: 120000 });
    await page.screenshot({ path: path.join(out, 'native-original-soviet07-lab-destroyed-failure.png') });
    report.score = await page.locator('body').innerText();
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_SOVIET07_LAB_DESTROYED_FAILURE_AND_COMPLETE_SCORE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
