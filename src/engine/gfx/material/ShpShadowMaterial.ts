import * as THREE from 'three';
import { PaletteBasicMaterial } from './PaletteBasicMaterial';
import { paletteShaderLib } from './paletteShaderLib';

// Ground coverage blends after terrain/overlays and before actor color. A
// flattened SHP shadow must not paint over a raised part of another sprite.
export const groundShadowOrder = -0.5;
export function configureGroundShadow(material: THREE.Material): void {
    material.transparent = false;
    material.depthWrite = false;
    material.blending = THREE.CustomBlending;
    material.blendEquation = material.blendEquationAlpha = THREE.AddEquation;
    material.blendSrc = THREE.SrcAlphaFactor;
    material.blendSrcAlpha = THREE.OneFactor;
    material.blendDst = material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
}

// Resolve binary shadow coverage before filtering. Interpolating palette indices
// would change their meaning and can sample another packed animation frame.
export const shadowWeightsGlsl = `
vec3 shadowWeights(float f) {
    return vec3(0.5 * (0.5 - f) * (0.5 - f), 0.75 - f * f, 0.5 * (0.5 + f) * (0.5 + f));
}
`;
const shadowSampling = `
uniform vec2 shadowTextureSize;
uniform bool shadowAntialias;
varying vec4 vShadowFrameRect;
float shadowCell(vec2 cell) {
    vec2 uv = (cell + 0.5) / shadowTextureSize;
    if (any(lessThan(uv, vShadowFrameRect.xy)) || any(greaterThanEqual(uv, vShadowFrameRect.zw))) return 0.0;
    return step(0.5 / 255.0, texture2D(map, uv).a);
}
${shadowWeightsGlsl}
float shadowCoverage(vec2 uv) {
    vec2 p = uv * shadowTextureSize - 0.5;
    vec2 center = floor(p + 0.5), f = p - center;
    vec3 wx = shadowWeights(f.x), wy = shadowWeights(f.y);
    float coverage = 0.0;
    for (int y = 0; y < 3; y++) {
        for (int x = 0; x < 3; x++) {
            coverage += shadowCell(center + vec2(float(x - 1), float(y - 1))) * wx[x] * wy[y];
        }
    }
    // A bounded native-pixel contour reconstruction, independent of HD density.
    // Keep the opaque interior and avoid a wide blur over the terrain or body.
    return smoothstep(0.075, 0.925, coverage);
}
`;

export class ShpShadowMaterial extends PaletteBasicMaterial {
    constructor(options: any = {}) {
        super({ ...options, alphaTest: 0.001 });
        configureGroundShadow(this);
        const image = this.map?.image as { width: number; height: number } | undefined;
        this.uniforms.shadowTextureSize = { value: [image?.width ?? 1, image?.height ?? 1] };
        this.uniforms.shadowAntialias = { value: true };
        this.vertexShader = this.vertexShader.replace('void main() {',
            'attribute vec4 shadowFrameRect; varying vec4 vShadowFrameRect;\nvoid main() {\nvShadowFrameRect = shadowFrameRect;');
        this.fragmentShader = this.fragmentShader.replace('void main() {', shadowSampling + '\nvoid main() {')
            .replace(paletteShaderLib.paletteColorFrag, paletteShaderLib.paletteColorFrag + `
    if (shadowAntialias) {
        diffuseColor.a = shadowCoverage(vMapUv) * opacity;
        #ifdef INSTANCE_OPACITY
            diffuseColor.a *= vInstanceOpacity;
        #endif
    }
`);
        this.type = 'ShpShadowMaterial';
        this.onBeforeCompile = shader => {
            Object.assign(shader.uniforms, this.uniforms);
            shader.vertexShader = this.vertexShader;
            shader.fragmentShader = this.fragmentShader;
        };
    }

    customProgramCacheKey(): string {
        return 'shp-shadow-coverage-v1';
    }
}
