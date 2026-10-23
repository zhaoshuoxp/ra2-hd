// Record actual Original-resource and HD motion with frame and joint telemetry.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from './desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const density = Number(process.argv.find(x => x.startsWith('--density='))?.split('=')[1] ?? 4);
const names = process.argv.find(x => x.startsWith('--families='))?.split('=')[1].split(',') ?? ['CAOS', 'DISK'];
assert(names.every(name => ['CAOS', 'DISK'].includes(name)));
const s = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = density > 0;
        if (density) graphics.hdDensity.value = density;
    }, density);
});
const { page, report, startClip, stopClip, stage, close, out } = s;
report.referenceKind = density ? 'Authored HD' : 'Original retail resources in project engine; not Westwood executable';
report.density = density || 'Original';
await page.evaluate(() => {
    const d = window.__ra2debug, f = window.__allied;
    f.effectRecords = []; f.animations = []; f.motion = []; f.motionFrames = {};
    const create = d.renderableManager.createTransientAnim.bind(d.renderableManager);
    d.renderableManager.createTransientAnim = (name, callback, ...args) => create(name, anim => {
        callback?.(anim);
        if (name === 'CDGAS') {
            const record = { id: f.effectRecords.length, created: d.game.currentTick, frames: [] };
            f.effectRecords.push(record); f.animations.push({ anim, record });
        }
    }, ...args);
    f.motionTimer = setInterval(() => {
        for (const { anim, record } of f.animations) if (anim.animationRunner) {
            record.frames.push({ tick: d.game.currentTick, requested: anim.animationRunner.getCurrentFrame(),
                rendered: anim.mainObj?.builder?.getFrame(), count: anim.mainObj?.frameCount,
                state: anim.animation?.getState(), rate: anim.animation?.props.rate,
                smoothFrame: anim.gasMotion?.frame, fraction: anim.gasMotion?.fraction,
                smoothVisible: anim.gasMotion?.mesh.visible, attached: !!anim.gasMotion?.mesh.parent });
        }
        const actor = f.actor;
        if (actor?.name === 'DISK') {
            const r = d.renderableManager.getRenderableByGameObject(actor);
            f.motion.push({ tick: d.game.currentTick, facing: actor.turretTrait.facing,
                position: actor.position.worldPosition.toArray(),
                displayed: r.unitVxlHd?.layers.flatMap(l => l.frames)
                    .filter(l => l.batch.visible).map(l => ({ member: l.part.member,
                        heading: l.frame.heading, opacity: l.batch.material.opacity,
                        phase: l.batch.userData.discPhase, matrix: l.batch.matrix.elements.slice() })) });
        }
    }, 16);
    const render = d.renderer.render.bind(d.renderer);
    d.renderer.render = (...args) => {
        render(...args);
        if (f.actor?.name !== 'DISK') return;
        const r = d.renderableManager.getRenderableByGameObject(f.actor);
        if (!r || !r.unitVxlHd?.active && d.generalOptions.graphics.hdEnabled.value) return;
        const heading = Math.floor(f.actor.turretTrait.facing / 11.25) * 11.25;
        if (f.motionFrames[heading]) return;
        const c = d.renderer.renderer.domElement, v = d.worldScene.viewport;
        const p = r.getPosition().clone().project(d.worldScene.camera), ratio = c.width / d.renderer.width;
        const x = (v.x + (p.x + 1) * v.width / 2) * ratio, y = (v.y + (1 - p.y) * v.height / 2) * ratio;
        const crop = document.createElement('canvas'); crop.width = 420; crop.height = 300;
        crop.getContext('2d').drawImage(c, Math.round(x - 210), Math.round(y - 210), 420, 300, 0, 0, 420, 300);
        f.motionFrames[heading] = crop.toDataURL();
    };
});
let failure;
try {
    for (const name of names) {
        await page.evaluate(name => {
            const d = window.__ra2debug, f = window.__allied;
            for (const actor of Object.values(f.actors)) if (actor.isSpawned) d.game.unspawnObject(actor);
            f.actors = {}; f.actor = f.spawn(name, 7, { rx: f.center.rx - 12, ry: f.center.ry - 12 });
            f.detailSize = [1400, 900];
            d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
            f.clipStart = d.game.currentTick;
        }, name);
        await page.waitForFunction(density => {
            const f = window.__allied;
            return !density || f.sample(f.actor).vxlHd;
        }, density);
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            if (f.actor.name === 'CAOS') d.actionsApi.orderUnits([f.actor.id], 10);
            f.clipStart = d.game.currentTick;
        });
        const recording = await startClip();
        await page.waitForFunction(() => window.__ra2debug.game.currentTick >= window.__allied.clipStart + 240,
            undefined, { timeout: 90000, polling: 16 });
        await stage(`${name}-motion-r11`);
        report.stages.at(-1).videoCrop = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            const r = d.renderableManager.getRenderableByGameObject(f.actor), c = d.renderer.renderer.domElement;
            const v = d.worldScene.viewport, p = r.getPosition().clone().project(d.worldScene.camera);
            const ratio = c.width / d.renderer.width;
            return [Math.round((v.x + (p.x + 1) * v.width / 2) * ratio - 700),
                Math.round((v.y + (1 - p.y) * v.height / 2) * ratio - 540), 1400, 900];
        });
        await stopClip(`${name}-motion-r11`);
        report.stages.at(-1).recording = recording;
        if (name === 'CAOS') {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                d.actionsApi.orderUnits([f.actor.id], 10); f.stoppedAt = d.game.currentTick;
            });
            await page.waitForFunction(() => window.__ra2debug.game.currentTick >= window.__allied.stoppedAt + 160,
                undefined, { timeout: 60000, polling: 16 });
            report.gasCleanup = await page.evaluate(() => !window.__allied.actor.deployerTrait.isDeployed()
                && window.__allied.animations.every(({ anim }) => !anim.gasMotion?.mesh.parent && anim.isAnimFinished()));
            assert(report.gasCleanup, 'Stopped native gas clouds must finish and release their motion meshes');
        }
    }
    report.effectRecords = await page.evaluate(() => window.__allied.effectRecords);
    report.motion = await page.evaluate(() => window.__allied.motion);
    report.motionFrames = [];
    for (const [heading, data] of Object.entries(await page.evaluate(() => window.__allied.motionFrames))) {
        const file = `DISK-phase-${heading}.png`;
        await fs.writeFile(path.join(out, file), Buffer.from(data.split(',')[1], 'base64'));
        report.motionFrames.push(file);
    }
    if (names.includes('DISK')) assert(report.motionFrames.length >= 16, 'A continuous revolution must record at least 16 native phases');
    if (names.includes('CAOS')) assert(report.effectRecords.length >= 2);
    if (density) {
        assert(report.effectRecords.every(effect => effect.frames.some(f => f.fraction > .05 && f.fraction < .95)));
        if (names.includes('DISK')) {
            const phases = report.motion.flatMap(row => row.displayed?.map(f => f.phase) ?? [])
                .filter(phase => phase !== undefined);
            assert(new Set(phases).size >= 16);
            assert(phases.every((phase, i) => !i || phase >= phases[i - 1]), 'Visible markings rotate in one direction');
        }
    }
    report.status = 'PASS_RECORDING_AND_TELEMETRY';
} catch (error) { failure = error; report.status = 'FAIL'; report.failure = error.stack; }
finally {
    await page.evaluate(() => clearInterval(window.__allied.motionTimer));
    await fs.writeFile(`${out}/motion.json`, JSON.stringify({ effects: report.effectRecords, motion: report.motion }, null, 2));
    await close(failure);
}
if (failure) throw failure;
