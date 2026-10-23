// Read actual Original building bindings on the archived Snow map; no renderer mutation.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const edition = process.argv.includes('--edition=ra2') ? 'ra2' : 'yr';
process.argv.push('--map=official-a4f07f9b927148f871136237.map', '--bot-slot=1');
const session = await startSession(receipt, output, edition, true, async ({ page }) => {
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; });
});
let failure;
try {
    const { page, report } = session;
    report.diagnosticOnly = true;
    report.disclosure = 'Read-only original building source, material and geometry observations. Shared harness reveal/stopped AI follows native startup. No map, palette, texture, body, frame or shader is changed; this probe is not visual acceptance.';
    report.originalBuildings = await page.evaluate(async () => {
        const d = window.__ra2debug, g = d.game;
        const rows = [], seen = new Set();
        const digest = async bytes => bytes && [...new Uint8Array(await crypto.subtle.digest('SHA-256',
            new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)))].map(b => b.toString(16).padStart(2, '0')).join('');
        for (const object of g.getWorld().getAllObjects().filter(object => object.isBuilding())) {
            if (seen.has(object.name)) continue;
            seen.add(object.name);
            const r = d.renderableManager.getRenderableByGameObject(object);
            if (!r) { rows.push({ name: object.name, renderableMissing: true }); continue; }
            const b = r.mainObj?.builder, mesh = b?.mesh;
            const material = mesh?.material, file = r.mainShpFile;
            const frameNo = b?.getFrame?.() ?? 0, frame = file?.images?.[frameNo];
            const texture = b?.atlas?.getTexture?.(), pixels = texture?.image?.data;
            rows.push({ name: object.name, tile: [object.tile.rx, object.tile.ry, object.tile.z],
                health: object.healthTrait?.health, placeholder: !!r.placeholderObj,
                objectImage: r.objectArt?.imageName, image: file?.filename, nativeFrames: file?.numImages,
                frameNo, nativeFrame: frame && { keys: Object.keys(frame), width: frame.width, height: frame.height,
                    bytes: frame.imageData?.byteLength, sha256: await digest(frame.imageData) },
                aggregateFrames: r.aggregatedImageData?.file?.numImages,
                paletteKeys: r.palette && Object.keys(r.palette),
                paletteSample: r.palette?.colors?.slice?.(0, 6),
                material: material && { type: material.type, class: material.constructor.name,
                    uniforms: Object.keys(material.uniforms ?? {}), defines: material.defines,
                    mapType: material.map?.type, mapFormat: material.map?.format },
                atlas: texture && { width: texture.image.width, height: texture.image.height,
                    bytes: pixels?.byteLength, sha256: await digest(pixels) },
                frameArea: b?.atlas?.getTextureArea?.(frameNo), hd: !!b?.hdOverride });
        }
        return { status: g.status, tick: g.currentTick, options: g.gameOpts,
            glError: d.renderer.renderer.getContext().getError(), rows };
    });
    assert.equal(report.originalBuildings.status, 1);
    assert.equal(report.originalBuildings.glError, 0);
    await page.screenshot({ path: path.join(output, 'original-building-bindings.png') });
    assert.equal(report.errors.length, 0);
    report.probeStatus = 'PASS_READ_ONLY_ORIGINAL_BINDING_OBSERVATIONS';
} catch (error) {
    failure = error; session.report.failure = error.stack;
    await session.page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
}
await session.close(failure);
if (failure) throw failure;
