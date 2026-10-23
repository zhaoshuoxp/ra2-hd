// Observe original gate frames and ordinary movement; no frame or rule overrides.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
process.argv.push('--map=xtower.map', '--bot-slot=1');
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; });
});
let failure;
try {
    const { page, report } = session;
    report.diagnosticOnly = true;
    report.disclosure = 'Unchanged official xtower map and Original rendering. Read original placements, then use one legal-foundation player gate and infantry fixture with an ordinary Move order. No source, rules, frames, timing or map edits. Observations do not establish gate gameplay acceptance.';
    report.originalGates = await page.evaluate(() => {
        const d = window.__ra2debug;
        return d.game.getWorld().getAllObjects().filter(o => o.isBuilding() && o.rules.gate).map(o => {
            const r = d.renderableManager.getRenderableByGameObject(o);
            return { name: o.name, id: o.id, tile: [o.tile.rx, o.tile.ry], owner: o.owner.name,
                health: o.healthTrait.health, frame: r.mainObj?.builder.getFrame(),
                source: r.mainShpFile?.filename, frames: r.mainShpFile?.images.length,
                traits: o.traits.getAll().map(t => t.constructor.name) };
        });
    });
    assert(report.originalGates.length && report.originalGates.every(o => o.source === 'gagate_a.shp'));
    report.fixture = await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        const gate = f.gateProbe = f.building('GAGATE_A');
        const unit = f.gateProbeUnit = f.spawn('E1', 3, gate.tile);
        window.__gateProbeTrace = [];
        window.__gateProbeTimer = setInterval(() => {
            const r = d.renderableManager.getRenderableByGameObject(gate);
            window.__gateProbeTrace.push({ tick: d.game.currentTick, gateFrame: r.mainObj?.builder.getFrame(),
                tile: [unit.tile.rx, unit.tile.ry], moving: unit.isMoving, health: unit.healthTrait.health });
        }, 50);
        d.worldInteraction.minimapHandler.panToTile(gate.tile);
        d.actionsApi.orderUnits([unit.id], 0, gate.tile.rx + 1, gate.tile.ry);
        return { gateId: gate.id, unitId: unit.id, gateTile: [gate.tile.rx, gate.tile.ry],
            target: [gate.tile.rx + 1, gate.tile.ry], owner: gate.owner.name };
    });
    await page.waitForTimeout(6000);
    report.movementObservation = await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        clearInterval(window.__gateProbeTimer);
        const trace = window.__gateProbeTrace;
        d.renderer.render();
        return { trace, reached: f.gateProbeUnit.tile.rx === f.gateProbe.tile.rx + 1
            && f.gateProbeUnit.tile.ry === f.gateProbe.tile.ry,
            phases: [...new Set(trace.map(row => row.gateFrame))],
            framebuffer: d.renderer.renderer.domElement.toDataURL('image/png').split(',')[1] };
    });
    await fs.writeFile(path.join(output, 'original-gate-movement.png'),
        Buffer.from(report.movementObservation.framebuffer, 'base64'));
    delete report.movementObservation.framebuffer;
    assert(report.movementObservation.trace.at(-1).tick > report.movementObservation.trace[0].tick);
    report.probeStatus = 'ORIGINAL_GATE_MOVEMENT_AND_FRAME_OBSERVATIONS_RECORDED';
    assert.equal(report.errors.length, 0);
} catch (error) { failure = error; session.report.failure = error.stack; }
await session.close(failure);
if (failure) throw failure;
