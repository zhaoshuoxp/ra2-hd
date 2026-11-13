export type HdDensity = 2 | 4;

export function parseHdDensity(value: unknown): HdDensity {
    return value === 2 || value === '2' ? 2 : 4;
}

export function hdTextureBudget(density: HdDensity): number {
    // Target physical memory: 8GiB at2X, 16GiB at4X. The shared cap covers
    // terrain, scenery and complete actor families; ownership stays unchanged.
    return (density === 2 ? 512 : 1536) * 1024 * 1024;
}
