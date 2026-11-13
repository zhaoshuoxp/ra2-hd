import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, pauseWorld, stepWorld } from '../m3-2/native-session.mjs';
import { replaySourcePrefix } from './replay-source.mjs';

const out = path.resolve(process.argv[2]), branch = process.argv[3], fixture = JSON.parse(await fs.readFile(path.resolve(process.argv[4])));
assert(['lab', 'beacon'].includes(branch)); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', branch, errors: [], failedResources: [], commands: [],
    scope: 'Original Soviet 03 failure branch, using ordinary force-attack orders against the protected objective. Source rules, triggers, health and objectives remain intact; prefix reconstruction or checkpoint loading is explicit validation setup.' };
let app, page;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
try {
    ({ app, page } = await campaignSession(out, report, { density: 2 }));
    if (branch === 'lab') report.replay = await replaySourcePrefix(page, fixture, 'engineers-delivered');
    else {
        await page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(checkpoint, 'sov03u.map'), fixture);
        await page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
            && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), fixture.tick, { timeout: 180000 });
        await pauseWorld(page); await page.evaluate(() => window.__ra2debug.gameScreen.menu.close());
        report.checkpoint = { tick: fixture.tick, worldHash: fixture.expected.worldHash, checksum: fixture.checksum };
    }
    const target = await page.evaluate(name => {
        const d = window.__ra2debug, g = d.game, object = g.world.getAllObjects().find(unit => unit.name === name && unit.isSpawned && !unit.isDestroyed);
        if (!object) throw Error('Original protected objective is absent: ' + name);
        d.worldInteraction.minimapHandler.panToTile(object.tile);
        return { id: object.id, name, owner: object.owner.name, health: object.healthTrait.health, tile: [object.tile.rx, object.tile.ry] };
    }, branch === 'lab' ? 'GATECH' : 'NAPSYB');
    report.target = target;
    for (let i = 0; i < 70; i++) {
        const order = await page.evaluate(id => {
            const d = window.__ra2debug, g = d.game;
            const ids = g.localPlayer.getOwnedObjects().filter(unit => unit.isSpawned && !unit.isDestroyed
                && ['HTNK', 'MTNK', 'V3', 'E2', 'FV', 'HTK'].includes(unit.name)).map(unit => unit.id);
            d.actionsApi.orderUnits(ids, 3, id); return { tick: g.currentTick, ids, order: 3, target: id };
        }, target.id);
        report.commands.push(order);
        const state = await stepWorld(page, 90); if (state.result) break;
    }
    report.final = await page.evaluate(() => { const g = window.__ra2debug.game, c = g.campaign;
        return { tick: g.currentTick, result: c.result, failure: c.failure,
            fired: [...c.machine.states].filter(([, state]) => state.fired).map(([id]) => id),
            defeatActions: c.trace.filter(action => action.opcode === 2), commands: c.journal.commands,
            sourceSha256: c.launch.sourceSha256, difficulty: c.launch.difficulty }; });
    assert.equal(report.final.result, 'defeat'); assert(!report.final.failure);
    assert(report.final.fired.includes(branch === 'lab' ? '0A1E37BC' : '07C6E684'));
    assert(report.final.defeatActions.length);
    await page.evaluate(() => { const manager = window.__ra2debug.gameScreen.gameTurnMgr;
        manager.setCampaignPaused(false); manager.doGameTurn(performance.now()); });
    await page.waitForSelector('[data-campaign-result=defeat]', { timeout: 45000 });
    await page.screenshot({ path: path.join(out, 'native-original-objective-failure.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_ORIGINAL_PROTECTED_OBJECTIVE_DEFEAT';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
