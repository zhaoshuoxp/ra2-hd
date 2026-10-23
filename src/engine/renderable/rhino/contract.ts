export const registration = { width: 80, height: 72, x: -40, y: -46 };
export const headings = [0, 45, 90, 135, 180, 225, 270, 315] as const;
export const partKeys = ['body', 'turret'].flatMap(p => headings.map(h => `${p}-${h}`));
export function heading(value: number): number | undefined {
    if (!Number.isFinite(value)) return undefined;
    return headings[Math.floor((((value % 360) + 360) % 360 + 22.5) / 45) % 8];
}
export function supported(unit: any): boolean {
    return unit.name === 'HTNK' && heading(unit.direction) !== undefined
        && heading(unit.turretTrait?.facing) !== undefined
        // Submerged hull flattening is a different asset contract. HTNK has no
        // native submerge ability; retain whole-original fallback for custom rules.
        && !unit.submergibleTrait?.isSubmerged();
}
export const digest = async (bytes: ArrayBuffer): Promise<string> =>
    Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
