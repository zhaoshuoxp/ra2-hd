// Verify source gate phases, ordinary passage, repair and destruction in the packaged Mac host.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const original = process.argv.includes('--original');
const density = process.argv.includes('--density=2') ? 2 : 4;
const mapName = process.argv.find(value => value.startsWith('--map='))?.slice(6) ?? 'xtower.map';
const sourceName = process.argv.find(value => value.startsWith('--source='))?.slice(9) ?? 'gagate_a.shp';
const placementCount = Number(process.argv.find(value => value.startsWith('--placements='))?.slice(13) ?? 4);
process.argv.push(`--map=${mapName}`, '--bot-slot=1');
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(({ original, density }) => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = !original; graphics.hdDensity.value = density;
    }, { original, density });
});
let failure;
try {
    const { page, report } = session;
    report.disclosure = `Unchanged official ${mapName} placements plus legal player gate/infantry fixtures. Ordinary Move and repair commands, native damage and destruction. Gate frames are observed without setting animation or simulation state. Native framebuffer captures are unscaled.`;
    report.original = original; report.density = density;
    report.originalPlacements = await page.evaluate(() => {
        const d = window.__ra2debug;
        return d.game.getWorld().getAllObjects().filter(o => o.name === 'GAGATE_A').map(o => {
            const r = d.renderableManager.getRenderableByGameObject(o);
            return { id: o.id, tile: [o.tile.rx, o.tile.ry], owner: o.owner.name,
                frame: r.mainObj.builder.getFrame(), hd: r.mainObj.builder.hdOverride?.identity,
                stages: o.gateTrait?.stages, source: r.mainShpFile.filename };
        });
    });
    assert.equal(report.originalPlacements.length, placementCount);
    assert(report.originalPlacements.every(o => o.stages === 9 && o.source === sourceName
        && (original ? !o.hd : o.hd)));
    report.fixturePlacement = await page.evaluate(clearPassage => {
        const f = window.__allied, d = window.__ra2debug, game = d.game, map = game.map;
        let near = { rx: f.center.rx + 12, ry: f.center.ry + 12 };
        let corridor = [];
        if (clearPassage) {
            const worker = game.getConstructionWorker(f.player), rule = game.rules.getObject('E1', 3);
            const candidates = map.tiles.getAll().filter(t => map.isWithinBounds(t))
                .sort((a, b) => Math.hypot(a.rx - near.rx, a.ry - near.ry)
                    - Math.hypot(b.rx - near.rx, b.ry - near.ry));
            near = candidates.find(t => {
                const tiles = [];
                for (let x = 0; x <= 2; x++) for (let y = -3; y <= 4; y++)
                    tiles.push(map.tiles.getByMapCoords(t.rx + x, t.ry + y));
                if (!tiles.every(tile => tile && map.isWithinBounds(tile) && !tile.rampType
                    && tile.z === t.z && map.terrain.getPassableSpeed(tile, rule.speedType, true, false) > 0
                    && !map.getGroundObjectsOnTile(tile).some(o => o.isTechno() || o.isTerrain()))) return false;
                if (!worker.canPlaceAt('GAGATE_A', t, { normalizedTile: true, ignoreAdjacent: true })) return false;
                corridor = tiles.map(tile => [tile.rx, tile.ry]);
                return true;
            });
            if (!near) throw Error('No legal gate foundation with a clear native infantry passage');
        }
        if (clearPassage) {
            f.gateProbe = game.createObject(2, 'GAGATE_A');
            game.changeObjectOwner(f.gateProbe, f.player);
            game.spawnObject(f.gateProbe, near);
        } else f.gateProbe = f.building('GAGATE_A', near);
        return { requestedClearPassage: clearPassage, gate: [f.gateProbe.tile.rx, f.gateProbe.tile.ry],
            corridor, policy: 'Legal player fixture on existing clear terrain; no map, terrain or object removal' };
    }, process.argv.includes('--clear-passage'));
    await page.waitForFunction(() => window.__allied.gateProbe.buildStatus === 1);
    await page.evaluate(() => {
        const d = window.__ra2debug, gate = window.__allied.gateProbe;
        d.worldInteraction.minimapHandler.panToTile(gate.tile);
        window.__gateTrace = []; window.__gateFrames = {};
        window.__gateTimer = setInterval(() => {
            const r = d.renderableManager.getRenderableByGameObject(gate);
            const frame = r.mainObj.builder.getFrame();
            window.__gateTrace.push({ tick: d.game.currentTick, frame, phase: gate.gateTrait.frame,
                passable: gate.gateTrait.passable, health: gate.healthTrait.health,
                unitTile: window.__allied.gateProbeUnit?.tile &&
                    [window.__allied.gateProbeUnit.tile.rx, window.__allied.gateProbeUnit.tile.ry] });
            if (!window.__gateFrames[frame]) {
                d.renderer.render();
                window.__gateFrames[frame] = d.renderer.renderer.domElement.toDataURL('image/png').split(',')[1];
            }
        }, 20);
    });
    report.cycles = [];
    for (const damaged of [false, true]) {
        if (damaged) await page.evaluate(() => {
            const d = window.__ra2debug, gate = window.__allied.gateProbe;
            gate.healthTrait.inflictDamage(Math.floor(gate.healthTrait.maxHitPoints * .6), gate, d.game);
        });
        const cycle = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied, gate = f.gateProbe;
            f.gateProbeUnit = f.spawn('E1', 3, { rx: gate.tile.rx + 1, ry: gate.tile.ry - 2 });
            const target = d.game.map.tiles.getByMapCoords(gate.tile.rx + 1, gate.tile.ry);
            d.actionsApi.orderUnits([f.gateProbeUnit.id], 0, target.rx, target.ry);
            return { startTick: d.game.currentTick, start: [f.gateProbeUnit.tile.rx, f.gateProbeUnit.tile.ry],
                target: [target.rx, target.ry], damaged: gate.healthTrait.health < 100 };
        });
        await page.waitForFunction(() => {
            const f = window.__allied;
            return f.gateProbeUnit.tile.rx === f.gateProbe.tile.rx + 1
                && f.gateProbeUnit.tile.ry === f.gateProbe.tile.ry && !f.gateProbeUnit.isMoving;
        }, undefined, { timeout: 20000 });
        cycle.entered = await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick,
            phase: window.__allied.gateProbe.gateTrait.frame,
            passable: window.__allied.gateProbe.gateTrait.passable }));
        assert(cycle.entered.passable && cycle.entered.phase === 9 && cycle.entered.tick > cycle.startTick);
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied, gate = f.gateProbe;
            const tile = d.game.map.tiles.getByMapCoords(gate.tile.rx + 1, gate.tile.ry + 3);
            f.gateProbeExit = tile;
            d.actionsApi.orderUnits([f.gateProbeUnit.id], 0, tile.rx, tile.ry);
        });
        await page.waitForFunction(() => window.__allied.gateProbeUnit.tile === window.__allied.gateProbeExit
            && !window.__allied.gateProbeUnit.isMoving, undefined, { timeout: 20000 });
        await page.evaluate(() => window.__ra2debug.game.unspawnObject(window.__allied.gateProbeUnit));
        await page.waitForFunction(() => window.__allied.gateProbe.gateTrait.frame === 0,
            undefined, { timeout: 15000 });
        cycle.closedTick = await page.evaluate(() => window.__ra2debug.game.currentTick);
        report.cycles.push(cycle);
    }
    await page.evaluate(() => window.__ra2debug.actionsApi.toggleRepairWrench(window.__allied.gateProbe.id));
    await page.waitForFunction(() => window.__allied.gateProbe.healthTrait.health === 100,
        undefined, { timeout: 30000 });
    report.repaired = true;
    const observation = await page.evaluate(() => {
        clearInterval(window.__gateTimer);
        return { trace: window.__gateTrace, frames: window.__gateFrames };
    });
    report.trace = observation.trace; report.captures = [];
    for (const [frame, png] of Object.entries(observation.frames)) {
        const file = `GAGATE_A-native-frame-${frame}.png`;
        await fs.writeFile(path.join(output, file), Buffer.from(png, 'base64'));
        report.captures.push({ frame: Number(frame), file, rescaled: false });
    }
    assert.deepEqual(report.captures.map(c => c.frame).sort((a, b) => a - b),
        Array.from({ length: 20 }, (_, frame) => frame));
    await page.evaluate(() => window.__ra2debug.game.destroyObject(window.__allied.gateProbe,
        { player: window.__allied.player }));
    assert(await page.evaluate(() => window.__allied.gateProbe.isDestroyed));
    assert.equal(report.errors.length, 0);
    report.gateStatus = 'PASS_NATIVE_NORMAL_AND_DAMAGED_OPEN_PASSAGE_CLOSE_REPAIR_AND_DESTRUCTION';
} catch (error) {
    failure = error; session.report.failure = error.stack;
    session.report.partialObservation = await session.page.evaluate(() => {
        clearInterval(window.__gateTimer);
        const f = window.__allied, d = window.__ra2debug;
        return { trace: window.__gateTrace, gateTile: f.gateProbe?.tile && [f.gateProbe.tile.rx, f.gateProbe.tile.ry],
            nearbyGroundUnits: f.gateProbe && d.game.getWorld().getAllObjects().filter(o => o.isUnit() && o.tile
                && Math.abs(o.tile.rx - f.gateProbe.tile.rx) <= 4 && Math.abs(o.tile.ry - f.gateProbe.tile.ry) <= 2)
                .map(o => ({ name: o.name, tile: [o.tile.rx, o.tile.ry], owner: o.owner.name })) };
    }).catch(() => undefined);
}
if (failure) await fs.writeFile(path.join(output, 'report.json'),
    JSON.stringify({ ...session.report, status: 'FAIL' }, null, 2) + '\n');
await session.close(failure);
if (failure) throw failure;
