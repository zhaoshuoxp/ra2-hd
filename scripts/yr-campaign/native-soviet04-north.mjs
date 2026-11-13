import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov04dmd.map');
let failure;
try {
    let state = await pilot.open();
    const commands = pilot.commands; commands.groundDefenders = ['HTNK', 'E2']; commands.airDefenders = [];
    const shield = await pilot.page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        const weapons = g.localPlayer.superWeaponsTrait.getAll().map(weapon => ({ name: weapon.name,
            type: weapon.rules.type, status: weapon.status, timer: weapon.timer?.getTicksLeft?.() }));
        const weapon = g.localPlayer.superWeaponsTrait.get('IronCurtainSpecial');
        const tanks = g.localPlayer.getOwnedObjects().filter(unit => unit.name === 'APOC' && unit.isSpawned && !unit.isDestroyed);
        const target = tanks[Math.floor(tanks.length / 2)];
        if (weapon?.status === 2 && target) d.actionsApi.activateSuperWeapon(weapon.rules.type,
            { rx: target.tile.rx, ry: target.tile.ry });
        return { weapons, lowPower: g.localPlayer.powerTrait.isLowPower(), tick: g.currentTick,
            cast: weapon?.status === 2 && !!target, target: target && [target.tile.rx, target.tile.ry] };
    });
    pilot.report.originalIronCurtain = shield;
    assert(shield.cast, 'The original paid Iron Curtain must be ready and powered');
    pilot.report.commands.push({ kind: 'ordinary-iron-curtain-escort', ...shield });
    const targets = async () => pilot.page.evaluate(() => {
        const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
        const visible = unit => g.map.tileOccupation.calculateTilesForGameObject(unit.tile, unit)
            .some(tile => !shroud.isShrouded(tile, unit.tileElevation));
        const units = g.world.getAllObjects().filter(unit => unit.isTechno() && unit.isSpawned && !unit.isDestroyed && visible(unit));
        const hero = units.find(unit => unit.name === 'RMNV');
        const controller = hero?.mindControllableTrait?.getController();
        const yard = units.find(unit => unit.name === 'YACNST');
        const tower = units.filter(unit => unit.name === 'YAPSYT' && unit.owner.name === 'Africans')
            .sort((a, b) => a.tile.rx - b.tile.rx)[0];
        return { hero: hero && { id: hero.id, owner: hero.owner.name }, controller: controller?.id,
            yard: yard?.id, tower: tower?.id };
    });
    for (let i = 0; i < 160 && !state.result; i++) {
        const current = await targets();
        if (current.controller !== undefined) await commands.order(['APOC'], 3, current.controller);
        else if (current.yard !== undefined) await commands.order(['APOC'], 2, current.yard);
        if (current.tower !== undefined) await commands.order(['V3'], 2, current.tower);
        else if (current.yard !== undefined) await commands.order(['V3'], 2, current.yard);
        if (current.hero?.owner === 'Germans') await commands.order([current.hero.id], 0, undefined, [122, 45]);
        await commands.step(15);
        if (i % 5 === 0) state = await pilot.observe('original-controller-yard-and-towers-' + i);
        if (!current.controller && !current.yard && current.hero?.owner === 'Germans') break;
    }
    state = await pilot.observe('original-northern-key-objects');
    await pilot.checkpoint('original-freed-romanov-and-northern-yard-checkpoint.json');
    const objectives = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game, c = g.campaign;
        return { local1: c.machine.variables.get('1'), safe: c.machine.variables.get('18'),
            local27: c.machine.variables.get('27'), local28: c.machine.variables.get('28'),
            hero: g.getAllPlayers().flatMap(owner => owner.getOwnedObjects(true)).filter(unit => unit.name === 'RMNV')
                .map(unit => ({ id: unit.id, owner: unit.owner.name, health: unit.healthTrait.health })) };
    });
    pilot.report.originalNorthernObjectives = objectives;
    assert(objectives.hero.some(unit => unit.owner === 'Germans'), 'The original captured Romanov was not freed');
    assert(objectives.safe, 'The original safe-to-evacuate predicate did not complete');
    await commands.order(['RMNV'], 0, undefined, [103, 18]);
    for (let i = 0; i < 200 && state.result !== 'victory'; i++) {
        await commands.attackVisible(['APOC', 'V3'], 'Arabs', 'buildings');
        await commands.step(30);
        if (i % 5 === 0) state = await pilot.observe('original-safe-airport-extraction-' + i);
    }
    state = await pilot.observe('original-airport-result'); assert.equal(state.result, 'victory');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_SOVIET04_CAPTURE_SCRIPTED_TRANSFER_RELEASE_NORTHERN_GOALS_AND_AIRPORT_VICTORY';
} catch (error) { failure = error; }
await pilot.finish(failure);
