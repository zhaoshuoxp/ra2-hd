import * as THREE from 'three';
import { HdSpriteMaterial } from '../../gfx/material/HdSpriteMaterial';
import type { VxlFrame, VxlPart } from './loadVxlFamily';

// Interpolate between received native headings, with at most one tick of lag.
// A paused or stopped simulation reaches its last heading and then stays still.
export class DiscRotation {
    private target?: number;
    private from = 0;
    private changedAt = 0;
    update(facing: number, time: number, tickDuration: number): number {
        if (this.target === undefined) this.target = this.from = facing;
        const delta = ((facing - this.target) % 360 + 360) % 360;
        if (Math.abs(delta) > .001) {
            this.target += delta;
            this.from = this.target - 360 / 32;
            this.changedAt = time;
        }
        const blend = THREE.MathUtils.clamp((time - this.changedAt) / Math.max(1, tickDuration), 0, 1);
        return this.from + (this.target - this.from) * blend;
    }
}

// The accepted eight views repeat the same surface markings. Move those
// markings on their projected annuli instead of blending mismatched outlines.
// Coverage stays on the original registered image at every rotation phase.
export function enableDiscSurfaceSpin(material: HdSpriteMaterial, part: VxlPart, frame: VxlFrame): void {
    const [x, y, w, h] = frame.rect, [pw, ph] = part.pageSize;
    material.uniforms.discRect = { value: new THREE.Vector4(x / pw, 1 - (y + h) / ph, w / pw, h / ph) };
    material.uniforms.discPhase = { value: 0 };
    const sampling = `
        uniform vec4 discRect;
        uniform float discPhase;
        float discRadius(vec2 p, float slope, float base, float flattening) {
            float x = p.x - .5, y = p.y - base;
            float a = slope * slope - flattening * flattening;
            float discriminant = y * y - a * x * x;
            if (discriminant < 0.0) return -1.0;
            return (slope * y - flattening * sqrt(discriminant)) / a;
        }
        vec2 discOrbit(vec2 p, float radius, float slope, float base, float flattening) {
            vec2 q = vec2((p.x - .5) / radius,
                (p.y - slope * radius - base) / (flattening * radius));
            float c = cos(discPhase), s = sin(discPhase);
            q = mat2(c, -s, s, c) * q;
            // The rear of the source photograph is occluded by the cabin.
            // Reuse its visible front surface, never its transparent exterior.
            q.y = abs(q.y);
            return vec2(.5 + radius * q.x, slope * radius + base + flattening * radius * q.y);
        }
        vec2 discWarp(vec2 uv) {
            vec2 p = (uv - discRect.xy) / discRect.zw;
            p.y = 1.0 - p.y;
            float collar = discRadius(p, 2.1, -.105, .9);
            float plate = discRadius(p, .16, .45, .92);
            vec2 warped = p;
            if (collar >= .045 && collar <= .245) {
                // Constant radius is also constant height on the cabin cone.
                // A 2D image rotation would drag the red belt through its roof.
                warped = discOrbit(p, collar, 2.1, -.105, .9);
            } else if (plate > .265 && plate < .51 && (p.y > .40 || abs(p.x - .50) > .25)) {
                warped = discOrbit(p, plate, .16, .45, .92);
            }
            warped.y = 1.0 - warped.y;
            return discRect.xy + warped * discRect.zw;
        }
        vec2 discColorUv(vec2 uv) {
            vec2 moved = discWarp(uv);
            vec4 color = texture2D(map, hdSpriteUv(moved));
            return color.a > .5 ? moved : uv;
        }
        vec4 discSample(vec2 uv) {
            vec4 coverage = texture2D(map, hdSpriteUv(uv));
            vec4 color = texture2D(map, hdSpriteUv(discColorUv(uv)));
            return vec4(color.rgb, coverage.a);
        }
    `;
    material.fragmentShader = material.fragmentShader
        .replace('texture2D( map, hdSpriteUv(vMapUv) )', 'discSample(vMapUv)')
        .replace('texture2D(remapMap, hdSpriteUv(vMapUv))', 'texture2D(remapMap, hdSpriteUv(discColorUv(vMapUv)))')
        .replace('vec4 base = texture2D(map, sampleUv);', 'vec4 base = discSample(uv);')
        .replace('vec4 data = texture2D(remapMap, sampleUv);', 'vec4 data = texture2D(remapMap, hdSpriteUv(discColorUv(uv)));');
    material.fragmentShader = material.uniforms.hdPass
        ? material.fragmentShader.replace('vec4 hdResolve(', sampling + '\nvec4 hdResolve(')
        : material.fragmentShader.replace('void main() {', sampling + '\nvoid main() {');
    const cache = material.customProgramCacheKey.bind(material);
    material.customProgramCacheKey = () => cache() + '/disc-projected-surface-spin-v1';
    material.needsUpdate = true;
}
