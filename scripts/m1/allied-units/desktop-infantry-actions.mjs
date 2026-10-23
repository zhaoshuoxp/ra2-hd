import assert from 'node:assert/strict';
import { startSession } from './desktop-session.mjs';

const session = await startSession(process.argv[2], process.argv[3], process.argv[4] ?? 'yr');
const { page, report, stage, startClip, stopClip, close } = session;
const identities = (process.argv[5] ?? 'E1,GGI,JUMPJET,CLEG,SPY,SNIPE,TANY,ADOG,GHOST,ENGINEER,CCOMAND,PTROOP,CIVAN').split(',');
let failure;
try {
    report.families = {};
    for (const identity of identities) {
        if (identity === 'GGI' && report.edition === 'ra2') continue;
        await page.evaluate(identity => {
            const d = window.__ra2debug, f = window.__allied;
            f.actor = f.spawn(identity, 3, { rx: f.center.rx - 5, ry: f.center.ry - 5 });
            d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
        }, identity);
        await page.waitForFunction(() => window.__allied.sample(window.__allied.actor).shpHd,
            undefined, { timeout: 45000 });
        const result = report.families[identity] = { binding: await page.evaluate(() => window.__allied.sample(window.__allied.actor)) };
        result.recording = await startClip();
        await stage(identity + '-ready');
        result.destination = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied, u = f.actor, g = d.game;
            const tile = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t) && !t.rampType
                && g.map.terrain.getPassableSpeed(t, u.rules.speedType, true, false) > 0
                && g.map.getTileZone(t) === 0
                && !g.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()))
                .sort((a, b) => Math.abs(Math.hypot(a.rx - u.tile.rx, a.ry - u.tile.ry) - 5)
                    - Math.abs(Math.hypot(b.rx - u.tile.rx, b.ry - u.tile.ry) - 5))[0];
            if (!tile) throw Error('No movement destination');
            f.destination = tile; d.actionsApi.orderUnits([u.id], 0, tile.rx, tile.ry);
            return [tile.rx, tile.ry];
        });
        await page.waitForFunction(() => {
            const f = window.__allied, u = f.actor, t = f.destination;
            return !u.isMoving && !u.warpedOutTrait?.isActive() && u.tile.rx === t.rx && u.tile.ry === t.ry;
        }, undefined, { timeout: 60000 });
        await stage(identity + '-moved'); result.movement = true;
        if (identity === 'SPY' || identity === 'ENGINEER') {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied, u = f.actor;
                f.target = f.building('NAPOWR', { rx: u.tile.rx + 3, ry: u.tile.ry }, f.enemy);
                d.actionsApi.orderUnits([u.id], 8, f.target.id);
            });
            await page.waitForFunction(() => !window.__allied.actor.isSpawned, undefined, { timeout: 60000 });
            if (identity === 'ENGINEER') assert(await page.evaluate(() => window.__allied.target.owner === window.__allied.player));
            result[identity === 'SPY' ? 'nativeInfiltration' : 'nativeCapture'] = true;
            await stage(identity + '-entered-building');
        } else {
            if (identity === 'E1' || identity === 'GGI') {
                await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.actor.id], 10));
                await page.waitForFunction(() => window.__allied.actor.deployerTrait.isDeployed());
                await stage(identity + '-deployed'); result.nativeDeployment = true;
            }
            await page.evaluate(identity => {
                const d = window.__ra2debug, f = window.__allied, u = f.actor;
                const armor = identity === 'GGI';
                f.target = f.spawn(armor ? 'HTNK' : 'E2', armor ? 7 : 3,
                    { rx: u.tile.rx + 3, ry: u.tile.ry }, f.enemy);
                f.target.attackTrait.setDisabled(true); f.target.moveTrait.setDisabled(true);
                f.targetHealth = f.target.healthTrait.health;
                d.actionsApi.orderUnits([u.id], 2, f.target.id);
            }, identity);
            await page.waitForFunction(() => {
                const f = window.__allied;
                return f.target.isDestroyed || f.target.healthTrait.health < f.targetHealth
                    || f.target.warpedOutTrait?.isActive() || f.target.owner === f.player;
            }, undefined, { timeout: 60000 });
            result.nativeAttack = true; await stage(identity + '-attack');
            await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.actor.id], 11));
            if (identity === 'E1' || identity === 'GGI') {
                await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.actor.id], 10));
                await page.waitForFunction(() => !window.__allied.actor.deployerTrait.isDeployed());
                result.nativeUndeployment = true; await stage(identity + '-undeployed');
            }
            if (identity === 'TANY' || identity === 'GHOST') {
                await page.evaluate(() => {
                    const d = window.__ra2debug, f = window.__allied, u = f.actor;
                    f.demolition = f.building('NAPOWR', { rx: u.tile.rx + 3, ry: u.tile.ry + 2 }, f.enemy);
                    d.actionsApi.orderUnits([u.id], 2, f.demolition.id);
                });
                await page.waitForFunction(() => window.__allied.demolition.isDestroyed, undefined, { timeout: 60000 });
                result.nativeDemolition = true; await stage(identity + '-demolition');
                await page.evaluate(() => {
                    const d = window.__ra2debug, f = window.__allied, g = d.game, u = f.actor;
                    const water = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t) && g.map.getTileZone(t) === 2
                        && g.map.terrain.getPassableSpeed(t, u.rules.speedType, true, false) > 0)
                        .sort((a, b) => Math.hypot(a.rx - u.tile.rx, a.ry - u.tile.ry) - Math.hypot(b.rx - u.tile.rx, b.ry - u.tile.ry))[0];
                    if (!water) throw Error('No passable water');
                    f.water = water; d.actionsApi.orderUnits([u.id], 0, water.rx, water.ry);
                });
                await page.waitForFunction(() => window.__ra2debug.game.map.getTileZone(window.__allied.actor.tile) === 2,
                    undefined, { timeout: 60000 });
                await page.evaluate(() => window.__ra2debug.worldInteraction.minimapHandler.panToTile(window.__allied.actor.tile));
                result.nativeWaterTransition = true; await stage(identity + '-water');
            }
        }
        result.clip = await stopClip(identity + '-native-actions');
        result.finalSample = await page.evaluate(() => window.__allied.sample(window.__allied.actor));
        if (identity === 'JUMPJET') {
            result.nativeFlight = await page.evaluate(() => window.__allied.traces.some(row =>
                row.some(s => s.id === window.__allied.actor.id && s.zone === 1 && s.shpHd)));
            assert(result.nativeFlight, 'Rocketeer must use its native airborne state with HD active');
        }
        if (identity === 'ADOG') {
            result.nativeLeap = await page.evaluate(() => window.__allied.projectiles.some(p => p.hd));
            assert(result.nativeLeap, 'Dog leap must bind the authored ADOGP member');
        }
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            for (const unit of [f.actor, f.target]) if (unit?.isSpawned) d.game.unspawnObject(unit);
        });
    }
    assert.deepEqual(report.errors, []);
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
