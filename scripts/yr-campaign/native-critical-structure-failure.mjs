import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], process.argv[3]);
const identity = process.argv[4];
let failure;
try {
    await pilot.open();
    pilot.report.scope = 'Original critical-structure failure through ordinary source-guided movement and player force-fire on the visible structure foundation. The original source identity, health, rules, triggers, owners and result remain unchanged.';
    const target = await pilot.page.evaluate(name => {
        const g = window.__ra2debug.game;
        const unit = g.world.getAllObjects().find(unit => unit.name === name && !unit.isDestroyed);
        if (!unit) throw Error('Original critical structure is absent');
        const foundation = unit.art.foundation;
        return { id: unit.id, name: unit.name, tile: [unit.tile.rx, unit.tile.ry],
            center: [unit.tile.rx + Math.floor(foundation.width / 2), unit.tile.ry + Math.floor(foundation.height / 2)] };
    }, identity);
    pilot.report.criticalStructure = target;
    const groups = await pilot.page.evaluate(target => {
        const g = window.__ra2debug.game;
        return g.localPlayer.getOwnedObjects().filter(unit => unit.isUnit() && unit.isSpawned && !unit.isDestroyed
            && unit.primaryWeapon && unit.zone !== 1 && !unit.rules.naval).map(unit => {
            const tiles = g.map.tiles.getAll().filter(tile => g.map.mapBounds.isWithinPlayerBounds(tile)
                && Math.hypot(tile.rx - target[0], tile.ry - target[1]) < 7
                && g.map.terrain.getPassableSpeed(tile, unit.rules.speedType, false, false) > 0
                && !g.map.getObjectsOnTile(tile).some(object => object.isBuilding() && !object.isDestroyed));
            const tile = tiles.sort((a, b) => Math.hypot(a.rx - unit.tile.rx, a.ry - unit.tile.ry)
                - Math.hypot(b.rx - unit.tile.rx, b.ry - unit.tile.ry))[0];
            return tile && { id: unit.id, name: unit.name, tile: [tile.rx, tile.ry] };
        }).filter(Boolean);
    }, target.center);
    assert(groups.length);
    for (const group of groups) await pilot.commands.order([group.id], 0, undefined, group.tile);
    let assigned = false;
    for (let i = 0; i < 400; i++) {
        const visible = await pilot.page.evaluate(id => {
            const g = window.__ra2debug.game, unit = g.world.getAllObjects().find(unit => unit.id === id);
            if (!unit || unit.isDestroyed) return false;
            const shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            return g.map.tileOccupation.calculateTilesForGameObject(unit.tile, unit)
                .some(tile => !shroud.isShrouded(tile, unit.tileElevation));
        }, target.id);
        if (visible && !assigned) {
            await pilot.commands.order(groups.map(unit => unit.id), 3, undefined, target.center); assigned = true;
        }
        try { await pilot.commands.step(90, { defend: false, repair: false }); }
        catch (error) { if (!error.message.startsWith('Original source defeat at tick')) throw error; }
        if (i % 10 === 0) await pilot.observe('ordinary-visible-critical-structure-force-fire-' + i);
        if (await pilot.page.evaluate(() => !!window.__ra2debug.game.campaign.result)) break;
    }
    const state = await pilot.observe('original-critical-structure-source-failure');
    assert(assigned); assert.equal(state.result, 'defeat');
    pilot.report.originalLose = await pilot.page.evaluate(() => window.__ra2debug.game.campaign.trace
        .filter(action => [2, 68].includes(action.opcode)));
    assert(pilot.report.originalLose.length);
    assert.deepEqual(pilot.report.errors, []); assert.deepEqual(pilot.report.failedResources, []);
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_CRITICAL_STRUCTURE_DESTRUCTION_AND_SOURCE_LOSS';
} catch (error) { failure = error; }
await pilot.finish(failure);
