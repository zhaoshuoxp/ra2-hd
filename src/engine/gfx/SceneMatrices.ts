import type * as THREE from 'three';

// Only the scene root opts out of the renderer's automatic traversal. Three
// also checks this flag when computing the root's own matrix, so enable it
// during our explicit update without changing any descendant's update policy.
export function updateSceneMatrices(scene: THREE.Scene): void {
    const automatic = scene.matrixWorldAutoUpdate;
    scene.matrixWorldAutoUpdate = true;
    try {
        scene.updateMatrixWorld(false);
    } finally {
        scene.matrixWorldAutoUpdate = automatic;
    }
}
