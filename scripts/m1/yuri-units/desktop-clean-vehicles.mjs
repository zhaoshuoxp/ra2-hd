// Compare immutable accepted/candidate resources through the actual game renderer.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from './desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const density = Number(process.argv.find(arg => arg.startsWith('--density='))?.split('=')[1] ?? 4);
assert([2, 4].includes(density));
const names = process.argv.find(arg => arg.startsWith('--families='))?.split('=')[1].split(',')
    ?? ['MIND', 'LTNK', 'YTNK'];
assert(names.every(name => ['MIND', 'LTNK', 'YTNK'].includes(name)));
const s = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = true; graphics.hdDensity.value = density;
    }, density);
});
const { page, report, stage, startClip, stopClip, close, out } = s;
report.requestedDensity = density;
report.families = {};
let failure, recording = false;
try {
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied, g = d.game;
        // A clear land patch permits the same native route in both resource roots.
        const rule = g.rules.getObject('LTNK', 7);
        const clear = t => t && g.map.isWithinBounds(t) && !t.rampType
            && g.map.terrain.getPassableSpeed(t, rule.speedType, false, false) > 0
            && !g.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain());
        const offsets = [];
        for (let x = -4; x <= 4; x++) for (let y = -4; y <= 4; y++) offsets.push([x, y]);
        const tiles = g.map.tiles.getAll(), byPosition = new Map(tiles.map(t => [t.rx + ',' + t.ry, t]));
        f.reviewOrigin = tiles.filter(t => clear(t)
            && offsets.every(([x, y]) => clear(byPosition.get((t.rx + x) + ',' + (t.ry + y)))))
            .sort((a, b) => Math.hypot(a.rx - f.center.rx + 12, a.ry - f.center.ry + 12)
                - Math.hypot(b.rx - f.center.rx + 12, b.ry - f.center.ry + 12))[0];
        if (!f.reviewOrigin) throw Error('No complete legal land patch');
        f.captureHeadings = {}; f.motion = [];
        const render = d.renderer.render.bind(d.renderer);
        d.renderer.render = (...args) => {
            render(...args);
            const u = f.actor, r = u && d.renderableManager.getRenderableByGameObject(u);
            if (!r?.unitVxlHd?.active) return;
            const layer = r.unitVxlHd.layers.find(layer => !layer.turret);
            const frame = layer.frames.find(frame => frame.batch.visible || frame.translucent.visible);
            if (!frame) return;
            const heading = frame.frame.heading;
            if (u.isMoving) f.motion.push({ tick: g.currentTick, heading, position: u.position.worldPosition.toArray(), hd: true });
            if (!u.isMoving || f.captureHeadings[heading]) return;
            const canvas = d.renderer.renderer.domElement, v = d.worldScene.viewport;
            const p = r.getPosition().clone().project(d.worldScene.camera), ratio = canvas.width / d.renderer.width;
            const x = (v.x + (p.x + 1) * v.width / 2) * ratio, y = (v.y + (1 - p.y) * v.height / 2) * ratio;
            const detail = document.createElement('canvas'); detail.width = 640; detail.height = 420;
            detail.getContext('2d').drawImage(canvas, Math.round(x - 320), Math.round(y - 252), 640, 420, 0, 0, 640, 420);
            f.captureHeadings[heading] = { tick: g.currentTick, png: detail.toDataURL() };
        };
    });
    for (const name of names) {
        const result = report.families[name] = {};
        await page.evaluate(name => {
            const d = window.__ra2debug, f = window.__allied;
            for (const u of Object.values(f.actors)) if (u.isSpawned) d.game.unspawnObject(u);
            f.actors = {}; f.captureHeadings = {}; f.motion = [];
            f.actor = f.spawn(name, 7, f.reviewOrigin);
            f.detailSize = [640, 420];
            d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
        }, name);
        await page.waitForFunction(() => window.__allied.sample(window.__allied.actor).vxlHd, undefined, { timeout: 30000 });
        result.binding = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied, r = d.renderableManager.getRenderableByGameObject(f.actor);
            const layer = r.unitVxlHd.layers.find(layer => !layer.turret);
            const frame = layer.frames.find(frame => frame.batch.visible || frame.translucent.visible);
            return { ...f.sample(f.actor), position: f.actor.position.worldPosition.toArray(),
                direction: f.actor.direction, bodyHeading: frame.frame.heading,
                density: d.sovietUnitsHd.families[f.actor.name].density,
                actualPartKeys: r.unitVxlHd.family.parts.map(part => part.key) };
        });
        assert.equal(result.binding.density, density);
        await stage(name + '-idle-comparison');
        result.recording = await startClip(); recording = true;
        for (const [dx, dy] of [[3, 0], [3, 3], [0, 3], [-3, 3], [-3, 0], [-3, -3], [0, -3], [3, -3]]) {
            for (const offset of [[dx, dy], [0, 0]]) {
                await page.evaluate(([dx, dy]) => {
                    const d = window.__ra2debug, f = window.__allied;
                    f.destination = [f.reviewOrigin.rx + dx, f.reviewOrigin.ry + dy];
                    d.actionsApi.orderUnits([f.actor.id], 0, ...f.destination);
                }, offset);
                await page.waitForFunction(() => window.__allied.actor.isMoving, undefined, { timeout: 15000, polling: 16 });
                await page.waitForFunction(() => {
                    const f = window.__allied;
                    return !f.actor.isMoving && Math.hypot(f.actor.tile.rx - f.destination[0], f.actor.tile.ry - f.destination[1]) < 1;
                }, undefined, { timeout: 30000, polling: 16 });
            }
        }
        result.motion = await page.evaluate(() => window.__allied.motion);
        const frames = await page.evaluate(() => window.__allied.captureHeadings);
        assert.equal(Object.keys(frames).length, 8, 'All eight authored body views must render during native turns');
        result.nativeFrames = [];
        for (const [heading, frame] of Object.entries(frames)) {
            const file = name + '-native-heading-' + heading + '.png';
            await fs.writeFile(path.join(out, file), Buffer.from(frame.png.split(',')[1], 'base64'));
            result.nativeFrames.push({ heading: Number(heading), tick: frame.tick, file });
        }
        await page.evaluate(name => {
            const d = window.__ra2debug, f = window.__allied;
            f.target = f.spawn(name === 'MIND' ? 'HTNK' : 'E2', name === 'MIND' ? 7 : 3,
                { rx: f.actor.tile.rx + 3, ry: f.actor.tile.ry }, f.enemy);
            f.target.attackTrait.setDisabled(true); f.target.moveTrait.setDisabled(true);
            d.actionsApi.orderUnits([f.actor.id], 2, f.target.id);
        }, name);
        await page.waitForFunction(() => {
            const f = window.__allied;
            return f.actor.name === 'MIND' ? f.target.owner === f.player : f.target.healthTrait.health < f.target.rules.strength;
        }, undefined, { timeout: 30000 });
        await stage(name + '-native-attack');
        result.nativeAttack = true;
        await page.waitForTimeout(800);
        await stopClip(name + '-clean-native-move-turn-attack'); recording = false;
        result.status = 'PASS_NATIVE_COMPLETE_FAMILY_CANDIDATE';
    }
} catch (error) { failure = error; }
finally {
    if (recording) await stopClip('failed-clean-vehicle-case');
    await close(failure);
}
if (failure) throw failure;
console.log(JSON.stringify({ status: report.status, output: out, families: Object.keys(report.families) }));
