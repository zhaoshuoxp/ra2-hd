import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all03umd.map');
const defendCity = process.argv.includes('--defend-city');
let failure;
try {
    let state = await pilot.open();
    let commands = pilot.commands;
    const configureDefense = () => {
        commands.groundDefenders = ['MTNK', 'MGTK', 'FV', 'E1', 'GGI', 'SNIPE'];
        commands.airDefenders = ['FV', 'GGI'];
        commands.groundPriority = ['YURI', 'VIRUS', 'INIT', 'YTNK', 'LTNK'];
    };
    if (defendCity) {
        configureDefense();
        if (!pilot.report.sourceCheckpoint) await commands.order(['GGI'], 9);
    }
    const snapshot = () => pilot.page.evaluate(() => {
        const g = window.__ra2debug.game;
        return { tick: g.currentTick, power: g.localPlayer.powerTrait.power, drain: g.localPlayer.powerTrait.drain,
            weapons: g.localPlayer.superWeaponsTrait.getAll().map(weapon => ({ name: weapon.name, type: weapon.rules.type,
                status: weapon.status, chargeTicks: weapon.chargeTicks })),
            plants: g.world.getAllObjects().filter(unit => /^CAPOWR/.test(unit.name) && !unit.isDestroyed)
                .map(unit => ({ id: unit.id, name: unit.name, owner: unit.owner.name,
                    tile: [unit.tile.rx, unit.tile.ry], health: unit.healthTrait.health })) };
    });
    (pilot.report.powerStages ??= []).push(await snapshot());
    const group = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game;
        const units = g.localPlayer.getOwnedObjects().filter(unit => unit.isSpawned && !unit.isDestroyed);
        return { tanks: units.filter(unit => ['MTNK', 'MGTK', 'FV'].includes(unit.name) && unit.tile.ry > 120).map(unit => unit.id),
            engineer: units.find(unit => unit.name === 'ENGINEER' && unit.tile.ry > 120)?.id };
    });
    assert(group.engineer !== undefined);
    await commands.order(group.tanks, 4, undefined, [153, 118]);
    await commands.order([group.engineer], 0, undefined, [153, 119]);
    for (let i = 0; i < 150; i++) {
        await commands.step(60, { defend: defendCity });
        const target = await pilot.page.evaluate(() => {
            const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            const plant = g.world.getAllObjects().find(unit => unit.name === 'CAPOWRAC' && !unit.isDestroyed);
            return plant && !shroud.isShrouded(plant.tile, plant.tileElevation) && { id: plant.id, owner: plant.owner.name };
        });
        if (target?.owner === 'Americans') break;
        if (target) await commands.order([group.engineer], 7, target.id);
        if (i % 5 === 0) state = await pilot.observe('original-seattle-fourth-city-power-plant-' + i);
    }
    const acquired = await snapshot(); pilot.report.powerStages.push(acquired);
    assert(acquired.plants.some(plant => plant.name === 'CAPOWRAC' && plant.owner === 'Americans'));
    if (defendCity) await commands.order(group.tanks, 4, undefined, [124, 130]);
    await pilot.restart('Original YR Allied03 fourth city plant, source power and weather charge');
    commands = pilot.commands;
    if (defendCity) configureDefense();
    await pilot.checkpoint('original-seattle-fourth-plant-checkpoint.json');
    for (let i = 0; i < 350; i++) {
        const power = await snapshot();
        if (i % 10 === 0) pilot.report.powerStages.push(power);
        const weather = power.weapons.find(weapon => weapon.type === 2 && weapon.status === 2);
        if (weather) {
            const target = await pilot.page.evaluate(center => {
                const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
                const silo = g.world.getAllObjects().find(unit => unit.name === 'NAMISL' && !unit.isDestroyed);
                if (!silo || shroud.isShrouded(silo.tile, silo.tileElevation)) return;
                const tiles = center ? g.map.tileOccupation.calculateTilesForGameObject(silo.tile, silo) : [silo.tile];
                return { id: silo.id, tile: [Math.round(tiles.reduce((sum, tile) => sum + tile.rx, 0) / tiles.length),
                    Math.round(tiles.reduce((sum, tile) => sum + tile.ry, 0) / tiles.length)] };
            }, defendCity);
            assert(target, 'The original briefing must reveal the nuclear target before ordinary targeting');
            await pilot.page.evaluate(tile => window.__ra2debug.actionsApi.activateSuperWeapon(2,
                { rx: tile[0], ry: tile[1] }), target.tile);
            pilot.report.commands.push({ kind: 'activate-superweapon', type: 2, tile: target.tile });
        }
        await commands.step(90, { defend: defendCity });
        if (i % 5 === 0) {
            state = await pilot.observe('original-seattle-weather-and-nuclear-goal-' + i);
            await pilot.checkpoint('last-seattle-weather-checkpoint.json');
        }
        if (state.result) break;
    }
    state = await pilot.observe('original-seattle-source-result');
    assert.equal(state.result, 'victory');
    if (process.argv.includes('--complete-source-flow')) await pilot.completeResultFlow();
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED03_CITY_PLANT_CAPTURE_POWER_WEATHER_NUCLEAR_GOAL_AND_SOURCE_VICTORY';
} catch (error) { failure = error; }
await pilot.finish(failure);
