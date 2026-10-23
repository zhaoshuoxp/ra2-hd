// Diagnostic captures only: compare the same native crate with HD, Original and disabled depth.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const session = await startSession(receipt, output, 'ra2', false, async ({ page }) => {
    const density = 2;
    await page.evaluate(density => {
        const g = window.__ra2debug.generalOptions.graphics;
        g.hdEnabled.value = true; g.hdDensity.value = density;
    }, density);
});
const { page, report, close } = session;
let failure;
try {
    report.diagnosticOnly = true;
    report.fixture = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, f = window.__allied;
        const tile = g.map.tiles.getByMapCoords(93, 120);
        const powerup = g.rules.powerups.powerups.find(row => row.type === 3 && row.probShares > 0);
        if (!g.gameOpts.cratesAppear || !g.crateGeneratorTrait.canPlaceCrateOnTile(g, tile)) throw Error('Invalid diagnostic site');
        f.spawn('CMIN', 7, { rx: tile.rx + 2, ry: tile.ry - 2 });
        const crate = g.crateGeneratorTrait.spawnCrateAt(tile, powerup, g);
        window.__m24ProbeCrate = crate;
        d.worldInteraction.minimapHandler.panToTile(tile);
        return { id: crate.id, name: crate.name, tile: [tile.rx, tile.ry, tile.z] };
    });
    await page.waitForTimeout(300);
    report.renderable = await page.evaluate(() => {
        const d = window.__ra2debug, object = window.__m24ProbeCrate;
        const r = d.renderableManager.getRenderableByGameObject(object), layer = d.mapRenderable.overlayLayer;
        const spec = layer.batchShpSpecsByObject.get(object).main;
        const builder = layer.batchShpBuilders.get(layer.getBatchKey(object)).find(builder => builder.specIndexes.has(spec));
        const mesh = builder.build(), index = builder.specIndexes.get(spec);
        const v = d.worldScene.viewport, source = d.renderer.renderer.domElement, ratio = source.width / d.renderer.width;
        const positions = [];
        for (let i = 0; i < builder.verticesPerSprite; i++) {
            const point = d.worldScene.camera.position.clone().fromBufferAttribute(mesh.geometry.attributes.position,
                index * builder.verticesPerSprite + i).applyMatrix4(mesh.matrixWorld).project(d.worldScene.camera);
            positions.push([(v.x + (point.x + 1) * v.width / 2) * ratio,
                (v.y + (1 - point.y) * v.height / 2) * ratio]);
        }
        const page = spec.hdOverride.pages[0], point = [30, 36];
        const lookup = page.tiles.map.image, pool = page.base.image;
        const offset = (Math.floor(point[1] / 4) * lookup.width + Math.floor(point[0] / 4)) * 4;
        const code = lookup.data.slice(offset, offset + 4);
        const tileIndex = code[0] + code[1] * 256 + code[2] * 65536;
        const columns = pool.width / 4;
        const poolPixel = [(tileIndex % columns) * 4 + point[0] % 4,
            Math.floor(tileIndex / columns) * 4 + point[1] % 4];
        const poolOffset = (poolPixel[1] * pool.width + poolPixel[0]) * 4;
        window.__m24ProbeLayer = layer;
        return { visible: r.get3DObject()?.visible, art: { flat: object.art.flat, hasShadow: object.art.hasShadow },
            frame: spec.frameNo, hd: spec.hdOverride?.identity, projectedVertices: positions,
            uv: Array.from(mesh.geometry.attributes.uv.array.slice(index * builder.verticesPerSprite * 2,
                (index + 1) * builder.verticesPerSprite * 2)),
            vertexColor: Array.from(mesh.geometry.attributes.vertexColorMult.array.slice(index * builder.verticesPerSprite * 4,
                (index + 1) * builder.verticesPerSprite * 4)),
            material: { defines: mesh.material.defines, opacity: mesh.material.opacity,
                hdVirtualSize: mesh.material.uniforms.hdVirtualSize.value,
                hdLookupSize: mesh.material.uniforms.hdLookupSize.value, poolSize: [pool.width, pool.height],
                lookupSize: [lookup.width, lookup.height], lookupCode: Array.from(code),
                rgbaSample: Array.from(pool.data.slice(poolOffset, poolOffset + 4)) },
            shape: { type: mesh?.type, visible: mesh?.visible, position: mesh?.position.toArray(),
                renderOrder: mesh?.renderOrder, depthTest: mesh?.material?.depthTest, depthWrite: mesh?.material?.depthWrite },
            position: r.getPosition().toArray(), spec: { position: spec.position.toArray(), depth: spec.depth,
                flat: spec.flat, offset: [spec.offset.x, spec.offset.y], file: spec.shpFile.filename } };
    });
    assert(report.renderable.hd?.endsWith('/SNOW/tiles/2'));
    const capture = async name => {
        await page.waitForTimeout(100);
        const png = await page.evaluate(() => {
            const d = window.__ra2debug; d.renderer.render();
            return d.renderer.renderer.domElement.toDataURL('image/png').split(',')[1];
        });
        await fs.writeFile(path.join(output, name + '.png'), Buffer.from(png, 'base64'));
    };
    await capture('diagnostic-hd-crate');
    report.colorBufferUpload = await page.evaluate(() => {
        const layer = window.__m24ProbeLayer, object = window.__m24ProbeCrate;
        const spec = layer.batchShpSpecsByObject.get(object).main;
        const builder = layer.batchShpBuilders.get(layer.getBatchKey(object)).find(builder => builder.specIndexes.has(spec));
        const attribute = builder.build().geometry.attributes.vertexColorMult;
        const before = attribute.version; attribute.needsUpdate = true;
        return { before, after: attribute.version, rendererChange: 'Mark the existing native light/visibility buffer dirty only' };
    });
    await capture('diagnostic-hd-crate-colour-buffer-upload');
    await page.evaluate(() => {
        const layer = window.__m24ProbeLayer, object = window.__m24ProbeCrate;
        window.__m24ProbeGetHd = layer.imageFinder.getHdOverride;
        const image = layer.imageFinder.findByObjectArt(object.art);
        layer.removeObject(object);
        layer.imageFinder.getHdOverride = source => source === image ? undefined
            : window.__m24ProbeGetHd.call(layer.imageFinder, source);
        layer.addObject(object);
    });
    await capture('diagnostic-original-crate-same-hd-terrain');
    await page.evaluate(() => {
        const layer = window.__m24ProbeLayer, object = window.__m24ProbeCrate;
        layer.removeObject(object); layer.imageFinder.getHdOverride = window.__m24ProbeGetHd;
        layer.addObject(object);
        const spec = layer.batchShpSpecsByObject.get(object).main;
        const builder = layer.batchShpBuilders.get(layer.getBatchKey(object)).find(builder => builder.specIndexes.has(spec));
        const mesh = builder.build(); mesh.material.depthTest = false; mesh.material.depthWrite = false;
    });
    await capture('diagnostic-hd-crate-without-depth');
    await page.evaluate(() => {
        const layer = window.__m24ProbeLayer, object = window.__m24ProbeCrate;
        const spec = layer.batchShpSpecsByObject.get(object).main;
        const builder = layer.batchShpBuilders.get(layer.getBatchKey(object)).find(builder => builder.specIndexes.has(spec));
        const mesh = builder.build(); mesh.renderOrder = 1;
    });
    await capture('diagnostic-hd-crate-later-opaque-order');
    await page.evaluate(() => {
        const layer = window.__m24ProbeLayer, object = window.__m24ProbeCrate;
        const spec = layer.batchShpSpecsByObject.get(object).main;
        const builder = layer.batchShpBuilders.get(layer.getBatchKey(object)).find(builder => builder.specIndexes.has(spec));
        const mesh = builder.build(); mesh.renderOrder = -1; mesh.material.transparent = true;
        mesh.material.needsUpdate = true;
    });
    await capture('diagnostic-hd-crate-transparent-order');
    await page.evaluate(() => {
        const layer = window.__m24ProbeLayer, object = window.__m24ProbeCrate;
        const spec = layer.batchShpSpecsByObject.get(object).main;
        const builder = layer.batchShpBuilders.get(layer.getBatchKey(object)).find(builder => builder.specIndexes.has(spec));
        const mesh = builder.build(); mesh.material.transparent = false;
        mesh.material.defines = { ...mesh.material.defines, M24_FRESH_HD_PROGRAM: 1 };
        mesh.material.needsUpdate = true;
    });
    await capture('diagnostic-hd-crate-fresh-program');
    report.gpuUniforms = await page.evaluate(() => {
        const d = window.__ra2debug, layer = window.__m24ProbeLayer, object = window.__m24ProbeCrate;
        const spec = layer.batchShpSpecsByObject.get(object).main;
        const builder = layer.batchShpBuilders.get(layer.getBatchKey(object)).find(builder => builder.specIndexes.has(spec));
        const material = builder.build().material, renderer = d.renderer.renderer;
        const properties = renderer.properties.get(material), program = properties.currentProgram.program;
        window.__m24ProbeOverrideFragment = material.fragmentShader;
        const gl = renderer.getContext(), values = {};
        for (const name of ['hdVirtualSize', 'hdPoolSize', 'hdLookupSize', 'hdTileMap', 'map', 'mapTransform',
            'opacity', 'alphaTest', 'remapMap', 'paletteOffsetCount', 'extraLight']) {
            const location = gl.getUniformLocation(program, name);
            const value = location && gl.getUniform(program, location);
            values[name] = ArrayBuffer.isView(value) ? Array.from(value) : value;
        }
        const linkedProgram = properties.currentProgram;
        const shader = gl.getShaderSource(linkedProgram.fragmentShader);
        return { values, sourceHasTileSampling: material.fragmentShader.includes('hdSpriteUv(vMapUv)'),
            sourceHasHdColor: material.fragmentShader.includes('vec4 remapData'),
            sourceHasNativePalette: material.fragmentShader.includes('float paletteColorIndex'),
            gpuHasHdColor: shader.includes('vec4 remapData'),
            gpuHasNativePalette: shader.includes('float paletteColorIndex'),
            liveUniformKeys: Object.keys(properties.uniforms),
            linkedMapMatchesSource: properties.uniforms.map?.value === material.map,
            linkedLookupMatchesSource: properties.uniforms.hdTileMap?.value === spec.hdOverride.pages[0].tiles.map,
            sourceTextureColorSpace: material.map.colorSpace,
            lookupTextureColorSpace: spec.hdOverride.pages[0].tiles.map.colorSpace,
            sourceVirtualSize: material.uniforms.hdVirtualSize.value,
            linkedVirtualSize: properties.uniforms.hdVirtualSize?.value };
    });
    await page.evaluate(() => {
        const layer = window.__m24ProbeLayer, object = window.__m24ProbeCrate;
        const spec = layer.batchShpSpecsByObject.get(object).main;
        const builder = layer.batchShpBuilders.get(layer.getBatchKey(object)).find(builder => builder.specIndexes.has(spec));
        const mesh = builder.build();
        mesh.material.defines = { ...mesh.material.defines, M24_SOLID_HD_PROGRAM: 1 };
        mesh.material.fragmentShader = 'void main() { gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); }';
        mesh.material.needsUpdate = true;
    });
    await capture('diagnostic-hd-crate-solid-geometry');
    await page.evaluate(() => {
        const layer = window.__m24ProbeLayer, object = window.__m24ProbeCrate;
        const spec = layer.batchShpSpecsByObject.get(object).main;
        const builder = layer.batchShpBuilders.get(layer.getBatchKey(object)).find(builder => builder.specIndexes.has(spec));
        const material = builder.build().material;
        material.defines = { ...material.defines, M24_FIXED_TEXTURE_SAMPLE: 1 };
        material.fragmentShader = 'uniform sampler2D map; void main() { gl_FragColor = texture2D(map, vec2(59.5 / 60.0, 31.5 / 60.0)); }';
        material.needsUpdate = true;
    });
    await capture('diagnostic-hd-crate-fixed-texture-sample');
    await page.evaluate(() => {
        const layer = window.__m24ProbeLayer, object = window.__m24ProbeCrate;
        const spec = layer.batchShpSpecsByObject.get(object).main;
        const builder = layer.batchShpBuilders.get(layer.getBatchKey(object)).find(builder => builder.specIndexes.has(spec));
        const material = builder.build().material;
        material.defines = { ...material.defines, M24_POOLED_TEXTURE_SAMPLE: 1 };
        const source = window.__m24ProbeOverrideFragment;
        material.fragmentShader = source.replace('  diffuseColor = clamp(diffuseColor, 0.0, 1.0);',
            '  diffuseColor = vec4(sampledDiffuseColor.rgb, 1.0);');
        material.needsUpdate = true;
    });
    await capture('diagnostic-hd-crate-force-sampled-alpha');
    await page.evaluate(() => {
        const layer = window.__m24ProbeLayer, object = window.__m24ProbeCrate;
        const spec = layer.batchShpSpecsByObject.get(object).main;
        const builder = layer.batchShpBuilders.get(layer.getBatchKey(object)).find(builder => builder.specIndexes.has(spec));
        const material = builder.build().material;
        material.defines = { ...material.defines, M24_RAW_POOLED_RGB: 1 };
        const prefix = window.__m24ProbeOverrideFragment.split('void main() {')[0];
        material.fragmentShader = prefix + 'void main() { vec4 col = texture2D(map, hdSpriteUv(vMapUv)); gl_FragColor = vec4(col.rgb, 1.0); }';
        material.needsUpdate = true;
    });
    await capture('diagnostic-hd-crate-raw-pooled-rgb');
    await page.evaluate(() => {
        const layer = window.__m24ProbeLayer, object = window.__m24ProbeCrate;
        const spec = layer.batchShpSpecsByObject.get(object).main;
        const builder = layer.batchShpBuilders.get(layer.getBatchKey(object)).find(builder => builder.specIndexes.has(spec));
        const material = builder.build().material;
        material.defines = { ...material.defines, M24_RAW_POOLED_RGBA: 1 };
        const prefix = window.__m24ProbeOverrideFragment.split('void main() {')[0];
        material.fragmentShader = prefix + 'void main() { gl_FragColor = texture2D(map, hdSpriteUv(vMapUv)); }';
        material.needsUpdate = true;
    });
    await capture('diagnostic-hd-crate-raw-pooled-rgba');
    await page.evaluate(() => {
        const layer = window.__m24ProbeLayer, object = window.__m24ProbeCrate;
        const spec = layer.batchShpSpecsByObject.get(object).main;
        const builder = layer.batchShpBuilders.get(layer.getBatchKey(object)).find(builder => builder.specIndexes.has(spec));
        const material = builder.build().material;
        material.defines = { ...material.defines, M24_FIXED_COLOR_ONLY: 1 };
        material.fragmentShader = window.__m24ProbeOverrideFragment.replace(
            /vec4 remapData =[\s\S]*?diffuseColor = clamp\(diffuseColor, 0.0, 1.0\);/,
            'diffuseColor = vec4(sampledDiffuseColor.rgb, sampledDiffuseColor.a * opacity);');
        material.needsUpdate = true;
    });
    await capture('diagnostic-hd-crate-fixed-color-with-native-light');
    await page.evaluate(() => {
        const layer = window.__m24ProbeLayer, object = window.__m24ProbeCrate;
        const spec = layer.batchShpSpecsByObject.get(object).main;
        const builder = layer.batchShpBuilders.get(layer.getBatchKey(object)).find(builder => builder.specIndexes.has(spec));
        const material = builder.build().material;
        material.defines = { ...material.defines, M24_REMAP_SAMPLE: 1 };
        const prefix = window.__m24ProbeOverrideFragment.split('void main() {')[0];
        material.fragmentShader = prefix + 'void main() { vec4 col = texture2D(remapMap, hdRemapUv(vMapUv)); gl_FragColor = vec4(col.rg, 0.0, 1.0); }';
        material.needsUpdate = true;
    });
    await capture('diagnostic-hd-crate-remap-input');
    report.disclosure = 'Counterfactual diagnostic only. Original override and disabled depth captures cannot be used as gameplay or visual acceptance evidence. Runtime package, art, source map and rules are unchanged.';
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
