import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all04dmd.map');
let failure;
try {
    let state = await pilot.open();
    const commands = pilot.commands;
    commands.groundDefenders = ['TNKD', 'MTNK', 'E1', 'GGI', 'ADOG'];
    const helicopter = state.own.find(unit => unit.name === 'SHAD'); assert(helicopter);
    if (!helicopter.passengers?.length) await commands.order(['TANY'], 17, helicopter.id);
    await commands.step(180);
    state = await pilot.observe('original-tanya-boards-source-nighthawk');
    assert(state.own.find(unit => unit.id === helicopter.id)?.passengers?.length);
    const landing = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game;
        const transport = g.localPlayer.getOwnedObjects().find(unit => unit.name === 'SHAD' && !unit.isDestroyed);
        const towers = g.world.getAllObjects().filter(unit => unit.name === 'YAGGUN' && !unit.isDestroyed);
        const tile = g.map.tiles.getAll().filter(tile => g.map.mapBounds.isWithinPlayerBounds(tile)
            && Math.hypot(tile.rx - 83, tile.ry - 117) < 12
            && g.map.getTileZone(tile) !== 2
            && g.map.terrain.getPassableSpeed(tile, 0, true, false) > 0
            && !g.map.terrain.findObstacles({ tile, onBridge: false }, transport).length
            && !g.map.getGroundObjectsOnTile(tile).some(object => object.isBuilding() && !object.isDestroyed)
            && towers.every(tower => Math.hypot(tower.tile.rx - tile.rx, tower.tile.ry - tile.ry) > 11))
            .sort((a, b) => Math.hypot(a.rx - 83, a.ry - 117) - Math.hypot(b.rx - 83, b.ry - 117))[0];
        if (!tile) throw Error('No source-guided safe ordinary landing terrain');
        return [tile.rx, tile.ry];
    });
    pilot.report.landingCell = landing;
    await commands.order(['SHAD'], 0, undefined, landing);
    for (const [name, near] of [['GAPOWR', [84, 166]], ['GAREFN', [85, 157]],
        ['GAPILE', [77, 160]], ['GAWEAP', [87, 162]]]) {
        if (!state.own.some(unit => unit.name === name)) await commands.build(name, near);
        state = await pilot.observe('ordinary-egypt-base-' + name);
    }
    if (state.own.filter(unit => unit.name === 'MTNK').length < 5) await commands.queue('MTNK', 5);
    await commands.step(360);
    await commands.order(['SHAD'], 10); await commands.step(600);
    state = await pilot.observe('original-tanya-nighthawk-landing');
    pilot.report.landingState = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game;
        const unit = g.localPlayer.getOwnedObjects().find(unit => unit.name === 'SHAD' && !unit.isDestroyed);
        return unit && { tile: [unit.tile.rx, unit.tile.ry], zone: unit.zone, elevation: unit.tileElevation,
            footTerrain: g.map.terrain.getPassableSpeed(unit.tile, 0, false, unit.onBridge),
            hoverTerrain: g.map.terrain.getPassableSpeed(unit.tile, 3, false, unit.onBridge),
            task: unit.unitOrderTrait.getCurrentTask() && { name: unit.unitOrderTrait.getCurrentTask().constructor.name,
                preventLanding: unit.unitOrderTrait.getCurrentTask().preventLanding },
            passengers: unit.transportTrait.units.map(passenger => passenger.name) };
    });
    assert(state.own.some(unit => unit.name === 'TANY' && unit.spawned));
    await pilot.checkpoint('original-tanya-pyramid-approach-checkpoint.json');
    if (process.argv.includes('--landing-only')) {
        await pilot.restart('Original YR Allied04 paid base, Nighthawk landing and surviving Tanya');
        pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED04_PAID_BASE_TANYA_LANDING_AND_EXACT_RESTART_GOALS_PENDING';
    } else {
        const goals = [
            ['YAGGUN', [96, 107]], ['YAGGUN', [97, 97]], ['YAPPET', [83, 93]],
            ['YAPOWR', [92, 102]], ['YAPOWR', [92, 98]], ['YAPOWR', [92, 94]], ['YAPOWR', [92, 90]],
            ['YAGGUN', [70, 97]], ['YAGGUN', [71, 107]],
            ['YAPOWR', [74, 102]], ['YAPOWR', [74, 98]], ['YAPOWR', [74, 94]], ['YAPOWR', [74, 90]],
        ];
        for (const [name, tile] of goals) {
            let complete = false, recovering = false;
            for (let i = 0; i < 450; i++) {
                const plan = await pilot.page.evaluate(({ name, tile }) => {
                    const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
                    const hero = g.localPlayer.getOwnedObjects().find(unit => unit.name === 'TANY' && unit.isSpawned && !unit.isDestroyed);
                    if (!hero) throw Error('The ordinary original Tanya was lost');
                    const objective = g.world.getAllObjects().find(unit => unit.name === name && !unit.isDestroyed
                        && unit.tile.rx === tile[0] && unit.tile.ry === tile[1]);
                    if (!objective) return { complete: true, health: hero.healthTrait.health };
                    const visible = g.map.tileOccupation.calculateTilesForGameObject(objective.tile, objective)
                        .some(cell => !shroud.isShrouded(cell, objective.tileElevation));
                    const infantry = g.world.getAllObjects().filter(unit => unit.isInfantry() && unit.isSpawned && !unit.isDestroyed
                        && unit.owner !== g.localPlayer && !unit.owner.isNeutral && !g.alliances.areAllied(g.localPlayer, unit.owner)
                        && !shroud.isShrouded(unit.tile, unit.tileElevation)
                        && Math.hypot(unit.tile.rx - hero.tile.rx, unit.tile.ry - hero.tile.ry) < 6)
                        .sort((a, b) => a.id - b.id)[0];
                    return { health: hero.healthTrait.health, visible, target: objective.id, infantry: infantry?.id };
                }, { name, tile });
                if (plan.complete) { complete = true; break; }
                recovering = plan.health < 40 || recovering && plan.health < 90;
                if (recovering) await commands.order(['TANY'], 0, undefined, [84, 100]);
                else if (plan.infantry !== undefined) await commands.order(['TANY'], 2, plan.infantry);
                else if (plan.visible) await commands.order(['TANY'], 2, plan.target);
                else await commands.order(['TANY'], 0, undefined, [tile[0] > 85 ? tile[0] - 5 : tile[0] + 5, tile[1] + 3]);
                await commands.step(30);
                if (i % 12 === 0) state = await pilot.observe('original-tanya-c4-' + name + '-' + tile.join('-') + '-' + i);
            }
            assert(complete, 'The original Tanya objective remains: ' + name + ' ' + tile.join(','));
            state = await pilot.observe('original-tanya-cleared-' + name + '-' + tile.join('-'));
            await pilot.checkpoint('last-tanya-pyramid-progress-checkpoint.json');
        }
        await commands.step(600);
        state = await pilot.observe('original-egypt-prison-power-and-einstein-rescue');
        pilot.report.rescueFlags = await pilot.page.evaluate(() =>
            Object.fromEntries(window.__ra2debug.game.campaign.machine.variables));
        assert(pilot.report.rescueFlags['3'], 'The original Einstein rescue objective did not complete');
        await pilot.restart('Original YR Allied04 Tanya infiltration, prison power and Einstein rescue');
        await pilot.checkpoint('original-einstein-rescue-checkpoint.json');
        pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED04_TANYA_NIGHTHAWK_C4_POWER_DOMINATOR_AND_EINSTEIN_RESCUE_STAGE';
    }
} catch (error) { failure = error; }
await pilot.finish(failure);
