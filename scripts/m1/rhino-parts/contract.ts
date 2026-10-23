import { supported as singlePoseSupported } from '../rhino-sprite/contract';
export const registration = { width: 64, height: 56, x: -32, y: -38 };
export const headings = [0, 90] as const;
export function referenceColor(color: any): boolean {
    return color?.r === 255 && color?.g === 24 && color?.b === 24;
}
export function heading(value: number): number | undefined {
    if (!Number.isFinite(value)) return undefined;
    const normalized = ((value % 360) + 360) % 360;
    return headings.find(h => Math.abs(normalized - h) < 1e-6);
}
export function supported(unit: any, owner: any): boolean {
    if (heading(unit.direction) === undefined || heading(unit.turretTrait?.facing) === undefined) return false;
    // Preserve the single-pose state exclusions without mutating native aiming.
    const neutral = Object.create(unit);
    Object.defineProperties(neutral, { direction: { value: 0 }, turretTrait: { value: { facing: 0 } } });
    return singlePoseSupported(neutral, owner);
}
