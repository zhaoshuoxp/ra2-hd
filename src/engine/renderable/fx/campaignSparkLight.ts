// Installed source: particle-system draw 0x60b090, flash cache 0x5dd760.
// The native random flash phase is not reconstructed from rendering. Use its
// initial phase 29 (wave 50) without consuming or changing simulation RNG.
export function campaignSparkLightCacheIndex(lightSize: number, particleCap: number, particles: number): number {
    if (lightSize <= 0 || particles <= 0) return -1;
    const ratio = Math.max(.4, Math.min(1, particles / particleCap));
    const sourceSize = Math.trunc(lightSize * ratio);
    return Math.min(63, Math.trunc(sourceSize * 50 / 64));
}

// Each native cache entry draws odd concentric radii, then copies every second
// row into a 2:1 plane. The shader resolves the same profile continuously.
export const campaignSparkLightFragment = `
    float radius = campaignFlashRadius;
    float distanceFromCenter = length((campaignFlashUv - .5) * (2.0 * (radius + 1.0)));
    float edge = max(fwidth(distanceFromCenter) * .5, .35);
    float coverage = 1.0 - smoothstep(radius - edge, radius + edge, distanceFromCenter);
    float strength = clamp(max(12.0, 10.0 + 2.0 * (radius - distanceFromCenter)) / 255.0, 0.0, 1.0);
    diffuseColor.a *= strength * coverage;
`;
