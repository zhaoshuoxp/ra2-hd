import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, worldState, stepWorld } from '../m3-2/native-session.mjs';
import { closeCampaignMenuPaused } from '../campaign-completion/named-save-restart.mjs';

const out = path.resolve(process.argv[2]), checkpoint = JSON.parse(await fs.readFile(path.resolve(process.argv[3])));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [],
    scope: 'Read-only source terrain, native topology, objective visibility and weapon inspection after exact checkpoint comparison. No source/actor edits or map reveal; not mission acceptance.' };
let session;
try {
    session = await campaignSession(out, report, { edition: 'yr', density: 0 });
    await session.page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22)
        .launchDiagnostic(checkpoint, checkpoint.identity.mission), checkpoint);
    await session.page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
        && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), checkpoint.tick, { timeout: 180000 });
    const restored = await worldState(session.page);
    assert.deepEqual({ worldHash: restored.hash, rng: restored.rng, mission: restored.mission,
        world: restored.world, pendingCallbacks: restored.pendingCallbacks }, checkpoint.expected);
    await closeCampaignMenuPaused(session.page);
    await session.page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setPaused(true));
    const unitName = process.argv.find(value => value.startsWith('--unit='))?.slice(7) ?? 'APOC';
    const goalNames = (process.argv.find(value => value.startsWith('--goals='))?.slice(8) ?? 'CALAB,GACSPH').split(',');
    report.topology = await session.page.evaluate(({ unitName, goalNames }) => {
        const g = window.__ra2debug.game, unit = g.localPlayer.getOwnedObjects(true).find(unit => unit.name === unitName);
        if (!unit) throw Error('Original topology observer requires the requested player unit: ' + unitName);
        const shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer), terrain = g.map.terrain;
        const islands = terrain.getIslandIdMap(unit.rules.speedType, false);
        const point = tile => tile && [tile.rx, tile.ry, tile.z];
        const describe = object => ({ id: object.id, name: object.name, owner: object.owner?.name,
            neutral: object.owner?.isNeutral, allied: g.alliances.areAllied(g.localPlayer, object.owner),
            tile: point(object.tile), spawned: object.isSpawned, health: object.healthTrait?.health,
            visible: object.tile && !shroud.isShrouded(object.tile, object.tileElevation),
            primary: object.primaryWeapon && { name: object.primaryWeapon.rules.name, range: object.primaryWeapon.rules.range },
            secondary: object.secondaryWeapon && { name: object.secondaryWeapon.rules.name, range: object.secondaryWeapon.rules.range },
            elite: object.veteranTrait?.isElite(),
            attackTarget: object.attackTrait?.currentTarget?.obj && {
                id: object.attackTrait.currentTarget.obj.id, name: object.attackTrait.currentTarget.obj.name },
            airstrike: object.airstrikeTrait && { readyAt: object.airstrikeTrait.readyAt,
                target: object.airstrikeTrait.target?.id,
                planes: object.airstrikeTrait.planes.map(({ plane }) => ({ id: plane.id, name: plane.name,
                    health: plane.healthTrait?.health, tile: point(plane.tile), spawned: plane.isSpawned,
                    destroyed: plane.isDestroyed })) } });
        return { tick: g.currentTick, localBounds: g.map.mapBounds.getRawLocalSize(),
            localPlayer: { name: g.localPlayer.name, power: g.localPlayer.powerTrait.power, drain: g.localPlayer.powerTrait.drain,
                weapons: g.localPlayer.superWeaponsTrait.getAll().map(weapon => ({ name: weapon.name, type: weapon.rules.type,
                    status: weapon.status, remaining: weapon.chargeTicks })) },
            own: g.localPlayer.getOwnedObjects().filter(object => object.isSpawned && !object.isDestroyed).map(describe),
            goals: g.world.getAllObjects().filter(object => goalNames.includes(object.name) && !object.isDestroyed).map(describe),
            radar: [...g.localPlayer.buildings].filter(object => object.name === 'NARADR').map(object => ({
                rule: object.rules.superWeapon, rule2: object.rules.superWeapon2,
                trait: object.superWeaponTrait && { name: object.superWeaponTrait.name } })),
            tiles: g.map.tiles.getAll().filter(tile => g.map.mapBounds.isWithinPlayerBounds(tile)).map(tile => ({
                x: tile.rx, y: tile.ry, z: tile.z, terrain: tile.terrainType,
                ground: terrain.getPassableSpeed(tile, unit.rules.speedType, false, false),
                island: islands.get(tile, false), visible: !shroud.isShrouded(tile) })),
            statics: g.world.getAllObjects().filter(object => (object.isBuilding() || object.isOverlay() && object.rules.wall)
                && !object.isDestroyed).map(object => ({ ...describe(object),
                    cells: g.map.tileOccupation.calculateTilesForGameObject(object.tile, object).map(tile => [tile.rx, tile.ry]) })) };
    }, { unitName, goalNames });
    assert.deepEqual(await worldState(session.page), restored);
    const observeTicks = Number(process.argv.find(value => value.startsWith('--observe-ticks='))?.slice(16) ?? 0);
    if (observeTicks) {
        assert(Number.isSafeInteger(observeTicks) && observeTicks > 0 && observeTicks <= 900);
        const weapons = () => session.page.evaluate(() => {
            const g = window.__ra2debug.game;
            return { tick: g.currentTick, localIsCombatant: g.getCombatants().includes(g.localPlayer),
                weapons: g.localPlayer.superWeaponsTrait.getAll().map(w => ({ name: w.name, status: w.status,
                    remaining: w.chargeTicks, recharge: w.rechargeTicks })),
                traits: g.traits.getAll().map(trait => Object.getOwnPropertyNames(Object.getPrototypeOf(trait))) };
        });
        report.weaponObservation = { before: await weapons() };
        await stepWorld(session.page, observeTicks);
        report.weaponObservation.after = await weapons();
    }
    report.status = 'PASS_READ_ONLY_ORIGINAL_TOPOLOGY_AND_OBJECTIVE_INSPECTION';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await session?.app.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
