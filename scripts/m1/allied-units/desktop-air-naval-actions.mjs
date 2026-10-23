import assert from 'node:assert/strict';
import { startSession } from './desktop-session.mjs';

const session = await startSession(process.argv[2], process.argv[3], process.argv[4] ?? 'yr');
const { page, report, stage, startClip, stopClip, close } = session;
const identities = (process.argv[5] ?? 'DLPH,DEST,CARRIER,AEGIS,LCRF,SHAD,ORCA,BEAG').split(',');
let failure;
try {
    report.families = {};
    for (const identity of identities) {
        await page.evaluate(identity => {
            const d = window.__ra2debug, f = window.__allied;
            f.actor = f.spawn(identity, ['ORCA', 'BEAG'].includes(identity) ? 1 : 7);
            d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
        }, identity);
        if (identity === 'ORCA' || identity === 'BEAG') {
            await page.evaluate(() => {
                const f = window.__allied;
                f.airfield = f.building('GAAIRC', f.actor.tile);
                f.airPower = f.building('GAPOWR', f.actor.tile);
            });
            await page.waitForFunction(() => window.__allied.airfield.buildStatus === 1);
        }
        await page.waitForFunction(() => {
            const f = window.__allied, sample = f.sample(f.actor); return sample.vxlHd || sample.shpHd;
        }, undefined, { timeout: 45000 });
        const result = report.families[identity] = { binding: await page.evaluate(() => window.__allied.sample(window.__allied.actor)) };
        result.recording = await startClip(); await stage(identity + '-ready');
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied, u = f.actor, g = d.game;
            const water = ['DLPH', 'DEST', 'CARRIER', 'AEGIS', 'LCRF'].includes(u.name);
            f.destination = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t) && !t.rampType
                && (!water || g.map.getTileZone(t) === 2)
                && g.map.terrain.getPassableSpeed(t, u.rules.speedType, false, false) > 0
                && !g.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()))
                .sort((a, b) => Math.abs(Math.hypot(a.rx - u.tile.rx, a.ry - u.tile.ry) - 6)
                    - Math.abs(Math.hypot(b.rx - u.tile.rx, b.ry - u.tile.ry) - 6))[0];
            if (!f.destination) throw Error('No legal movement tile');
            d.actionsApi.orderUnits([u.id], 0, f.destination.rx, f.destination.ry);
        });
        await page.waitForFunction(() => {
            const f = window.__allied;
            return f.traces.some(row => row.some(s => s.id === f.actor.id && s.moving));
        }, undefined, { timeout: 60000 });
        await stage(identity + '-moving'); result.nativeMovement = true;
        await page.waitForFunction(() => {
            const f = window.__allied;
            return Math.hypot(f.actor.tile.rx - f.destination.rx, f.actor.tile.ry - f.destination.ry) < 2;
        }, undefined, { timeout: 60000 });
        await page.evaluate(() => window.__ra2debug.worldInteraction.minimapHandler.panToTile(window.__allied.actor.tile));
        if (identity === 'LCRF' || identity === 'SHAD') {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied, u = f.actor, g = d.game;
                f.landing = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t) && !t.rampType
                    && g.map.getTileZone(t) === 0 && g.map.terrain.getPassableSpeed(t, u.rules.speedType, false, false) > 0
                    && !g.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()))
                    .sort((a, b) => Math.hypot(a.rx - u.tile.rx, a.ry - u.tile.ry) - Math.hypot(b.rx - u.tile.rx, b.ry - u.tile.ry))[0];
                d.actionsApi.orderUnits([u.id], 0, f.landing.rx, f.landing.ry);
            });
            await page.waitForFunction(() => !window.__allied.actor.isMoving && window.__allied.actor.zone === 0,
                undefined, { timeout: 90000 });
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                f.passenger = f.spawn('E1', 3, f.actor.tile);
                d.actionsApi.orderUnits([f.passenger.id], 17, f.actor.id);
            });
            await page.waitForFunction(() => window.__allied.actor.transportTrait.units.includes(window.__allied.passenger),
                undefined, { timeout: 30000 });
            result.nativeBoarding = true; await stage(identity + '-loaded');
            await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.actor.id], 10));
            await page.waitForFunction(() => !window.__allied.actor.transportTrait.units.length && window.__allied.passenger.isSpawned,
                undefined, { timeout: 30000 });
            result.nativeUnload = true; await stage(identity + '-unloaded');
        } else {
            await page.evaluate(identity => {
                const d = window.__ra2debug, f = window.__allied, u = f.actor;
                const targetName = identity === 'AEGIS' ? 'ZEP' : identity === 'DEST' ? 'SUB'
                    : ['DLPH', 'CARRIER'].includes(identity) ? 'SAPC' : 'HTNK';
                f.target = f.spawn(targetName, 7, { rx: u.tile.rx + 4, ry: u.tile.ry }, f.enemy);
                f.target.attackTrait?.setDisabled(true);
                if (identity === 'AEGIS') {
                    d.game.changeObjectOwner(f.target, f.player);
                    d.actionsApi.orderUnits([f.target.id], 0, f.target.tile.rx + 3, f.target.tile.ry);
                }
                f.targetHealth = f.target.healthTrait.health;
            }, identity);
            if (identity === 'AEGIS') {
                await page.waitForFunction(() => window.__allied.target.zone === 1);
                await page.evaluate(() => window.__ra2debug.game.changeObjectOwner(window.__allied.target, window.__allied.enemy));
            }
            await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.actor.id], 2, window.__allied.target.id));
            await page.waitForFunction(() => window.__allied.target.isDestroyed
                || window.__allied.target.healthTrait.health < window.__allied.targetHealth, undefined, { timeout: 120000 });
            result.nativeAttack = true; await stage(identity + '-attack');
            if (identity === 'CARRIER' || identity === 'DEST') {
                const childName = identity === 'CARRIER' ? 'HORNET' : 'ASW';
                result.childBindings = await page.evaluate(childName => window.__allied.traces.flat()
                    .filter(s => s.name === childName && s.spawned && s.vxlHd), childName);
                assert(result.childBindings.length, childName + ' must render HD during native flight');
                await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.actor.id], 11));
                await page.waitForFunction(() => window.__allied.actor.airSpawnTrait.availableSpawns > 0,
                    undefined, { timeout: 120000 });
                result.nativeChildReturn = true; await stage(identity + '-child-return');
            }
            if (identity === 'ORCA' || identity === 'BEAG') {
                await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits(
                    [window.__allied.actor.id], 13, window.__allied.airfield.id));
                await page.waitForFunction(() => window.__allied.airfield.dockTrait.isDocked(window.__allied.actor),
                    undefined, { timeout: 90000 });
                await page.waitForFunction(() => window.__allied.actor.ammoTrait.ammo === window.__allied.actor.ammoTrait.maxAmmo,
                    undefined, { timeout: 90000 });
                await page.waitForFunction(() => window.__allied.actor.zone === 0 && window.__allied.actor.tileElevation === 0,
                    undefined, { timeout: 90000 });
                result.parkedVisibility = await page.evaluate(() => {
                    const d = window.__ra2debug, f = window.__allied;
                    const h = d.renderableManager.getRenderableByGameObject(f.actor).unitVxlHd;
                    return { sample: f.sample(f.actor), depthOffset: h.dockDepthCache?.offset,
                        visibleLayers: h.layers.flatMap(l => l.frames).filter(f => f.batch.visible).length };
                });
                assert(result.parkedVisibility.visibleLayers > 0 && result.parkedVisibility.depthOffset > 0);
                result.nativeDockReload = true; await stage(identity + '-reloaded');
            }
        }
        await stopClip(identity + '-native-actions');
        await page.evaluate(() => {
            const f = window.__allied, g = window.__ra2debug.game;
            for (const key of ['actor', 'target', 'passenger', 'airfield', 'airPower']) {
                if (f[key]?.isSpawned) g.unspawnObject(f[key]); delete f[key];
            }
        });
    }
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
