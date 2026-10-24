import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const original = process.argv.includes('--original'), density = process.argv.includes('--2x') ? 2 : 4;
const seconds = Number(process.argv.find(arg => arg.startsWith('--seconds='))?.slice(10) ?? 35);
assert(seconds >= 5 && seconds <= 120);
const s = await startSession(receipt, output, process.argv.includes('--ra2') ? 'ra2' : 'yr', false, async ({ page }) => {
    await page.evaluate(({ original, density }) => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = !original; graphics.hdDensity.value = density;
    }, { original, density });
});
let failure;
try {
    s.report.fountain = await s.page.evaluate(async () => {
        const d = window.__ra2debug, game = d.game;
        clearInterval(window.__allied.timer);
        const unit = game.getWorld().getAllObjects().find(object => object.name === 'CAWASH18');
        if (!unit) throw Error('The selected map must contain its original fountain');
        d.worldInteraction.minimapHandler.panToTile(unit.tile);
        await new Promise(resolve => setTimeout(resolve, 350));
        window.__liveFountain = { unit, samples: [], captures: [], states: new Set(), startTick: game.currentTick,
            startTime: performance.now() };
        const render = d.renderer.render.bind(d.renderer);
        d.renderer.render = (...args) => {
            const result = render(...args), audit = window.__liveFountain;
            const r = d.renderableManager.getRenderableByGameObject(unit), active = r?.animObjects.get(2)?.[0];
            if (!active || audit.samples.length >= 12000) return result;
            const animation = r.animations.get(active);
            const sample = { time: performance.now(), tick: game.currentTick, frame: active.builder.getFrame(),
                state: animation.getState(), base: r.mainObj.get3DObject().visible,
                active: active.get3DObject().visible, hd: !!active.builder.hdOverride,
                referenceVisible: !!r.fountainSurface?.reference?.mesh.visible,
                glError: d.renderer.renderer.getContext().getError() };
            audit.samples.push(sample);
            const key = JSON.stringify([Math.floor((performance.now() - audit.startTime) / 5000),
                sample.frame, sample.state, sample.base, sample.active, sample.hd]);
            if (!audit.states.has(key)) {
                audit.states.add(key);
                const canvas = d.renderer.getCanvas(), viewport = d.worldScene.viewport;
                const point = r.getPosition().clone().project(d.worldScene.camera);
                const ratio = canvas.width / d.renderer.width;
                const x = (viewport.x + (point.x + 1) * viewport.width / 2) * ratio;
                const y = (viewport.y + (1 - point.y) * viewport.height / 2) * ratio;
                const detail = document.createElement('canvas'); detail.width = 360; detail.height = 320;
                detail.getContext('2d').drawImage(canvas, Math.round(x - 180), Math.round(y - 170), 360, 320, 0, 0, 360, 320);
                const fixed = r.fountainSurface?.reference?.mesh;
                let basin;
                if (fixed) {
                    if (!audit.basinCrop) {
                        const vertices = fixed.geometry.getAttribute('position'), points = [];
                        for (let index = 0; index < vertices.count; index++) {
                            const point = fixed.position.clone().fromBufferAttribute(vertices, index)
                                .applyMatrix4(fixed.matrixWorld).project(d.worldScene.camera);
                            points.push([(viewport.x + (point.x + 1) * viewport.width / 2) * ratio,
                                (viewport.y + (1 - point.y) * viewport.height / 2) * ratio]);
                        }
                        const left = Math.ceil(Math.min(...points.map(point => point[0]))) + 10;
                        const top = Math.ceil(Math.min(...points.map(point => point[1]))) + 5;
                        audit.basinCrop = [left, top, Math.floor(Math.max(...points.map(point => point[0]))) - left - 10,
                            Math.floor(Math.max(...points.map(point => point[1]))) - top - 5];
                    }
                    const [left, top, width, height] = audit.basinCrop;
                    const region = document.createElement('canvas'); region.width = width; region.height = height;
                    region.getContext('2d').drawImage(canvas, left, top, width, height, 0, 0, width, height);
                    const rgba = region.getContext('2d').getImageData(0, 0, width, height).data;
                    let hash = 2166136261;
                    for (const value of rgba) hash = Math.imul(hash ^ value, 16777619) >>> 0;
                    basin = { crop: audit.basinCrop, hash };
                }
                const meshInfo = mesh => mesh && ({ visible: mesh.visible, layers: mesh.layers.mask,
                    position: mesh.position.toArray(), matrix: mesh.matrix.elements, world: mesh.matrixWorld.elements,
                    geometry: mesh.geometry.uuid, positions: Array.from(mesh.geometry.attributes.position.array),
                    uv: Array.from(mesh.geometry.attributes.uv.array), material: mesh.material.type,
                    map: mesh.material.map?.uuid, parent: mesh.parent?.uuid });
                audit.captures.push({ ...sample, basin, meshes: {
                    base: meshInfo(r.mainObj.getShapeMesh()), active: meshInfo(active.getShapeMesh()),
                    reference: meshInfo(fixed), cameraLayers: d.worldScene.camera.layers.mask,
                }, png: detail.toDataURL('image/png').split(',')[1] });
            }
            return result;
        };
        const r = d.renderableManager.getRenderableByGameObject(unit), active = r.animObjects.get(2)[0];
        return { tile: [unit.tile.rx, unit.tile.ry], properties: r.animations.get(active).props,
            activeArt: r.animArtProps.getByType(2), density: d.environmentHd?.density };
    });
    await s.startClip();
    await s.page.waitForTimeout(seconds * 1000);
    await s.stopClip('fountain-continuous');
    const capture = await s.page.evaluate(() => {
        const audit = window.__liveFountain;
        return { startTick: audit.startTick, endTick: window.__ra2debug.game.currentTick,
            samples: audit.samples, captures: audit.captures };
    });
    for (let index = 0; index < capture.captures.length; index++) {
        const item = capture.captures[index], file = `state-${index}.png`;
        await fs.writeFile(path.join(s.out, file), Buffer.from(item.png, 'base64'));
        delete item.png; item.file = file;
    }
    Object.assign(s.report, capture);
    assert(capture.endTick > capture.startTick, 'Simulation must continue during the observation');
    assert(capture.samples.length >= 30);
    assert(capture.samples.every(sample => sample.glError === 0));
    assert(new Set(capture.samples.map(sample => sample.frame)).size >= 10, 'The real animation must advance');
    if (original) assert(capture.samples.every(sample => sample.base && sample.active && !sample.hd && !sample.referenceVisible),
        'Original must preserve the native base and animation without a composite HD basin');
    if (process.argv.includes('--expect-stable')) {
        assert(capture.samples.every(sample => !sample.base && sample.active && sample.hd),
            'HD fountain presentation must stay on the same complete surface across every real animation loop');
        assert(capture.samples.every(sample => sample.referenceVisible));
        assert.equal(new Set(capture.captures.map(item => item.basin?.hash)).size, 1,
            'The rendered basin must remain pixel-identical while all water frames advance');
        assert(capture.captures.every(item => item.basin?.hash !== undefined));
    }
    s.report.status = 'PASS_NATIVE_CONTINUOUS_FOUNTAIN_OBSERVATION';
    await fs.writeFile(path.join(s.out, 'fountain-loop.json'), JSON.stringify(s.report, null, 2) + '\n');
    console.log(JSON.stringify({ status: s.report.status, seconds, frames: capture.samples.length,
        states: capture.captures.map(({ png, ...state }) => state), properties: s.report.fountain.properties }));
} catch (error) { failure = error; }
await s.close(failure);
if (failure) throw failure;
