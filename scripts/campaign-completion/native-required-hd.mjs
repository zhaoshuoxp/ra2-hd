import assert from 'node:assert/strict';

// Pan normally to each required actor so deferred off-screen poses are measured
// only after entering the viewport. Never reveal shroud or change simulation.
export async function requiredNativeHd(page, names, density) {
    const rows = await page.evaluate(async names => {
        const d = window.__ra2debug, g = d.game;
        const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const state = () => JSON.stringify({ tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot() });
        const before = state(), camera = { ...d.worldScene.cameraPan.getPan() }, rows = [];
        try { for (const name of names) {
            const row = { name,
            graphics: { enabled: d.generalOptions.graphics.hdEnabled.value, density: d.generalOptions.graphics.hdDensity.value },
            selection: d.worldView.sovietUnitsHd?.report.families[name] ?? d.sovietBuildingsHd?.[name],
            observation: 'Each actor is observed after ordinary camera panning; original camera, tick, world hash and RNG are retained.',
            instances: [] };
            for (const object of g.world.getAllObjects().filter(object => object.name === name && object.isSpawned && !object.isDestroyed)) {
                d.worldInteraction.minimapHandler.panToTile(object.tile);
                await frame(); await d.worldView.sovietUnitsHd.idle(); await frame();
                const r = d.renderableManager.getRenderableByGameObject(object);
                const models = [...new Set([r?.mainObj, r?.mainRenderable, r?.shpRenderable,
                    ...[...(r?.animObjects?.values?.() ?? [])].flat()])].filter(model => model?.builder);
                const layer = r?.terrainLayer ?? r?.mapOverlayLayer ?? r?.mapSmudgeLayer;
                const specs = layer?.batchShpSpecsByObject?.get(object), spec = specs?.main;
                const batch = spec && [...layer.batchShpBuilders.values()].flat().find(builder => builder.specIndexes.has(spec));
                let batchPart;
                if (batch) {
                    const frame = batch.hdOverride?.frames[spec.frameNo], page = frame && batch.hdOverride.pages[frame.page];
                    const logical = batch.getSpriteGeometryOptions(spec).logicalSize ?? batch.atlas.getTextureArea(spec.frameNo);
                    const sample = frame?.sampleRect;
                    const aggregateStart = layer.aggregatedImageData.imageIndexes.get(spec.shpFile);
                    const sourceFrame = batch.hdOverride ? spec.frameNo : spec.frameNo - aggregateStart;
                    let shadow;
                    if (specs.shadow) {
                        const builder = layer.shadowBatchShpBuilders.find(builder => builder.has(specs.shadow));
                        const original = spec.shpFile.images[sourceFrame + spec.shpFile.numImages / 2];
                        const rendered = builder?.shpFile.images[specs.shadow.frameNo];
                        shadow = { sourceFrame: sourceFrame + spec.shpFile.numImages / 2,
                            gpuHd: !!builder?.hdOverride,
                            originalIndices: !!rendered && rendered.imageData.length === original.imageData.length
                                && rendered.imageData.every((value, index) => value === original.imageData[index]) };
                    }
                    batchPart = { batched: true, member: batch.shpFile.filename, sourceMember: spec.shpFile.filename,
                        sourceFrame, override: batch.hdOverride?.identity, shadow,
                        gpu: !!page && batch.mesh.material.type === 'HdSpriteMaterial' && batch.mesh.material.map === page.base,
                        logicalSize: [logical.width, logical.height], sampleSize: sample ? [sample.width, sample.height] : null,
                        density: sample ? sample.width / logical.width : null,
                        verticalDensity: sample ? sample.height / logical.height : null };
                }
                const vxlFrames = r?.unitVxlHd?.layers.flatMap(layer => layer.frames) ?? [];
                row.instances.push({ id: object.id, vxl: !!r?.unitVxlHd?.active,
                    vxlGpu: !!vxlFrames.length && vxlFrames.every(layer => layer.source.material.type === 'HdSpriteMaterial'
                        && layer.source.material.map === layer.part.override.pages[0].base),
                    vxlDensities: r?.unitVxlHd?.family?.parts.map(part => part.frames[0].rect[2] / part.frames[0].logicalSize[0]) ?? [],
                    vxlVerticalDensities: r?.unitVxlHd?.family?.parts.map(part => part.frames[0].rect[3] / part.frames[0].logicalSize[1]) ?? [],
                    parts: [...models.map(model => {
                        const b = model.builder, p = b.getHdPage?.(), mesh = model.getShapeMesh?.();
                        const index = b.frameNo + b.frameOffset, original = b.shpFile?.images[index], sample = b.hdOverride?.frames[index]?.sampleRect;
                        const logical = b.getSpriteGeometryOptions(b.frameNo).logicalSize;
                        const source = [...(r?.aggregatedImageData?.imageIndexes ?? [])].find(([image, start]) =>
                            index >= start && index < start + (r.shpFrameInfos?.get(image)?.frameCount ?? 0));
                        return { member: b.shpFile?.filename, sourceMember: source?.[0]?.filename ?? b.shpFile?.filename,
                            sourceFrame: source ? index - source[1] : index, override: b.hdOverride?.identity,
                            gpu: !!p && mesh?.material?.type === 'HdSpriteMaterial'
                            && mesh.material.map === p.base, nativeSize: original ? [original.width, original.height] : null,
                            logicalSize: logical ? [logical.width, logical.height] : null,
                            sampleSize: sample ? [sample.width, sample.height] : null,
                            density: logical?.width && sample ? sample.width / logical.width : null,
                            verticalDensity: logical?.height && sample ? sample.height / logical.height : null };
                    }), ...(batchPart ? [batchPart] : [])] });
            }
            rows.push(row);
        } } finally { d.worldScene.cameraPan.setPan(camera); await frame(); }
        if (state() !== before) throw Error('Native HD camera observation changed simulation tick, world hash or RNG');
        return rows;
    }, names);
    try { for (const row of rows) {
        assert(row.instances.length, 'Required live HD actor absent: ' + row.name);
        for (const instance of row.instances) {
            for (const part of instance.parts.filter(part => part.batched && part.shadow)) {
                assert(part.shadow.originalIndices && !part.shadow.gpuHd,
                    'Batched actor must retain its original shadow: ' + row.name);
            }
            if (instance.vxl) assert(instance.vxlGpu && instance.vxlDensities.length
                && [...instance.vxlDensities, ...instance.vxlVerticalDensities].every(value => Math.abs(value - density) < .001));
            else assert(instance.parts.some(part => part.gpu && part.density >= density && part.density < density + .25
                && part.verticalDensity >= density && part.verticalDensity < density + .25),
                'Required actual HD binding/density missing: ' + row.name + '#' + instance.id);
        }
    } } catch (error) { error.nativeHdRows = rows; throw error; }
    return rows;
}
