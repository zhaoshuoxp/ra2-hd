import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, stepWorld } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';
import { readFeedbackSource, replayFeedbackOpening, advanceFeedbackSource } from './feedback-source-replay-v53.mjs';
const out = path.resolve(process.argv[2]), difficulty = process.argv[3] ?? 'normal', legacy = process.argv.includes('--legacy');
await fs.mkdir(out, { recursive: false });
const source = await readFeedbackSource(path.join(import.meta.dirname, 'fixtures/all12-source-commands-v26.json'));
source.samples = [];
const report = {
    status: 'RUNNING', errors: [], failedResources: [], commands: [], difficulty, legacy, samples: [], scope: 'Identical retained original Allied12 creation seed, selected source difficulty and ordinary player opening commands. Hard resolves the actual landed SEAL IDs and the visible source reactor instead of applying an Easy recording to different actors. Observe source AI organization and the first attack departure hold; no source, handicap, troop or RNG edits.'
};
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 0 }));
    report.start = await replayFeedbackOpening(page, source, 0, { difficulty, ...(!legacy ? { openingGraceVersion: 1 } : {}) });
    if (difficulty === 'hard') {
        await advanceFeedbackSource(page, 360);
        report.hardOpening = await page.evaluate(() => { const g = window.__ra2debug.game; window.__feedbackSourceCommands.clear(); const target = g.world.getAllObjects().find(u => u.isBuilding() && u.centerTile.rx === 65 && u.centerTile.ry === 64); return { target: target && { id: target.id, name: target.name }, seals: g.localPlayer.getOwnedObjects().filter(u => u.name === 'GHOST').map(u => u.id) }; });
        assert(report.hardOpening.target);
        assert(report.hardOpening.seals.length);
        await new OrdinaryCampaignCommands(page, report).order(report.hardOpening.seals, 2, report.hardOpening.target.id);
        await stepWorld(page, 60);
    }
    await page.evaluate(() => { const g = window.__ra2debug.game; window.__apocSpawns = []; const spawn = g.spawnObject; g.spawnObject = function (u, t) { const result = spawn.call(this, u, t); if (u.name === 'APOC')
        window.__apocSpawns.push({ tick: g.currentTick, id: u.id, owner: u.owner.name, tile: [t.rx, t.ry] }); return result; }; });
    for (const tick of [900, 1800, 3000, 4500, 6000]) {
        const state = await advanceFeedbackSource(page, tick);
        report.samples.push({
            ...state, ...await page.evaluate(() => { const g = window.__ra2debug.game, c = g.campaign; return {
                aiTrace: c.teams.sourceAi.trace, aiState: c.teams.sourceAi.snapshot(), activation: c.trace.filter(t => t.opcode === 3 || t.opcode === 74), spawns: window.__apocSpawns, teams: [...c.teams.instances.values()].filter(t => t.aiTrigger).map(t => ({
                    id: t.id, type: t.type, phase: t.phase, line: t.line, started: t.started, openingAttackUntil: t.openingAttackUntil, members: t.members.map(u => ({ id: u.id, name: u.name, tile: [u.tile.rx, u.tile.ry] }))
                })), initialApocs: g.world.getAllObjects().filter(u => u.name === 'APOC' && u.id < 3000).map(u => ({ id: u.id, owner: u.owner.name, tile: [u.tile.rx, u.tile.ry], tasks: u.unitOrderTrait.getTasks().length }))
            }; })
        });
    }
    assert(report.samples.at(-1).aiTrace.length > 0);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_ORIGINAL_FINALE_DIFFICULTY_OPENING_OBSERVATION';
}
catch (error) {
    report.status = 'FAIL';
    report.error = error.stack;
    process.exitCode = 1;
}
finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
