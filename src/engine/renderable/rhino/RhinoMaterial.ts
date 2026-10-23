import * as THREE from 'three';
import { HdSpriteMaterial } from '../../gfx/material/HdSpriteMaterial';

// Remap only the measured red chroma, preserving authored wear, shading and
// highlights. The reference red delta is exactly zero. Production C is unchanged.
const remapFunction = `
    uniform vec3 rhinoColorDelta;
    vec3 rhinoRemap(vec3 base, float mask) {
        float chroma = max(0.0, base.r - max(base.g, base.b));
        return clamp(base + mask * chroma * rhinoColorDelta, 0.0, 1.0);
    }
`;
export function colorDelta(color: { r: number; g: number; b: number }): THREE.Vector3 {
    const c = new THREE.Color().setRGB(color.r / 255, color.g / 255, color.b / 255, THREE.SRGBColorSpace);
    const ref = new THREE.Color().setRGB(1, 24 / 255, 24 / 255, THREE.SRGBColorSpace);
    const scale = Math.max(c.r, c.g, c.b, 1e-6);
    return new THREE.Vector3(c.r / scale - ref.r, c.g / scale - ref.g, c.b / scale - ref.b);
}
export class RhinoMaterial extends HdSpriteMaterial {
    constructor(options: any = {}) {
        super(options);
        this.uniforms.rhinoColorDelta = { value: new THREE.Vector3() };
        this.fragmentShader = this.fragmentShader.replace('void main() {', remapFunction + '\nvoid main() {')
            .replace('mix(sampledDiffuseColor.rgb, ownerColor, remapData.r)', 'rhinoRemap(sampledDiffuseColor.rgb, remapData.r)');
    }
    enableFiltering(pass: 'opaque' | 'edge' | 'full' | 'hidden'): void {
        super.enableFiltering(pass);
        this.fragmentShader = this.fragmentShader.replace('mix(base.rgb, owner, data.r)', 'rhinoRemap(base.rgb, data.r)');
    }
    copy(source: this): this {
        super.copy(source);
        // Per-vehicle uniform shared only by that vehicle's source/interior/edge/depth clones.
        this.uniforms.rhinoColorDelta = source.uniforms.rhinoColorDelta;
        return this;
    }
    customProgramCacheKey(): string { return `rhino-chroma-v1-${super.customProgramCacheKey()}`; }
}
