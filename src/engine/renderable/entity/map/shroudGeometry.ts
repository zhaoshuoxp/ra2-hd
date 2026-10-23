import * as THREE from 'three';

// The SHP rectangle contains a tile diamond. Collapse its exterior corners so
// neighboring masks share rasterized edges instead of multiplying twice in a
// dilated overlap. Keep eight vertices for the existing incremental UV updates.
export function clipShroudToTile(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    const positions = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    const us = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
    for (const edge of [Math.min(...us), Math.max(...us)]) {
        const indices = us.flatMap((u, i) => u === edge ? [i] : []);
        const center = new THREE.Vector3();
        let v = 0;
        for (const i of indices) {
            center.add(new THREE.Vector3().fromBufferAttribute(positions, i));
            v += uv.getY(i);
        }
        center.divideScalar(indices.length);
        for (const i of indices) {
            positions.setXYZ(i, center.x, center.y, center.z);
            uv.setY(i, v / indices.length);
        }
    }
    return geometry;
}
