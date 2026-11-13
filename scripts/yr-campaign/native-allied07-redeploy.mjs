import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all07smd.map');
let failure;
try {
    await pilot.open();
    for (const name of ['NACNST', 'NAPOWR']) {
        const repair = await pilot.page.evaluate(name => {
            const g = window.__ra2debug.game, building = g.world.getAllObjects().find(u => u.name === name && !u.isDestroyed);
            const engineer = g.localPlayer.getOwnedObjects().filter(u => u.name === 'ENGINEER' && u.isSpawned)
                .sort((a, b) => Math.hypot(a.tile.rx - building.tile.rx, a.tile.ry - building.tile.ry)
                    - Math.hypot(b.tile.rx - building.tile.rx, b.tile.ry - building.tile.ry))[0];
            return { id: building.id, engineer: engineer?.id, health: building.healthTrait.health };
        }, name);
        if (repair.health < 100) {
            assert(repair.engineer !== undefined);
            await pilot.commands.order([repair.engineer], 15, repair.id);
            await pilot.commands.step(600, { defend: false });
        }
    }
    const yard = await pilot.page.evaluate(() => window.__ra2debug.game.localPlayer.getOwnedObjects()
        .find(u => u.name === 'NACNST' && u.isSpawned && !u.isDestroyed)?.id);
    assert(yard !== undefined);
    // A normal move order on a construction yard invokes its undeploy action.
    const destination = await pilot.page.evaluate(id => {
        const g = window.__ra2debug.game, u = g.world.getObjectById(id);
        return [u.tile.rx + 2, u.tile.ry + 3];
    }, yard);
    await pilot.page.evaluate(({ yard, destination }) => window.__ra2debug.actionsApi.orderUnits([yard], 0, ...destination), { yard, destination });
    await pilot.commands.step(180, { defend: false });
    let state = await pilot.observe('original-soviet-yard-packed-mcv');
    assert(!state.result, 'Packing the original Soviet yard must not lose the mission');
    const mcv = state.own.find(u => u.name === 'SMCV' && u.spawned);
    assert(mcv);
    await pilot.commands.order([mcv.id], 11);
    await pilot.commands.order([mcv.id], 9);
    await pilot.commands.step(180, { defend: false });
    state = await pilot.observe('original-soviet-mcv-redeployed-yard');
    assert(!state.result);
    assert(state.own.some(u => u.name === 'NACNST'));
    await pilot.restart('Original critical Soviet yard survives ordinary pack and redeploy');
    pilot.report.status = 'PASS_ORIGINAL_ALLIED07_CRITICAL_YARD_PACK_MCV_REDEPLOY_AND_RESTART';
} catch (error) { failure = error; }
await pilot.finish(failure);
