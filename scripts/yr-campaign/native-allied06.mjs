import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';
import { advanceSupportedPrisms } from './supported-prism-column.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all06umd.map');
const reinforceParliament = process.argv.includes('--reinforce-parliament');
function configureDefense(commands, parliament) {
    commands.groundDefenders = ['MTNK', 'SREF', 'E1', 'GGI'];
    commands.airDefenders = ['FV', 'GGI']; commands.groundPriority = ['YURI', 'MIND', 'VIRUS'];
    if (parliament !== undefined) commands.repairTargets = [parliament];
}
async function run() {
    let state = await pilot.open();
    let commands = pilot.commands;
    configureDefense(commands);
    const parliament = await pilot.page.evaluate(() => window.__ra2debug.game.world.getAllObjects()
        .find(unit => unit.name === 'CALOND04' && !unit.isDestroyed)?.id);
    assert(parliament !== undefined);
    if (!pilot.report.sourceCheckpoint) {
        await commands.order(['E1'], 0, undefined, [89, 113]);
        await commands.step(120);
        const deploy = await pilot.page.evaluate(() => {
            const g = window.__ra2debug.game, mcv = g.localPlayer.getOwnedObjects().find(unit => unit.name === 'AMCV' && unit.isSpawned);
            const worker = g.getConstructionWorker(g.localPlayer);
            const tile = g.map.tiles.getAll().filter(tile => Math.hypot(tile.rx - 90, tile.ry - 121) < 15
                && worker.canPlaceAt('GACNST', tile, { ignoreAdjacent: true, ignoreObjects: [mcv] }))
                .sort((a, b) => Math.hypot(a.rx - 90, a.ry - 121) - Math.hypot(b.rx - 90, b.ry - 121))[0];
            if (!tile) throw Error('No legal original Parliament-side construction-yard deployment');
            return [tile.rx, tile.ry];
        });
        pilot.report.deploymentCell = deploy;
        await commands.order(['AMCV'], 0, undefined, deploy);
        for (let i = 0; i < 40; i++) {
            await commands.step(60);
            const ready = await pilot.page.evaluate(() => {
                const g = window.__ra2debug.game, mcv = g.localPlayer.getOwnedObjects().find(unit => unit.name === 'AMCV' && unit.isSpawned);
                if (!mcv) return { deployed: true };
                return { deployed: false, allowed: g.getConstructionWorker(g.localPlayer).canPlaceAt('GACNST', mcv.tile,
                    { ignoreAdjacent: true, ignoreObjects: [mcv] }), moving: !!mcv.moveTrait.currentWaypoint };
            });
            if (ready.deployed) break;
            if (ready.allowed && !ready.moving) await commands.order(['AMCV'], 9);
        }
        commands.repairTargets = [parliament];
        await commands.order(['E1'], 9);
        await commands.order(['E1'], 8, parliament);
        for (const [name, tile] of [['GAPOWR', [95, 120]], ['GAREFN', [94, 126]], ['GAPILE', [87, 121]],
            ['GAWEAP', [96, 125]], ['AMRADR', [95, 117]], ['GAPOWR', [89, 118]],
            ['ATESLA', [89, 115]], ['ATESLA', [98, 116]], ['GATECH', [94, 130]],
            ['GASPYSAT', [90, 130]], ['GAPOWR', [98, 120]], ['ATESLA', [88, 120]], ['ATESLA', [98, 121]]]) {
            await commands.build(name, tile); state = await pilot.observe('ordinary-london-parliament-base-' + name);
            await pilot.checkpoint('last-london-base-checkpoint.json');
        }
    }
    configureDefense(commands, parliament);
    if (reinforceParliament) {
        for (const [name, tile] of [['GAPOWR', [90, 125]], ['GAPOWR', [88, 124]],
            ['ATESLA', [97, 113]], ['ATESLA', [97, 110]]]) {
            await commands.build(name, tile);
            state = await pilot.observe('ordinary-london-reinforced-parliament-' + name);
            await pilot.checkpoint('last-london-reinforced-defense-checkpoint.json');
        }
        await commands.queue('ENGINEER', 4);
        await commands.order(['GAPILE'], 0, undefined, [92, 117]);
    }
    if (process.argv.includes('--base-only')) {
        await pilot.restart('Original YR Allied06 deployed base, paid defenses and protected Parliament');
        pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED06_PAID_BASE_PARLIAMENT_DEFENSE_AND_EXACT_RESTART_GOALS_PENDING';
        return;
    }
    await commands.queue('CMIN', 2); await commands.queue('FV', 3);
    await commands.queue('GGI', 8); await commands.queue('SREF', 20); await commands.queue('JUMPJET', 12);
    await commands.order(['GAWEAP', 'GAPILE'], 0, undefined, [93, 122]);
    let deployed = false;
    for (let i = 0; i < 800; i++) {
        await commands.step(90);
        if (i % 10 === 0) state = await pilot.observe('ordinary-london-paid-parliament-defense-and-army-' + i);
        if (reinforceParliament) {
            const ids = await pilot.page.evaluate(() => window.__ra2debug.game.localPlayer.getOwnedObjects()
                .filter(unit => unit.name === 'GGI' && unit.isSpawned && !unit.isDestroyed
                    && !unit.deployerTrait?.isDeployed() && !unit.moveTrait.currentWaypoint).map(unit => unit.id));
            if (ids.length) await commands.order(ids, 9);
        } else if (!deployed && state.own.filter(unit => unit.name === 'GGI').length >= 10) {
            await commands.order(['GGI'], 9); deployed = true;
        }
        assert(state.own.some(unit => unit.name === 'GACNST'));
        if (!state.queues.some(queue => queue.items.some(item => ['SREF', 'JUMPJET', 'CMIN', 'FV'].includes(item.name)))
            && state.own.filter(unit => unit.name === 'SREF').length >= 16
            && state.own.filter(unit => unit.name === 'JUMPJET').length >= 10) break;
    }
    const army = { prisms: state.own.filter(unit => unit.name === 'SREF').slice(4).map(unit => unit.id),
        air: state.own.filter(unit => unit.name === 'JUMPJET').map(unit => unit.id) };
    assert(army.prisms.length >= 12 && army.air.length >= 10); pilot.report.army = army;
    await pilot.restart('Original YR Allied06 protected Parliament, paid defenses and assault army');
    commands = pilot.commands;
    commands.repairTargets = [parliament];
    if (reinforceParliament) configureDefense(commands, parliament);
    await pilot.checkpoint('original-london-parliament-and-army-checkpoint.json');
    for (let stage = 0; stage < 180 && !state.result; stage++) {
        const goal = await pilot.page.evaluate(({ ids, excludeNavalUnits }) => {
            const g = window.__ra2debug.game, own = g.localPlayer.getOwnedObjects().filter(unit => ids.includes(unit.id)
                && unit.isSpawned && !unit.isDestroyed);
            if (!own.length) throw Error('The ordinary London prism column was lost');
            const center = own.reduce((sum, unit) => [sum[0] + unit.tile.rx / own.length, sum[1] + unit.tile.ry / own.length], [0, 0]);
            const target = g.campaign.resolveHouse(9).getOwnedObjects().filter(unit => unit.isSpawned && !unit.isDestroyed
                && !unit.rules.insignificant && !unit.rules.invisibleInGame && unit.rules.legalTarget !== false
                && !(excludeNavalUnits && unit.isUnit() && unit.rules.naval))
                .sort((a, b) => Number(b.isBuilding()) - Number(a.isBuilding())
                    || Math.hypot(a.tile.rx - center[0], a.tile.ry - center[1]) - Math.hypot(b.tile.rx - center[0], b.tile.ry - center[1]))[0];
            return target && { id: target.id, name: target.name, tile: [target.tile.rx, target.tile.ry] };
        }, { ids: army.prisms, excludeNavalUnits: reinforceParliament });
        if (!goal) break;
        await advanceSupportedPrisms(pilot, goal, army, 'ordinary-london-final-force-' + stage + '-' + goal.name);
        state = await pilot.observe('original-london-source-goal-cleared-' + stage + '-' + goal.name);
        if (!state.result) await pilot.checkpoint('last-london-force-progress-checkpoint.json');
    }
    for (let i = 0; i < 100 && !state.result; i++) {
        await commands.step(60, { defend: false }); state = await pilot.observe('original-london-result-delay-' + i);
    }
    assert.equal(state.result, 'victory');
    if (process.argv.includes('--complete-source-flow')) await pilot.completeResultFlow();
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED06_PARLIAMENT_DEFENSE_SOURCE_TIMER_FINAL_LAND_FORCES_AND_SOURCE_VICTORY';
}
let failure;
try { await run(); }
catch (error) { failure = error; }
await pilot.finish(failure);
