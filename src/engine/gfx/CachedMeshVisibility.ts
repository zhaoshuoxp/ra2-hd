import type * as THREE from 'three';

// Keep cached artwork and its resources, but exclude unused heading/coverage
// passes from matrix traversal. Native geometry remains attached independently.
export function setCachedMeshVisibility(mesh: THREE.Object3D, parent: THREE.Object3D, visible: boolean): void {
    mesh.visible = visible;
    if (visible) {
        if (mesh.parent !== parent) parent.add(mesh);
    } else if (mesh.parent === parent) {
        parent.remove(mesh);
    }
}
