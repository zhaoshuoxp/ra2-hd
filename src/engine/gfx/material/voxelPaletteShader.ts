// Lighting-row equation follows Thomas Sneddon's VXL renderer research.
// See docs/mcv-rendering.md for attribution and the remaining fidelity limits.
export const voxelPaletteParsFragment = `
uniform sampler2D voxelLookup;
uniform bool useVoxelLookup;
`;

export const voxelPaletteFragment = `
if (useVoxelLookup) {
    vec3 voxelUp = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));
    vec3 voxelLight = voxelUp;
    #if NUM_DIR_LIGHTS > 0
        voxelLight = normalize(directionalLights[0].direction);
    #endif
    vec3 halfDirection = normalize(voxelLight + voxelUp);
    float halfDot = dot(geometryNormal, halfDirection);
    float row = clamp(floor(16.0 * (max(0.0, dot(geometryNormal, voxelLight))
        + max(0.0, halfDot / (3.0 - 2.0 * halfDot)))), 0.0, 31.0);
    float index = texture2D(voxelLookup,
        vec2((paletteColorIndex * 255.0 + 0.5) / 256.0, (row + 0.5) / 32.0)).r;
    float paletteRow = paletteOffsetCount.x;
    #ifdef INSTANCE_TRANSFORM
        paletteRow = vInstancePaletteOffset;
    #endif
    vec4 voxelColor = texture2D(palette,
        vec2((index * 255.0 + 0.5) / 256.0, (paletteRow + 0.5) / paletteOffsetCount.y));
    // Remove the old Phong compensation, retaining map tint, elevation and effects.
    vec3 voxelBrightness = max(vec3(0.0), ambientLightColor / 0.8
        + extraIrradiance - vec3(4.71238898038469));
    outgoingLight = voxelColor.rgb * voxelBrightness;
    diffuseColor.a *= voxelColor.a;
}
`;
