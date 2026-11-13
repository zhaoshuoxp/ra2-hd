import * as THREE from 'three';
import { LightingType } from '../../type/LightingType';

// A family's authored light reference must not depend on where or when its
// renderer first acquires the shared HD pages. Local lights remain live.
export function authoredLightReference(renderer: any): THREE.Vector3 {
    const base = renderer.lighting?.getBaseAmbient?.();
    if (!base) return renderer.baseShpExtraLight?.clone() ?? new THREE.Vector3();
    const type = renderer.objectArt.lightingType;
    const extra = renderer.rules.audioVisual.extraUnitLight;
    if (type === LightingType.None) return new THREE.Vector3().setScalar(extra);
    const tint = type >= LightingType.Full || base.forceTint
        ? new THREE.Vector3(base.red, base.green, base.blue) : new THREE.Vector3(1, 1, 1);
    return tint.multiplyScalar(base.ambient + base.ground).addScalar(extra - 1);
}
