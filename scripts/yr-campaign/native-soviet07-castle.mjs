import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';
import { orderGroundColumn } from './ordinary-column.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov07tmd.map');
let failure;
try {
    let state = await pilot.open();
    const commands = pilot.commands;
    assert(await pilot.page.evaluate(() => ['5', '6'].every(flag => window.__ra2debug.game.campaign.machine.variables.get(flag))),
        'Resume the original liberation of both factions');
    const resumeColumn = process.argv.includes('--resume-column');
    if (!resumeColumn) {
        const count = state.own.filter(unit => unit.name === 'SREF' && unit.spawned).length;
        if (count < 12) await commands.queue('SREF', 12 - count);
        await commands.order(['GAWEAP'], 0, undefined, [52, 118]);
        for (let i = 0; i < 300; i++) {
            await commands.step(90); state = await pilot.observe('ordinary-captured-allied-prism-production-' + i);
            if (state.own.filter(unit => unit.name === 'SREF' && unit.spawned).length >= 12) break;
        }
        assert(state.own.filter(unit => unit.name === 'SREF' && unit.spawned).length >= 12,
            'Ordinary captured-Allied prism production has not completed');
        await pilot.checkpoint('ordinary-captured-prism-column-checkpoint.json');
        for (const goal of [[60, 118], [80, 122], [100, 112], [115, 95], [115, 75], [106, 58]]) {
            await commands.order(['SREF'], 0, undefined, goal);
            for (let i = 0; i < 150; i++) {
                await commands.step(60, { defend: false });
                if (i % 5 === 0) state = await pilot.observe('ordinary-prism-column-transfer-' + goal.join('-') + '-' + i);
                const guns = state.own.filter(unit => unit.name === 'SREF' && unit.spawned);
                assert(guns.length >= 8, 'The ordinary captured-Allied transfer lost its artillery');
                if (guns.every(unit => Math.hypot(unit.tile[0] - goal[0], unit.tile[1] - goal[1]) < 6)) break;
            }
            await pilot.checkpoint('last-prism-transfer-checkpoint.json');
        }
    }
    const front = state.own.filter(unit => ['TTNK', 'HTNK'].includes(unit.name) && unit.spawned
        && unit.tile[0] < 125 && unit.tile[1] < 100).map(unit => unit.id);
    const escort = state.own.filter(unit => unit.name === 'HTK' && unit.spawned
        && unit.tile[0] < 125 && unit.tile[1] < 100).map(unit => unit.id);
    assert(front.length >= 4, 'Original liberated Soviet armor is absent');
    pilot.report.combinedColumn = { front, escort, artillery: 'SREF' };
    await commands.order([...front, ...escort, 'SREF'], 0, undefined, [117, 68]);
    for (let i = 0; i < 80; i++) {
        await commands.step(60, { defend: false });
        if (i % 5 === 0) state = await pilot.observe('ordinary-combined-front-regroup-' + i);
        const units = state.own.filter(unit => front.includes(unit.id) || unit.name === 'SREF');
        if (units.every(unit => Math.hypot(unit.tile[0] - 117, unit.tile[1] - 68) < 8)) break;
    }
    await pilot.checkpoint('original-combined-ground-regroup-checkpoint.json');
    for (const goal of [[100, 61], [91, 64], [85, 70], [75, 73], [68, 69]]) {
        for (let i = 0; i < 240 && !state.result; i++) {
            const plan = await orderGroundColumn(commands, goal, { tanks: front, artillery: ['SREF'], escort });
            assert(plan, 'The ordinary combined ground column was lost');
            await commands.step(45, { defend: false });
            if (i % 5 === 0) state = await pilot.observe('original-combined-castle-assault-' + goal.join('-') + '-' + i);
            if (plan.distance < 5) break;
        }
        if (state.result) break;
        await pilot.checkpoint('last-castle-column-checkpoint.json');
    }
    let assigned;
    for (let i = 0; i < 220 && !state.result; i++) {
        const castle = await pilot.page.evaluate(() => {
            const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            const target = g.world.getAllObjects().find(unit => unit.name === 'CATRAN03' && !unit.isDestroyed);
            return target && { id: target.id, visible: g.map.tileOccupation.calculateTilesForGameObject(target.tile, target)
                .some(tile => !shroud.isShrouded(tile, target.tileElevation)) };
        });
        if (castle?.visible && assigned !== castle.id) {
            await commands.order(['SREF'], 2, castle.id); assigned = castle.id;
        } else if (castle && assigned === undefined && i % 15 === 0) await commands.order(['SREF'], 0, undefined, [70, 73]);
        await commands.step(45, { defend: false });
        if (i % 5 === 0) state = await pilot.observe('original-yuri-castle-and-result-' + i);
    }
    state = await pilot.observe('original-soviet-campaign-final-result'); assert.equal(state.result, 'victory');
    pilot.report.status = `PASS_NATIVE_ORIGINAL_${pilot.report.launch.difficulty.toUpperCase()}_SOVIET07_BOTH_LIBERATED_FACTIONS_COMBINED_ASSAULT_CASTLE_AND_SOURCE_VICTORY`;
} catch (error) { failure = error; }
await pilot.finish(failure);
