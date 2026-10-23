import * as THREE from 'three';
import { Palette } from '../../src/data/Palette';
import { Color } from '../../src/util/Color';
import { ShpRenderable } from '../../src/engine/renderable/ShpRenderable';
import { ShpBuilder } from '../../src/engine/renderable/builder/ShpBuilder';
import { resolveHdSprite, disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import { MeshBatchManager } from '../../src/engine/gfx/batch/MeshBatchManager';
import { RenderableContainer } from '../../src/engine/gfx/RenderableContainer';
import { Coords } from '../../src/game/Coords';
import { WorldScene } from '../../src/engine/renderable/WorldScene';
import { TextureUtils } from '../../src/engine/gfx/TextureUtils';
const check = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
const digest = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
async function start() {
    const baselineOnly = new URL(location.href).searchParams.has('original-only');
    const raw = await (await fetch('/source.json')).json();
    const binding = await (await fetch('/binding.json')).json();
    const manifestBytes = await (await fetch(binding.manifestRoute)).arrayBuffer();
    check(await digest(manifestBytes) === binding.sha256, 'Manifest changed');
    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
    const frames = raw.frames.map(f => ({ ...f, imageData: Uint8Array.from(f.pixels) }));
    const shp = { filename: 'cons.shp', width: raw.canvas[0], height: raw.canvas[1], numImages: frames.length,
        getImage: (index: number) => frames[index] };
    const source = { ...raw.source, canvas: raw.canvas, frames: frames.slice(0, frames.length / 2).map(f => ({
        nativeFrame: f.nativeFrame, trimOrigin: [f.x, f.y], trimSize: [f.width, f.height],
        legacyRenderSize: [f.width + f.width % 2, f.height + f.height % 2], empty: !f.pixels.some(Boolean) })) };
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(960, 540);
    renderer.setClearColor(0x26332d, 1);
    document.querySelector('#canvas')!.append(renderer.domElement);
    const camera = WorldScene.createCamera({ width: 960, height: 540 });
    camera.translateZ(camera.far / 2);
    camera.updateMatrixWorld();
    const readPage = async (filename: string, sha256: string, bytes: number) => {
        const route = binding.files[filename];
        check(typeof route === 'string', 'Undeclared page');
        const response = await fetch(route);
        check(response.ok, 'Missing page');
        const payload = await response.arrayBuffer();
        check(payload.byteLength === bytes && await digest(payload) === sha256, 'Page hash or size mismatch');
        const bitmap = await createImageBitmap(new Blob([payload], { type: 'image/png' }),
            { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(bitmap, 0, 0);
        const rgba = new Uint8Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
        bitmap.close();
        return { width: canvas.width, height: canvas.height, rgba };
    };
    const selected = await resolveHdSprite(manifest, binding.sha256, source, 4, renderer.capabilities.maxTextureSize, readPage, textures => {
        if (baselineOnly) return;
        textures.forEach(t => renderer.initTexture(t));
        check(renderer.getContext().getError() === 0, 'Texture upload failed');
    });
    check(selected.density === 2 && selected.override, 'Expected 4x request to choose complete 2x member');
    check(renderer.getContext().getError() === 0, 'Texture upload failed');
    const palettes = [new Color(240, 40, 40), new Color(40, 100, 240)].map(owner =>
        new Palette({ colors: raw.palette.map(c => new Color(...c)) }).remap(owner));
    const sourceGroup = new THREE.Group(), scene = new THREE.Scene();
    const units = [];
    for (let i = 0; i < 2; i++) {
        const unit = ShpRenderable.factory(shp, palettes[i], camera, { x: 0, y: 0 }, true, 0, true);
        unit.setBatched(true); unit.setBatchPalettes(palettes);
        if (i && !baselineOnly) unit.setHdOverride(selected.override);
        unit.create3DObject(); sourceGroup.add(unit.get3DObject()!); units.push(unit);
    }
    const manager = new MeshBatchManager(new RenderableContainer(sourceGroup));
    manager.create3DObject(); scene.add(manager.get3DObject()!);
    const gl = renderer.getContext();
    const read = () => { const bytes = new Uint8Array(960 * 540 * 4);
        gl.readPixels(0, 0, 960, 540, gl.RGBA, gl.UNSIGNED_BYTE, bytes); return bytes; };
    function draw(frame: number, mode: number, split = false) {
        units.forEach((u, i) => {
            u.setFrame(frame); u.get3DObject()!.visible = split || i === mode;
            u.get3DObject()!.position.set(0, 0, 0);
            if (split) u.get3DObject()!.position.copy(new THREE.Vector3((i ? 220 : -220) * Coords.COS_ISO_CAMERA_BETA * Coords.ISO_WORLD_SCALE, 0, 0).applyQuaternion(camera.quaternion));
            u.get3DObject()!.updateMatrix();
        });
        sourceGroup.updateMatrixWorld(true); manager.updateMeshes(); renderer.render(scene, camera);
    }
    let stopped = false;
    const report: any = { status: 'PASS', baselineOnly, source: raw.source, visibleFrames: source.frames.length,
        chosenDensity: selected.density, fallback: selected.attempts, gpuBytes: selected.gpuBytes,
        allFrameGeometry: 0, allFrameShadowGeometry: 0, pixelMaxDifference: 0,
        metrics: { cssCanvas: [960, 540], drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], devicePixelRatio,
            rendererPixelRatio: renderer.getPixelRatio(), maxTextureSize: renderer.capabilities.maxTextureSize,
            cameraBounds: [camera.left, camera.right, camera.top, camera.bottom] }, sequences: raw.sequences };
    (window as any).acceptConscript = async () => {
        stopped = true;
        units.forEach(u => u.setPalette(palettes[0]));
        for (let frame = 0; frame < source.frames.length; frame++) {
            draw(frame, 0); const original = read();
            draw(frame, 1); const hd = read();
            const positions = units.map(u => Array.from((u.getShapeMesh() as THREE.Mesh).geometry.attributes.position.array));
            check(JSON.stringify(positions[0]) === JSON.stringify(positions[1]), `Frame ${frame}: body geometry`);
            report.allFrameGeometry++;
            const shadowPositions = units.map(u => Array.from(((u.getShadowMesh() as any).geometry).attributes.position.array));
            check(JSON.stringify(shadowPositions[0]) === JSON.stringify(shadowPositions[1]), `Frame ${frame}: shadow geometry`);
            report.allFrameShadowGeometry++;
            let max = 0; hd.forEach((v, i) => { max = Math.max(max, Math.abs(v - original[i])); });
            report.pixelMaxDifference = Math.max(report.pixelMaxDifference, max);
            check(max <= 1, `Frame ${frame}: pixels differ by ${max}`);
            check(gl.getError() === 0, `Frame ${frame}: GL error`);
        }
        units[1].setPalette(palettes[1]);
        draw(20, 1, true);
        document.querySelector('#status')!.textContent = 'Walk · facing 2 · native frame 20 · calibration only';
        report.drawCalls = renderer.info.render.calls;
        return report;
    };
    (window as any).disposeConscript = () => {
        stopped = true; manager.dispose(); units.forEach(u => u.dispose()); ShpBuilder.clearCaches();
        disposeHdSprite(selected.override); TextureUtils.cache.forEach(t => t.dispose()); TextureUtils.cache.clear();
        const after = { ...renderer.info.memory, materials: ShpBuilder.materialCache.size,
            hdTexturesReleased: selected.override.pages.every(p => [p.base, p.data].every(t => !renderer.properties.get(t).__webglTexture)) };
        renderer.dispose(); renderer.forceContextLoss(); return after;
    };
    const controls = document.querySelector('#controls')!;
    const select = document.createElement('select');
    Object.keys(raw.sequences).forEach(name => { const option = document.createElement('option'); option.text = name; select.add(option); });
    select.value = 'Walk'; controls.append(select);
    const facing = document.createElement('input'); facing.type = 'range'; facing.min = '0'; facing.max = '7'; facing.value = '0'; controls.append(facing);
    const label = document.querySelector('#status')!;
    const begin = performance.now();
    function animate(now: number) {
        if (stopped) return;
        const [start, count, stride] = raw.sequences[select.value].split(',').map(Number);
        const frame = start + (stride ? Number(facing.value) * stride : 0) + Math.floor((now - begin) / 100) % count;
        draw(frame, 1, true);
        label.textContent = `${select.value} · facing ${facing.value} · native frame ${frame} · calibration only`;
        requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
    (window as any).conscriptReady = true;
}
start().catch(error => { (window as any).conscriptError = error.stack; document.querySelector('#status')!.textContent = error.message; });
