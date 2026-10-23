import * as THREE from 'three';

// Native bridge decks are ordered opaque overlays without a depth surface.
// Blend Rhino coverage after native geometry in the SAME order band, before
// the next bridge band. Custom blending retains alpha without Three's OPAQUE
// shader define. Depth testing remains enabled; production C is unchanged.
export function nativeCoverage(mesh: THREE.Mesh, nativeOrder: number): void {
    const material = mesh.material as THREE.Material;
    if (material.blending !== THREE.CustomBlending) {
        material.transparent = false;
        material.blending = THREE.CustomBlending;
        material.blendEquation = material.blendEquationAlpha = THREE.AddEquation;
        material.blendSrc = material.blendSrcAlpha = THREE.OneFactor;
        material.blendDst = material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
        material.needsUpdate = true;
    }
    mesh.renderOrder = nativeOrder + 0.25;
}
