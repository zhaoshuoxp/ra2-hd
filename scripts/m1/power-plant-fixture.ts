import * as THREE from 'three';
import { Palette } from '../../src/data/Palette';
import { Color } from '../../src/util/Color';
import { ShpFile } from '../../src/data/ShpFile';
import { ShpImage } from '../../src/data/ShpImage';
import { ShpAggregator } from '../../src/engine/renderable/builder/ShpAggregator';
import { ShpRenderable } from '../../src/engine/renderable/ShpRenderable';
import { ShpBuilder } from '../../src/engine/renderable/builder/ShpBuilder';
import { resolvePowerPlantHd, aggregatePowerPlantHd, disposePowerPlantHd } from '../../src/engine/renderable/builder/resolvePowerPlantHd';
import { MeshBatchManager } from '../../src/engine/gfx/batch/MeshBatchManager';
import { RenderableContainer } from '../../src/engine/gfx/RenderableContainer';
import { WorldScene } from '../../src/engine/renderable/WorldScene';
import { TextureUtils } from '../../src/engine/gfx/TextureUtils';

const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const digest = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map(b => b.toString(16).padStart(2, '0')).join('');

async function run() {
    const bindings = await (await fetch('/bindings.json')).json();
    const entries = [];
    const raws = [];
    for (const binding of bindings) {
        const raw = await (await fetch(`/source/${binding.member}.json`)).json();
        raws.push(raw);
        const bytes = await (await fetch(binding.manifestRoute)).arrayBuffer();
        check(await digest(bytes) === binding.sha256, 'manifest identity');
        const manifest = JSON.parse(new TextDecoder().decode(bytes));
        const image = new ShpFile(); image.filename = binding.member;
        [image.width, image.height] = raw.canvas;
        raw.frames.forEach(f => image.addImage(new ShpImage(Uint8Array.from(f.pixels), f.width, f.height, f.x, f.y)));
        entries.push({ image, manifest, manifestHash: binding.sha256,
            source: { ...raw.source, canvas: raw.canvas, frames: raw.frames.slice(0, binding.requiredFrames).map(f => ({
                nativeFrame: f.nativeFrame, trimOrigin: [f.x, f.y], trimSize: [f.width, f.height],
                legacyRenderSize: [f.width + f.width % 2, f.height + f.height % 2], empty: f.empty })) },
            read: async (filename: string, hash: string, size: number) => {
                const response = await fetch(binding.files[filename]); check(response.ok, 'missing page');
                const bytes = await response.arrayBuffer(); check(bytes.byteLength === size && await digest(bytes) === hash, 'page identity');
                const bitmap = await createImageBitmap(new Blob([bytes]), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
                try {
                    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
                    const ctx = canvas.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(bitmap, 0, 0);
                    return { width: canvas.width, height: canvas.height, rgba: new Uint8Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data) };
                } finally { bitmap.close(); }
            } });
    }
    const aggregate = new ShpAggregator().aggregate(entries.map((e, i) =>
        ShpAggregator.getShpFrameInfo(e.image, raws[i].hasShadow)), 'agg_GAPOWR.shp');
    // Match prewarming runs before the optional HD selection.
    ShpBuilder.prepareTexture(aggregate.file);
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(384, 256); renderer.setClearColor(0x26332d, 1); document.body.append(renderer.domElement);
    const camera = WorldScene.createCamera({ width: 384, height: 256 });
    camera.translateZ(camera.far / 2); camera.updateMatrixWorld();
    const palettes = [[240, 40, 40], [40, 100, 240], [240, 220, 40]].map(c =>
        new Palette({ colors: raws[0].palette.map(c => new Color(...c)) }).remap(new Color(...c)));
    const gl = renderer.getContext();
    const pixels = () => { const bytes = new Uint8Array(384 * 256 * 4);
        gl.readPixels(0, 0, 384, 256, gl.RGBA, gl.UNSIGNED_BYTE, bytes); return bytes; };
    const report: any = { status: 'PASS_CALIBRATION_ONLY', cases: 0, geometryPairs: 0, shadowPairs: 0,
        maxPixelDifference: 0, retainedFrames: 16, variants: [], aggregateOffsets: [...aggregate.imageIndexes.values()],
        metrics: { css: [384, 256], drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
            devicePixelRatio, rendererPixelRatio: renderer.getPixelRatio() } };
    try {
        for (const density of [2, 4]) {
            const loaded = await resolvePowerPlantHd(entries, density, renderer.capabilities.maxTextureSize, textures => {
                textures.forEach(t => renderer.initTexture(t)); check(gl.getError() === 0, 'upload');
            });
            check(loaded.report.density === density, JSON.stringify(loaded.report));
            const hd = aggregatePowerPlantHd(aggregate, loaded)!;
            report.variants.push(loaded.report);
            // Original ordinary materials clone custom uniforms at compile time.
            // Construct each fixed-state oracle afresh; live batch attributes remain native.
            for (const batched of [false, true]) for (let member = 0; member < entries.length; member++)
                for (const [row, light, opacity] of [[0, 0, 1], [1, -0.3, 0.65], [2, 0.4, 1]]) {
                const source = new THREE.Group(), scene = new THREE.Scene();
                const units = [false, true].map(useHd => {
                    const unit = ShpRenderable.factory(aggregate.file, palettes[0], camera, { x: 4, y: -6 },
                        raws[member].hasShadow, 0, true, member ? 1 : 0, true);
                    unit.setSize(entries[member].image as any);
                    unit.setFrameOffset(aggregate.imageIndexes.get(entries[member].image)!);
                    unit.setBatched(batched); if (batched) unit.setBatchPalettes(palettes);
                    if (useHd) unit.setHdOverride(hd);
                    unit.setPalette(palettes[row]); unit.setExtraLight(new THREE.Vector3(light, light / 2, light / 3));
                    unit.setOpacity(opacity);
                    unit.create3DObject(); source.add(unit.get3DObject()!); return unit;
                });
                const manager = new MeshBatchManager(new RenderableContainer(source)); manager.create3DObject();
                scene.add(batched ? manager.get3DObject()! : source);
                function draw(mode: number, frame: number, row: number, light: number, opacity: number) {
                    units.forEach((unit, i) => {
                        unit.get3DObject()!.visible = mode === i; unit.setFrame(frame); unit.setPalette(palettes[row]);
                        unit.setExtraLight(new THREE.Vector3(light, light / 2, light / 3)); unit.setOpacity(opacity);
                    });
                    source.updateMatrixWorld(true); if (batched) manager.updateMeshes(); renderer.render(scene, camera);
                    check(renderer.info.render.calls > 0, 'no draw'); check(gl.getError() === 0, 'render error');
                    return pixels();
                }
                try {
                    for (let frame = 0; frame < entries[member].source.frames.length; frame++) {
                            const original = draw(0, frame, row, light, opacity), hdPixels = draw(1, frame, row, light, opacity);
                            const positions = units.map(u => Array.from((u.getShapeMesh() as THREE.Mesh).geometry.attributes.position.array));
                            check(JSON.stringify(positions[0]) === JSON.stringify(positions[1]), `geometry ${member}/${frame}`);
                            report.geometryPairs++;
                            if (raws[member].hasShadow) {
                                const shadows = units.map(u => u.getShadowMesh() as THREE.Mesh);
                                check(JSON.stringify(Array.from(shadows[0].geometry.attributes.position.array))
                                    === JSON.stringify(Array.from(shadows[1].geometry.attributes.position.array)), 'shadow geometry');
                                check((shadows[0].material as any).map === (shadows[1].material as any).map, 'original shadow texture');
                                report.shadowPairs++;
                            }
                            let max = 0; for (let i = 0; i < original.length; i++) max = Math.max(max, Math.abs(original[i] - hdPixels[i]));
                            report.maxPixelDifference = Math.max(max, report.maxPixelDifference); report.cases++;
                            check(max <= 1, `pixels ${density}/${batched}/${member}/${frame}/${row}: ${max}`);
                    }
                    if (member === 1) {
                        // Verify switching from authored-range pages to retained native tail data and back.
                        for (const frame of [16, 31, 0, 8]) {
                            const a = draw(0, frame, row, light, opacity), b = draw(1, frame, row, light, opacity);
                            check(a.every((v, i) => Math.abs(v - b[i]) <= 1), `retained transition ${frame}`);
                        }
                    }
                } finally { manager.dispose(); units.forEach(u => u.dispose()); }
            }
            const textures = [...loaded.overrides.values()].flatMap(o => o.pages.flatMap(p => [p.base, p.data]));
            disposePowerPlantHd(loaded);
            check(textures.every(t => !renderer.properties.get(t).__webglTexture), 'HD textures remain');
        }
        return report;
    } finally {
        ShpBuilder.clearCaches(); TextureUtils.cache.forEach(t => t.dispose()); TextureUtils.cache.clear();
        report.disposal = { ...renderer.info.memory, materials: ShpBuilder.materialCache.size };
        renderer.dispose(); renderer.forceContextLoss();
    }
}
(window as any).runPowerPlant = run;
