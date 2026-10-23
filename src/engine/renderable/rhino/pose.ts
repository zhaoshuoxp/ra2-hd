import * as THREE from 'three';

// The authored heading already contains flat yaw. Apply only the native residual
// pose, including rocking about its native pivot and sinking translations.
export function nativePose(target: THREE.Matrix4, yawInverse: THREE.Matrix4, r: any): THREE.Matrix4 {
    const yaw = r.tiltObj.rotation.y + r.dirWrapObj.rotation.y;
    target.copy(r.tiltObj.matrix).multiply(r.dirWrapObj.matrix)
        .multiply(r.rockingTiltObj.matrix).multiply(r.mainObj.matrix)
        .multiply(yawInverse.makeRotationY(-yaw));
    // Preserve the accepted flat-pose transform exactly, including intermediate yaw.
    const e = target.elements;
    for (let i = 0; i < 16; i++) {
        const identity = i % 5 === 0 ? 1 : 0;
        if (Math.abs(e[i] - identity) < 1e-12) e[i] = identity;
    }
    return target;
}
