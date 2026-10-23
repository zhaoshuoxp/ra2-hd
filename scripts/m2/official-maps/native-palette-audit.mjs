// Inspect unresolved legacy art in a task-local native match before authoring.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { startSession } from '../../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(() => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = true;
        graphics.hdDensity.value = 2;
    });
});
const { page, report, close } = session;
let failure;
try {
    report.disclosure = 'Native legacy CITY palette diagnosis using unchanged selected map and rules, baseline HD selectors, an isolated task profile and controlled legal fixtures. This is not the final copied Mac review application or an HD acceptance result.';
    report.placedLegacy = await page.evaluate(() => window.__ra2debug.game.getWorld().getAllObjects()
        .filter(object => /^CITY0[1-5]$/.test(object.name))
        .map(object => ({ name: object.name, id: object.id, tile: [object.tile.rx, object.tile.ry] })));
    report.legacy = [];
    for (const name of ['CITY01', 'CITY02', 'CITY03', 'CITY04', 'CITY05']) {
        const state = await page.evaluate(name => {
            const d = window.__ra2debug;
            const object = d.game.getWorld().getAllObjects().find(object => object.name === name)
                ?? window.__allied.building(name);
            window.__allied.actors[object.id] = object;
            window.__allied.actor = object;
            d.worldInteraction.minimapHandler.panToTile(object.tile);
            return { id: object.id, name: object.name, tile: [object.tile.rx, object.tile.ry] };
        }, name);
        await page.waitForTimeout(250);
        const native = await page.evaluate(id => {
            const d = window.__ra2debug, object = window.__allied.actors[id];
            const r = d.renderableManager.getRenderableByGameObject(object);
            const sprite = r.mainObj ?? r.mainRenderable ?? r.shpRenderable;
            const builder = sprite?.builder, image = r.mainShpFile;
            const frame = image.images[0];
            return { member: image.filename, canvas: [image.width, image.height],
                paletteType: object.art.paletteType, customPaletteName: object.art.customPaletteName,
                imageName: object.art.imageName, nativeFrame: 0, renderFrame: builder?.getFrame(),
                hd: builder?.hdOverride?.identity ?? null, size: [frame.width, frame.height],
                origin: [frame.x, frame.y], indices: Array.from(frame.imageData),
                colors: r.palette.colors.map(color => [color.r, color.g, color.b]),
                paletteHash: r.palette.hash, visible: sprite?.get3DObject()?.visible };
        }, state.id);
        assert(native.visible && native.hd === null && native.paletteType === 2);
        native.runtimeIndexSha256 = createHash('sha256').update(Buffer.from(native.indices)).digest('hex');
        native.runtimePaletteSha256 = createHash('sha256').update(Buffer.from(native.colors.flat())).digest('hex');
        await fs.writeFile(path.join(output, name.toLowerCase() + '-native.json'), JSON.stringify(native, null, 2) + '\n');
        const png = await page.evaluate(() => {
            const d = window.__ra2debug;
            d.renderer.render();
            return d.renderer.renderer.domElement.toDataURL('image/png').split(',')[1];
        });
        await fs.writeFile(path.join(output, name.toLowerCase() + '-framebuffer.png'), Buffer.from(png, 'base64'));
        report.legacy.push({ ...state, ...native, indices: undefined, colors: undefined });
    }
    report.paletteAuditStatus = 'NATIVE_UNIT_PALETTE_AND_ORIGINAL_BINDINGS_CONFIRMED';
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
console.log(JSON.stringify({ status: report.paletteAuditStatus, output, placed: report.placedLegacy, legacy: report.legacy }));
