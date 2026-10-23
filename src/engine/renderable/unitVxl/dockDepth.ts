import * as THREE from 'three';

// A folded building sprite is not a physical parking surface. Recover its
// depth at the aircraft's registered pixels, without moving those pixels.
// Only the occupied dock participates; other objects keep normal depth tests.
export function dockDepthOffset(
    geometry: THREE.BufferGeometry,
    aircraftWorld: THREE.Matrix4,
    dockMesh: THREE.Mesh,
    towardCamera: THREE.Vector3,
): number {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const surface = new THREE.Mesh(dockMesh.geometry, material);
    surface.matrixWorld.copy(dockMesh.matrixWorld);
    const positions = geometry.getAttribute('position');
    const ray = new THREE.Raycaster();
    let offset = 0;
    for (let i = 0; i < positions.count; i++) {
        const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(aircraftWorld);
        ray.set(point.clone().addScaledVector(towardCamera, 10000), towardCamera.clone().negate());
        const hit = ray.intersectObject(surface, false)[0];
        if (hit) offset = Math.max(offset, 10000 - hit.distance + 0.5);
    }
    material.dispose();
    return offset;
}
