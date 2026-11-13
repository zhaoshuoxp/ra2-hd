import * as THREE from 'three';

// Preserve the complete painted shape, not only its bounding rectangle. The
// closest rotation of the native projected pose supplies the screen bearing;
// one rigid rotation replaces compression and shear for every component.
export function groundVolumeCorrection(target: THREE.Matrix4,
    imageGeometry: THREE.BufferGeometry,
    imagePose: THREE.Matrix4, camera: THREE.Camera): THREE.Matrix4 {
    target.identity();
    const rotation = new THREE.Matrix4().makeRotationFromQuaternion(camera.quaternion);
    const view = rotation.clone().invert(), posed = view.clone().multiply(imagePose);
    const positions = imageGeometry.getAttribute('position');
    const p0 = new THREE.Vector3().fromBufferAttribute(positions, 0);
    const q0 = p0.clone().applyMatrix4(view), r0 = p0.clone().applyMatrix4(posed);
    let basis: number[] | undefined;
    for (let i = 1; i+1 < positions.count; i++) {
        const p1 = new THREE.Vector3().fromBufferAttribute(positions, i);
        const p2 = new THREE.Vector3().fromBufferAttribute(positions, i+1);
        const q1 = p1.clone().applyMatrix4(view).sub(q0), q2 = p2.clone().applyMatrix4(view).sub(q0);
        const determinant = q1.x*q2.y-q2.x*q1.y;
        if (Math.abs(determinant) < 1e-7) continue;
        const r1 = p1.applyMatrix4(posed).sub(r0), r2 = p2.applyMatrix4(posed).sub(r0);
        basis = [(r1.x*q2.y-r2.x*q1.y)/determinant, (r2.x*q1.x-r1.x*q2.x)/determinant,
            (r1.y*q2.y-r2.y*q1.y)/determinant, (r2.y*q1.x-r1.y*q2.x)/determinant];
        break;
    }
    if (!basis) return target;
    const [a,b,c,d] = basis, determinant = a*d-b*c;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-7) return target;
    // Polar decomposition keeps the native image orientation. A projected
    // longitudinal axis alone also includes perspective foreshortening and
    // can rotate the whole painted vehicle toward an unrelated bearing.
    const angle = Math.atan2(c-b,a+d);
    const co = Math.cos(angle), si = Math.sin(angle);
    const correction = new THREE.Matrix4().set(
        (co*d+si*c)/determinant, (-co*b-si*a)/determinant, 0, 0,
        (si*d-co*c)/determinant, (-si*b+co*a)/determinant, 0, 0,
        0, 0, 1, 0, 0, 0, 0, 1);
    return target.copy(rotation).multiply(correction).multiply(view);
}
