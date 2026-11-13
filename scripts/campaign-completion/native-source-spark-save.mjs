import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession } from '../m3-2/native-session.mjs';
import { replaySourcePrefix } from './replay-source.mjs';
import { namedSaveRestart } from './named-save-restart.mjs';

const [outArg, sourceArg, prefix] = process.argv.slice(2), out = path.resolve(outArg);
await fs.mkdir(out, { recursive: false });
const source = JSON.parse(await fs.readFile(path.join(sourceArg, 'report.json')));
source.appliedCommands = JSON.parse(await fs.readFile(path.join(sourceArg, 'applied-command-journal.json')));
source.difficulty = source.identity.launch.difficulty;
const report = { status: 'RUNNING', errors: [], failedResources: [],
    scope: 'Actual original action88 IFV sparks, reconstructed from original creation seeds and ordinary commands. A real named Save UI and full application restart must retain exact world/RNG/mission and actual rendered source-colored points. No fabricated event, altered source/rule, hidden initial save or post-creation RNG edit. Original illumination and exact pristine-retail particle physics remain separate reconstruction limits.' };
let app, page, labels;
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 0 }));
    report.prefix = await replaySourcePrefix(page, source, prefix);
    report.before = await page.evaluate(() => { const g = window.__ra2debug.game;
        return { tick: g.currentTick, hash: g.getHash(), particles: g.campaign.particles.snapshot(),
            actions: g.campaign.trace.filter(action => action.opcode === 88) };
    });
    assert.equal(report.before.particles.systems[0].name, 'LGSparkSys');
    assert.equal(report.before.particles.systems[0].particle, 'LargeSpark');
    assert(report.before.particles.systems[0].sparks.length > 0 && report.before.actions.length > 0);
    ({ app, page, labels } = await namedSaveRestart({ app, page, labels }, out, report, 'Original active IFV spark system'));
    assert(report.restoredSparkSystems.actual[0].points.length > 0);
    report.after = await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick,
        hidden: document.hidden, particles: window.__ra2debug.game.campaign.particles.snapshot(),
        effects: window.__ra2debug.renderableManager.worldScene.getChildren()
            .filter(fx => fx.get3DObject?.()?.name === 'fx_campaign_sparks')
            .map(fx => ({ active: fx.state.active, count: fx.state.sparks.length, source: fx.get3DObject().userData })),
        sourceFirings: window.__ra2debug.game.campaign.machine.states.get('0AF78D3C').fired }));
    await page.waitForFunction(() => window.__restoredCampaignSparkObservers.every(({ fx, materials, disposed }) =>
        !fx.state.active && !fx.get3DObject() && disposed.size === materials.length
        && !window.__ra2debug.renderableManager.worldScene.getChildren().includes(fx)));
    report.after.releasedOriginalInstances = await page.evaluate(() => window.__restoredCampaignSparkObservers
        .map(({ fx, materials, disposed }) => ({ active: fx.state.active, groupCleared: !fx.get3DObject(),
            materialCount: materials.length, disposedMaterials: disposed.size })));
    const oldIds = new Set(report.before.particles.systems.map(system => system.id));
    assert(report.after.particles.systems.every(system => !oldIds.has(system.id)));
    assert(report.after.sourceFirings > 1, 'The unchanged original trigger continues to create new bursts');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_ACTIVE_SPARK_NAMED_RESTART_RENDERED_POINTS_AND_RELEASE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
