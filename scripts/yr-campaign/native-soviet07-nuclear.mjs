import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov07tmd.map');
let failure;
try {
    let state = await pilot.open();
    const commands = pilot.commands; commands.groundDefenders = ['TTNK', 'HTNK', 'DRON'];
    commands.airDefenders = ['HTK', 'FLAKT'];
    if (!state.own.some(unit => unit.name === 'NAMISL')) {
        await commands.build('NAMISL', [151, 151]); state = await pilot.observe('ordinary-paid-nuclear-silo');
    }
    const ships = state.own.filter(unit => unit.name === 'ZEP' && unit.spawned).length;
    if (ships < 10) await commands.queue('ZEP', 10 - ships);
    for (let i = 0; i < 600; i++) {
        await commands.step(120); state = await pilot.observe('ordinary-paid-castle-air-assault-' + i);
        const ready = await pilot.page.evaluate(() => window.__ra2debug.game.localPlayer.superWeaponsTrait.getAll()
            .find(weapon => weapon.rules.type === 0)?.status === 2);
        if (ready && state.own.filter(unit => unit.name === 'ZEP' && unit.spawned).length >= 10) break;
    }
    assert(state.own.filter(unit => unit.name === 'ZEP' && unit.spawned).length >= 10);
    await pilot.checkpoint('original-paid-nuclear-air-assault-checkpoint.json');
    for (const goal of [[142, 107], [126, 80], [107, 58]]) {
        await commands.order(['ZEP'], 0, undefined, goal);
        for (let i = 0; i < 180; i++) {
            await commands.step(60);
            if (i % 5 === 0) state = await pilot.observe('ordinary-nuclear-air-column-' + goal.join('-') + '-' + i);
            const ships = state.own.filter(unit => unit.name === 'ZEP' && unit.spawned);
            if (ships.every(unit => Math.hypot(unit.tile[0] - goal[0], unit.tile[1] - goal[1]) < 6)) break;
        }
    }
    pilot.report.ordinaryNuclearLaunch = await pilot.page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        const weapon = g.localPlayer.superWeaponsTrait.getAll().find(weapon => weapon.rules.type === 0);
        const target = g.world.getAllObjects().find(unit => unit.name === 'CATRAN03' && !unit.isDestroyed);
        if (!target) throw Error('Original castle is absent before the ordinary assault');
        if (weapon?.status !== 2) throw Error('Ordinary nuclear superweapon has not charged');
        const shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
        if (shroud.isShrouded(target.tile, target.tileElevation)) throw Error('Ordinary nuclear strike requires the visible original castle');
        d.actionsApi.activateSuperWeapon(weapon.rules.type, { rx: target.tile.rx, ry: target.tile.ry });
        return { tick: g.currentTick, target: target.id, tile: [target.tile.rx, target.tile.ry] };
    });
    await commands.step(900); state = await pilot.observe('original-castle-after-ordinary-nuclear-strike');
    if (!state.result) await pilot.checkpoint('original-post-nuclear-castle-checkpoint.json');
    let assigned;
    for (let i = 0; i < 550 && !state.result; i++) {
        const target = await pilot.page.evaluate(() => {
            const g = window.__ra2debug.game;
            return g.world.getAllObjects().find(unit => unit.name === 'CATRAN03' && !unit.isDestroyed)?.id;
        });
        if (target !== undefined && assigned !== target) { await commands.order(['ZEP'], 2, target); assigned = target; }
        await commands.step(45);
        if (i % 5 === 0) state = await pilot.observe('original-nuclear-and-air-castle-goal-' + i);
        if (target !== undefined) assert(state.own.some(unit => unit.name === 'ZEP'), 'The ordinary castle air assault was lost');
    }
    state = await pilot.observe('original-soviet-final-result'); assert.equal(state.result, 'victory');
    pilot.report.status = `PASS_NATIVE_ORIGINAL_${pilot.report.launch.difficulty.toUpperCase()}_SOVIET07_BOTH_LIBERATED_FACTIONS_NUCLEAR_AIR_CASTLE_AND_SOURCE_VICTORY`;
} catch (error) { failure = error; }
await pilot.finish(failure);
