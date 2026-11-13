import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all07smd.map');
let failure;
try {
    let state = await pilot.open();
    const commands = pilot.commands;
    commands.groundDefenders = ['HTNK', 'E2', 'MTNK', 'MGTK', 'SREF'];
    commands.airDefenders = ['HTK', 'FV']; commands.groundPriority = ['MIND', 'YURI', 'VIRUS'];
    commands.autoForceShield = true;
    await commands.order(['MTNK', 'MGTK', 'SREF', 'FV'], 0, undefined, [84, 125]);
    if (process.argv.includes('--recover-income')) {
        const pending = state.queues.flatMap(queue => queue.items).filter(item => item.name === 'SUB')
            .reduce((sum, item) => sum + item.quantity, 0);
        if (pending) await commands.cancel('SUB', pending);
        pilot.report.ordinaryRecoverySale = await pilot.page.evaluate(() => {
            const d = window.__ra2debug, g = d.game;
            const silo = g.localPlayer.getOwnedObjects().find(unit => unit.name === 'NAMISL' && !unit.isDestroyed);
            if (!silo) throw Error('The ordinary recovery sale requires the existing optional silo');
            d.actionsApi.sellBuilding(silo.id);
            return { tick: g.currentTick, id: silo.id, name: silo.name };
        });
        await commands.step(180);
        await commands.build('NAREFN', [77, 123]);
        await commands.build('NAWEAP', [77, 127]);
        await commands.queue('HARV', 2);
        state = await pilot.observe('ordinary-tierra-safe-refinery-and-paid-mining-recovery');
        await pilot.checkpoint('original-tierra-safe-refinery-recovery-checkpoint.json');
    }
    if (!state.own.some(unit => unit.name === 'NAYARD')) {
        pilot.report.recon = await pilot.page.evaluate(() => {
            const d = window.__ra2debug, g = d.game;
            const weapon = g.localPlayer.superWeaponsTrait.getAll().find(weapon => weapon.rules.type === 8);
            if (weapon?.status !== 2) throw Error('The ordinary original Spy Plane has not charged');
            d.actionsApi.activateSuperWeapon(8, { rx: 70, ry: 155 });
            return { tick: g.currentTick, type: 8, target: [70, 155] };
        });
        let dock;
        for (let i = 0; i < 60 && !dock; i++) {
            await commands.step(60);
            dock = await pilot.page.evaluate(() => {
                const g = window.__ra2debug.game, worker = g.getConstructionWorker(g.localPlayer);
                const tile = g.map.tiles.getAll().filter(tile => worker.canPlaceAt('NAYARD', tile, { normalizedTile: true }))
                    .sort((a, b) => Math.hypot(a.rx - 70, a.ry - 155) - Math.hypot(b.rx - 70, b.ry - 155))[0];
                return tile && [tile.rx, tile.ry];
            });
        }
        assert(dock, 'The ordinary reconnaissance did not reveal a legal naval-yard foundation');
        pilot.report.dockPlan = dock;
        await commands.build('NAYARD', dock);
    }
    const additional = 8 - state.own.filter(unit => unit.name === 'SUB').length;
    if (additional > 0) await commands.queue('SUB', additional);
    await pilot.checkpoint('original-tierra-paid-anti-submarine-production-checkpoint.json');
    const routes = [[116, 137], [126, 127], [108, 166], [96, 171], [90, 180]];
    let route = 0, previousRoute;
    for (let i = 0; i < 1000; i++) {
        await commands.step(90);
        if (i % 10 === 0) {
            state = await pilot.observe('ordinary-tierra-anti-submarine-fleet-' + i);
            await pilot.checkpoint('last-anti-submarine-progress-checkpoint.json');
        }
        assert(state.own.some(unit => unit.name === 'NACNST'), 'The original critical Soviet yard was lost');
        const remaining = await pilot.page.evaluate(() => window.__ra2debug.game.world.getAllObjects()
            .filter(unit => unit.name === 'BSUB' && unit.owner.name === 'Yuri3' && !unit.isDestroyed)
            .map(unit => ({ id: unit.id, tile: [unit.tile.rx, unit.tile.ry] })));
        if (!remaining.length) break;
        if (state.own.filter(unit => unit.name === 'SUB').length < 3) continue;
        const target = await commands.attackVisible(['SUB'], 'Yuri3', 'naval');
        if (target) {
            (pilot.report.visibleNavalTargets ??= []).push({ tick: state.tick, ...target });
            previousRoute = undefined;
        }
        else {
            if (previousRoute !== route) {
                await commands.order(['SUB'], 0, undefined, routes[route]); previousRoute = route;
            }
            const arrived = state.own.filter(unit => unit.name === 'SUB')
                .some(unit => Math.hypot(unit.tile[0] - routes[route][0], unit.tile[1] - routes[route][1]) < 7);
            if (arrived && route < routes.length - 1) route++;
        }
    }
    pilot.report.remainingBoomers = await pilot.page.evaluate(() => window.__ra2debug.game.world.getAllObjects()
        .filter(unit => unit.name === 'BSUB' && unit.owner.name === 'Yuri3' && !unit.isDestroyed).map(unit => unit.id));
    assert.equal(pilot.report.remainingBoomers.length, 0);
    await pilot.restart('Original YR Allied07 paid Soviet submarines remove original coastal Boomer bombardment while the critical yard survives');
    await pilot.checkpoint('original-tierra-coastal-boomers-cleared-checkpoint.json');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED07_SOVIET_NAVAL_PRODUCTION_COASTAL_BOOMERS_CLEARED_AND_RESTART_STAGE';
} catch (error) { failure = error; }
await pilot.finish(failure);
