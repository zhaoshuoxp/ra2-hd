import { test, expect } from 'bun:test';
import * as THREE from 'three';
import { SpriteUtils } from '../../src/engine/gfx/SpriteUtils';
import { clipShroudToTile } from '../../src/engine/renderable/entity/map/shroudGeometry';
import { nearestGameSpeed, selectedGameSpeed } from '../../src/gui/screen/game/gameMenu/gameSpeedControl';

test('shroud diamond partitions the original rectangle without changing its center or update stride', () => {
    const camera = new THREE.PerspectiveCamera(); camera.rotation.set(-Math.PI / 6, Math.PI / 4, 0, 'YXZ');
    const geometry = SpriteUtils.createSpriteGeometry({ camera, texture: { image: { width: 300, height: 300 } } as THREE.Texture,
        textureArea: { x: .5, y: .5, width: 59, height: 29 }, logicalSize: { width: 60, height: 30 }, flat: true, align: { x: 0, y: -1 } });
    const area = () => {
        const p = geometry.getAttribute('position'), index = geometry.index!;
        let sum = 0;
        for (let i = 0; i < index.count; i += 3) {
            const a = new THREE.Vector3().fromBufferAttribute(p, index.getX(i));
            const b = new THREE.Vector3().fromBufferAttribute(p, index.getX(i + 1));
            const c = new THREE.Vector3().fromBufferAttribute(p, index.getX(i + 2));
            sum += b.sub(a).cross(c.sub(a)).length() / 2;
        }
        return sum;
    };
    const center = () => {
        const p = geometry.getAttribute('position'), sum = new THREE.Vector3();
        for (let i = 0; i < p.count; i++) sum.add(new THREE.Vector3().fromBufferAttribute(p, i));
        return sum.divideScalar(p.count);
    };
    const originalArea = area(), originalIndex = geometry.index!.array.slice(), originalCenter = center();
    clipShroudToTile(geometry);
    expect(area()).toBeCloseTo(originalArea / 2, 3);
    expect(center().distanceTo(originalCenter)).toBeCloseTo(0, 5);
    expect(geometry.getAttribute('position').count).toBe(8);
    expect(geometry.getAttribute('uv').count * 2).toBe(16);
    expect(geometry.index!.array).toEqual(originalIndex);
    const uv = geometry.getAttribute('uv');
    const points = Array.from({ length: uv.count }, (_, i) => [uv.getX(i), uv.getY(i)]);
    const unique = new Set(points.map(p => p.join(',')));
    expect(unique.size).toBe(4);
    // Frame translation in the atlas cannot change the tile's world geometry.
    const positions = geometry.getAttribute('position').array.slice();
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) + .2);
    expect(geometry.getAttribute('position').array).toEqual(positions);
    geometry.dispose();
});

test('five solo speed choices map to the new rates, rejecting invalid selections', () => {
    expect(Array.from({ length: 5 }, (_, i) => selectedGameSpeed(i))).toEqual([1.5, 3, 4.5, 6, 7.5]);
    for (let i = 0; i < 5; i++) expect(nearestGameSpeed(selectedGameSpeed(i))).toBe(i);
    for (const invalid of [-1, 5, 6, .5, NaN, Infinity]) expect(() => selectedGameSpeed(invalid)).toThrow();
});
