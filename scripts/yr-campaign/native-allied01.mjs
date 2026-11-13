import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all01umd.map');
let failure;
try {
    let state = await pilot.open();
    const commands = pilot.commands; commands.groundDefenders = ['E1', 'GGI']; commands.airDefenders = ['GGI'];
    await commands.order(['FV'], 10); await commands.step(90);
    await commands.queue('ENGINEER', 8);
    for (let i = 0; i < 100; i++) {
        await commands.step(60); state = await pilot.observe('ordinary-city-engineer-production-' + i);
        if (state.own.filter(unit => unit.name === 'ENGINEER' && unit.spawned).length >= 8) break;
    }
    const plants = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game;
        return g.world.getAllObjects().filter(unit => /^CAPOWR0[1-8]$/.test(unit.name) && unit.isSpawned && !unit.isDestroyed)
            .map(unit => ({ id: unit.id, name: unit.name, tile: [unit.tile.rx, unit.tile.ry] }))
            .sort((a, b) => a.name.localeCompare(b.name));
    });
    pilot.report.originalPowerPlants = plants;
    assert(plants.length >= 7, 'Original city power plants are absent');
    for (const plant of plants) {
        if (await pilot.page.evaluate(() => window.__ra2debug.game.campaign.machine.variables.get('47'))) break;
        const engineer = await pilot.page.evaluate(() => {
            const unit = window.__ra2debug.game.localPlayer.getOwnedObjects()
                .find(unit => unit.name === 'ENGINEER' && unit.isSpawned && !unit.isDestroyed);
            return unit && { id: unit.id };
        });
        assert(engineer, 'An ordinary paid engineer is required for the original capturable plant');
        await commands.order(['MTNK', 'MGTK'], 4, undefined, plant.tile);
        await commands.order([engineer.id], 0, undefined, plant.tile);
        let assigned = false;
        for (let i = 0; i < 140; i++) {
            const target = await pilot.page.evaluate(id => {
                const g = window.__ra2debug.game, plant = g.world.getAllObjects().find(unit => unit.id === id && !unit.isDestroyed);
                const shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
                return plant && { visible: g.map.tileOccupation.calculateTilesForGameObject(plant.tile, plant)
                    .some(tile => !shroud.isShrouded(tile, plant.tileElevation)), index: plant.rules.index,
                    capturable: plant.rules.capturable, owner: plant.owner.name };
            }, plant.id);
            if (target?.visible && !assigned) { await commands.order([engineer.id], 7, plant.id); assigned = true; }
            await commands.step(60, { defend: false });
            if (i % 5 === 0) state = await pilot.observe('original-city-power-approach-' + plant.name + '-' + i);
            const progress = await pilot.page.evaluate(id => {
                const g = window.__ra2debug.game, plant = g.world.getAllObjects().find(unit => unit.id === id && !unit.isDestroyed);
                return { tick: g.currentTick, owner: plant?.owner.name, captured: plant?.owner === g.localPlayer,
                    locked: g.campaign.inputLocked, online: !!g.campaign.machine.variables.get('47'),
                    power: g.localPlayer.powerTrait.power, drain: g.localPlayer.powerTrait.drain,
                    plantPower: plant?.rules.power,
                    ownedPowerSources: [...g.localPlayer.buildings].filter(unit => unit.rules.power > 0)
                        .map(unit => ({ name: unit.name, power: unit.rules.power, health: unit.healthTrait.health })) };
            }, plant.id);
            if (progress.captured || progress.online || progress.locked) {
                (pilot.report.originalPowerProgress ??= []).push({ plant: plant.name, ...progress }); break;
            }
        }
        await pilot.checkpoint('last-original-power-checkpoint.json');
        await pilot.checkpoint('original-' + plant.name.toLowerCase() + '-progress-checkpoint.json');
        if (await pilot.page.evaluate(() => window.__ra2debug.game.campaign.inputLocked)) break;
    }
    for (let i = 0; i < 120; i++) {
        const online = await pilot.page.evaluate(() => !!window.__ra2debug.game.campaign.machine.variables.get('47'));
        if (online) break;
        await commands.step(60, { defend: false });
        if (i % 5 === 0) state = await pilot.observe('original-time-machine-power-online-' + i);
    }
    assert(await pilot.page.evaluate(() => window.__ra2debug.game.campaign.machine.variables.get('47')),
        'Original captured power has not enabled the time machine');
    await pilot.restart('Original YR Allied01 city power plants and enabled time machine');
    await pilot.checkpoint('original-powered-time-machine-checkpoint.json');
    pilot.report.status = `PASS_NATIVE_ORIGINAL_ALLIED01_${pilot.report.launch.difficulty.toUpperCase()}_CITY_POWER_TIME_MACHINE_AND_EXACT_RESTART_GOALS_PENDING`;
} catch (error) { failure = error; }
await pilot.finish(failure);
