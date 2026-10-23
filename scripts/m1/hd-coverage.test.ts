import { test, expect } from 'bun:test';
import * as THREE from 'three';
import { HdSpriteMaterial } from '../../src/engine/gfx/material/HdSpriteMaterial';
import { PaletteBasicMaterial } from '../../src/engine/gfx/material/PaletteBasicMaterial';
import { MergedSpriteMesh } from '../../src/engine/gfx/batch/MergedSpriteMesh';
import { BatchedMesh } from '../../src/engine/gfx/batch/BatchedMesh';

function sprite(transparent = false) {
    const geometry = new THREE.PlaneGeometry(2, 4);
    const material = new HdSpriteMaterial({ map: new THREE.DataTexture(new Uint8Array(64), 4, 4),
        palette: new THREE.Texture(), remapMap: new THREE.Texture(), transparent });
    const mesh = new BatchedMesh(geometry, material);
    mesh.matrixWorld.makeTranslation(5, 7, 9);
    mesh.setPaletteIndex(3); mesh.setExtraLight(new THREE.Vector3(0.2, 0.3, 0.4)); mesh.setOpacity(0.6);
    return mesh;
}

test('HD edge views share buffers, preserve item ranges, palette/light and bounds, and reuse allocations', () => {
    const a = sprite(), b = sprite(); b.matrixWorld.makeTranslation(15, 17, 19);
    b.geometry.attributes.uv.array.fill(0.25);
    const batch = new MergedSpriteMesh(a.geometry, a.material as THREE.Material, 4);
    batch.renderOrder = 12;
    const planes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), -2)];
    (batch.material as THREE.Material).clippingPlanes = planes;
    batch.updateFromMeshes([a, b]);
    expect(batch.children.length).toBe(2);
    const edges = batch.children as THREE.Mesh[];
    expect(edges[0].geometry.attributes.position).toBe(batch.geometry.attributes.position);
    expect(edges[0].geometry.index).toBe(batch.geometry.index);
    expect(edges[1].geometry.drawRange).toEqual({ start: 6, count: 6 });
    expect(edges[1].geometry.boundingSphere!.center.toArray()).toEqual([15, 17, 19]);
    expect(edges[0].renderOrder).toBe(12);
    const mat = edges[0].material as HdSpriteMaterial;
    expect(mat.clippingPlanes).toBe(planes);
    expect(mat.depthWrite).toBe(false); expect(mat.depthTest).toBe(true);
    expect(mat.defines.VERTEX_PALETTE_OFFSET).toBe('');
    expect(mat.defines.USE_VERTEX_COLOR_MULT).toBe('');
    expect(mat.uniforms.hdFiltering).toBe((batch.material as HdSpriteMaterial).uniforms.hdFiltering);
    expect(batch.geometry.attributes.vertexPaletteOffset.getX(0)).toBe(3);
    expect(batch.geometry.attributes.vertexColorMult.getW(0)).toBeCloseTo(0.6);
    expect(batch.geometry.attributes.hdFrameRect.getZ(4)).toBe(0.25);
    const version = batch.geometry.attributes.hdFrameRect.version;
    batch.updateFromMeshes([a, b]);
    expect(batch.geometry.attributes.hdFrameRect.version).toBe(version);
    expect(batch.children[0]).toBe(edges[0]);
    batch.updateFromMeshes([b]);
    expect(edges[1].visible).toBe(false);
    expect(batch.geometry.attributes.hdFrameRect.getZ(0)).toBe(0.25);
    let disposed = 0;
    edges.forEach(e => e.geometry.addEventListener('dispose', () => disposed++));
    batch.dispose(); expect(disposed).toBe(2); expect(batch.children.length).toBe(0);
    a.geometry.dispose(); b.geometry.dispose();
    (a.material as THREE.Material).dispose(); (b.material as THREE.Material).dispose();
});

test('faded HD sprites use individually sorted full coverage; indexed batches gain no edge pass', () => {
    const a = sprite(true), hd = new MergedSpriteMesh(a.geometry, a.material as THREE.Material, 2);
    hd.updateFromMeshes([a]);
    expect((hd.material as HdSpriteMaterial).uniforms.hdPass.value).toBe(0);
    expect(((hd.children[0] as THREE.Mesh).material as HdSpriteMaterial).uniforms.hdPass.value).toBe(3);
    const material = new PaletteBasicMaterial();
    const indexed = new MergedSpriteMesh(a.geometry, material, 2);
    indexed.updateFromMeshes([a]);
    expect(indexed.children.length).toBe(0);
    expect(indexed.geometry.attributes.hdFrameRect).toBeUndefined();
    hd.dispose(); indexed.dispose(); material.dispose(); a.geometry.dispose(); (a.material as THREE.Material).dispose();
});

test('bridge coverage blends before the deck band, including a fully faded body', () => {
    for (const faded of [false, true]) {
        const mesh = sprite(faded);
        const batch = new MergedSpriteMesh(mesh.geometry, mesh.material as THREE.Material, 2, true);
        batch.renderOrder = 0;
        batch.updateFromMeshes([mesh]);
        const edge = batch.children[0] as THREE.Mesh;
        const mat = edge.material as HdSpriteMaterial;
        expect(edge.renderOrder).toBeGreaterThan(batch.renderOrder);
        expect(edge.renderOrder).toBeLessThan(1);
        expect(mat.transparent).toBe(false);
        expect(mat.blending).toBe(THREE.CustomBlending);
        expect(mat.blendSrc).toBe(THREE.OneFactor);
        expect(mat.blendDst).toBe(THREE.OneMinusSrcAlphaFactor);
        expect(mat.depthTest).toBe(true);
        expect(mat.depthWrite).toBe(false);
        expect(mat.uniforms.hdPass.value).toBe(faded ? 3 : 2);
        batch.dispose(); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
    }
});
