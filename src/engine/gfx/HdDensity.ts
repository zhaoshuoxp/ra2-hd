export type HdDensity = 2 | 4;

export function parseHdDensity(value: unknown): HdDensity {
    return value === 2 || value === '2' ? 2 : 4;
}

export function hdTextureBudget(density: HdDensity): number {
    return (density === 2 ? 512 : 1280) * 1024 * 1024;
}
