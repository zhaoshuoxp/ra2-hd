import assert from 'node:assert/strict';
import { startSession } from './desktop-session.mjs';

const session = await startSession(process.argv[2], process.argv[3], process.argv[4] ?? 'yr');
const { page, report, stage, startClip, stopClip, close } = session;
const identities = (process.argv[5] ?? 'AMCV,MTNK,TNKD,SREF,MGTK,FV,BFRT,ROBO,CMIN').split(',');
let failure;
try {
    report.families = {};
    for (const identity of identities) {
        if (report.edition === 'ra2' && ['BFRT', 'ROBO'].includes(identity)) continue;
        await page.evaluate(identity => {
            const d = window.__ra2debug, f = window.__allied;
            f.actor = f.spawn(identity, 7, { rx: f.center.rx - 6, ry: f.center.ry - 6 });
            if (identity === 'ROBO') {
                f.power = f.building('GAPOWR'); f.controller = f.building('GAROBO');
            }
            d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
        }, identity);
        await page.waitForFunction(() => window.__allied.sample(window.__allied.actor).vxlHd,
            undefined, { timeout: 45000 });
        const result = report.families[identity] = { binding: await page.evaluate(() => window.__allied.sample(window.__allied.actor)) };
        result.recording = await startClip(); await stage(identity + '-ready');
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied, u = f.actor, g = d.game;
            f.destination = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t) && !t.rampType
                && g.map.getTileZone(t) === 0 && g.map.terrain.getPassableSpeed(t, u.rules.speedType, false, false) > 0
                && (!u.rules.deploysInto || g.getConstructionWorker(u.owner).canPlaceAt(u.rules.deploysInto, t,
                    { ignoreObjects: [u], ignoreAdjacent: true }))
                && !g.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()))
                .sort((a, b) => Math.abs(Math.hypot(a.rx - u.tile.rx, a.ry - u.tile.ry) - 5)
                    - Math.abs(Math.hypot(b.rx - u.tile.rx, b.ry - u.tile.ry) - 5))[0];
            d.actionsApi.orderUnits([u.id], 0, f.destination.rx, f.destination.ry);
        });
        await page.waitForFunction(() => {
            const f = window.__allied, u = f.actor;
            return !u.isMoving && !u.warpedOutTrait?.isActive() && u.tile === f.destination;
        }, undefined, { timeout: 60000 });
        result.nativeMovement = true; await stage(identity + '-moved');
        if (identity === 'AMCV') {
            await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.actor.id], 10));
            await page.waitForFunction(() => !window.__allied.actor.isSpawned
                && [...window.__allied.player.buildings].some(b => b.name === 'GACNST'), undefined, { timeout: 30000 });
            result.nativeConstructionYardHandoff = true; await stage(identity + '-deployed');
        } else if (identity === 'CMIN') {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied, u = f.actor, g = d.game;
                f.refinery = f.building('GAREFN', { rx: u.tile.rx + 3, ry: u.tile.ry });
                const ore = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t)
                    && g.map.getObjectsOnTile(t).some(o => o.isOverlay() && o.isTiberium()))
                    .sort((a, b) => Math.hypot(a.rx - u.tile.rx, a.ry - u.tile.ry) - Math.hypot(b.rx - u.tile.rx, b.ry - u.tile.ry))[0];
                if (!ore) throw Error('No native ore');
                f.creditsBefore = f.player.credits; d.actionsApi.orderUnits([u.id], 14, ore.rx, ore.ry);
            });
            await page.waitForFunction(() => window.__allied.actor.harvesterTrait.status === 3
                && !window.__allied.actor.harvesterTrait.isEmpty(), undefined, { timeout: 120000 });
            await stage(identity + '-harvesting');
            await page.waitForFunction(() => [7, 8].includes(window.__allied.actor.harvesterTrait.status),
                undefined, { timeout: 180000 });
            await stage(identity + '-unloading');
            await page.waitForFunction(() => window.__allied.actor.harvesterTrait.isEmpty()
                && window.__allied.player.credits > window.__allied.creditsBefore, undefined, { timeout: 90000 });
            result.nativeHarvestUnloadCredits = true;
            result.unloadBinding = await page.evaluate(() => window.__allied.traces.flat()
                .filter(t => t.id === window.__allied.actor.id && t.parts?.includes('cmon.vxl') && t.vxlHd));
            assert(result.unloadBinding.length, 'Native unload representation must actually be HD');
        } else {
            if (identity === 'FV' || identity === 'BFRT') {
                const passengers = identity === 'FV' ? ['E1', 'SHK', 'ENGINEER'] : ['E1'];
                result.passengerCases = [];
                for (const passenger of passengers) {
                    await page.evaluate(passenger => {
                        const d = window.__ra2debug, f = window.__allied;
                        f.passenger = f.spawn(passenger, 3, f.actor.tile);
                        d.actionsApi.orderUnits([f.passenger.id], 17, f.actor.id);
                    }, passenger);
                    await page.waitForFunction(() => window.__allied.actor.transportTrait.units.includes(window.__allied.passenger));
                    await page.waitForFunction(() => window.__allied.sample(window.__allied.actor).vxlHd);
                    await stage(identity + '-passenger-' + passenger);
                    result.passengerCases.push(await page.evaluate(() => ({
                        passenger: window.__allied.passenger.name, mode: window.__allied.passenger.rules.ifvMode,
                        sample: window.__allied.sample(window.__allied.actor),
                    })));
                    if (identity === 'FV' && passenger === 'ENGINEER') {
                        await page.evaluate(() => {
                            const d = window.__ra2debug, f = window.__allied;
                            f.repairTarget = f.spawn('MTNK', 7, f.actor.tile);
                            f.repairTarget.healthTrait.health = Math.floor(f.repairTarget.healthTrait.health / 2);
                            f.damagedHealth = f.repairTarget.healthTrait.health;
                            d.actionsApi.orderUnits([f.actor.id], 2, f.repairTarget.id);
                        });
                        await page.waitForFunction(() => window.__allied.repairTarget.healthTrait.health > window.__allied.damagedHealth,
                            undefined, { timeout: 30000 });
                        result.nativeRepair = true; await stage('FV-repair');
                    }
                    if (identity === 'FV') {
                        await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.actor.id], 10));
                        await page.waitForFunction(() => !window.__allied.actor.transportTrait.units.length && window.__allied.passenger.isSpawned);
                        await page.evaluate(() => window.__ra2debug.game.unspawnObject(window.__allied.passenger));
                    }
                }
            }
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied, u = f.actor;
                f.target = f.spawn('HTNK', 7, { rx: u.tile.rx + 3, ry: u.tile.ry + 1 }, f.enemy);
                f.target.attackTrait.setDisabled(true); f.target.moveTrait.setDisabled(true);
                f.healthBefore = f.target.healthTrait.health;
                d.actionsApi.orderUnits([u.id], 2, f.target.id);
            });
            await page.waitForFunction(() => window.__allied.target.isDestroyed
                || window.__allied.target.healthTrait.health < window.__allied.healthBefore, undefined, { timeout: 60000 });
            result.nativeAttack = true; await stage(identity + '-attack');
            await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.actor.id], 11));
            if (identity === 'MGTK') {
                await page.waitForFunction(() => window.__allied.actor.disguiseTrait.isDisguised(), undefined, { timeout: 30000 });
                result.nativeMirageDisguise = true; await stage('MGTK-disguised');
            }
            if (identity === 'BFRT') {
                await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.actor.id], 10));
                await page.waitForFunction(() => !window.__allied.actor.transportTrait.units.length && window.__allied.passenger.isSpawned);
                result.nativeEvacuation = true; await stage('BFRT-evacuated');
            }
            if (identity === 'ROBO') {
                await page.evaluate(() => window.__ra2debug.game.unspawnObject(window.__allied.controller));
                await page.waitForFunction(() => !window.__allied.actor.poweredUnitTrait.isOnline());
                result.nativePowerDependence = true; await stage('ROBO-offline');
                await page.evaluate(() => { window.__allied.controller = window.__allied.building('GAROBO'); });
                await page.waitForFunction(() => window.__allied.actor.poweredUnitTrait.isOnline());
                result.nativePowerRecovery = true; await stage('ROBO-online');
            }
        }
        await stopClip(identity + '-native-actions');
        await page.evaluate(() => {
            const f = window.__allied, g = window.__ra2debug.game;
            for (const key of ['actor', 'target', 'passenger', 'repairTarget', 'controller', 'power', 'refinery']) {
                if (f[key]?.isSpawned) g.unspawnObject(f[key]); delete f[key];
            }
        });
    }
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
