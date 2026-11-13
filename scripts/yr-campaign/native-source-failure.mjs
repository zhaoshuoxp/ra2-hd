import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], process.argv[3]);
let failure;
try {
    let state = await pilot.open();
    pilot.report.scope = 'Negative branch using normal building sales and deliberate ordinary movement into original hostile defenses. Source-guided navigation reads original positions; no source, actor, health, owner, trigger, RNG or result edits. The original Lose action must execute.';
    const sale = await pilot.page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        const buildings = g.localPlayer.getOwnedObjects().filter(unit => unit.isBuilding()
            && unit.isSpawned && !unit.isDestroyed && !unit.rules.unsellable);
        for (const building of buildings) d.actionsApi.sellObject(building.id);
        return buildings.map(unit => ({ id: unit.id, name: unit.name }));
    });
    pilot.report.commands.push({ kind: 'ordinary-building-sales', buildings: sale });
    const safeStep = async ticks => {
        try { await pilot.commands.step(ticks, { defend: false, repair: false }); }
        catch (error) { if (!error.message.startsWith('Original source defeat at tick')) throw error; }
    };
    await safeStep(180);
    for (let i = 0; i < 600 && !state.result; i++) {
        if (i % 10 === 0) {
            const plan = await pilot.page.evaluate(() => {
                const g = window.__ra2debug.game;
                const own = (g.localPlayer.campaignControlledPlayers ?? [g.localPlayer])
                    .flatMap(owner => owner.getOwnedObjects()).filter(unit => unit.isUnit() && unit.isSpawned && !unit.isDestroyed);
                const enemies = g.world.getAllObjects().filter(unit => unit.isTechno() && unit.isSpawned
                    && !unit.isDestroyed && unit.primaryWeapon && !g.areFriendly(unit, { owner: g.localPlayer }));
                const scored = enemies.map(unit => ({ unit, density: enemies.filter(other =>
                    Math.hypot(other.tile.rx - unit.tile.rx, other.tile.ry - unit.tile.ry) < 10).length }))
                    .sort((a, b) => b.density - a.density || a.unit.id - b.unit.id);
                const anchor = scored[0]?.unit;
                if (!anchor) return { tick: g.currentTick, orders: [] };
                const orders = own.map(unit => {
                    const tiles = g.map.tiles.getAll().filter(tile => g.map.mapBounds.isWithinPlayerBounds(tile)
                        && Math.hypot(tile.rx - anchor.tile.rx, tile.ry - anchor.tile.ry) < 8
                        && g.map.terrain.getPassableSpeed(tile, unit.rules.speedType, false, false) > 0
                        && !g.map.getObjectsOnTile(tile).some(object => object.isBuilding() && !object.isDestroyed));
                    const target = tiles.sort((a, b) => Math.hypot(a.rx - anchor.tile.rx, a.ry - anchor.tile.ry)
                        - Math.hypot(b.rx - anchor.tile.rx, b.ry - anchor.tile.ry))[0];
                    return target && { id: unit.id, name: unit.name, tile: [target.rx, target.ry] };
                }).filter(Boolean);
                return { tick: g.currentTick, anchor: { id: anchor.id, name: anchor.name,
                    tile: [anchor.tile.rx, anchor.tile.ry] }, orders };
            });
            for (const order of plan.orders) await pilot.commands.order([order.id], 0, undefined, order.tile);
            (pilot.report.negativeNavigation ??= []).push(plan);
        }
        await safeStep(90);
        if (i % 10 === 0) state = await pilot.observe('ordinary-exposure-to-original-hostile-defenses-' + i);
        if (await pilot.page.evaluate(() => !!window.__ra2debug.game.campaign.result)) break;
    }
    state = await pilot.observe('original-source-negative-result');
    assert.equal(state.result, 'defeat');
    pilot.report.originalLose = await pilot.page.evaluate(() => {
        const c = window.__ra2debug.game.campaign;
        return c.trace.filter(action => [2, 68].includes(action.opcode));
    });
    assert(pilot.report.originalLose.length > 0, 'The original source loss action must execute');
    assert.deepEqual(pilot.report.errors, []); assert.deepEqual(pilot.report.failedResources, []);
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_SOURCE_LOSS_AFTER_ORDINARY_SALES_AND_HOSTILE_EXPOSURE';
} catch (error) { failure = error; }
await pilot.finish(failure);
