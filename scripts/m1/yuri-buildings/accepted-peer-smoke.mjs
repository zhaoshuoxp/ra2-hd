// Bounded activation check from the review app's own registered resource root.
import assert from 'node:assert/strict';
import { startSession } from '../allied-units/desktop-session.mjs';

const session = await startSession(process.argv[2], process.argv[3], 'yr');
const { page, report, stage, close } = session;
let failure;
try {
    await page.evaluate(() => {
        const f = window.__allied;
        f.buildings = [f.building('GAPOWR'), f.building('NAPOWR')];
        f.units = [f.spawn('E1', 3), f.spawn('MTNK', 7)];
        for (const actor of f.buildings) f.actors[actor.id] = actor;
        window.__ra2debug.worldInteraction.minimapHandler.panToTile(f.center);
    });
    await page.waitForFunction(() => {
        const f = window.__allied, d = window.__ra2debug;
        return f.buildings.every(unit => d.renderableManager.getRenderableByGameObject(unit)?.mainObj?.builder?.hdOverride)
            && f.units.every(unit => {
                const r = d.renderableManager.getRenderableByGameObject(unit);
                return r?.shpRenderable?.builder?.hdOverride || r?.unitVxlHd?.active;
            });
    }, undefined, { timeout: 90000 });
    report.acceptedBindings = await page.evaluate(() => {
        const f = window.__allied, d = window.__ra2debug;
        return [...f.buildings, ...f.units].map(unit => {
            const r = d.renderableManager.getRenderableByGameObject(unit);
            const hd = r?.mainObj?.builder?.hdOverride ?? r?.shpRenderable?.builder?.hdOverride;
            return { name: unit.name, identity: hd?.identity, density: hd?.density,
                vxlHd: !!r?.unitVxlHd?.active, visible: r?.get3DObject().visible };
        });
    });
    assert(report.acceptedBindings.every(binding => binding.identity || binding.vxlHd));
    report.boundary = 'Four accepted peers in one controlled YR temperate scene; no new Yuri HD, owner-color, complete density matrix or hardware pressure certification.';
    await stage('accepted-peer-activation');
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
console.log(JSON.stringify({ status: report.status, bindings: report.acceptedBindings }));
