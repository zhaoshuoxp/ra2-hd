import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all03umd.map');
let failure;
try {
    const state = await pilot.open();
    const tanks = state.own.filter(u => ['MTNK', 'MGTK', 'FV'].includes(u.name) && u.tile[1] > 120).map(u => u.id);
    assert(tanks.length >= 3);
    await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game;
        window.__automaticShots = [];
        g.events.subscribe(2, e => window.__automaticShots.push({ tick: g.currentTick,
            id: e.gameObject?.id, name: e.gameObject?.name, owner: e.gameObject?.owner?.name,
            target: e.target?.obj?.id, weapon: e.weapon?.rules.name }));
    });
    await pilot.commands.order(tanks, 0, undefined, [92, 130]);
    await pilot.commands.step(650, { defend: false });
    await pilot.commands.order(tanks, 11);
    for (let i = 0; i < 10; i++) {
        await pilot.commands.step(90, { defend: false });
        await pilot.observe('uncommanded-hostile-acquisition-' + i);
    }
    pilot.report.autofire = await pilot.page.evaluate(ids => {
        const g = window.__ra2debug.game, own = g.localPlayer.getOwnedObjects();
        return { shots: window.__automaticShots, tanks: own.filter(u => ids.includes(u.id)).map(u => ({
            id: u.id, name: u.name, tile: [u.tile.rx, u.tile.ry], tasks: u.unitOrderTrait.getTasks().map(t => t.constructor.name),
            target: u.attackTrait.currentTarget?.obj?.id, acquisition: u.attackTrait.shouldPassiveAcquire(u, g),
            enemies: g.world.getAllObjects().filter(v => v.isTechno() && v.isSpawned && !g.areFriendly(u, v)
                && Math.hypot(v.tile.rx - u.tile.rx, v.tile.ry - u.tile.ry) < 12).map(v => {
                    const weapon = u.attackTrait.selectWeaponVersus(u, v, g, false, true);
                    return { id: v.id, name: v.name, owner: v.owner.name, tile: [v.tile.rx, v.tile.ry],
                        eligible: u.attackTrait.canPassiveAcquire(v, g), weapon: weapon?.rules.name,
                        range: weapon && u.attackTrait.rangeHelper.isInWeaponRange(u, v, weapon, g.rules),
                        los: weapon && u.attackTrait.losHelper.hasLineOfSight(u, v, weapon),
                        threat: v.rules.threatPosed, neutral: v.owner.isNeutral };
                }) })) };
    }, tanks);
    assert(pilot.report.autofire.shots.some(e => tanks.includes(e.id)), 'Source tanks must acquire an enemy without an attack order');
    pilot.report.status = 'PASS_ORIGINAL_ALLIED03_TANK_AUTOMATIC_FIRE_AFTER_ORDINARY_MOVE_AND_STOP';
} catch (error) { failure = error; }
await pilot.finish(failure);
