import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';
import { namedSaveRestart } from './named-save-restart.mjs';
import { readFeedbackSource, replayFeedbackOpening } from './feedback-source-replay-v53.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';

const out = path.resolve(process.argv[2]), mode = process.argv[3] ?? 'base';
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', mode, errors: [], failedResources: [], commands: [],
    scope: 'Unchanged original mission, ordinary input, actual named save and complete application restart. Base mode saves during active MCV foundation clearance; AA mode saves completed normally paid Patriots. No reveal, source/rule/health/RNG/goal edits or hidden checkpoint start.' };
let app, page, labels;
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: mode === 'base' ? 2 : 4 }));
    if (mode === 'base') {
        await page.evaluate(() => {
            const screen = window.__ra2debug.mainMenuController.screens.get(22), root = screen.rootController, go = root.goToScreen;
            root.goToScreen = function(type, params) {
                root.goToScreen = go;
                return go.call(this, type, { ...params, gameId: 'campaign-all10-v55-3', timestamp: 1793815200000 });
            };
            return screen.launchPrepared('all10s.map');
        });
        await waitWorld(page, 'all10s.map'); await stepWorld(page, 3470);
        report.pending = await page.evaluate(() => {
            const g = window.__ra2debug.game;
            return { tick: g.currentTick, version: g.campaign.launch.baseActivationVersion,
                mcvs: g.world.getAllObjects().filter(u => u.name === 'SMCV' && u.isSpawned).map(u => ({
                    id: u.id, owner: u.owner.name, tile: [u.tile.rx, u.tile.ry], tasks: u.unitOrderTrait.getTasks().map(t => ({
                        status: t.status, morph: t.morphInto?.name, children: t.children.length,
                    })),
                })) };
        });
        assert.equal(report.pending.version, 3);
        assert(report.pending.mcvs.some(u => u.tasks.some(t => t.morph === 'NACNST')));
    } else {
        const source = await readFeedbackSource(path.join(import.meta.dirname, 'fixtures/all12-source-commands-v26.json'));
        source.samples = [];
        report.opening = await replayFeedbackOpening(page, source, 3366, { openingGraceVersion: 1,
            demolitionSafetyVersion: 1, retaliationVersion: 1, neutralStructureTargetingVersion: 1, civilianTargetingVersion: 2 });
        const commands = new OrdinaryCampaignCommands(page, report);
        await commands.build('GAPILE'); await commands.build('NASAM');
        report.aa = await page.evaluate(() => window.__ra2debug.game.localPlayer.getOwnedObjects()
            .find(u => u.name === 'NASAM' && u.isSpawned && !u.isDestroyed).id);
    }
    ({ app, page, labels } = await namedSaveRestart({ app, page, labels }, out, report,
        mode === 'base' ? 'V55 Active MCV Clearance' : 'V55 Completed Patriot', stepWorld, async context => {
            if (mode === 'base') assert.equal(await context.page.evaluate(() => window.__ra2debug.game.campaign.launch.baseActivationVersion), 3);
            else {
                await context.page.evaluate(id => {
                    const d = window.__ra2debug, u = d.game.world.getObjectById(id);
                    d.worldInteraction.minimapHandler.panToTile(u.tile);
                }, report.aa);
                await context.page.waitForTimeout(500);
                report.restoredAa = await context.page.evaluate(id => {
                    const d = window.__ra2debug, u = d.game.world.getObjectById(id), r = d.renderableManager.getRenderableByGameObject(u);
                    return { id, buildStatus: u.buildStatus, turretVisible: r.turret.visible, animation: r.currentAnimType,
                        hd: !!r.buildingTurretHd, paused: d.gameScreen.gameTurnMgr.isSimulationPaused() };
                }, report.aa);
                assert.equal(report.restoredAa.buildStatus, 1); assert(report.restoredAa.turretVisible);
                assert.equal(report.restoredAa.animation, 0); assert(report.restoredAa.paused);
                await context.page.screenshot({ path: path.join(out, 'actual-restored-paused-patriot.png') });
            }
        }));
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = mode === 'base' ? 'PASS_ACTIVE_ORIGINAL_MCV_CLEARANCE_FULL_RESTART_EXACT_CONTINUATION'
        : 'PASS_PAID_COMPLETED_PATRIOT_FULL_RESTART_VISIBLE_WHILE_PAUSED';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close().catch(() => {});
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
