import * as THREE from 'three';
import type { HdSpriteOverride } from './HdSpriteOverride';
import type { HdSource } from './resolveHdSprite';

// This policy is tied to the reviewed authored revision, never to an arbitrary
// building name or future pack. Original exports remain immutable on disk.
export const stablePowerPlantManifest = 'dd3f67f96968c4b821852728af618c4d4f1a2fac0b822e3d09c3ab8cf8da3a64';
export const powerPlantAnimationPolicy = 'stable-structure-effects-v1';

export function stabilizePowerPlantAnimation(override: HdSpriteOverride, source: HdSource, density: number) {
    if (source.member !== 'ggpowr_a.shp' || override.frames.length !== 16 || ![2, 4].includes(density))
        throw new Error('Invalid active animation for stabilization');
    const original = override.pages.map(p => ({
        base: (p.base.image as THREE.DataTexture['image']).data as Uint8Array,
        data: (p.data.image as THREE.DataTexture['image']).data as Uint8Array,
        width: (p.base.image as THREE.DataTexture['image']).width,
    }));
    const derived = original.map(p => ({ base: p.base.slice(), data: p.data.slice() }));
    const effectPixels: number[] = [];
    for (const first of [0, 8]) {
        const frame = override.frames[first], rect = frame.sampleRect;
        const metadata = source.frames[first];
        const index = (f: number, x: number, y: number) => {
            const area = override.frames[f].sampleRect;
            return ((area.y + y) * original[override.frames[f].page].width + area.x + x) * 4;
        };
        for (let f = first; f < first + 8; f++) {
            const next = override.frames[f].sampleRect;
            if (next.width !== rect.width || next.height !== rect.height
                || JSON.stringify(source.frames[f].trimOrigin) !== JSON.stringify(metadata.trimOrigin)
                || JSON.stringify(source.frames[f].trimSize) !== JSON.stringify(metadata.trimSize))
                throw new Error('Active animation geometry changed');
        }
        // Only common emissive interiors in the upper core/tubes may animate.
        // Their shared mask excludes rims, silhouette, team panels and machinery.
        const hot = new Uint8Array(rect.width * rect.height);
        for (let y = 0; y < metadata.trimSize[1] * density * 0.52; y++) for (let x = 0; x < rect.width; x++) {
            let common = true;
            for (let f = first; f < first + 8; f++) {
                const p = original[override.frames[f].page], i = index(f, x, y);
                const r = p.base[i], g = p.base[i + 1], b = p.base[i + 2];
                if (p.base[i + 3] < 250 || p.data[i] !== 0 || r < 150 || g < 75 || r <= g * 1.02 || g <= b * 1.35) {
                    common = false; break;
                }
            }
            hot[y * rect.width + x] = Number(common);
        }
        const weights = new Float32Array(hot.length);
        let count = 0;
        for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
            if (!hot[y * rect.width + x]) continue;
            let distance = density + 1;
            for (let dy = -density; dy <= density; dy++) for (let dx = -density; dx <= density; dx++) {
                const sx = x + dx, sy = y + dy;
                if (sx < 0 || sy < 0 || sx >= rect.width || sy >= rect.height || !hot[sy * rect.width + sx])
                    distance = Math.min(distance, Math.max(Math.abs(dx), Math.abs(dy)));
            }
            // Leave the boundary fixed and feather inward; no moving metal edge.
            const weight = Math.min(1, Math.max(0, (distance - 1) / density));
            weights[y * rect.width + x] = weight;
            if (weight) count++;
        }
        if (!count) throw new Error('No stable emissive region in active animation');
        effectPixels.push(count);
        const reference = original[frame.page];
        for (let f = first; f < first + 8; f++) {
            const src = original[override.frames[f].page], dst = derived[override.frames[f].page];
            for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
                const target = index(f, x, y), anchor = index(first, x, y), weight = weights[y * rect.width + x];
                for (let c = 0; c < 4; c++) {
                    // Coverage/remap always belong to the stable reference. RGB
                    // changes only inside the common fire/glow mask.
                    dst.base[target + c] = c === 3 ? reference.base[anchor + c]
                        : Math.round(reference.base[anchor + c] * (1 - weight) + src.base[target + c] * weight);
                    dst.data[target + c] = reference.data[anchor + c];
                }
            }
        }
    }
    override.pages.forEach((p, i) => {
        (p.base.image as THREE.DataTexture['image']).data = derived[i].base;
        (p.data.image as THREE.DataTexture['image']).data = derived[i].data;
        p.base.needsUpdate = p.data.needsUpdate = true;
    });
    override.identity += `/${powerPlantAnimationPolicy}`;
    return { policy: powerPlantAnimationPolicy, effectPixels };
}
