import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';
import { orderGroundColumn } from './ordinary-column.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov04dmd.map');
let failure;
try {
    let state = await pilot.open(), commands = pilot.commands;
    commands.groundDefenders = ['HTNK', 'E2', 'SHK']; commands.airDefenders = [];
    const has = name => state.own.some(unit => unit.name === name && unit.spawned);
    if (!process.argv.includes('--advance-only')) {
        await commands.order(['NAWEAP'], 0, undefined, [94, 141]);
        for (const [name, tile] of [['NAREFN', [91, 133]], ['NANRCT', [74, 142]],
            ['TESLA', [82, 128]], ['TESLA', [97, 134]], ['NAIRON', [90, 144]]]) {
            if (name === 'NAREFN' || !has(name)) {
                await commands.build(name, tile); state = await pilot.observe('ordinary-protected-economy-' + name);
                await pilot.checkpoint('last-construction-checkpoint.json');
            }
        }
        for (const [name, count] of [['V3', 4], ['APOC', 3], ['DTRUCK', 2], ['DRON', 4], ['HTK', 2]]) {
            const present = state.own.filter(unit => unit.name === name).length;
            if (present < count) await commands.queue(name, count - present);
        }
        for (let i = 0; i < 200; i++) {
            await commands.order(['APOC', 'V3', 'DTRUCK', 'DRON', 'HTK'], 0, undefined, [94, 141]);
            await commands.step(90); state = await pilot.observe('ordinary-source-iron-curtain-force-' + i);
            if ([['V3', 4], ['APOC', 3], ['DTRUCK', 2], ['DRON', 3], ['HTK', 1]]
                .every(([name, count]) => state.own.filter(unit => unit.name === name).length >= count)) break;
            if (i % 15 === 0) await pilot.checkpoint('last-assembly-checkpoint.json');
        }
        assert(has('DTRUCK') && has('V3') && has('APOC'), 'Ordinary source force production did not complete');
        await pilot.checkpoint('ordinary-demolition-force-checkpoint.json');
        if (process.argv.includes('--assemble-only')) {
            pilot.report.status = 'PASS_NATIVE_ORIGINAL_SOVIET04_CAPTURE_AND_LEGAL_IRON_CURTAIN_DEMOLITION_PRODUCTION_FINAL_GOALS_PENDING';
            await pilot.finish(); process.exit(0);
        }
    }
    for (const goal of [[110, 115], [128, 91], [142, 75], [135, 60], [121, 48], [109, 44], [103, 36], [100, 27]]) {
        for (let i = 0; i < 170; i++) {
            const plan = await orderGroundColumn(commands, goal);
            assert(plan, 'The ordinary escort column was lost');
            const orders = await pilot.page.evaluate(() => {
                const d = window.__ra2debug, g = d.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
                const own = g.localPlayer.getOwnedObjects().filter(unit => unit.isSpawned && !unit.isDestroyed);
                const tanks = own.filter(unit => unit.name === 'APOC');
                const drones = own.filter(unit => unit.name === 'DRON');
                const trucks = own.filter(unit => unit.name === 'DTRUCK');
                const center = tanks.reduce((p, unit) => [p[0] + unit.tile.rx / tanks.length,
                    p[1] + unit.tile.ry / tanks.length], [0, 0]);
                const visible = unit => g.map.tileOccupation.calculateTilesForGameObject(unit.tile, unit)
                    .some(tile => !shroud.isShrouded(tile, unit.tileElevation));
                const enemies = g.world.getAllObjects().filter(unit => unit.isTechno() && unit.isSpawned && !unit.isDestroyed
                    && !unit.owner.isNeutral && !g.alliances.areAllied(g.localPlayer, unit.owner) && visible(unit));
                const target = enemies.filter(unit => ['YAPSYT', 'YACNST'].includes(unit.name))
                    .sort((a, b) => Math.hypot(a.tile.rx - center[0], a.tile.ry - center[1])
                        - Math.hypot(b.tile.rx - center[0], b.tile.ry - center[1]))[0];
                const weapon = g.localPlayer.superWeaponsTrait.get('IronCurtainSpecial');
                const close = target && trucks.filter(unit => Math.hypot(unit.tile.rx - target.tile.rx, unit.tile.ry - target.tile.ry) < 18);
                let shield;
                if (weapon?.status === 2 && close?.length) {
                    const tile = close[0].tile;
                    d.actionsApi.activateSuperWeapon(weapon.rules.type, { rx: tile.rx, ry: tile.ry });
                    shield = { tick: g.currentTick, ids: close.map(unit => unit.id), tile: [tile.rx, tile.ry] };
                }
                const result = [];
                const protectedTruck = trucks.find(unit => unit.invulnerableTrait.isActive());
                if (target && protectedTruck) result.push({ ids: [protectedTruck.id], type: 2, target: target.id });
                else if (trucks.length && tanks.length) result.push({ ids: trucks.map(unit => unit.id), type: 0,
                    tile: [tanks[0].tile.rx, tanks[0].tile.ry] });
                if (drones.length && tanks.length) result.push({ ids: drones.map(unit => unit.id), type: 0,
                    tile: [tanks[0].tile.rx, tanks[0].tile.ry] });
                return { orders: result, shield };
            });
            if (orders.shield) pilot.report.commands.push({ kind: 'ordinary-iron-curtain-demolition', ...orders.shield });
            for (const order of orders.orders) await commands.order(order.ids, order.type, order.target, order.tile);
            await commands.step(60);
            if (i % 5 === 0) state = await pilot.observe('ordinary-northern-source-objectives-' + goal.join('-') + '-' + i);
            if (plan.distance < 5) break;
        }
        state = await pilot.observe('original-northern-stage-' + goal.join('-'));
        await pilot.checkpoint('last-northern-objective-checkpoint.json');
    }
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_SOVIET04_NORTHERN_ASSAULT_CONTINUATION_FINAL_RESCUE_AND_EXTRACTION_PENDING';
} catch (error) { failure = error; }
await pilot.finish(failure);
