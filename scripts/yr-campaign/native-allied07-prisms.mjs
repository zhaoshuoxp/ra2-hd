import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all07smd.map');
let failure;
async function manageEconomyAndSilo() {
    const inputs = await pilot.page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, own = g.localPlayer.getOwnedObjects();
        const shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
        const ore = g.world.getAllObjects().filter(unit => unit.isOverlay() && unit.isTiberium() && unit.value > 0
            && !shroud.isShrouded(unit.tile, unit.tileElevation));
        const refiners = own.filter(unit => unit.rules.refinery && unit.isSpawned && !unit.isDestroyed);
        const orders = [];
        for (const miner of own.filter(unit => unit.rules.harvester && unit.isSpawned && !unit.isDestroyed
            && [0, 1].includes(unit.harvesterTrait.status))) {
            const target = ore.sort((a, b) => {
                const distance = unit => Math.hypot(miner.tile.rx - unit.tile.rx, miner.tile.ry - unit.tile.ry)
                    + Math.min(...refiners.map(refinery => Math.hypot(refinery.tile.rx - unit.tile.rx, refinery.tile.ry - unit.tile.ry)));
                return distance(a) - distance(b) || b.value - a.value;
            })[0];
            if (target) {
                d.actionsApi.orderUnits([miner.id], 14, target.tile.rx, target.tile.ry);
                orders.push({ kind: 'ordinary-visible-ore-gather', tick: g.currentTick,
                    miner: miner.id, tile: [target.tile.rx, target.tile.ry], value: target.value });
            }
        }
        const weapon = g.localPlayer.superWeaponsTrait.getAll().find(weapon => weapon.rules.type === 0);
        if (weapon?.status === 2) {
            const buildings = [9, 14].flatMap(id => g.campaign.resolveHouse(id).getOwnedObjects())
                .filter(unit => unit.isBuilding() && unit.isSpawned && !unit.isDestroyed
                    && !unit.rules.invisibleInGame && unit.rules.legalTarget !== false
                    && !shroud.isShrouded(unit.tile, unit.tileElevation));
            const score = target => (target.name === 'YACNST' ? 40 : 0) + buildings.reduce((sum, unit) => sum
                + (Math.hypot(unit.tile.rx - target.tile.rx, unit.tile.ry - target.tile.ry) < 8
                    ? ({ YAGGUN: 6, YAPSYT: 4, YAPOWR: 2 }[unit.name] ?? 1) : 0), 0);
            const target = buildings.sort((a, b) => score(b) - score(a) || a.id - b.id)[0];
            if (target) {
                d.actionsApi.activateSuperWeapon(0, { rx: target.tile.rx, ry: target.tile.ry });
                orders.push({ kind: 'ordinary-paid-nuclear-strike', tick: g.currentTick,
                    id: target.id, name: target.name, tile: [target.tile.rx, target.tile.ry] });
            }
        }
        return { tick: g.currentTick, oreCells: ore.length, orders };
    });
    pilot.report.commands.push(...inputs.orders);
    pilot.report.remainingVisibleOreCells = inputs.oreCells;
}
try {
    let state = await pilot.open();
    const commands = pilot.commands;
    commands.groundDefenders = ['HTNK', 'E2', 'MTNK', 'MGTK'];
    commands.airDefenders = ['HTK', 'FV']; commands.groundPriority = ['MIND', 'YURI', 'VIRUS'];
    commands.autoForceShield = true; commands.autoDominatorCounterstrike = true;
    await manageEconomyAndSilo();
    for (const [name, near] of [['GAREFN', [104, 191]], ['AMRADR', [106, 194]], ['GATECH', [100, 200]]]) {
        if (!state.own.some(unit => unit.name === name)) await commands.build(name, near);
        await manageEconomyAndSilo(); state = await pilot.observe('ordinary-tierra-restored-prism-technology-' + name);
        await pilot.checkpoint('last-tierra-prism-technology-checkpoint.json');
    }
    const existing = name => state.own.filter(unit => unit.name === name && unit.spawned).length;
    if (existing('SREF') < 12) await commands.queue('SREF', 12 - existing('SREF'));
    if (existing('FV') < 6) await commands.queue('FV', 6 - existing('FV'));
    await commands.order(['GAWEAP'], 0, undefined, [112, 183]);
    for (let i = 0; i < 1100; i++) {
        await commands.step(90);
        if (i % 10 === 0) {
            await manageEconomyAndSilo(); state = await pilot.observe('ordinary-tierra-paid-prism-army-' + i);
            await pilot.checkpoint('last-tierra-prism-production-checkpoint.json');
        }
        assert(state.own.some(unit => unit.name === 'NACNST'), 'The original critical repaired Soviet yard was lost');
        if (existing('SREF') >= 12 && existing('FV') >= 4) break;
    }
    assert(existing('SREF') >= 12, 'The paid ordinary prism army has not completed');
    await pilot.checkpoint('original-tierra-paid-prism-army-checkpoint.json');
    let assigned;
    for (let i = 0; i < 2400 && !state.result; i++) {
        if (i % 10 === 0) await manageEconomyAndSilo();
        const target = await commands.attackVisible(['SREF'], undefined, 'ground');
        if (target) {
            if (assigned !== target.target) {
                (pilot.report.ordinaryGroundTargets ??= []).push({ tick: state.tick, ...target });
                assigned = target.target;
            }
        } else await commands.attackVisible(['SREF'], undefined, 'buildings');
        await commands.attackVisible(['FV'], undefined, 'air');
        if (i % 20 === 0) {
            const destination = await pilot.page.evaluate(() => {
                const g = window.__ra2debug.game;
                const army = g.localPlayer.getOwnedObjects().filter(unit => unit.name === 'SREF' && unit.isSpawned && !unit.isDestroyed);
                return army.length ? army.reduce((sum, unit) => [sum[0] + unit.tile.rx / army.length,
                    sum[1] + unit.tile.ry / army.length], [0, 0]).map(Math.round) : undefined;
            });
            assert(destination, 'The ordinary paid prism army was lost');
            await commands.order(['FV'], 0, undefined, destination);
        }
        await commands.step(90);
        if (i % 10 === 0) {
            state = await pilot.observe('original-tierra-normal-prism-assault-' + i);
            if (!state.result) await pilot.checkpoint('last-tierra-prism-assault-checkpoint.json');
        }
    }
    state = await pilot.observe('original-tierra-prism-source-result');
    assert.equal(state.result, 'victory');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED07_REPAIRED_BASE_TWO_FACTION_TECH_NAVY_AIR_AND_PRISM_FORCES_WITH_SOURCE_FINAL_VICTORY';
} catch (error) { failure = error; }
await pilot.finish(failure);
