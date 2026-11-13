import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';
import { advanceSupportedPrisms } from './supported-prism-column.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all05umd.map');
async function run() {
    let state = await pilot.open();
    let commands = pilot.commands;
    commands.groundDefenders = ['MTNK', 'GGI', 'E1', 'SREF'];
    commands.airDefenders = ['GGI', 'FV']; commands.groundPriority = ['YURI', 'MIND', 'VIRUS'];
    const resumedArmy = state.own.filter(unit => unit.name === 'SREF').length >= 12;
    if (!resumedArmy) {
        const developedBase = state.own.some(unit => unit.name === 'GATECH');
        if (!developedBase) {
        await commands.order(['GGI'], 9);
        await commands.queue('DEST', 4);
        await commands.attackVisible(['DEST', 'DLPH'], undefined, 'any');
        for (const [name, tile] of [['GAWEAP', [53, 85]], ['AMRADR', [49, 103]],
            ['GAPOWR', [45, 100]], ['ATESLA', [55, 83]], ['ATESLA', [56, 96]],
            ['GATECH', [45, 104]], ['GASPYSAT', [46, 108]], ['GAPOWR', [45, 110]]]) {
            await commands.build(name, tile); state = await pilot.observe('ordinary-sydney-base-' + name);
            await commands.attackVisible(['DEST', 'DLPH'], undefined, 'any');
            await pilot.checkpoint('last-sydney-base-checkpoint.json');
        }
        }
        if (process.argv.includes('--base-only')) {
            await pilot.restart('Original YR Allied05 paid Sydney base, naval defense and intact source forces');
            pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED05_PAID_BASE_NAVAL_DEFENSE_AND_EXACT_RESTART_GOALS_PENDING';
            return;
        }
        for (const [name, desired] of [['CMIN', 3], ['FV', 3], ['SREF', 26], ['JUMPJET', 12]]) {
            const count = desired - state.own.filter(unit => unit.name === name).length;
            if (count > 0) await commands.queue(name, count);
        }
        await commands.order(['CARRIER'], 0, undefined, [60, 65]);
        await commands.order(['GAWEAP'], 0, undefined, [56, 94]);
        await commands.order(['GAPILE'], 0, undefined, [56, 94]);
        for (let i = 0; i < 800; i++) {
            await commands.attackVisible(['DEST', 'DLPH'], undefined, 'any');
            await commands.step(90);
            if (i % 10 === 0) state = await pilot.observe('ordinary-sydney-paid-prism-air-and-naval-production-' + i);
            assert(state.own.some(unit => unit.name === 'GACNST'));
            if (!state.queues.some(queue => queue.items.some(item => ['SREF', 'JUMPJET', 'FV'].includes(item.name)))
            && state.own.filter(unit => unit.name === 'SREF').length >= 20
                && state.own.filter(unit => unit.name === 'JUMPJET').length >= 8) break;
        }
    }
    const army = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game, own = g.localPlayer.getOwnedObjects().filter(unit => unit.isSpawned && !unit.isDestroyed);
        const prisms = own.filter(unit => unit.name === 'SREF').sort((a, b) => a.id - b.id);
        return { prisms: prisms.slice(4).map(unit => unit.id), defense: prisms.slice(0, 4).map(unit => unit.id),
            air: own.filter(unit => unit.name === 'JUMPJET').map(unit => unit.id) };
    });
    assert(army.prisms.length >= 8 && army.air.length >= 8); pilot.report.army = army;
    if (!resumedArmy) await pilot.restart('Original YR Allied05 paid army, mining, naval defense and intact Sydney base');
    commands = pilot.commands;
    await pilot.checkpoint('original-sydney-supported-army-checkpoint.json');
    for (let stage = 0; stage < 120 && !state.result; stage++) {
        const goal = await pilot.page.evaluate(ids => {
            const g = window.__ra2debug.game;
            const own = g.localPlayer.getOwnedObjects().filter(unit => ids.includes(unit.id) && unit.isSpawned && !unit.isDestroyed);
            if (!own.length) throw Error('The ordinary Sydney prism column was lost');
            const center = own.reduce((sum, unit) => [sum[0] + unit.tile.rx / own.length, sum[1] + unit.tile.ry / own.length], [0, 0]);
            const buildings = ['BadGuy1 House', 'BadGuy2 House'].flatMap(name => g.campaign.resolveHouse(name).getOwnedObjects())
                .filter(unit => unit.isBuilding() && !unit.isDestroyed && !unit.rules.insignificant);
            const clones = buildings.filter(unit => unit.name === 'NACLON');
            const target = (clones.length ? clones : buildings).sort((a, b) => Math.hypot(a.tile.rx - center[0], a.tile.ry - center[1])
                - Math.hypot(b.tile.rx - center[0], b.tile.ry - center[1]))[0];
            return target && { id: target.id, name: target.name, tile: [target.tile.rx, target.tile.ry] };
        }, army.prisms);
        if (!goal) break;
        await advanceSupportedPrisms(pilot, goal, army, 'ordinary-sydney-source-objective-' + stage + '-' + goal.name);
        state = await pilot.observe('original-sydney-objective-cleared-' + stage + '-' + goal.name);
        if (!state.result) await pilot.checkpoint('last-sydney-objective-progress-checkpoint.json');
    }
    for (let i = 0; i < 80 && !state.result; i++) {
        await commands.step(60, { defend: false }); state = await pilot.observe('original-sydney-result-delay-' + i);
    }
    assert.equal(state.result, 'victory');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED05_NAVAL_DEFENSE_THREE_CLONING_VATS_BOTH_BASE_HOUSES_AND_SOURCE_VICTORY';
}
let failure;
try { await run(); }
catch (error) { failure = error; }
await pilot.finish(failure);
