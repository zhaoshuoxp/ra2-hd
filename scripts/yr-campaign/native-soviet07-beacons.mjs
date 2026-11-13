import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov07tmd.map');
let failure;
try {
    let state = await pilot.open();
    const commands = pilot.commands; commands.groundDefenders = ['TTNK', 'HTNK', 'SHK', 'DRON'];
    commands.airDefenders = ['HTK', 'FLAKT'];
    const playable = async proposed => {
        const chosen = await pilot.page.evaluate(proposed => {
            const g = window.__ra2debug.game;
            const tile = g.map.tiles.getAll().filter(tile => g.map.mapBounds.isWithinPlayerBounds(tile)
                && Math.hypot(tile.rx - proposed[0], tile.ry - proposed[1]) <= 12)
                .sort((a, b) => Math.hypot(a.rx - proposed[0], a.ry - proposed[1])
                    - Math.hypot(b.rx - proposed[0], b.ry - proposed[1]))[0];
            if (!tile) throw Error('Source-guided approach has no nearby playable destination');
            return [tile.rx, tile.ry];
        }, proposed);
        if (chosen.join() !== proposed.join()) (pilot.report.playableApproachCells ??= []).push({ proposed, chosen });
        return chosen;
    };
    if (!state.own.some(unit => unit.name === 'NANRCT')) {
        await commands.build('NANRCT', [153, 151]); state = await pilot.observe('ordinary-transylvania-reactor');
    }
    const desired = await pilot.page.evaluate(() => window.__ra2debug.game.campaign.machine.variables.get('5')) ? 10 : 4;
    const ready = state.own.filter(unit => unit.name === 'ZEP' && unit.spawned).length;
    if (ready < desired) await commands.queue('ZEP', desired - ready);
    for (let i = 0; i < 600; i++) {
        await commands.step(120); state = await pilot.observe('ordinary-beacon-assault-production-' + i);
        if (state.own.filter(unit => unit.name === 'ZEP' && unit.spawned).length >= desired) break;
    }
    assert(state.own.filter(unit => unit.name === 'ZEP' && unit.spawned).length >= desired, 'Ordinary paid beacon assault production failed');
    await pilot.checkpoint('ordinary-beacon-air-force-checkpoint.json');
    const phases = [
        { flag: '5', name: 'soviet', beacon: [95, 42], route: [[160, 110], [150, 75], [130, 45], [110, 30], [95, 34]] },
        { flag: '6', name: 'allied', beacon: [27, 100], route: [[105, 50], [85, 52], [70, 57], [55, 70], [40, 85], [27, 94]] },
    ];
    for (const phase of phases) {
        if (await pilot.page.evaluate(flag => window.__ra2debug.game.campaign.machine.variables.get(flag), phase.flag)) continue;
        for (const proposed of phase.route) {
            const goal = await playable(proposed);
            await commands.order(['ZEP'], 0, undefined, goal);
            for (let i = 0; i < 145; i++) {
                await commands.step(60);
                if (i % 5 === 0) state = await pilot.observe('ordinary-' + phase.name + '-beacon-approach-' + goal.join('-') + '-' + i);
                const ships = state.own.filter(unit => unit.name === 'ZEP' && unit.spawned);
                assert(ships.length, 'The ordinary beacon approach was lost: ' + phase.name);
                if (ships.every(unit => Math.hypot(unit.tile[0] - goal[0], unit.tile[1] - goal[1]) < 5)) break;
            }
            await pilot.checkpoint('last-beacon-approach-checkpoint.json');
        }
        let assigned, liberated;
        for (let i = 0; i < 200; i++) {
            const plan = await pilot.page.evaluate(phase => {
                const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
                const target = g.world.getAllObjects().find(unit => unit.name === 'NAPSYB' && !unit.isDestroyed
                    && unit.tile.rx === phase.beacon[0] && unit.tile.ry === phase.beacon[1]);
                return { liberated: !!g.campaign.machine.variables.get(phase.flag), target: target?.id,
                    visible: target && g.map.tileOccupation.calculateTilesForGameObject(target.tile, target)
                        .some(tile => !shroud.isShrouded(tile, target.tileElevation)) };
            }, phase);
            if (plan.liberated) { liberated = true; break; }
            if (plan.visible && assigned !== plan.target) {
                await commands.order(['ZEP'], 2, plan.target); assigned = plan.target;
            } else if (assigned === undefined && i % 20 === 0) await commands.order(['ZEP'], 0, undefined, phase.beacon);
            await commands.step(45);
            if (i % 5 === 0) state = await pilot.observe('original-' + phase.name + '-beacon-destruction-' + i);
            assert(state.own.some(unit => unit.name === 'ZEP'), 'The ordinary beacon attack was lost: ' + phase.name);
        }
        assert(liberated, 'Original faction liberation flag did not complete: ' + phase.name);
        state = await pilot.observe('original-' + phase.name + '-faction-ownership-transfer');
        assert(state.own.some(unit => unit.name === (phase.name === 'soviet' ? 'NACNST' : 'GACNST')));
        await pilot.checkpoint('original-' + phase.name + '-liberation-checkpoint.json');
    }
    await pilot.restart('Original YR Soviet07 both liberated factions and transferred bases');
    await pilot.checkpoint('original-both-factions-liberated-checkpoint.json');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_SOVIET07_BOTH_BEACONS_FACTION_TRANSFERS_AND_EXACT_RESTART_CASTLE_PENDING';
} catch (error) { failure = error; }
await pilot.finish(failure);
