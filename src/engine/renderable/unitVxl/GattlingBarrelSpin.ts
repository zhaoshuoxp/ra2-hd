import * as THREE from 'three';
import { HdSpriteMaterial } from '../../gfx/material/HdSpriteMaterial';
import { surfacePoint } from '../entity/plugin/magneticBeamAttachments';

// The two retail CYLINDER sections are the independent gattling barrels.
const tips: Record<number, [number, number]> = {
    0: [.09, .84], 45: [.50, .89], 90: [.89, .86], 135: [.90, .73],
    180: [.88, .27], 225: [.50, .75], 270: [.10, .26], 315: [.08, .74],
};
export const gattlingSpinRates = [1, 2, 4] as const;
export function isGattlingBarrel(part: any): boolean {
    return part.actor === 'YTNK' && part.member === 'ytnktur.vxl'
        && ['CYLINDER14', 'CYLINDER22'].includes(part.section);
}
export function gattlingTipUv(part: any, frame: any): THREE.Vector2 {
    const [x, y, w, h] = frame.rect, [nx, ny] = tips[frame.heading];
    return new THREE.Vector2((x + nx * w) / part.pageSize[0], 1 - (y + ny * h) / part.pageSize[1]);
}
export function enableGattlingSpin(material: HdSpriteMaterial, part: any, frame: any): void {
    const center = gattlingTipUv(part, frame), radius = 1.15 * frame.rect[2] / frame.logicalSize[0];
    material.uniforms.gattlingFace = { value: new THREE.Vector4(center.x, center.y,
        radius / part.pageSize[0], radius / part.pageSize[1]) };
    material.uniforms.gattlingPhase = { value: 0 };
    material.uniforms.gattlingActive = { value: 0 };
    material.fragmentShader = `
        uniform vec4 gattlingFace;
        uniform float gattlingPhase;
        uniform float gattlingActive;
        vec2 gattlingUv(vec2 uv) {
            vec2 p = (uv - gattlingFace.xy) / gattlingFace.zw;
            if (gattlingActive == 0.0 || dot(p, p) > 1.0) return uv;
            float c = cos(gattlingPhase), s = sin(gattlingPhase);
            return gattlingFace.xy + mat2(c, -s, s, c) * p * gattlingFace.zw;
        }
        ` + material.fragmentShader;
    material.fragmentShader = material.fragmentShader
        .replaceAll('hdSpriteUv(vMapUv)', 'hdSpriteUv(gattlingUv(vMapUv))')
        .replaceAll('hdSpriteUv(uv)', 'hdSpriteUv(gattlingUv(uv))');
    const cache = material.customProgramCacheKey.bind(material);
    material.customProgramCacheKey = () => cache() + '/gattling-face-spin-v1';
    material.needsUpdate = true;
}
export function gattlingMuzzle(renderable: any, nativePoint: THREE.Vector3): THREE.Vector3 {
    const points: THREE.Vector3[] = [];
    if (renderable?.unitVxlHd?.active) for (const layer of renderable.unitVxlHd.layers) {
        for (const frame of layer.frames) {
            if (!isGattlingBarrel(frame.part) || !frame.batch.visible && !frame.translucent.visible) continue;
            const point = surfacePoint(frame.batch, gattlingTipUv(frame.part, frame.frame));
            if (!point) continue;
            frame.batch.updateWorldMatrix(true, false);
            points.push(point.applyMatrix4(frame.batch.matrixWorld));
        }
    }
    return points.sort((a, b) => a.distanceToSquared(nativePoint) - b.distanceToSquared(nativePoint))[0] ?? nativePoint;
}
