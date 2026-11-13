import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';
import { orderGroundColumn } from './ordinary-column.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov04dmd.map');
let failure;
try {
    let state = await pilot.open(), commands = pilot.commands;
    const has = name => state.own.some(unit => unit.name === name && unit.spawned);
    const foundRomanov = () => state.houses.some(house => house.objects.some(unit => unit.name === 'RMNV'));
    commands.groundDefenders = ['HTNK', 'E2', 'SHK', 'DRON'];
    for (let i = 0; i < 60 && !has('NACNST'); i++) {
        await commands.step(90); state = await pilot.observe('original-mcv-deployment-' + i);
    }
    assert(has('NACNST'), 'Original MCV did not deploy');
    await commands.order(['HTNK', 'E2'], 4, undefined, [84, 141]);
    if (!has('NATECH')) {
        for (const [name, tile] of [['NAPOWR', [86, 140]], ['NAREFN', [89, 134]], ['NAHAND', [77, 134]],
            ['NAWEAP', [82, 130]], ['NAPOWR', [88, 142]], ['NARADR', [76, 140]], ['NATECH', [73, 137]]]) {
            await commands.build(name, tile); state = await pilot.observe('ordinary-base-' + name);
            await pilot.checkpoint('last-base-checkpoint.json');
        }
        await pilot.restart('Original YR Soviet04 source base and paid construction');
        commands = pilot.commands; commands.groundDefenders = ['HTNK', 'E2', 'SHK', 'DRON'];
        state = await pilot.observe('original-restored-base');
        await pilot.checkpoint('paid-base-checkpoint.json');
    }
    if (!process.argv.includes('--advance-only')) {
        await commands.order(['NAWEAP'], 0, undefined, [95, 141]);
        if (process.argv.includes('--rescue-first') && !has('RMNV')) {
            const drones = state.own.filter(unit => unit.name === 'DRON').length;
            if (drones < 4) await commands.queue('DRON', 4 - drones);
            if (!has('HTK') && !state.queues.some(queue => queue.items.some(item => item.name === 'HTK')))
                await commands.queue('HTK', 1);
            for (let i = 0; i < 40 && state.own.filter(unit => unit.name === 'DRON').length < 4; i++) {
                await commands.step(90); state = await pilot.observe('ordinary-immune-rescue-scouts-' + i);
            }
            const scouts = state.own.filter(unit => unit.name === 'DRON').slice(0, 2).map(unit => unit.id);
            assert.equal(scouts.length, 2);
            for (const goal of [[110, 115], [135, 88], [147, 77], [138, 70]]) {
                await commands.order(scouts, 0, undefined, goal);
                for (let i = 0; i < 40; i++) {
                    await commands.step(60); state = await pilot.observe('original-rescue-scout-route-' + goal.join('-') + '-' + i);
                    if (foundRomanov()) break;
                    if (state.own.some(unit => scouts.includes(unit.id) && Math.hypot(unit.tile[0] - goal[0], unit.tile[1] - goal[1]) < 3)) break;
                }
                if (foundRomanov()) break;
            }
            for (let i = 0; i < 30 && !foundRomanov(); i++) {
                await commands.step(90); state = await pilot.observe('original-romanov-discovery-' + i);
            }
            await pilot.checkpoint('original-scouted-romanov-checkpoint.json');
            if (process.argv.includes('--rescue-only')) {
                assert(foundRomanov(), 'The original discovery has not spawned Romanov');
                pilot.report.status = 'PASS_NATIVE_ORIGINAL_SOVIET04_PAID_BASE_RESTART_AND_ROMANOV_DISCOVERY_FINAL_GOALS_PENDING';
                await pilot.finish(); process.exit(0);
            }
        }
        if (!has('NANRCT')) {
            if (!process.argv.includes('--rescue-first')) await commands.queue('DRON', 4);
            for (const [name, tile] of [['NAREFN', [96, 137]], ['NANRCT', [74, 142]], ['TESLA', [82, 128]], ['TESLA', [97, 134]]]) {
                await commands.build(name, tile); state = await pilot.observe('ordinary-anti-psychic-base-' + name);
            }
        }
        const curtain = await pilot.page.evaluate(() => {
            const g = window.__ra2debug.game, rules = g.rules.getBuilding('NAIRON');
            return { techLevel: rules.techLevel, available: g.localPlayer.production.isAvailableForProduction(rules) };
        });
        pilot.report.originalIronCurtainUnlock = curtain;
        if (curtain.available && !has('NAIRON')) {
            await commands.build('NAIRON', [76, 143]); state = await pilot.observe('original-unlocked-iron-curtain');
        }
        for (const [name, count] of [['V3', 5], ['APOC', 6], ['HTK', 2]]) {
            const present = state.own.filter(unit => unit.name === name).length;
            if (present < count) await commands.queue(name, count - present);
        }
        for (let i = 0; i < 400; i++) {
            await commands.order(['APOC', 'V3', 'HTK'], 0, undefined, [95, 141]);
            await commands.step(180); state = await pilot.observe('ordinary-paid-ground-column-' + i);
            if (['APOC', 'V3', 'HTK'].every((name, n) => state.own.filter(unit => unit.name === name).length >= [6, 5, 2][n])) break;
            assert(has('NAWEAP') && has('HARV'), 'The ordinary production economy was lost');
            if (i % 20 === 0) await pilot.checkpoint('last-production-checkpoint.json');
        }
        assert(state.own.filter(unit => unit.name === 'APOC').length >= 6, 'Ordinary Apocalypse production did not complete');
        assert(state.own.filter(unit => unit.name === 'V3').length >= 4, 'Ordinary artillery production did not complete');
        await pilot.checkpoint('ordinary-ground-column-checkpoint.json');
    }
    pilot.report.romanovWorld = await pilot.page.evaluate(() => { const g = window.__ra2debug.game;
        return g.getAllPlayers().flatMap(owner => owner.getOwnedObjects(true)).filter(unit => unit.name === 'RMNV')
            .map(unit => ({ id: unit.id, owner: unit.owner.name, tile: [unit.tile.rx, unit.tile.ry],
                health: unit.healthTrait.health, spawned: unit.isSpawned, destroyed: unit.isDestroyed, limbo: unit.limboData })); });
    if (process.argv.includes('--base-only')) {
        pilot.report.status = 'PASS_NATIVE_ORIGINAL_SOVIET04_PAID_BASE_RESTART_AND_GROUND_FORCE_FINAL_GOALS_PENDING';
    } else {
        for (const goal of [[92, 116], [113, 99], [135, 72], [114, 44], [100, 33], [118, 33], [72, 57], [44, 81], [34, 96]]) {
            for (let i = 0; i < 200 && !state.result; i++) {
                const shield = await pilot.page.evaluate(() => {
                    const d = window.__ra2debug, g = d.game, weapon = g.localPlayer.superWeaponsTrait.get('IronCurtainSpecial');
                    const units = g.localPlayer.getOwnedObjects().filter(unit => unit.name === 'APOC' && unit.isSpawned && !unit.isDestroyed);
                    if (weapon?.status !== 2 || !units.length) return;
                    const enemy = g.world.getAllObjects().some(unit => unit.isTechno() && unit.isSpawned && !unit.isDestroyed
                        && ['YURI', 'YAPSYT', 'YAGGUN'].includes(unit.name) && units.some(tank => Math.hypot(tank.tile.rx - unit.tile.rx, tank.tile.ry - unit.tile.ry) < 18));
                    if (!enemy) return;
                    const tile = units[Math.floor(units.length / 2)].tile;
                    d.actionsApi.activateSuperWeapon(weapon.rules.type, { rx: tile.rx, ry: tile.ry });
                    return { tick: g.currentTick, type: weapon.rules.type, tile: [tile.rx, tile.ry], units: units.map(unit => unit.id) };
                });
                if (shield) pilot.report.commands.push({ kind: 'ordinary-iron-curtain', ...shield });
                const plan = await orderGroundColumn(commands, goal);
                assert(plan, 'The ordinary ground column was lost');
                await commands.step(90);
                if (i % 5 === 0) state = await pilot.observe('original-ground-objectives-' + goal.join('-') + '-' + i);
                if (plan.distance < 5) break;
            }
            state = await pilot.observe('original-ground-stage-' + goal.join('-'));
            if (goal[0] === 135 && goal[1] === 72) {
                const discovery = await pilot.page.evaluate(() => {
                    const g = window.__ra2debug.game;
                    if (g.getAllPlayers().flatMap(owner => owner.getOwnedObjects(true)).some(unit => unit.name === 'RMNV' && !unit.isDestroyed)) return;
                    const bar = g.world.getAllObjects().find(unit => unit.name === 'CAMORR06' && unit.isSpawned && !unit.isDestroyed);
                    if (!bar || g.mapShroudTrait.getPlayerShroud(g.localPlayer).isShrouded(bar.tile, bar.tileElevation)) return;
                    return bar.id;
                });
                if (discovery !== undefined) {
                    await commands.order(['APOC'], 3, discovery); await commands.step(60);
                    await commands.order(['APOC'], 11);
                    for (let i = 0; i < 35; i++) {
                        await commands.step(60); state = await pilot.observe('original-bar-fired-on-discovery-' + i);
                        if (state.houses.some(house => house.objects.some(unit => unit.name === 'RMNV'))) break;
                    }
                }
            }
            const controller = await pilot.page.evaluate(() => {
                const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
                const romanov = g.getAllPlayers().flatMap(owner => owner.getOwnedObjects(true)).find(unit => unit.name === 'RMNV' && !unit.isDestroyed);
                if (!romanov || g.localPlayer.campaignControlledPlayers.includes(romanov.owner)) return;
                const units = g.localPlayer.getOwnedObjects().filter(unit => ['APOC', 'V3'].includes(unit.name) && unit.isSpawned && !unit.isDestroyed);
                const target = g.world.getAllObjects().find(unit => unit.name === 'YURI' && unit.owner.name === 'Special' && unit.isSpawned && !unit.isDestroyed
                    && !shroud.isShrouded(unit.tile, unit.tileElevation) && Math.hypot(unit.tile.rx - romanov.tile.rx, unit.tile.ry - romanov.tile.ry) < 15
                    && units.some(own => Math.hypot(own.tile.rx - unit.tile.rx, own.tile.ry - unit.tile.ry) < 20));
                return target?.id;
            });
            if (controller !== undefined) {
                await commands.order(['APOC', 'V3'], 3, controller);
                await commands.step(180); state = await pilot.observe('original-captured-romanov-controller');
            }
            await pilot.checkpoint('last-ground-objective-checkpoint.json');
        }
        assert(has('RMNV'), 'The original Romanov rescue has not completed');
        await commands.order(['RMNV'], 0, undefined, [103, 18]);
        for (let i = 0; i < 300 && state.result !== 'victory'; i++) {
            await commands.attackVisible(['APOC', 'V3'], undefined, 'buildings');
            await commands.step(90);
            if (i % 5 === 0) state = await pilot.observe('original-ground-extraction-' + i);
        }
        state = await pilot.observe('original-romanov-result'); assert.equal(state.result, 'victory');
        pilot.report.status = 'PASS_NATIVE_ORIGINAL_SOVIET04_BASE_RESTART_GROUND_GOALS_ROMANOV_AND_AIRPORT_VICTORY';
    }
} catch (error) { failure = error; }
await pilot.finish(failure);
