// Focused native-order verification for the accepted Task D feedback corrections.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from './desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const density = Number(process.argv.find(arg => arg.startsWith('--density='))?.split('=')[1] ?? 4);
const names = process.argv.find(arg => arg.startsWith('--families='))?.split('=')[1].split(',')
    ?? ['DISK', 'TELE', 'MIND', 'YURIPR', 'CAOS'];
assert(names.every(name => ['DISK', 'TELE', 'MIND', 'YURIPR', 'CAOS', 'YURI'].includes(name)));
assert([0, 2, 4].includes(density), 'Density must be 0 (Original), 2 or 4');
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = density > 0;
        if (density) graphics.hdDensity.value = density;
    }, density);
});
const { page, report, stage, startClip, stopClip, close, out } = session;
const wait = (fn, timeout = 30000) => page.waitForFunction(fn, undefined, { timeout, polling: 16 });
report.corrections = {};
report.requestedDensity = density || 'Original';
await page.evaluate(density => {
    const d = window.__ra2debug, f = window.__allied;
    f.effects = []; f.effectTrace = []; f.detonations = []; f.headings = [];
    f.frameCaptures = {};
    const addEffect = d.renderableManager.addEffect.bind(d.renderableManager);
    d.renderableManager.addEffect = effect => { f.effects.push(effect); addEffect(effect); };
    const dispatch = d.game.events.dispatch.bind(d.game.events);
    d.game.events.dispatch = event => {
        if (event.type === 30) f.detonations.push({ tick: d.game.currentTick,
            animation: event.explodeAnim, position: event.position.toArray(), target: event.target?.obj?.id });
        dispatch(event);
    };
    f.feedbackTimer = setInterval(() => {
        const objects = f.effects.map(effect => effect.get3DObject?.()).filter(object => object?.parent);
        f.effectTrace.push({ tick: d.game.currentTick, effects: objects.map(object => ({
            name: object.name, phase: object.userData.phase, source: object.userData.source,
            target: object.userData.target, vertices: object.geometry?.getAttribute('position')?.count,
        })) });
        if (f.actor?.name === 'DISK') {
            const r = d.renderableManager.getRenderableByGameObject(f.actor);
            const yaw = f.actor.turretTrait.facing;
            f.headings.push({ tick: d.game.currentTick, yaw, heading: (Math.round(yaw / 45) * 45) % 360,
                hd: !!r?.unitVxlHd?.active });
        }
    }, 16);
    f.live = name => f.effects.map(effect => effect.get3DObject?.()).filter(object => object?.parent && object.name === name);
    const render = d.renderer.render.bind(d.renderer);
    d.renderer.render = (...args) => {
        render(...args);
        if (f.actor?.name === 'TELE' && f.target) {
            const effect = f.live('fx_magnetic_ribbon')[0];
            if (!effect || f.target.magneticLiftTrait.getController() !== f.actor || f.target.tileElevation <= 0) return;
            const first = f.frameCaptures['TELE-live-purple-ribbon'];
            const target = f.target.position.worldPosition.toArray();
            const pulled = first && Math.hypot(target[0] - first.target[0], target[2] - first.target[2]) > 1;
            const key = !first ? 'TELE-live-purple-ribbon' : pulled ? 'TELE-moving-iridescent-field' : undefined;
            if (!key || f.frameCaptures[key]) return;
            const r = d.renderableManager.getRenderableByGameObject(f.actor);
            const canvas = d.renderer.renderer.domElement, v = d.worldScene.viewport;
            const p = r.getPosition().clone().project(d.worldScene.camera), ratio = canvas.width / d.renderer.width;
            const x = (v.x + (p.x + 1) * v.width / 2) * ratio, y = (v.y + (1 - p.y) * v.height / 2) * ratio;
            const detail = document.createElement('canvas'); detail.width = 1600; detail.height = 700;
            detail.getContext('2d').drawImage(canvas, Math.round(x - 800), Math.round(y - 420), 1600, 700, 0, 0, 1600, 700);
            const victimRenderable = d.renderableManager.getRenderableByGameObject(f.target);
            let bounds;
            for (const mesh of victimRenderable.bodyVxlBuilder.sections.values()) {
                mesh.updateWorldMatrix(true, false);
                if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
                const box = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
                bounds ? bounds.union(box) : bounds = box;
            }
            const project = point => {
                const p = r.getPosition().clone().fromArray(point).project(d.worldScene.camera);
                return [(v.x + (p.x + 1) * v.width / 2) * ratio - Math.round(x - 800),
                    (v.y + (1 - p.y) * v.height / 2) * ratio - Math.round(y - 420)];
            };
            f.frameCaptures[key] = { tick: d.game.currentTick, samples: Object.values(f.actors).map(f.sample), target,
                endpoint: effect.userData.target, elevated: f.target.tileElevation, bands: effect.children.length,
                logicalWidth: effect.userData.logicalWidth, animationTime: effect.userData.animationTime,
                source: effect.userData.source, sourcePixel: project(effect.userData.source), endpointPixel: project(effect.userData.target),
                opacityRange: effect.userData.opacityRange, appearance: effect.userData.appearance, emission: effect.userData.emission,
                targetHd: !!victimRenderable.unitVxlHd?.active,
                targetBodyBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
                png: detail.toDataURL() };
            if (pulled) {
                effect.visible = false; render(...args);
                detail.getContext('2d').drawImage(canvas, Math.round(x - 800), Math.round(y - 420), 1600, 700, 0, 0, 1600, 700);
                f.transparencyOff = detail.toDataURL();
                effect.visible = true; render(...args);
                f.teleStop = { tick: d.game.currentTick, activeController: f.target.magneticLiftTrait.getController() === f.actor,
                    beamVisible: !!effect.parent, elevated: f.target.tileElevation, target };
                d.actionsApi.orderUnits([f.actor.id], 11);
                f.teleStop.nativeOrderSubmitted = true;
            }
            return;
        }
        if (f.actor?.name !== 'DISK') return;
        const r = d.renderableManager.getRenderableByGameObject(f.actor);
        if (!r?.vxlBuilders?.length) return;
        if (density && !r.unitVxlHd?.active) return;
        const heading = (Math.round(f.actor.turretTrait.facing / 45) * 45) % 360;
        const effect = f.live('fx_disc_laser')[0];
        const key = effect ? (effect.userData.phase === 'ring' && effect.userData.progress >= .4 ? 'DISK-ring-live-frame'
            : effect.userData.phase === 'ray' ? 'DISK-ray-live-frame' : undefined) : 'DISK-spin-' + heading;
        if (!key || f.frameCaptures[key]) return;
        const canvas = d.renderer.renderer.domElement, v = d.worldScene.viewport;
        const p = r.getPosition().clone().project(d.worldScene.camera), ratio = canvas.width / d.renderer.width;
        const x = (v.x + (p.x + 1) * v.width / 2) * ratio, y = (v.y + (1 - p.y) * v.height / 2) * ratio;
        const detail = document.createElement('canvas'); detail.width = 1000; detail.height = 700;
        detail.getContext('2d').drawImage(canvas, Math.round(x - 500), Math.round(y - 420), 1000, 700, 0, 0, 1000, 700);
        f.frameCaptures[key] = { tick: d.game.currentTick, heading, phase: effect?.userData.phase,
            progress: effect?.userData.progress, hd: !!r.unitVxlHd?.active, png: detail.toDataURL() };
    };
    f.setup = name => {
        for (const unit of Object.values(f.actors)) if (unit.isSpawned) d.game.unspawnObject(unit);
        f.actors = {}; f.effects = []; f.effectTrace = []; f.detonations = []; f.headings = [];
        f.frameCaptures = {}; f.teleStop = undefined;
        f.actor = f.spawn(name, ['YURIPR', 'YURI'].includes(name) ? 3 : 7, { rx: f.center.rx - 12, ry: f.center.ry - 12 });
        f.actor.moveTrait?.setDisabled(true);
        d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
        f.detailSize = [900, 620];
    };
    f.targetFor = (name, distance, ry = 0) => {
        const unit = f.spawn(name, name === 'E2' ? 3 : 7,
            { rx: f.actor.tile.rx + distance, ry: f.actor.tile.ry + ry }, f.enemy);
        unit.attackTrait?.setDisabled(true); unit.moveTrait?.setDisabled(true); return unit;
    };
    f.attack = () => d.actionsApi.orderUnits([f.actor.id], 2, f.target.id);
}, density);
let recording = false, failure;
try {
    for (const name of names) {
        const result = report.corrections[name] = { status: 'RUNNING' };
        await page.evaluate(name => window.__allied.setup(name), name);
        await page.waitForFunction(density => {
            const f = window.__allied, d = window.__ra2debug, s = f.sample(f.actor);
            return density ? s.shpHd || s.vxlHd : !!d.renderableManager.getRenderableByGameObject(f.actor);
        }, density, { timeout: 30000 });
        result.binding = await page.evaluate(() => window.__allied.sample(window.__allied.actor));
        assert.equal(!!(result.binding.shpHd || result.binding.vxlHd), density > 0);
        result.actualDensity = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied; return d.sovietUnitsHd?.families[f.actor.name]?.density;
        });
        if (density) assert.equal(result.actualDensity, density);
        result.recording = await startClip(); recording = true;
        if (name === 'DISK') {
            await wait(() => new Set(window.__allied.headings.map(h => h.heading)).size === 8);
            result.spin = await page.evaluate(() => window.__allied.headings);
            await stage('DISK-native-spin');
            await page.evaluate(() => { const f = window.__allied; f.target = f.targetFor('HTNK', 4); f.attack(); });
            await wait(() => window.__allied.live('fx_disc_laser').some(o => o.userData.phase === 'ring'));
            await stage('DISK-ring');
            await wait(() => window.__allied.live('fx_disc_laser').some(o => o.userData.phase === 'ray'));
            await stage('DISK-outgoing-ray');
            await wait(() => window.__allied.frameCaptures['DISK-ring-live-frame'] && window.__allied.frameCaptures['DISK-ray-live-frame']);
            const frames = await page.evaluate(() => window.__allied.frameCaptures);
            result.liveFrames = [];
            for (const [frameName, { png, ...metadata }] of Object.entries(frames)) {
                await fs.writeFile(path.join(out, frameName + '.png'), Buffer.from(png.split(',')[1], 'base64'));
                result.liveFrames.push({ file: frameName + '.png', ...metadata });
            }
            assert.equal(result.liveFrames.filter(frame => frame.file.startsWith('DISK-spin-')).length, 8);
            assert(result.liveFrames.every(frame => frame.hd === (density > 0)));
            result.ringThenRay = await page.evaluate(() => window.__allied.effectTrace);
            assert(result.ringThenRay.some(r => r.effects.some(e => e.name === 'fx_disc_laser' && e.phase === 'ring')));
            assert(result.ringThenRay.some(r => r.effects.some(e => e.name === 'fx_disc_laser' && e.phase === 'ray')));
            await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.actor.id], 11));
            await wait(() => !window.__allied.live('fx_disc_laser').length);
            result.laserCleanup = true;
        } else if (name === 'TELE') {
            await page.evaluate(() => { window.__allied.detailSize = [1600, 700]; });
            await page.evaluate(() => { const f = window.__allied; f.target = f.targetFor('HTNK', 6); f.attack(); });
            await wait(() => window.__allied.frameCaptures['TELE-moving-iridescent-field'] && window.__allied.teleStop?.nativeOrderSubmitted);
            const frames = await page.evaluate(() => window.__allied.frameCaptures);
            const hidden = await page.evaluate(() => window.__allied.transparencyOff);
            await fs.writeFile(path.join(out, 'TELE-beam-hidden-same-frame-detail.png'), Buffer.from(hidden.split(',')[1], 'base64'));
            for (const [key, { png, ...metadata }] of Object.entries(frames)) {
                await fs.writeFile(path.join(out, key + '-detail.png'), Buffer.from(png.split(',')[1], 'base64'));
                report.stages.push({ name: key, samples: metadata.samples, capture: 'SAME_RENDERED_LIVE_FRAME' });
            }
            const { png: firstPng, ...first } = frames['TELE-live-purple-ribbon'];
            const { png: movingPng, ...moving } = frames['TELE-moving-iridescent-field'];
            result.lifting = first; result.moving = moving;
            assert.equal(result.lifting.bands, 1); assert(result.lifting.elevated > 0);
            assert(result.lifting.logicalWidth >= 8 && result.lifting.logicalWidth <= 10,
                'One filled band matching the supplied retail reference width');
            assert(result.lifting.opacityRange[0] > 0 && result.lifting.opacityRange[1] < .7);
            for (const frame of [first, moving]) {
                if (!frame.targetHd) assert(Math.abs(frame.endpoint[1] - frame.targetBodyBounds.min[1]) < 1,
                    'Contact follows the bottom of the live rendered native body');
                assert(Math.hypot(frame.endpoint[0] - frame.target[0], frame.endpoint[2] - frame.target[2]) > 20,
                    'Contact is on the body perimeter, away from the unit center');
            }
            assert(Math.hypot(moving.target[0] - first.target[0], moving.target[2] - first.target[2]) > 1,
                'The live rendered endpoint follows native horizontal pulling after lift');
            result.stopDuringLift = await page.evaluate(() => window.__allied.teleStop);
            assert(result.stopDuringLift.activeController && result.stopDuringLift.beamVisible && result.stopDuringLift.elevated > 0);
            await wait(() => !window.__allied.target.magneticLiftTrait.isActive() && !window.__allied.live('fx_magnetic_ribbon').length);
            result.liveEndpointAndRelease = true; await stage('TELE-released-clean');
        } else if (['MIND', 'YURIPR', 'YURI'].includes(name)) {
            await page.evaluate(name => {
                const d = window.__ra2debug, f = window.__allied;
                f.target = f.targetFor(name === 'MIND' ? 'HTNK' : 'E2', 3);
                d.renderableManager.getRenderableByGameObject(f.actor).selectionModel.setSelected(true); f.attack();
            }, name);
            await wait(() => {
                const f = window.__allied; return f.target.owner === f.player && f.live('fx_mclink').length;
            });
            await stage(name + '-selected-native-control-arc');
            result.nativeControlledArc = await page.evaluate(() => {
                const f = window.__allied, line = f.live('fx_mclink')[0], positions = line.geometry.getAttribute('position');
                const ys = Array.from({ length: positions.count }, (_, i) => positions.getY(i));
                return { source: f.actor.id, controlled: f.actor.mindControllerTrait.getTargets().map(t => t.id),
                    target: f.target.id, vertices: positions.count, arcRise: Math.max(...ys) - Math.min(...ys),
                    sourceAttachment: [positions.getX(0), positions.getY(0), positions.getZ(0)],
                    sourceBase: f.actor.position.worldPosition.toArray() };
            });
            assert(result.nativeControlledArc.vertices > 2); assert(result.nativeControlledArc.arcRise > 256);
            assert(result.nativeControlledArc.sourceAttachment[1] > result.nativeControlledArc.sourceBase[1] + 64);
            await page.waitForTimeout(3000);
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                d.renderableManager.getRenderableByGameObject(f.actor).selectionModel.setSelected(false);
            });
            await wait(() => !window.__allied.live('fx_mclink').length);
            result.nativeSelectionGate = true;
        } else {
            await page.evaluate(() => {
                const f = window.__allied; f.target = f.targetFor('E2', 2); f.far = f.targetFor('E2', 5);
                f.attack();
            });
            await wait(() => window.__allied.target.berserkTrait.isActive());
            await stage('CAOS-caster-centered-native-gas');
            result.center = await page.evaluate(() => {
                const f = window.__allied;
                return { source: f.actor.position.worldPosition.toArray(), orderedTarget: f.target.position.worldPosition.toArray(),
                    farTarget: f.far.position.worldPosition.toArray(), nearAffected: f.target.berserkTrait.isActive(),
                    farAffected: f.far.berserkTrait.isActive(), detonations: f.detonations };
            });
            assert(result.center.nearAffected); assert.equal(result.center.farAffected, false);
            assert(result.center.detonations.some(e => e.animation === 'CDGAS'
                && Math.hypot(e.position[0] - result.center.source[0], e.position[2] - result.center.source[2]) < 1));
        }
        result.effects = await page.evaluate(() => window.__allied.effectTrace);
        await stopClip(name + '-native-feedback-correction'); recording = false;
        result.status = 'PASS_SELECTED_NATIVE_CASE';
    }
} catch (error) { failure = error; }
finally {
    if (recording) await stopClip('failed-native-feedback-case');
    await page.evaluate(() => clearInterval(window.__allied.feedbackTimer));
    await fs.writeFile(path.join(out, 'corrections.json'), JSON.stringify(report.corrections, null, 2) + '\n');
    await close(failure);
}
if (failure) throw failure;
console.log(JSON.stringify({ status: report.status, corrections: Object.keys(report.corrections), output: out }));
