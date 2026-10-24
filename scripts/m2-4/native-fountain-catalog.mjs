import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [receipt, output, catalogFile] = process.argv.slice(2), root = path.resolve(output);
const catalog = JSON.parse(await fs.readFile(catalogFile, 'utf8'));
await fs.mkdir(root, { recursive: false });
const results = [];
for (const entry of catalog) {
    const name = entry.edition + '-' + entry.name.replace('.map', '');
    process.argv = process.argv.filter(arg => !arg.startsWith('--map=') && !arg.startsWith('--bot-slot='));
    process.argv.push('--map=' + entry.runtimeName, '--bot-slot=1');
    let session, failure;
    const result = { ...entry, density: process.argv.includes('--2x') ? 2 : 4, fountains: [] };
    try {
        session = await startSession(receipt, path.join(root, name), entry.edition, false, async ({ page }) => {
            await page.evaluate(density => {
                window.__ra2debug.generalOptions.graphics.hdDensity.value = density;
            }, result.density);
        });
        const count = await session.page.evaluate(() => {
            clearInterval(window.__allied.timer);
            window.__catalogFountains = window.__ra2debug.game.getWorld().getAllObjects().filter(o => o.name === 'CAWASH18');
            return window.__catalogFountains.length;
        });
        assert.equal(count, entry.placed.length);
        for (let index = 0; index < count; index++) {
            await session.page.evaluate(index => {
                const d = window.__ra2debug;
                d.worldInteraction.minimapHandler.panToTile(window.__catalogFountains[index].tile);
            }, index);
            await session.page.waitForTimeout(1500);
            await session.page.evaluate(index => {
                const d = window.__ra2debug, unit = window.__catalogFountains[index];
                const originalRender = d.renderer.render.bind(d.renderer);
                window.__fountainAudit = { samples: [], captures: [], startTick: d.game.currentTick, originalRender };
                d.renderer.render = (...args) => {
                    const rendered = originalRender(...args), audit = window.__fountainAudit;
                    const r = d.renderableManager.getRenderableByGameObject(unit), sprite = r.animObjects.get(2)?.find(s => s.get3DObject().visible);
                    const fixed = r.fountainSurface?.reference?.mesh;
                    const sample = { tick: d.game.currentTick, frame: sprite?.builder.getFrame(),
                        base: r.mainObj.get3DObject().visible, active: !!sprite, reference: !!fixed?.visible,
                        glError: d.renderer.renderer.getContext().getError() };
                    if (fixed) {
                        const canvas = d.renderer.getCanvas(), viewport = d.worldScene.viewport;
                        const vertices = fixed.geometry.getAttribute('position'), points = [], ratio = canvas.width / d.renderer.width;
                        for (let i = 0; i < vertices.count; i++) {
                            const p = fixed.position.clone().fromBufferAttribute(vertices, i).applyMatrix4(fixed.matrixWorld).project(d.worldScene.camera);
                            points.push([(viewport.x + (p.x + 1) * viewport.width / 2) * ratio,
                                (viewport.y + (1 - p.y) * viewport.height / 2) * ratio]);
                        }
                        const left = Math.ceil(Math.min(...points.map(p => p[0]))) + 10;
                        const top = Math.ceil(Math.min(...points.map(p => p[1]))) + 5;
                        const width = Math.floor(Math.max(...points.map(p => p[0]))) - left - 10;
                        const height = Math.floor(Math.max(...points.map(p => p[1]))) - top - 5;
                        const region = document.createElement('canvas'); region.width = width; region.height = height;
                        region.getContext('2d').drawImage(canvas, left, top, width, height, 0, 0, width, height);
                        let hash = 2166136261;
                        for (const value of region.getContext('2d').getImageData(0, 0, width, height).data)
                            hash = Math.imul(hash ^ value, 16777619) >>> 0;
                        sample.basin = hash;
                        if (!audit.captures.some(item => item.frame === sample.frame)) {
                            const crop = document.createElement('canvas'); crop.width = 240; crop.height = 220;
                            crop.getContext('2d').drawImage(canvas, left - 100, top - 110, 240, 220, 0, 0, 240, 220);
                            audit.captures.push({ frame: sample.frame, png: crop.toDataURL('image/png').split(',')[1] });
                        }
                    }
                    audit.samples.push(sample); return rendered;
                };
            }, index);
            await session.page.waitForTimeout(3000);
            const audit = await session.page.evaluate(index => {
                const d = window.__ra2debug, audit = window.__fountainAudit, unit = window.__catalogFountains[index];
                d.renderer.render = audit.originalRender;
                return { tile: [unit.tile.rx, unit.tile.ry], health: unit.healthTrait?.health,
                    startTick: audit.startTick, endTick: d.game.currentTick, samples: audit.samples, captures: audit.captures };
            }, index);
            for (const capture of audit.captures) {
                const file = `fountain-${index}-frame-${capture.frame}.png`;
                await fs.writeFile(path.join(session.out, file), Buffer.from(capture.png, 'base64'));
                delete capture.png; capture.file = file;
            }
            result.fountains.push(audit);
            assert(audit.samples.length > 10 && audit.endTick > audit.startTick);
            assert(audit.samples.every(s => !s.base && s.active && s.reference && s.glError === 0));
            assert.equal(new Set(audit.samples.map(s => s.frame)).size, 10);
            assert.equal(new Set(audit.samples.map(s => s.basin)).size, 1);
            assert(audit.samples.every(s => s.basin !== undefined));
        }
        result.status = 'PASS_NATIVE_ALL_PLACED_FOUNTAINS';
    } catch (error) { failure = error; result.status = 'FAIL'; result.error = String(error.stack); }
    if (session) await session.close(failure);
    await fs.writeFile(path.join(root, name + '.json'), JSON.stringify(result, null, 2) + '\n');
    results.push({ edition: entry.edition, name: entry.name, status: result.status,
        fountains: result.fountains.length, expected: entry.placed.length, error: result.error });
    await fs.writeFile(path.join(root, 'progress.json'), JSON.stringify(results, null, 2) + '\n');
    console.log(JSON.stringify(results.at(-1)));
}
assert(results.every(result => result.status.startsWith('PASS')), 'Inspect preserved per-map failures');
