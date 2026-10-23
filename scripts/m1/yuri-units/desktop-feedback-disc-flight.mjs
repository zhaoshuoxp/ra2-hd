// Verify the disc correction during native flight and turns, not only idle spin.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from './desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const s = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdDensity.value = 4; });
});
const { page, report, startClip, stopClip, close, out } = s;
let failure;
try {
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        f.actor = f.spawn('DISK', 7, { rx: f.center.rx - 12, ry: f.center.ry - 12 });
        f.origin = f.actor.tile; f.motion = []; f.motionFrames = {};
        d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
        const render = d.renderer.render.bind(d.renderer);
        d.renderer.render = (...args) => {
            render(...args);
            const r = d.renderableManager.getRenderableByGameObject(f.actor);
            if (!f.actor.isMoving || !r?.unitVxlHd?.active) return;
            const yaw = (r.tiltObj.rotation.y + (r.dirWrapObj?.rotation.y ?? 0)) * 180 / Math.PI;
            const heading = ((Math.round(yaw / 45) * 45) % 360 + 360) % 360;
            f.motion.push({ tick: d.game.currentTick, heading, position: f.actor.position.worldPosition.toArray(),
                elevation: f.actor.tileElevation, tilt: r.tiltObj.rotation.toArray(), hd: true });
            if (f.motionFrames[heading]) return;
            const canvas = d.renderer.renderer.domElement, v = d.worldScene.viewport;
            const p = r.getPosition().clone().project(d.worldScene.camera), ratio = canvas.width / d.renderer.width;
            const x = (v.x + (p.x + 1) * v.width / 2) * ratio, y = (v.y + (1 - p.y) * v.height / 2) * ratio;
            const detail = document.createElement('canvas'); detail.width = 800; detail.height = 520;
            detail.getContext('2d').drawImage(canvas, Math.round(x - 400), Math.round(y - 312), 800, 520, 0, 0, 800, 520);
            f.motionFrames[heading] = detail.toDataURL();
        };
    });
    await page.waitForFunction(() => window.__allied.sample(window.__allied.actor).vxlHd);
    report.recording = await startClip();
    for (const [dx, dy] of [[6, 0], [6, 6], [0, 6], [-6, 6], [-6, 0], [-6, -6], [0, -6], [6, -6]]) {
        for (const target of [[dx, dy], [0, 0]]) {
            await page.evaluate(([dx, dy]) => {
                const d = window.__ra2debug, f = window.__allied;
                f.destination = [f.origin.rx + dx, f.origin.ry + dy];
                d.actionsApi.orderUnits([f.actor.id], 0, ...f.destination);
            }, target);
            await page.waitForFunction(() => window.__allied.actor.isMoving, undefined, { timeout: 15000, polling: 16 });
            await page.waitForFunction(() => {
                const f = window.__allied; return !f.actor.isMoving
                    && Math.hypot(f.actor.tile.rx - f.destination[0], f.actor.tile.ry - f.destination[1]) < 2;
            }, undefined, { timeout: 30000, polling: 16 });
        }
    }
    report.motion = await page.evaluate(() => window.__allied.motion);
    const frames = await page.evaluate(() => window.__allied.motionFrames);
    assert.equal(Object.keys(frames).length, 8, 'Eight native body bearings must be observed during flight');
    assert(new Set(report.motion.map(row => JSON.stringify(row.position))).size > 20);
    report.flightFrames = [];
    for (const [heading, data] of Object.entries(frames)) {
        const file = `DISK-flight-${heading}.png`;
        await fs.writeFile(path.join(out, file), Buffer.from(data.split(',')[1], 'base64'));
        report.flightFrames.push(file);
    }
    await stopClip('DISK-native-flight-and-turns');
} catch (error) { failure = error; }
finally { await close(failure); }
if (failure) throw failure;
console.log(JSON.stringify({ status: report.status, output: out, headings: report.flightFrames.length }));
