import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { ShpFile } from '../../../src/data/ShpFile';
import { ShpImage } from '../../../src/data/ShpImage';
import { ShpBuilder } from '../../../src/engine/renderable/builder/ShpBuilder';
import { ShpShadowMaterial } from '../../../src/engine/gfx/material/ShpShadowMaterial';
import { MergedSpriteMesh } from '../../../src/engine/gfx/batch/MergedSpriteMesh';
import { BatchedMesh } from '../../../src/engine/gfx/batch/BatchedMesh';
import { HdSpriteMaterial } from '../../../src/engine/gfx/material/HdSpriteMaterial';

test('shadow smoothing preserves native geometry/UVs and isolates frame/cache identity from the body', () => {
    const shp = new ShpFile();
    shp.width = shp.height = 12;
    shp.addImage(new ShpImage(new Uint8Array(16).fill(1), 4, 4, 2, 3));
    shp.addImage(new ShpImage(new Uint8Array(24).fill(12), 6, 4, 1, 2));
    const camera = new THREE.OrthographicCamera(); camera.rotation.set(-0.6, -0.7, 0);
    const original = new ShpBuilder(shp, {}, camera), shadow = new ShpBuilder(shp, {}, camera);
    original.flat = shadow.flat = true;
    shadow.shadowCoverage = true;
    (original as any).initTexture(); (shadow as any).initTexture();
    for (const frame of [0, 1]) {
        const native = original.createGeometry(frame), smooth = shadow.createGeometry(frame);
        expect([...smooth.attributes.position.array]).toEqual([...native.attributes.position.array]);
        expect([...smooth.attributes.uv.array]).toEqual([...native.attributes.uv.array]);
        expect(native.attributes.shadowFrameRect).toBeUndefined();
        const uv = smooth.attributes.uv, rect = smooth.attributes.shadowFrameRect;
        expect(rect.count).toBe(uv.count);
        for (let i = 0; i < uv.count; i++) {
            expect(uv.getX(i)).toBeGreaterThanOrEqual(rect.getX(i));
            expect(uv.getX(i)).toBeLessThanOrEqual(rect.getZ(i));
            expect(uv.getY(i)).toBeGreaterThanOrEqual(rect.getY(i));
            expect(uv.getY(i)).toBeLessThanOrEqual(rect.getW(i));
        }
        expect(original.getGeometryCacheKey(frame)).not.toBe(shadow.getGeometryCacheKey(frame));
        native.dispose(); smooth.dispose();
    }
    ShpBuilder.clearCaches();
});

test('Original embedded shadows keep one draw, nearest body sampling and shared index textures', () => {
    const map = new THREE.DataTexture(new Uint8Array(256), 8, 8);
    const material = new HdSpriteMaterial({ map, palette: new THREE.Texture(), indexedCoverage: true,
        embeddedShadowMap: map, nearestIndexedBody: true });
    const geometry = new THREE.PlaneGeometry();
    geometry.setAttribute('shadowFrameRect', new THREE.BufferAttribute(new Float32Array(16).fill(0.5), 4));
    const source = new BatchedMesh(geometry, material), batch = new MergedSpriteMesh(geometry, material, 2);
    batch.updateFromMeshes([source]);
    const mat = batch.material as HdSpriteMaterial;
    expect(mat.uniforms.embeddedShadowMap.value).toBe(map);
    expect(mat.uniforms.shadowAntialias.value).toBe(true);
    expect(mat.uniforms.hdMinFootprint.value).toBe(1);
    expect(mat.defines.NEAREST_INDEXED_BODY).toBe('');
    expect(mat.uniforms.hdPass.value).toBe(3);
    expect(mat.transparent).toBe(false); expect(mat.depthWrite).toBe(true);
    expect(mat.blendSrc).toBe(THREE.OneFactor); expect(mat.blendDst).toBe(THREE.OneMinusSrcAlphaFactor);
    expect(batch.children).toHaveLength(0);
    expect(batch.geometry.attributes.shadowFrameRect.getX(0)).toBe(0.5);
    batch.dispose(); geometry.dispose(); material.dispose(); map.dispose();
});

test('merged shadow animation keeps frame clamps and per-instance opacity without another draw pass', () => {
    const material = new ShpShadowMaterial({ map: new THREE.DataTexture(new Uint8Array(256), 8, 8),
        palette: new THREE.Texture(), transparent: true });
    const geometry = new THREE.PlaneGeometry();
    geometry.setAttribute('shadowFrameRect', new THREE.BufferAttribute(new Float32Array(16).fill(0.25), 4));
    const a = new BatchedMesh(geometry, material); a.setOpacity(0.5);
    const batch = new MergedSpriteMesh(geometry, material, 2);
    batch.updateFromMeshes([a]);
    const mat = batch.material as ShpShadowMaterial;
    expect(mat).toBeInstanceOf(ShpShadowMaterial);
    expect(mat.uniforms.shadowTextureSize.value).toEqual([8, 8]);
    expect(mat.uniforms.shadowAntialias.value).toBe(true);
    expect(mat.alphaTest).toBe(0.001);
    expect(batch.children).toHaveLength(0);
    expect(batch.geometry.attributes.vertexColorMult.getW(0)).toBe(0.5);
    expect([...batch.geometry.attributes.shadowFrameRect.array.slice(0, 16)]).toEqual([...geometry.attributes.shadowFrameRect.array]);
    geometry.attributes.uv.array.fill(0.75);
    geometry.attributes.shadowFrameRect.array.fill(0.75);
    a.setOpacity(0.125); batch.updateFromMeshes([a]);
    expect(batch.geometry.attributes.shadowFrameRect.getX(0)).toBe(0.75);
    expect(batch.geometry.attributes.vertexColorMult.getW(0)).toBe(0.125);
    const version = batch.geometry.attributes.shadowFrameRect.version;
    batch.updateFromMeshes([a]);
    expect(batch.geometry.attributes.shadowFrameRect.version).toBe(version);
    batch.updateFromMeshes([]);
    expect(batch.geometry.drawRange.count).toBe(0);
    batch.dispose(); geometry.dispose(); material.dispose();
});
