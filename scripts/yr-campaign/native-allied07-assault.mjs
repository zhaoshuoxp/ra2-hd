import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all07smd.map');
let failure;
try {
    let state = await pilot.open();
    const commands = pilot.commands;
    commands.groundDefenders = ['HTNK', 'E2', 'MTNK', 'MGTK', 'SREF'];
    commands.airDefenders = ['HTK', 'FV']; commands.groundPriority = ['MIND', 'YURI', 'VIRUS'];
    commands.autoForceShield = true; commands.autoDominatorCounterstrike = true;
    const shipsGoal = Number(process.argv.find(value => value.startsWith('--airships='))?.slice(11) ?? 16);
    assert(Number.isSafeInteger(shipsGoal) && shipsGoal >= 6 && shipsGoal <= 24);
    if (process.argv.includes('--wait-source-strike')) {
        await commands.step(2400);
        state = await pilot.observe('ordinary-tierra-original-attack-before-production-recovery');
        await pilot.checkpoint('original-post-strike-recovery-checkpoint.json');
    }
    if (process.argv.includes('--neutralize-dominator')) {
        pilot.report.ordinaryDominatorStrike = await pilot.page.evaluate(() => {
            const d = window.__ra2debug, g = d.game;
            const target = g.world.getAllObjects().find(unit => unit.name === 'YAPPET' && !unit.isDestroyed);
            const weapon = g.localPlayer.superWeaponsTrait.getAll().find(weapon => weapon.rules.type === 0);
            if (!target || weapon?.status !== 2) throw Error('The ordinary counterstrike requires the original Dominator and a charged paid silo');
            const shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            if (shroud.isShrouded(target.tile, target.tileElevation)) throw Error('The satellite has not revealed the original target');
            d.actionsApi.activateSuperWeapon(0, { rx: target.tile.rx, ry: target.tile.ry });
            return { tick: g.currentTick, id: target.id, tile: [target.tile.rx, target.tile.ry] };
        });
        await commands.step(1200);
        state = await pilot.observe('original-tierra-dominator-after-paid-nuclear-counterstrike');
        await pilot.checkpoint('original-tierra-dominator-counterstrike-checkpoint.json');
    }
    const technology = [['GAPOWR', [100, 195]], ['GAREFN', [104, 191]], ['GAPILE', [102, 199]],
        ['GAWEAP', [104, 198]], ['AMRADR', [106, 194]], ['GATECH', [100, 200]], ['GASPYSAT', [108, 199]],
        ['NAHAND', [78, 122]], ['NAREFN', [77, 115]], ['NAWEAP', [78, 133]], ['NARADR', [79, 125]],
        ['NATECH', [76, 145]], ['NAFLAK', [84, 120]], ['NAFLAK', [82, 130], 2], ['NAMISL', [84, 131]]];
    for (let pass = 0; pass < 8; pass++) {
        for (const [name, near, required = 1] of technology) {
            if (state.own.filter(unit => unit.name === name).length < required) {
                const available = await pilot.page.evaluate(name => {
                    const g = window.__ra2debug.game;
                    return g.localPlayer.production.isAvailableForProduction(g.rules.getBuilding(name));
                }, name);
                if (!available) continue;
                try { await commands.build(name, near); }
                catch (error) {
                    if (!error.message.startsWith('Original combat canceled ordinary building production:')) throw error;
                    pilot.report.commands.push({ kind: 'ordinary-combat-production-loss', name, error: error.message });
                }
            }
            state = await pilot.observe('ordinary-tierra-united-tech-' + pass + '-' + name);
            await pilot.checkpoint('last-tierra-united-tech-checkpoint.json');
        }
        if (['NAWEAP', 'NATECH', 'NAMISL', 'GAPILE'].every(name => state.own.some(unit => unit.name === name))) break;
    }
    assert(['NAWEAP', 'NATECH', 'NAMISL', 'GAPILE'].every(name => state.own.some(unit => unit.name === name)),
        'Ordinary construction has not retained the complete paid air-production technology');
    const ships = state.own.filter(unit => unit.name === 'ZEP' && unit.spawned).length;
    const jets = state.own.filter(unit => unit.name === 'JUMPJET' && unit.spawned).length;
    if (ships < shipsGoal) await commands.queue('ZEP', shipsGoal - ships);
    if (jets < 18) await commands.queue('JUMPJET', 18 - jets);
    await commands.order(['NAWEAP'], 0, undefined, [84, 125]);
    await commands.order(['GAPILE'], 0, undefined, [84, 125]);
    for (let i = 0; i < 850; i++) {
        await commands.step(90);
        if (i % 10 === 0) {
            state = await pilot.observe('ordinary-tierra-paid-combined-air-fleet-' + i);
            await pilot.checkpoint('last-tierra-air-production-checkpoint.json');
        }
        assert(state.own.some(unit => unit.name === 'NACNST'), 'The original critical Soviet yard was lost');
        assert(state.own.some(unit => unit.name === 'NAWEAP'), 'Original combat destroyed the paid air-fleet factory');
        assert(state.own.some(unit => unit.name === 'NATECH'), 'Original combat destroyed the paid air-fleet laboratory');
        if (state.own.filter(unit => unit.name === 'ZEP' && unit.spawned).length >= shipsGoal
            && state.own.filter(unit => unit.name === 'JUMPJET' && unit.spawned).length >= 12) break;
    }
    assert(state.own.filter(unit => unit.name === 'ZEP' && unit.spawned).length >= shipsGoal);
    await pilot.checkpoint('original-tierra-united-air-fleet-checkpoint.json');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED07_PAID_TWO_FACTION_TECH_SATELLITE_AND_COMBINED_AIR_FLEET_STAGE';
} catch (error) { failure = error; }
await pilot.finish(failure);
