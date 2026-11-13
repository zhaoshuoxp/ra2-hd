import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [receipt, output, edition = 'yr'] = process.argv.slice(2);
const original = process.argv.includes('--original');
const session = await startSession(receipt, output, edition, false, async ({ page }) => {
    await page.evaluate(original => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = !original;
        graphics.hdDensity.value = 2;
    }, original);
});
const { page, report, stage, close, out } = session;
let failure;
try {
    report.regression = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, f = window.__allied, world = g.getWorld();
        clearInterval(f.timer);
        g.speed.value = g.desiredSpeed.value = Number.EPSILON;
        const result = { cases: [], removals: [], invalidRemovals: [], error: undefined };
        const describe = unit => ({ name: unit.name, id: unit.id, tick: g.currentTick,
            spawned: unit.isSpawned, destroyed: unit.isDestroyed, limbo: !!unit.limboData,
            tile: unit.tile && [unit.tile.rx, unit.tile.ry], zone: unit.zone,
            elevation: unit.tileElevation, ammo: unit.ammo, moving: unit.isMoving,
            tasks: unit.unitOrderTrait?.getTasks().map(task => ({ name: task.constructor.name,
                status: task.status, target: task.targetTile && [task.targetTile.rx, task.targetTile.ry],
                destination: task.destinationLeptons?.toArray(), waypoint: task.currentWaypointLeptons?.toArray(),
                path: task.path?.map(node => [node.tile.rx, node.tile.ry]), options: task.options })),
            stored: unit.airSpawnTrait?.availableSpawns });
        const remove = world.removeObject.bind(world);
        world.removeObject = unit => {
            if (!world.hasObjectId(unit.id)) result.invalidRemovals.push({ ...describe(unit), stack: new Error().stack });
            if (['ASW', 'HORNET', 'DEST', 'CARRIER'].includes(unit.name)) result.removals.push(describe(unit));
            return remove(unit);
        };
        const step = (count = 1) => {
            for (const action of d.actionQueue.dequeueAll()) { action.player = f.player; action.process(); }
            for (let tick = 0; tick < count; tick++) g.update();
        };
        const until = (predicate, limit = 3600) => {
            let ticks = 0;
            while (!predicate() && ticks < limit) { step(); ticks++; }
            if (!predicate()) throw new Error(`Condition timed out after ${ticks} simulation ticks`);
            return ticks;
        };
        const order = (unit, type, ...args) => { d.actionsApi.orderUnits([unit.id], type, ...args); step(); };
        try {
            for (const identity of ['DEST', 'CARRIER']) {
                for (const mode of ['return', 'target-destroyed-before-takeoff', 'target-destroyed', 'parent-moving', 'parent-destroyed']) {
                    const ship = f.actor = f.spawn(identity, 7);
                    const target = f.spawn(identity === 'DEST' ? 'SUB' : 'SAPC', 7,
                        { rx: ship.tile.rx + 4, ry: ship.tile.ry }, f.enemy);
                    target.attackTrait?.setDisabled(true);
                    const children = ship.airSpawnTrait.spawns.slice();
                    for (const child of children) f.actors[child.id] = child;
                    const row = { identity, mode, ship: describe(ship), target: describe(target) };
                    result.cases.push(row);
                    order(ship, 2, target.id);
                    row.launchTicks = until(() => children.some(child => child.isSpawned));
                    if (mode !== 'target-destroyed-before-takeoff')
                        row.takeoffTicks = until(() => children.some(child => child.zone === 1));
                    row.launched = children.map(describe);
                    if (mode === 'parent-destroyed') {
                        g.destroyObject(ship);
                        row.crashTicks = until(() => children.every(child => child.isDestroyed));
                    } else {
                        if (mode.startsWith('target-destroyed')) g.destroyObject(target);
                        else until(() => children.some(child => child.ammo < child.ammoTrait.maxAmmo));
                        order(ship, 11);
                        ship.attackTrait.setDisabled(true);
                        if (mode === 'parent-moving') {
                            const water = g.map.tiles.getAll().find(tile => g.map.isWithinBounds(tile)
                                && g.map.getTileZone(tile) === 2 && !tile.rampType
                                && Math.hypot(tile.rx - ship.tile.rx, tile.ry - ship.tile.ry) >= 2
                                && Math.hypot(tile.rx - ship.tile.rx, tile.ry - ship.tile.ry) <= 3
                                && !g.map.getGroundObjectsOnTile(tile).some(object => object.isTechno() || object.isTerrain()));
                            if (!water) throw new Error('No nearby water movement fixture');
                            order(ship, 0, water.rx, water.ry);
                        }
                        row.returnTicks = until(() => ship.airSpawnTrait.availableSpawns === ship.rules.spawnsNumber);
                        row.returned = children.map(describe);
                        row.reloadTicks = until(() => children.every(child => child.ammo === child.ammoTrait.maxAmmo));
                        row.storageUnique = new Set(ship.airSpawnTrait.storage).size === ship.airSpawnTrait.storage.length;
                        if (!row.storageUnique) throw new Error('Duplicate aircraft in parent storage');
                    }
                    row.final = { ship: describe(ship), children: children.map(describe) };
                    if (!ship.isDestroyed) g.destroyObject(ship);
                    if (!target.isDestroyed) g.destroyObject(target);
                    step(30);
                    row.status = 'PASS';
                }
            }
        } catch (error) {
            result.error = error.stack;
            result.objects = Object.values(f.actors).map(describe);
        }
        result.finalTick = g.currentTick;
        return result;
    });
    await stage('naval-spawn-regression');
    assert.equal(report.regression.error, undefined, report.regression.error);
    assert.equal(report.regression.invalidRemovals.length, 0);
    assert.equal(report.regression.cases.length, 10);
    if (process.argv.includes('--check-error-log')) {
        await page.evaluate(() => {
            const d = window.__ra2debug;
            window.__allied.spawn('DEST', 7);
            d.gameScreen.handleError(new Error('Synthetic game-error persistence regression'), 'Synthetic diagnostic persistence check');
        });
        await page.waitForTimeout(200);
        const diagnostic = JSON.parse(await fs.readFile(path.join(out, 'profile/game-error-latest.json'), 'utf8'));
        assert(diagnostic.error.stack.includes('Synthetic game-error persistence regression'));
        assert.equal(diagnostic.map, report.selectedMap);
        assert(diagnostic.airSpawns.some(parent => parent.name === 'DEST' && parent.children.some(child => child.name === 'ASW')));
        report.diagnosticPersistence = { status: 'PASS', synthetic: true, file: 'profile/game-error-latest.json' };
    }
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
