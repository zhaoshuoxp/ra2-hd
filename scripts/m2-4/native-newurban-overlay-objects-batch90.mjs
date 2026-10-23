// Verify original placed theater rocks and stock crate creation/pickup with exact HD sources.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function validateNewUrbanOverlayObjects({ page, report, out }, expectedBindings) {
    const evidence = report.newNativeOverlayObjects = {
        disclosure: 'Rocks are original map placements. Crates use the native generator with the existing Money powerup and legal land/water tiles; stock CMIN/DLPH Move orders collect them. No map, rule, source, shadow, frame or cooldown is changed. Controlled fixtures do not establish natural-match or visual acceptance.',
        rocks: [], crates: []
    };
    const capture = async (name, tile, objectId, anchorPixels) => {
        await page.evaluate(tile => {
            const d = window.__ra2debug;
            d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(tile[0], tile[1]));
        }, tile);
        await page.waitForTimeout(100);
        const sample = await page.evaluate(({ objectId, anchorPixels }) => {
            const d = window.__ra2debug; d.renderer.render();
            const source = d.renderer.renderer.domElement, width = 640, height = 480;
            if (objectId !== undefined) {
                const object = d.game.getWorld().getAllObjects().find(object => object.id === objectId);
                const renderable = d.renderableManager.getRenderableByGameObject(object);
                const p = renderable.getPosition().clone().project(d.worldScene.camera);
                const v = d.worldScene.viewport, ratio = source.width / d.renderer.width;
                anchorPixels = [(v.x + (p.x + 1) * v.width / 2) * ratio,
                    (v.y + (1 - p.y) * v.height / 2) * ratio];
            }
            if (!anchorPixels?.every(Number.isFinite)) throw Error('Missing native object projection');
            const rect = [Math.max(0, Math.min(source.width - width, Math.floor(anchorPixels[0] - width / 2))),
                Math.max(0, Math.min(source.height - height, Math.floor(anchorPixels[1] - height / 2))), width, height];
            const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(source, ...rect, 0, 0, width, height);
            return { sourceOutput: [source.width, source.height], sourceRect: rect, anchorPixels,
                png: canvas.toDataURL().split(',')[1] };
        }, { objectId, anchorPixels });
        const file = name + '-native-detail.png';
        await fs.writeFile(path.join(out, file), Buffer.from(sample.png, 'base64'));
        delete sample.png; return { file, rescaled: false, ...sample };
    };
    const rockNames = Object.keys(expectedBindings).filter(name => /^(SROCK|TROCK)\d\d$/.test(name));
    evidence.expectedRockNames = rockNames;
    for (const name of rockNames) {
        const sample = await page.evaluate(name => {
            const d = window.__ra2debug;
            const object = d.game.getWorld().getAllObjects().find(object => object.name === name && object.isOverlay());
            if (!object) throw Error('Missing original placed rock: ' + name);
            return window.__m23Binding(object);
        }, name);
        assert.equal(sample.hd, expectedBindings[name]);
        assert.equal(sample.frame, 0);
        evidence.rocks.push({ name, sample, capture: await capture(name, sample.tile, sample.id) });
    }
    assert.equal(evidence.rocks.length, rockNames.length);
    assert.equal(report.theater, 'NEWURBAN');
    assert.deepEqual(rockNames.slice().sort(), ['SROCK01', 'SROCK02', 'SROCK03', 'SROCK04', 'TROCK01', 'TROCK02', 'TROCK04', 'TROCK05']);
    for (const name of ['CRATE', 'WCRATE']) {
        const fixture = await page.evaluate(name => {
            const d = window.__ra2debug, g = d.game, f = window.__allied;
            if (!g.gameOpts.cratesAppear) throw Error('Native crate fixture requires the existing crates option');
            const water = name === 'WCRATE';
            const powerup = g.rules.powerups.powerups.find(row => row.type === 3 && row.probShares > 0);
            if (!powerup || water && !powerup.waterAllowed) throw Error('No existing legal Money powerup');
            const collectorRule = g.rules.getObject(water ? 'DLPH' : 'CMIN', 7);
            const waterApproach = tile => [1, 2].every(step => {
                const approach = g.map.tiles.getByMapCoords(tile.rx + step, tile.ry - step);
                return approach && g.map.isWithinBounds(approach) && !approach.rampType
                    && g.map.getTileZone(approach, true) === 2
                    && g.map.terrain.getPassableSpeed(approach, collectorRule.speedType, false, false) > 0
                    && !g.map.getGroundObjectsOnTile(approach).length;
            });
            const silhouettes = g.getWorld().getAllObjects().filter(object => object.tile
                && (object.isTechno() || object.isTerrain() || object.rules.isARock));
            const tile = g.map.tiles.getAll().filter(tile => g.crateGeneratorTrait.canPlaceCrateOnTile(g, tile)
                && (g.map.getTileZone(tile, true) === 2) === water
                && (!water || waterApproach(tile))
                && (water || silhouettes.every(object => Math.max(Math.abs(object.tile.rx - tile.rx),
                    Math.abs(object.tile.ry - tile.ry)) > 3)))
                .sort((a, b) => Math.hypot(a.rx - f.center.rx, a.ry - f.center.ry)
                    - Math.hypot(b.rx - f.center.rx, b.ry - f.center.ry))[0];
            if (!tile) throw Error('No legal crate fixture tile: ' + name);
            const collector = f.spawn(water ? 'DLPH' : 'CMIN', 7, { rx: tile.rx + 2, ry: tile.ry - 2 });
            const crate = g.crateGeneratorTrait.spawnCrateAt(tile, powerup, g);
            if (!crate || crate.name !== name || collector.tile === crate.tile) throw Error('Invalid stock crate fixture');
            window.__m24OverlayCrate = { crate, collector };
            return { name, powerup: { ...powerup }, water,
                legalApproach: water ? [1, 2].map(step => [tile.rx + step, tile.ry - step]) : undefined,
                before: { ...window.__m23Binding(crate), credits: f.player.credits,
                    cratesPickedUp: f.player.cratesPickedUp, collector: f.sample(collector),
                    trackedPowerup: g.crateGeneratorTrait.peekInsideCrate(crate) } };
        }, name);
        await page.waitForFunction(() => {
            const d = window.__ra2debug, crate = window.__m24OverlayCrate.crate;
            return d.mapRenderable.overlayLayer.hasObject(crate)
                || !!d.renderableManager.getRenderableByGameObject(crate)?.mainRenderable;
        }, undefined, { timeout: 10000 });
        fixture.before = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied, { crate, collector } = window.__m24OverlayCrate;
            const layer = d.mapRenderable.overlayLayer;
            const spec = layer.batchShpSpecsByObject.get(crate).main;
            const builder = layer.batchShpBuilders.get(layer.getBatchKey(crate)).find(builder => builder.specIndexes.has(spec));
            return { ...window.__m23Binding(crate), credits: f.player.credits,
                cratesPickedUp: f.player.cratesPickedUp, collector: f.sample(collector),
                trackedPowerup: d.game.crateGeneratorTrait.peekInsideCrate(crate),
                visible: d.renderableManager.getRenderableByGameObject(crate)?.get3DObject()?.visible,
                colorBufferVersion: builder.build().geometry.attributes.vertexColorMult.version };
        });
        assert.equal(fixture.before.hd, expectedBindings[name]);
        assert.equal(fixture.before.frame, 0);
        assert.equal(fixture.before.trackedPowerup, 3);
        assert.equal(fixture.before.visible, true);
        assert(fixture.before.colorBufferVersion > 0, 'Native late spawn must schedule the light/visibility upload');
        fixture.beforeCapture = await capture(name + '-created', fixture.before.tile, fixture.before.id);
        await page.evaluate(() => {
            const d = window.__ra2debug, { crate, collector } = window.__m24OverlayCrate;
            d.actionsApi.orderUnits([collector.id], 0, crate.tile.rx, crate.tile.ry);
        });
        await page.waitForFunction(() => !window.__m24OverlayCrate.crate.isSpawned, undefined, { timeout: 30000 });
        fixture.after = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied, { crate, collector } = window.__m24OverlayCrate;
            return { ...window.__m23Binding(crate), credits: f.player.credits, cratesPickedUp: f.player.cratesPickedUp,
                collector: f.sample(collector), batchedEntryPresent: d.mapRenderable.overlayLayer.hasObject(crate),
                trackedPowerup: d.game.crateGeneratorTrait.peekInsideCrate(crate) };
        });
        assert(!fixture.after.spawned && !fixture.after.batchedEntryPresent && fixture.after.trackedPowerup === undefined);
        assert.equal(fixture.after.cratesPickedUp, fixture.before.cratesPickedUp + 1);
        assert(fixture.after.credits > fixture.before.credits, 'Stock pickup must grant the original Money reward');
        fixture.afterCapture = await capture(name + '-picked-up', fixture.before.tile, undefined,
            fixture.beforeCapture.anchorPixels);
        evidence.crates.push(fixture);
        await page.evaluate(() => {
            const d = window.__ra2debug, collector = window.__m24OverlayCrate.collector;
            d.actionsApi.orderUnits([collector.id], 11);
            if (collector.isSpawned) d.game.unspawnObject(collector);
        });
    }
    evidence.status = 'PASS_ALL_8_ORIGINAL_ROCKS_AND_NATIVE_LAND_WATER_CRATE_PICKUP';
}
