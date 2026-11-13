import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov04dmd.map');
let failure;
try {
    let state = await pilot.open();
    const commands = pilot.commands;
    for (let i = 0; i < 60 && !state.own.some(unit => unit.name === 'NACNST'); i++) {
        await commands.step(90); state = await pilot.observe('original-source-yard-' + i);
    }
    await commands.order(['E2'], 0, undefined, [84, 130]); await commands.step(120);
    await commands.build('NAPOWR', [77, 143]);
    pilot.report.destinationOccupancy = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game, tile = g.map.tiles.getByMapCoords(78, 144);
        return { tick: g.currentTick, destination: [78, 144],
            buildings: g.map.getObjectsOnTile(tile).filter(unit => unit.isBuilding() && !unit.isDestroyed)
                .map(unit => ({ id: unit.id, name: unit.name, tile: [unit.tile.rx, unit.tile.ry] })) };
    });
    assert(pilot.report.destinationOccupancy.buildings.some(unit => unit.name === 'NAPOWR'),
        'The ordinary power plant must cover the source regroup destination');
    await commands.order(['E2'], 4, undefined, [97, 70]);
    commands.groundDefenders = ['HTNK'];
    for (let i = 0; i < 180; i++) {
        await commands.step(90); state = await pilot.observe('original-six-unit-loss-reinforcement-' + i);
        if (state.sourceTrace.some(row => row.section === 'Actions' && row.key === '09412AFC' && row.index === 0)) break;
    }
    const action = state.sourceTrace.find(row => row.section === 'Actions' && row.key === '09412AFC' && row.index === 0);
    assert(action, 'The original unit-loss reinforcement did not execute');
    assert(action.tick > pilot.report.destinationOccupancy.tick);
    await commands.step(180); state = await pilot.observe('original-blocked-regroup-continuation');
    pilot.report.reinforcement = { action, team: state.teams.find(team => team.type === '075D3C8C') };
    assert(state.own.some(unit => unit.name === 'APOC' && unit.spawned));
    pilot.report.status = 'PASS_NATIVE_YR35_SOURCE_REINFORCEMENT_AFTER_LEGAL_BUILDING_OCCUPIES_FIRST_DESTINATION';
} catch (error) { failure = error; }
await pilot.finish(failure);
