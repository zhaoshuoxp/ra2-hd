import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], cases: [],
    scope: 'Original Allied07 Normal/Hard difficulty-specific naval attacks through actual source first damage and radar89, with zero player commands. Easy has a separate complete original goal. This is not a Normal/Hard full victory claim.' };
let app, page;
try {
    for (const difficulty of ['normal', 'hard']) {
        const folder = path.join(out, difficulty); await fs.mkdir(folder);
        ({ app, page } = await campaignSession(folder, report, { density: 0 }));
        const slider = page.locator('[data-campaign-difficulty]'); await slider.focus();
        if (difficulty === 'hard') await slider.press('End');
        else { await slider.press('Home'); await slider.press('ArrowRight'); }
        await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('all07t.map'));
        await waitWorld(page, 'all07t.map'); await stepWorld(page, 2300);
        const state = await page.evaluate(() => {
            const g = window.__ra2debug.game, c = g.campaign;
            return { launch: c.launch, tick: g.currentTick, hash: g.getHash(), result: c.result, failure: c.failure,
                commands: c.journal.commands.length, trace: c.trace,
                states: Object.fromEntries(['07C3C06C', '0CEA003C', '04178E9C', '07BE3CCC', '041788DC', '0417812C']
                    .map(id => [id, c.machine.states.get(id)])),
                enemyHandicap: c.houses.get('BadGuy1 House').handicap,
                dred: c.houses.get('BadGuy1 House').getOwnedObjects().filter(o => o.name === 'DRED' && !o.isDestroyed)
                    .map(o => ({ id: o.id, tile: [o.tile.rx, o.tile.ry], tasks: o.unitOrderTrait.tasks.length })) };
        });
        report.cases.push(state);
        assert.equal(state.launch.difficulty, difficulty); assert.equal(state.launch.semanticsVersion, 21);
        assert.equal(state.launch.sourceSha256, '3925c1211d86938a7137ff0df11cba85c59d3ae75742221d5e2d4d502d33c103');
        assert(!state.result && !state.failure); assert.equal(state.commands, 0); assert(state.dred.length >= 6);
        const expected = difficulty === 'normal' ? ['0CEA003C', '041788DC', 1170] : ['04178E9C', '0417812C', 870];
        for (const key of expected.slice(0, 2)) assert(state.trace.some(action => action.key === key
            && action.tick === expected[2] && action.opcode === 7));
        for (const key of ['07C3C06C', '0CEA003C', '04178E9C', '07BE3CCC', '041788DC', '0417812C']) {
            if (!expected.includes(key)) assert.equal(state.states[key].fired, 0);
        }
        assert(state.trace.some(action => action.key === '0AAC521C' && action.opcode === 100));
        assert.equal(state.enemyHandicap.teamDelay, difficulty === 'normal' ? 1000 : 1500);
        await page.screenshot({ path: path.join(folder, 'native-original-difficulty-fleet-stage.png') });
        await app.close(); app = undefined;
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_NORMAL_HARD_NAVAL_STAGES_AND_SOURCE_TARGET_ATTACKS';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
