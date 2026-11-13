import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';
import { orderGroundColumn } from './ordinary-column.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov04dmd.map');
let failure;
try {
    let state = await pilot.open();
    let commands = pilot.commands; commands.groundDefenders = ['HTNK', 'E2']; commands.airDefenders = [];
    await commands.order(['RMNV'], 11);
    if (!process.argv.includes('--west-only')) {
        for (let i = 0; i < 110; i++) {
            const target = await pilot.page.evaluate(() => {
                const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
                const names = ['YAPSYT', 'YAGGUN', 'YABRCK'];
                const unit = g.world.getAllObjects().filter(unit => names.includes(unit.name) && unit.isSpawned && !unit.isDestroyed
                    && unit.tile.rx > 80 && unit.tile.ry < 40
                    && !shroud.isShrouded(unit.tile, unit.tileElevation))
                    .sort((a, b) => names.indexOf(a.name) - names.indexOf(b.name) || a.id - b.id)[0];
                return unit && { id: unit.id, name: unit.name };
            });
            if (!target) break;
            await commands.order(['V3'], 2, target.id);
            await commands.order(['APOC'], 4, undefined, [99, 29]);
            await commands.step(30);
            if (i % 5 === 0) state = await pilot.observe('ordinary-northern-evacuation-defenses-' + i);
        }
        state = await pilot.observe('original-northern-defenses-cleared');
        await pilot.checkpoint('original-cleared-north-checkpoint.json');
    }
    for (const goal of process.argv.includes('--direct-barracks') ? [] : [[90, 55], [70, 65], [54, 81], [49, 92]]) {
        for (let i = 0; i < 70; i++) {
            const readiness = await pilot.page.evaluate(() => {
                const g = window.__ra2debug.game, weapon = g.localPlayer.superWeaponsTrait.get('IronCurtainSpecial');
                return { ready: weapon?.status === 2, tick: g.currentTick };
            });
            const plan = await orderGroundColumn(commands, goal); assert(plan, 'Ordinary western escort was lost');
            if (goal[0] === 49 && readiness.ready) {
                const shield = await pilot.page.evaluate(() => {
                    const d = window.__ra2debug, g = d.game, weapon = g.localPlayer.superWeaponsTrait.get('IronCurtainSpecial');
                    const units = g.localPlayer.getOwnedObjects().filter(unit => unit.name === 'APOC' && unit.isSpawned && !unit.isDestroyed);
                    const tile = units[0].tile;
                    d.actionsApi.activateSuperWeapon(weapon.rules.type, { rx: tile.rx, ry: tile.ry });
                    return { tick: g.currentTick, ids: units.map(unit => unit.id), tile: [tile.rx, tile.ry] };
                });
                pilot.report.commands.push({ kind: 'ordinary-iron-curtain-western-escort', ...shield });
            }
            await commands.step(60);
            if (i % 5 === 0) state = await pilot.observe('ordinary-western-base-approach-' + goal.join('-') + '-' + i);
            if (plan.distance < 5) break;
        }
        await pilot.checkpoint('last-western-approach-checkpoint.json');
    }
    if (process.argv.includes('--direct-barracks')) {
        const shield = await pilot.page.evaluate(() => {
            const d = window.__ra2debug, g = d.game, weapon = g.localPlayer.superWeaponsTrait.get('IronCurtainSpecial');
            const unit = g.localPlayer.getOwnedObjects().find(unit => unit.name === 'APOC' && unit.isSpawned && !unit.isDestroyed);
            if (weapon?.status !== 2 || !unit) throw Error('Ordinary western assault requires its ready Iron Curtain');
            d.actionsApi.activateSuperWeapon(weapon.rules.type, { rx: unit.tile.rx, ry: unit.tile.ry });
            return { tick: g.currentTick, tile: [unit.tile.rx, unit.tile.ry] };
        });
        pilot.report.commands.push({ kind: 'ordinary-iron-curtain-western-barracks', ...shield });
        await commands.order(['APOC'], 0, undefined, [42, 92]); await commands.step(75);
    }
    for (let i = 0; i < 140; i++) {
        const target = await pilot.page.evaluate(() => {
            const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            return g.world.getAllObjects().find(unit => unit.name === 'YABRCK' && unit.owner.name === 'Alliance'
                && unit.isSpawned && !unit.isDestroyed && !shroud.isShrouded(unit.tile, unit.tileElevation))?.id;
        });
        if (target !== undefined) await commands.order(['V3', 'APOC'], 2, target);
        await commands.step(30); state = await pilot.observe('original-western-barracks-objective-' + i);
        const safe = await pilot.page.evaluate(() => window.__ra2debug.game.campaign.machine.variables.get('18'));
        if (safe) break;
    }
    pilot.report.safe = await pilot.page.evaluate(() => window.__ra2debug.game.campaign.machine.variables.get('18'));
    assert(pilot.report.safe, 'The original two-base safety predicate remains incomplete');
    const controlled = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game;
        const hero = g.getAllPlayers().flatMap(owner => owner.getOwnedObjects(true)).find(unit => unit.name === 'RMNV' && !unit.isDestroyed);
        return hero?.mindControllableTrait?.getController()?.id;
    });
    if (controlled !== undefined) {
        const sold = await pilot.page.evaluate(() => {
            const d = window.__ra2debug, g = d.game;
            const tech = [...g.localPlayer.buildings].find(unit => unit.name === 'NATECH' && !unit.isDestroyed);
            if (!tech) throw Error('Ordinary drone production needs the existing paid tech-center resale');
            d.actionsApi.sellBuilding(tech.id); return tech.id;
        });
        pilot.report.commands.push({ kind: 'ordinary-sell-paid-tech-center', id: sold });
        await commands.step(90); await commands.queue('DRON', 2);
        for (let i = 0; i < 80; i++) {
            await commands.step(60); state = await pilot.observe('ordinary-final-controller-scout-production-' + i);
            if (state.own.filter(unit => unit.name === 'DRON').length >= 2) break;
        }
        for (const goal of [[110, 115], [135, 88], [138, 70], [135, 60], [125, 50], [118, 33]]) {
            await commands.order(['DRON'], 0, undefined, goal);
            for (let i = 0; i < 70; i++) {
                const seen = await pilot.page.evaluate(id => {
                    const g = window.__ra2debug.game, unit = g.world.getAllObjects().find(unit => unit.id === id && !unit.isDestroyed);
                    if (!unit) return false;
                    const drones = g.localPlayer.getOwnedObjects().filter(unit => unit.name === 'DRON' && unit.isSpawned && !unit.isDestroyed);
                    return !g.mapShroudTrait.getPlayerShroud(g.localPlayer).isShrouded(unit.tile, unit.tileElevation)
                        && drones.some(drone => Math.hypot(drone.tile.rx - unit.tile.rx, drone.tile.ry - unit.tile.ry) < 12);
                }, controlled);
                if (seen) await commands.order(['DRON'], 3, controlled);
                await commands.step(30); state = await pilot.observe('ordinary-final-controller-recovery-' + goal.join('-') + '-' + i);
                if (state.own.some(unit => unit.name === 'RMNV')) break;
                if (state.own.some(unit => unit.name === 'DRON' && Math.hypot(unit.tile[0] - goal[0], unit.tile[1] - goal[1]) < 2)) break;
            }
            if (state.own.some(unit => unit.name === 'RMNV')) break;
        }
        assert(state.own.some(unit => unit.name === 'RMNV'), 'Ordinary final controller recovery did not complete');
    }
    await pilot.restart('Original YR Soviet04 freed Romanov and both original base safety goals');
    commands = pilot.commands;
    await commands.order(['RMNV'], 0, undefined, [103, 18]);
    for (let i = 0; i < 240 && state.result !== 'victory'; i++) {
        await commands.step(45);
        if (i % 5 === 0) state = await pilot.observe('original-safe-romanov-airport-' + i);
    }
    state = await pilot.observe('original-complete-romanov-result'); assert.equal(state.result, 'victory');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_SOVIET04_DISCOVERY_CAPTURE_RELEASE_BOTH_BASE_SAFETY_GOALS_RESTART_AND_AIRPORT_VICTORY';
} catch (error) { failure = error; }
await pilot.finish(failure);
