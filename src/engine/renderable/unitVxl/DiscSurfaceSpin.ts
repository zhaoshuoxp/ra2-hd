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

// Rotate the complete photographed surface, including its baked shading. The
// dome, cap, deck and lower body share one phase; native registered coverage
// remains fixed because the saucer's silhouette is rotationally symmetric.
export function enableDiscSurfaceSpin(material: HdSpriteMaterial, part: VxlPart, frame: VxlFrame): void {
    const [x, y, w, h] = frame.rect, [pw, ph] = part.pageSize;
    material.uniforms.discRect = { value: new THREE.Vector4(x / pw, 1 - (y + h) / ph, w / pw, h / ph) };
    material.uniforms.discPhase = { value: 0 };
    material.uniforms.discLower = { value: Number(part.member === 'disk.vxl') };
    const sampling = `
        uniform vec4 discRect;
        uniform float discPhase;
        uniform float discLower;
        float discRadius(vec2 p, float slope, float base, float flattening) {
            float x = p.x - .5, y = p.y - base;
            float a = slope * slope - flattening * flattening;
            float discriminant = y * y - a * x * x;
            if (discriminant < 0.0) return -1.0;
            return (slope * y - flattening * sqrt(discriminant)) / a;
        }
        vec2 discTurn(vec2 q) {
            float c = cos(discPhase), s = sin(discPhase);
            return mat2(c, -s, s, c) * q;
        }
        vec2 discOrbit(vec2 p, float radius, float slope, float base, float flattening, bool front) {
            vec2 q = discTurn(vec2((p.x - .5) / radius,
                (p.y - slope * radius - base) / (flattening * radius)));
            // The cabin occludes the rear source surface. The complete flat
            // cap and lower body do not need this front-surface continuation.
            if (front) q.y = abs(q.y);
            return vec2(.5 + radius * q.x, slope * radius + base + flattening * radius * q.y);
        }
        float discCone(vec2 p) {
            float halfWidth = p.y < .14 ? mix(.025, .13, clamp((p.y - .045) / .095, 0.0, 1.0))
                : p.y < .33 ? mix(.13, .205, (p.y - .14) / .19)
                : p.y < .43 ? mix(.205, .23, (p.y - .33) / .10)
                : mix(.23, .08, clamp((p.y - .43) / .11, 0.0, 1.0));
            return smoothstep(0.0, .015, halfWidth - abs(p.x - .5))
                * smoothstep(.04, .06, p.y) * (1.0 - smoothstep(.53, .56, p.y));
        }
        vec2 discUv(vec2 p) {
            p.y = 1.0 - p.y;
            return discRect.xy + p * discRect.zw;
        }
        vec3 discSurface(vec2 uv, bool collar) {
            vec2 p = (uv - discRect.xy) / discRect.zw;
            p.y = 1.0 - p.y;
            vec2 moved; float blend;
            if (discLower > .5) {
                if (collar) return vec3(uv, 0.0);
                moved = .5 + discTurn(p - .5);
                blend = 1.0;
            } else if (collar) {
                // The flat cap and tapered cabin use one phase, including
                // the center that the former annular mask left stationary.
                float cap = discRadius(p, 0.0, .095, .9);
                float radius = discRadius(p, 1.45, .0225, .9);
                if (cap <= .05) {
                    moved = discOrbit(p, max(.0001, cap), 0.0, .095, .9, false);
                    blend = discCone(p);
                } else {
                    if (radius <= .0001 || radius >= .245) return vec3(uv, 0.0);
                    moved = discOrbit(p, radius, 1.45, .0225, .9, true);
                    blend = (1.0 - smoothstep(.215, .245, radius)) * discCone(p);
                }
            } else {
                float radius = discRadius(p, .16, .45, .92);
                if (radius <= .0001 || radius >= .51) return vec3(uv, 0.0);
                moved = discOrbit(p, radius, .16, .45, .92, true);
                blend = (1.0 - smoothstep(.485, .51, radius)) * (1.0 - discCone(p));
            }
            moved = discUv(moved);
            // The outline remains registered. Fade only where a projected
            // sample reaches the photograph's transparent boundary.
            blend *= smoothstep(.5, .98, texture2D(map, hdSpriteUv(moved)).a);
            return vec3(moved, blend);
        }
        vec4 discOwner(vec2 uv) {
            vec4 data = texture2D(remapMap, hdRemapUv(uv));
            // The retained atlas packs an obsolete illumination field in G's
            // high nibble. Only the native owner shade belongs in this pass.
            data.g = mod(floor(data.g * 255.0 + .5), 16.0) / 255.0;
            return data;
        }
        vec4 discRemapSample(vec2 uv) {
            vec3 plate = discSurface(uv, false), cabin = discSurface(uv, true);
            return mix(mix(discOwner(uv), discOwner(plate.xy), plate.z), discOwner(cabin.xy), cabin.z);
        }
        vec4 discSample(vec2 uv) {
            vec4 coverage = texture2D(map, hdSpriteUv(uv));
            vec3 plate = discSurface(uv, false), cabin = discSurface(uv, true);
            vec3 color = mix(mix(coverage.rgb, texture2D(map, hdSpriteUv(plate.xy)).rgb, plate.z),
                texture2D(map, hdSpriteUv(cabin.xy)).rgb, cabin.z);
            return vec4(color.rgb, coverage.a);
        }
    `;
    material.fragmentShader = material.fragmentShader
        .replace('texture2D( map, hdSpriteUv(vMapUv) )', 'discSample(vMapUv)')
        .replace('texture2D(remapMap, hdRemapUv(vMapUv))', 'discRemapSample(vMapUv)')
        .replace('vec4 base = texture2D(map, sampleUv);', 'vec4 base = discSample(uv);')
        .replace('vec4 data = texture2D(remapMap, hdRemapUv(uv));', 'vec4 data = discRemapSample(uv);');
    material.fragmentShader = material.uniforms.hdPass
        ? material.fragmentShader.replace('vec4 hdResolve(', sampling + '\nvec4 hdResolve(')
        : material.fragmentShader.replace('void main() {', sampling + '\nvoid main() {');
    const cache = material.customProgramCacheKey.bind(material);
    material.customProgramCacheKey = () => cache() + '/disc-whole-surface-spin-v7';
    material.needsUpdate = true;
}
