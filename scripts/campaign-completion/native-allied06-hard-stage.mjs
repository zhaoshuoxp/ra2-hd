import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [],
    scope: 'Original Allied06 Hard ten-minute northern production stage with no player commands. The source Easy thirty-minute and Normal fifteen-minute stages have separate actual-goal/failure traces. This is a difficulty-stage check, not a Hard victory.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 0 }));
    const slider = page.locator('[data-campaign-difficulty]'); await slider.focus(); await slider.press('End');
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('all06u.map'));
    await waitWorld(page, 'all06u.map'); await stepWorld(page, 9200);
    report.stage = await page.evaluate(() => {
        const g = window.__ra2debug.game, c = g.campaign;
        return { launch: c.launch, tick: g.currentTick, hash: g.getHash(), result: c.result, failure: c.failure,
            commands: c.journal.commands.length, trace: c.trace,
            states: Object.fromEntries(['0999341C', '081C703C', '081DB55C', '07B8270C', '0B4F886C', '07B83CFC', '0B4FB28C']
                .map(id => [id, c.machine.states.get(id)])),
            ai: c.teams.sourceAi?.snapshot(), teams: [...c.teams.instances.values()].map(t =>
                ({ type: t.type, phase: t.phase, owner: t.owner.name, members: t.members.filter(u => !u.isDestroyed).length })) };
    });
    const s = report.stage;
    assert.equal(s.launch.difficulty, 'hard'); assert.equal(s.launch.semanticsVersion, 20);
    assert.equal(s.launch.sourceSha256, '9e02b8fa4c570000c2bb34c9b0e702b143e2e93ae529faa36556e1f43af0f922');
    assert(!s.result && !s.failure); assert.equal(s.commands, 0);
    assert(s.trace.some(a => a.key === '0999341C' && a.tick === 9000 && a.opcode === 3));
    assert(s.trace.some(a => a.key === '0999341C' && a.tick === 9000 && a.opcode === 4));
    for (const id of ['081C703C', '081DB55C', '0B4F886C', '0B4FB28C']) assert.equal(s.states[id].fired, 0);
    for (const id of ['0999341C', '07B8270C', '07B83CFC']) assert(s.states[id].fired > 0);
    await page.screenshot({ path: path.join(out, 'native-original-hard-northern-production.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_HARD_TEN_MINUTE_PRODUCTION_AND_DIFFICULTY_SPECIFIC_WAVES';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
