import { shadowWeightsGlsl } from './ShpShadowMaterial';

// Infantry can contain palette-12 ground shadows in the visible frame. Existing
// HD packs composite those black pixels under the authored figure. Identify them
// with the native index map and black RGB together, preserving dark body detail.
export const embeddedShadowDeclarations = `
#ifdef EMBEDDED_SHP_SHADOW
uniform sampler2D embeddedShadowMap;
uniform vec2 embeddedShadowTextureSize;
uniform bool shadowAntialias;
varying vec4 vShadowFrameRect;
${shadowWeightsGlsl}
float embeddedNativeIndex(vec2 uv) {
    vec2 nativeUv = mix(vShadowFrameRect.xy, vShadowFrameRect.zw,
        (uv - vHdFrameRect.xy) / (vHdFrameRect.zw - vHdFrameRect.xy));
    return floor(texture2D(embeddedShadowMap, nativeUv).a * 255.0 + 0.5);
}
bool embeddedGround(vec2 uv, vec4 base) {
    return base.a > 0.0 && max(max(base.r, base.g), base.b) < 0.00001
        && embeddedNativeIndex(uv) == 12.0 && texture2D(remapMap, hdSpriteUv(uv)).r < 0.00001;
}
float embeddedShadowCell(vec2 cell, vec2 size) {
    if (any(lessThan(cell, vec2(0.0))) || any(greaterThanEqual(cell, size))) return 0.0;
    vec2 uv = mix(vHdFrameRect.xy, vHdFrameRect.zw, (cell + 0.5) / size);
    #ifdef INDEXED_COVERAGE
        return float(embeddedNativeIndex(uv) == 12.0);
    #else
        return float(embeddedGround(uv, texture2D(map, hdSpriteUv(uv))));
    #endif
}
float embeddedShadowCoverage(vec2 uv) {
    vec2 size = (vShadowFrameRect.zw - vShadowFrameRect.xy) * embeddedShadowTextureSize;
    vec2 p = (uv - vHdFrameRect.xy) / (vHdFrameRect.zw - vHdFrameRect.xy) * size - 0.5;
    vec2 center = floor(p + 0.5), f = p - center;
    vec3 wx = shadowWeights(f.x), wy = shadowWeights(f.y);
    float coverage = 0.0;
    for (int y = 0; y < 3; y++) for (int x = 0; x < 3; x++) {
        coverage += embeddedShadowCell(center + vec2(float(x - 1), float(y - 1)), size) * wx[x] * wy[y];
    }
    return smoothstep(0.075, 0.925, coverage);
}
#endif
`;
