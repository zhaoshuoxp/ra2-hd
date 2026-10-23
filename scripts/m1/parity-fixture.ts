import * as THREE from 'three';
import { Palette } from '../../src/data/Palette';
import { Color } from '../../src/util/Color';
import { ShpBuilder } from '../../src/engine/renderable/builder/ShpBuilder';
import { MeshBatchManager } from '../../src/engine/gfx/batch/MeshBatchManager';
import { RenderableContainer } from '../../src/engine/gfx/RenderableContainer';
import { Coords } from '../../src/game/Coords';
import { HdSpriteMaterial } from '../../src/engine/gfx/material/HdSpriteMaterial';
import { textureFromPalette } from '../../src/engine/gfx/TextureUtils';
import { TextureUtils } from '../../src/engine/gfx/TextureUtils';

const check = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
export function texture(bytes: Uint8Array, width: number, height: number, color = false) {
    const value = new THREE.DataTexture(bytes, width, height, THREE.RGBAFormat);
    value.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    value.flipY = true;
    value.minFilter = value.magFilter = THREE.NearestFilter;
    value.generateMipmaps = false;
    value.needsUpdate = true;
    return value;
}

export async function runParity() {
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(256, 192);
    document.body.append(renderer.domElement);
    renderer.setClearColor(0x212b36, 1);
    const camera = new THREE.OrthographicCamera(-128, 128, 96, -96, -2000, 2000);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(-Coords.ISO_CAMERA_ALPHA, Coords.ISO_CAMERA_BETA, 0, 'YXZ');
    camera.updateMatrixWorld();
    const indexed = Uint8Array.from({ length: 23 * 17 }, (_, i) => [0, 1, 64, 255, ...Array.from({ length: 16 }, (_, j) => 16 + j)][i % 20]);
    const shp = { width: 64, height: 64, numImages: 1,
        getImage: () => ({ x: 21, y: 15, width: 23, height: 17, imageData: indexed }) };
    const basePalette = new Palette(Uint8Array.from({ length: 768 }, (_, i) => (i * 17 + 11) % 64));
    const palettes = [new Color(240, 32, 48), new Color(16, 224, 80), new Color(32, 80, 244)]
        .map(c => basePalette.clone().remap(c));
    const samples: any[] = [];
    let geometryCases = 0;
    const gl = renderer.getContext();
    const read = () => {
        const result = new Uint8Array(256 * 192 * 4);
        gl.readPixels(0, 0, 256, 192, gl.RGBA, gl.UNSIGNED_BYTE, result);
        check(gl.getError() === gl.NO_ERROR, 'WebGL error');
        return result;
    };
    function draw(density: number, batched: boolean, light: number[], opacity: number, paletteRow: number) {
        const width = 24 * density + 4, height = 18 * density + 4;
        const base = new Uint8Array(width * height * 4), data = new Uint8Array(base.length);
        for (let i = 3; i < data.length; i += 4) data[i] = 255;
        for (let y = 0; y < 17 * density; y++) for (let x = 0; x < 23 * density; x++) {
            const index = indexed[Math.floor(y / density) * 23 + Math.floor(x / density)];
            const color = basePalette.getColor(index), offset = ((y + 2) * width + x + 2) * 4;
            base.set([color.r, color.g, color.b, index ? 255 : 0], offset);
            if (index >= 16 && index <= 31) data.set([255, index - 16, 0, 255], offset);
        }
        const pages = [{ base: texture(base, width, height, true), data: texture(data, width, height) }];
        const source = new THREE.Group(), scene = new THREE.Scene();
        const builder = new ShpBuilder(shp, palettes[paletteRow], camera, 4, true, 3);
        builder.setOffset({ x: 2, y: -3 });
        builder.setBatched(batched);
        if (batched) builder.setBatchPalettes(palettes);
        builder.setExtraLight(new THREE.Vector3(...light));
        builder.setOpacity(opacity);
        if (density) builder.setHdOverride({ identity: `synthetic-${density}`, pages,
            frames: [{ page: 0, sampleRect: { x: 2, y: 2, width: 24 * density, height: 18 * density } }] });
        const mesh = builder.build();
        source.add(mesh);
        source.updateMatrixWorld(true);
        const manager = new MeshBatchManager(new RenderableContainer(source));
        manager.create3DObject();
        if (batched) { manager.updateMeshes(); scene.add(manager.get3DObject()!); }
        else scene.add(source);
        renderer.render(scene, camera);
        const pixels = read(), positions = Array.from(mesh.geometry.attributes.position.array);
        check(renderer.info.render.calls > 0, 'No real draw call');
        manager.dispose(); builder.dispose();
        pages.forEach(p => { p.base.dispose(); p.data.dispose(); });
        return { pixels, positions };
    }
    try {
        for (const batched of [false, true]) for (const light of [[0, 0, 0], [-0.6, -0.4, -0.2], [0.5, 0.2, 1.0]]) {
            for (const opacity of [1, 0.65, 0.02]) for (let row = 0; row < palettes.length; row++) {
                const original = draw(0, batched, light, opacity, row);
                for (const density of [1, 2, 4]) {
                    const hd = draw(density, batched, light, opacity, row);
                    check(JSON.stringify(hd.positions) === JSON.stringify(original.positions), 'Geometry differs');
                    geometryCases++;
                    let maxDifference = 0, changedChannels = 0;
                    hd.pixels.forEach((v, i) => { const d = Math.abs(v - original.pixels[i]);
                        maxDifference = Math.max(maxDifference, d); if (d > 1) changedChannels++; });
                    samples.push({ batched, light, opacity, row, density, maxDifference, changedChannels });
                    check(maxDifference <= 1, `GPU parity failed: ${JSON.stringify(samples.at(-1))}`);
                }
            }
        }
        const mixedCoverage = [];
        const target = new THREE.WebGLRenderTarget(8, 8);
        const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10); quadCamera.position.z = 2;
        const geometry = new THREE.PlaneGeometry(2, 2);
        const linear = (byte: number) => { const x = byte / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
        for (const coverage of [0, 128, 255]) {
            const base = texture(new Uint8Array([96, 128, 160, 128]), 1, 1, true);
            const data = texture(new Uint8Array([coverage, 7, 0, 255]), 1, 1);
            const material = new HdSpriteMaterial({ map: base, remapMap: data, palette: textureFromPalette(palettes[0]),
                opacity: 0.65, alphaTest: 0.05, transparent: true, blending: THREE.NoBlending, extraLight: new THREE.Vector3(0.2, -0.3, 0.5) });
            const scene = new THREE.Scene(); scene.add(new THREE.Mesh(geometry, material));
            renderer.setRenderTarget(target); renderer.render(scene, quadCamera);
            const actual = new Uint8Array(4); renderer.readRenderTargetPixels(target, 4, 4, 1, 1, actual);
            const owner = palettes[0].getColor(23), ramp = [owner.r, owner.g, owner.b];
            const expected = [96, 128, 160].map((v, i) => Math.round(255 * Math.min(1, Math.max(0,
                (linear(v) * (1 - coverage / 255) + linear(ramp[i]) * coverage / 255) * [1.2, 0.7, 1.5][i]))));
            expected.push(Math.round(128 * 0.65));
            check(actual.every((v, i) => Math.abs(v - expected[i]) <= 1), `Mixed coverage ${coverage}: ${actual} != ${expected}`);
            mixedCoverage.push({ coverage, actual: Array.from(actual), expected });
            material.dispose(); base.dispose(); data.dispose();
        }
        renderer.setRenderTarget(null); geometry.dispose(); target.dispose();
        return { status: 'PASS', geometryCases, samples, mixedCoverage, metrics: {
            css: [renderer.domElement.clientWidth, renderer.domElement.clientHeight],
            drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
            devicePixelRatio, rendererPixelRatio: renderer.getPixelRatio(), maxTextureSize: renderer.capabilities.maxTextureSize,
            cameraBounds: [camera.left, camera.right, camera.top, camera.bottom] } };
    } finally {
        ShpBuilder.clearCaches();
        TextureUtils.cache.forEach(t => t.dispose()); TextureUtils.cache.clear();
        renderer.dispose(); renderer.forceContextLoss();
    }
}
(window as any).runParity = runParity;
