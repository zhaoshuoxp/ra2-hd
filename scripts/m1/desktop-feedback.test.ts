import { test, expect } from 'bun:test';
import { displayChoices } from '../../desktop/display.mjs';
import { HdSpriteMaterial } from '../../src/engine/gfx/material/HdSpriteMaterial';
import { GameSpeed } from '../../src/game/GameSpeed';
import { selectedGameSpeed } from '../../src/gui/screen/game/gameMenu/gameSpeedControl';
import * as THREE from 'three';

test('desktop window modes fit the current monitor in physical pixels', () => {
    const retina = displayChoices({ scaleFactor: 2, workAreaSize: { width: 1512, height: 944 }, size: { width: 1512, height: 982 } });
    expect(retina.some(c => c.id === '2560x1440')).toBe(true);
    expect(retina.some(c => c.id === '3840x2160')).toBe(false);
    expect(retina.at(-1).label).toBe('3024 × 1964 (full screen)');
    const small = displayChoices({ scaleFactor: 1, workAreaSize: { width: 1366, height: 768 }, size: { width: 1366, height: 768 } });
    expect(small.map(c => c.id)).toEqual(['1280x720', 'fullscreen']);
});
test('five solo tiers preserve the network and replay speed mapping', () => {
    expect(selectedGameSpeed(4) * GameSpeed.BASE_TICKS_PER_SECOND).toBe(112.5);
    expect(GameSpeed.computeGameSpeed(6) * GameSpeed.BASE_TICKS_PER_SECOND).toBe(60);
    expect(selectedGameSpeed(2) * GameSpeed.BASE_TICKS_PER_SECOND).toBe(67.5);
});
test('original Conscript coverage resolves palette entries before mixing and survives edge cloning', () => {
    const map = new THREE.DataTexture(new Uint8Array(64), 4, 4);
    const material = new HdSpriteMaterial({ map, indexedCoverage: true, coverageWidth: 1 });
    material.enableFiltering('opaque');
    const edge = material.clone(); edge.enableFiltering('edge');
    expect(edge.defines).toHaveProperty('INDEXED_COVERAGE');
    expect(edge.map).toBe(map);
    expect(edge.uniforms.hdMinFootprint.value).toBe(1);
    expect(edge.fragmentShader).toContain('float index = texture2D(map, uv).a');
    expect(edge.depthWrite).toBe(false);
    expect(edge.premultipliedAlpha).toBe(true);
    expect(material.depthWrite).toBe(true);
    material.dispose(); edge.dispose(); map.dispose();
});

test('menu sprite scaling follows DOM scale without altering world billboard geometry', async () => {
    const { BatchedMesh } = await import('../../src/engine/gfx/batch/BatchedMesh');
    const { MergedSpriteMesh } = await import('../../src/engine/gfx/batch/MergedSpriteMesh');
    const geometry = new THREE.PlaneGeometry(20, 10);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new BatchedMesh(geometry, material);
    mesh.scale.set(1.5, 1.5, 1); mesh.position.set(100, 50, 0); mesh.updateMatrixWorld();
    const batch = new MergedSpriteMesh(geometry, material, 1);
    batch.updateFromMeshes([mesh]);
    const originalX = geometry.attributes.position.getX(0);
    expect(batch.geometry.attributes.position.getX(0)).toBe(originalX + 100);
    mesh.userData.scaleUiSprite = true;
    batch.updateFromMeshes([mesh]);
    expect(batch.geometry.attributes.position.getX(0)).toBe(originalX * 1.5 + 100);
    expect(geometry.attributes.position.getX(0)).toBe(originalX);
    batch.dispose(); geometry.dispose(); material.dispose();
});
