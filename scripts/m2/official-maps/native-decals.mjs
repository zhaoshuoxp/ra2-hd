// Check every new ground-decal identity through the native smudge renderer.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

export async function validateNativeDecals({ page, report, out }, expectedBindings, requestedNames) {
    const available = await page.evaluate(() => [...window.__ra2debug.game.rules.smudgeRules.keys()]
        .filter(name => /^(BURNT|CRATER)\d\d$/.test(name)));
    assert.equal(available.length, 24);
    const names = requestedNames ?? available;
    assert(names.length && new Set(names).size === names.length && names.every(name => available.includes(name)),
        'Explicit decal names must be unique original ground-effect identities');
    report.newNativeDecals = { disclosure: 'Controlled native createObject/spawnObject on a legal open tile. Actual native smudge batching and frame identity; no art, rules, palette or source override.', cases: [] };
    for (const name of names) {
        await page.evaluate(name => {
            const d = window.__ra2debug, g = d.game, center = window.__allied.center;
            const units = g.getWorld().getAllObjects().filter(object => object.isUnit());
            const tile = g.map.tiles.getAll().filter(tile => g.map.isWithinBounds(tile)
                && !tile.rampType && !g.map.getGroundObjectsOnTile(tile).length
                && units.every(unit => Math.hypot(unit.tile.rx - tile.rx, unit.tile.ry - tile.ry) > 4)
                && g.map.terrain.getPassableSpeed(tile, 1, false, false) > 0)
                .sort((a, b) => Math.hypot(a.rx - center.rx, a.ry - center.ry)
                    - Math.hypot(b.rx - center.rx, b.ry - center.ry))[0];
            if (!tile) throw Error('No legal native smudge tile');
            const object = g.createObject(5, name); g.spawnObject(object, tile);
            window.__m23Decal = object; d.worldInteraction.minimapHandler.panToTile(tile);
        }, name);
        await page.waitForTimeout(100);
        const sample = await page.evaluate(() => {
            const d = window.__ra2debug, object = window.__m23Decal;
            const r = d.renderableManager.getRenderableByGameObject(object);
            const binding = d.mapRenderable.smudgeLayer.getObjectHdBinding(object)
                ?? { identity: r?.builder?.hdOverride?.identity, frame: r?.builder?.getFrame() };
            d.renderer.render();
            const source = d.renderer.renderer.domElement, width = 640, height = 480;
            const rect = [Math.floor((source.width - width) / 2), Math.floor((source.height - height) / 2), width, height];
            const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(source, ...rect, 0, 0, width, height);
            return { name: object.name, tile: [object.tile.rx, object.tile.ry], binding,
                sourceOutput: [source.width, source.height], sourceRect: rect, png: canvas.toDataURL().split(',')[1] };
        });
        assert(sample.binding.identity?.endsWith(`/tiles/${report.environment.density}`));
        if (expectedBindings) assert.equal(sample.binding.identity, expectedBindings[name],
            `Native decal must bind its selected source and manifest: ${name}`);
        assert.equal(sample.binding.frame, 0);
        await fs.writeFile(path.join(out, `${name}-native-detail.png`), Buffer.from(sample.png, 'base64'));
        delete sample.png; report.newNativeDecals.cases.push(sample);
        await page.evaluate(() => window.__ra2debug.game.unspawnObject(window.__m23Decal));
    }
    report.newNativeDecals.status = requestedNames
        ? 'PASS_ALL_REQUESTED_NATIVE_DECAL_BINDINGS_AND_UNSCALED_CAPTURES'
        : 'PASS_ALL_24_NATIVE_DECAL_BINDINGS_AND_UNSCALED_CAPTURES';
}
