import * as THREE from 'three';
import { ShpShadowMaterial } from '../../../src/engine/gfx/material/ShpShadowMaterial';
import { MergedSpriteMesh } from '../../../src/engine/gfx/batch/MergedSpriteMesh';
import { BatchedMesh } from '../../../src/engine/gfx/batch/BatchedMesh';
import { HdSpriteMaterial } from '../../../src/engine/gfx/material/HdSpriteMaterial';

// Injected by the scoped runtime validator; never included in the application.
(window as any).__testShadowCoverage = () => {
    const renderer = new THREE.WebGLRenderer({ alpha: true });
    const target = new THREE.WebGLRenderTarget(128, 128);
    renderer.setRenderTarget(target); renderer.setClearColor(0, 0);
    const pixels = new Uint8Array(128 * 128 * 4), data = new Uint8Array(24 * 8 * 4);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 24; x++) {
        data[(y * 24 + x) * 4 + 3] = x < 8 ? Number(x + y < 8) * 12 : x < 16 ? 255 : 0;
    }
    const map = new THREE.DataTexture(data, 24, 8); map.needsUpdate = true;
    const paletteData = new Uint8Array(256 * 4);
    for (let i = 1; i < 256; i++) paletteData[i * 4 + 3] = 255;
    const palette = new THREE.DataTexture(paletteData, 256, 1); palette.needsUpdate = true;
    const material = new ShpShadowMaterial({ map, palette, transparent: true, opacity: 0.5 });
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 10);
    camera.position.z = 5;
    const geometry = new THREE.PlaneGeometry(8, 8);
    const uv = geometry.attributes.uv;
    const rect = new THREE.BufferAttribute(new Float32Array(16), 4);
    const frame = (index: number) => {
        for (let i = 0; i < uv.count; i++) {
            uv.setXY(i, (index + (i % 2)) / 3, i < 2 ? 1 : 0);
            rect.setXYZW(i, index / 3, 0, (index + 1) / 3, 1);
        }
        uv.needsUpdate = rect.needsUpdate = true;
    };
    geometry.setAttribute('shadowFrameRect', rect); frame(0);
    const mesh = new THREE.Mesh(geometry, material); scene.add(mesh);
    const sample = () => {
        renderer.render(scene, camera);
        renderer.readRenderTargetPixels(target, 0, 0, 128, 128, pixels);
        return Array.from(pixels.filter((_, i) => i % 4 === 3));
    };
    material.uniforms.shadowAntialias.value = false;
    const nearest = sample();
    material.uniforms.shadowAntialias.value = true;
    const smooth = sample();
    frame(2); const empty = sample();
    frame(1); const solid = sample();
    frame(0); mesh.removeFromParent();
    const source = new BatchedMesh(geometry, material); source.setOpacity(0.5);
    // Uniform opacity is 1 for a batch; the source supplies native 0.5 once.
    material.opacity = 1;
    const batch = new MergedSpriteMesh(geometry, material, 1); batch.updateFromMeshes([source]); scene.add(batch);
    const merged = sample(); source.setOpacity(0.125); batch.updateFromMeshes([source]);
    const faded = sample();
    const result = {
        nearestLevels: [...new Set(nearest)].sort((a, b) => a - b),
        smoothLevels: new Set(smooth).size, smoothMax: Math.max(...smooth),
        emptyMax: Math.max(...empty), solidCenter: solid[64 * 128 + 64],
        mergedDifference: merged.reduce((n, alpha, i) => n + Number(alpha !== smooth[i]), 0),
        fadedMax: Math.max(...faded), glError: renderer.getContext().getError(),
    };
    batch.dispose(); geometry.dispose(); material.dispose(); map.dispose(); palette.dispose(); target.dispose(); renderer.dispose();
    return result;
};

(window as any).__testEmbeddedShadow = () => {
    const renderer = new THREE.WebGLRenderer({ alpha: true }), target = new THREE.WebGLRenderTarget(128, 128);
    renderer.setRenderTarget(target); renderer.setClearColor(0, 0);
    const nativeData = new Uint8Array(4 * 4 * 4), baseData = new Uint8Array(8 * 8 * 4), data = new Uint8Array(baseData.length);
    const indices = [5, 2, 0, 0, 2, 2, 12, 0, 0, 12, 12, 0, 0, 0, 0, 0];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const index = indices[y * 4 + x]; nativeData[(y * 4 + x) * 4 + 3] = index;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
            const at = ((y * 2 + dy) * 8 + x * 2 + dx) * 4;
            // Dark authored boots overlap the old shadow index; black body detail
            // uses another native index. Neither may be removed or softened.
            const color = x === 1 && y === 2 ? 40 : index === 2 ? 180 : 0;
            baseData.set([color, color, color, index ? 255 : 0], at); data[at + 3] = 255;
            if (x === 2 && y === 2) data[at] = 255;
        }
    }
    const map = new THREE.DataTexture(baseData, 8, 8), remap = new THREE.DataTexture(data, 8, 8);
    const native = new THREE.DataTexture(nativeData, 4, 4), palette = new THREE.DataTexture(new Uint8Array(256 * 4), 256, 1);
    palette.image.data.set([100, 0, 0, 255], 16 * 4);
    for (const texture of [map, remap, native, palette]) texture.needsUpdate = true;
    const material = new HdSpriteMaterial({ map, remapMap: remap, palette, embeddedShadowMap: native });
    material.enableBlendedCoverage();
    const geometry = new THREE.PlaneGeometry(8, 8), rect = new Float32Array([0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1]);
    geometry.setAttribute('hdFrameRect', new THREE.BufferAttribute(rect, 4));
    geometry.setAttribute('shadowFrameRect', new THREE.BufferAttribute(rect.slice(), 4));
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 10); camera.position.z = 5;
    const mesh = new THREE.Mesh(geometry, material); scene.add(mesh);
    const sample = (enabled: boolean) => {
        material.uniforms.shadowAntialias.value = enabled; renderer.render(scene, camera);
        const pixels = new Uint8Array(128 * 128 * 4); renderer.readRenderTargetPixels(target, 0, 0, 128, 128, pixels);
        return pixels;
    };
    const before = sample(false), after = sample(true);
    const at = (x: number, y: number) => (y * 128 + x) * 4;
    const regionEqual = (x: number, y: number) => {
        for (let dy = -4; dy < 4; dy++) for (let dx = -4; dx < 4; dx++) {
            const start = at(x + dx, y + dy);
            for (let c = 0; c < 4; c++) if (before[start + c] !== after[start + c]) return false;
        }
        return true;
    };
    const result = { blackBodyPreserved: regionEqual(16, 16), darkOverlappingBootPreserved: regionEqual(48, 80),
        opaqueBodyPreserved: regionEqual(48, 48), ownerMaskedBodyPreserved: regionEqual(80, 80),
        beforeAlphaLevels: new Set(before.filter((_, i) => i % 4 === 3)).size,
        afterAlphaLevels: new Set(after.filter((_, i) => i % 4 === 3)).size,
        glError: renderer.getContext().getError() };
    geometry.dispose(); material.dispose(); for (const texture of [map, remap, native, palette]) texture.dispose();
    target.dispose(); renderer.dispose(); return result;
};
