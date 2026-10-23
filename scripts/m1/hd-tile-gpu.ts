import * as THREE from 'three';
import { poolHdPage } from '../../src/engine/renderable/builder/poolHdPage';
import { HdSpriteMaterial } from '../../src/engine/gfx/material/HdSpriteMaterial';

async function decode(url: string) {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
    return { width: image.width, height: image.height, rgba: new Uint8Array(ctx.getImageData(0, 0, image.width, image.height).data) };
}

async function run() {
    const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setSize(320, 320);
    document.body.append(renderer.domElement);
    const errors: string[] = []; renderer.debug.onShaderError = (_gl, _program, vertex, fragment) => {
        errors.push(renderer.getContext().getShaderInfoLog(vertex)!, renderer.getContext().getShaderInfoLog(fragment)!);
    };
    const target = new THREE.WebGLRenderTarget(320, 320), scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-160, 160, 160, -160, 0.1, 20); camera.position.z = 10;
    const paletteBytes = new Uint8Array(256 * 4);
    const palette = new THREE.DataTexture(paletteBytes, 256, 1); palette.colorSpace = THREE.SRGBColorSpace;
    const rows: any[] = [], fixtures = (window as any).__tileFixtures ?? await fetch('/fixtures.json').then(r => r.json());
    for (const fixture of fixtures) {
        const base = await decode(fixture.base), data = await decode(fixture.data);
        const p = poolHdPage(base, data, 2048)!;
        if (!p) throw Error('Real accepted fixture did not pool');
        const originalBase = new THREE.DataTexture(base.rgba, base.width, base.height);
        const originalData = new THREE.DataTexture(data.rgba, data.width, data.height);
        for (const t of [originalBase, originalData]) { t.flipY = true; t.generateMipmaps = false; t.needsUpdate = true; }
        originalBase.colorSpace = THREE.SRGBColorSpace;
        const [x, y, width, height] = fixture.rect;
        const left = x / base.width, right = (x + width) / base.width;
        const top = 1 - y / base.height, bottom = 1 - (y + height) / base.height;
        const geometry = new THREE.PlaneGeometry(width / fixture.density, height / fixture.density);
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute([left, top, right, top, left, bottom, right, bottom], 2));
        geometry.setAttribute('hdFrameRect', new THREE.Float32BufferAttribute(Array(4).fill([left, bottom, right, top]).flat(), 4));
        for (const filtering of [false, true]) for (const scale of [0.63, 1, 1.71]) for (const opacity of [1, 0.37]) {
            for (let i = 0; i < 256; i++) paletteBytes.set([i, 255 - i, (i * 11) % 256, 255], i * 4);
            palette.needsUpdate = true;
            const captures: Uint8Array[] = [];
            for (const tiled of [false, true]) {
                const material = new HdSpriteMaterial({ map: tiled ? p.base : originalBase,
                    remapMap: tiled ? p.data : originalData, tiles: tiled ? p.tiles : undefined,
                    palette, paletteCount: 1, opacity, transparent: true, coverageWidth: fixture.density });
                if (filtering) material.enableFiltering('full');
                const mesh = new THREE.Mesh(geometry, material); mesh.scale.setScalar(scale); mesh.position.set(0.23, -0.41, 0);
                scene.add(mesh); renderer.setRenderTarget(target); renderer.setClearColor(0x314839, 1); renderer.clear(); renderer.render(scene, camera);
                const capture = new Uint8Array(320 * 320 * 4); renderer.readRenderTargetPixels(target, 0, 0, 320, 320, capture); captures.push(capture);
                mesh.removeFromParent(); material.dispose();
            }
            let different = 0, maxDifference = 0;
            for (let i = 0; i < captures[0].length; i++) {
                const difference = Math.abs(captures[0][i] - captures[1][i]);
                if (difference) different++; maxDifference = Math.max(maxDifference, difference);
            }
            rows.push({ name: fixture.name, filtering, scale, opacity, different, maxDifference, gpuBytes: p.gpuBytes });
        }
        geometry.dispose(); [originalBase, originalData, p.base, p.data, p.tiles.map].forEach(t => t.dispose());
    }
    renderer.setRenderTarget(null); renderer.render(scene, camera);
    const remainingTextures = renderer.info.memory.textures;
    const glError = renderer.getContext().getError();
    target.dispose(); palette.dispose(); renderer.dispose();
    (window as any).__tileResult = { rows, errors, remainingTextures, glError,
        status: rows.every(r => r.maxDifference === 0) && !errors.length && glError === 0 ? 'PASS_BYTE_EXACT_GPU_PARITY' : 'FAIL' };
}
run().catch(error => { (window as any).__tileResult = { status: 'FAIL', error: String(error) }; });
