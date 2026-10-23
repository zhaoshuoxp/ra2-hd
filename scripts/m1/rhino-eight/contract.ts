import { supported as singlePoseSupported } from '../rhino-sprite/contract';
export const registration = { width: 80, height: 72, x: -40, y: -46 };
export const headings = [0, 45, 90, 135, 180, 225, 270, 315] as const;
export function referenceColor(color: any): boolean {
    return color?.r === 255 && color?.g === 24 && color?.b === 24;
}
export function heading(value: number): number | undefined {
    if (!Number.isFinite(value)) return undefined;
    const normalized = ((value % 360) + 360) % 360;
    // Quantize presentation only. Native facing, aiming and body transforms remain continuous.
    return headings[Math.floor((normalized + 22.5) / 45) % headings.length];
}
export function supported(unit: any, owner: any): boolean {
    if (heading(unit.direction) === undefined || heading(unit.turretTrait?.facing) === undefined) return false;
    if (unit.spinVelocity !== undefined && !Number.isFinite(unit.spinVelocity)) return false;
    // TurnTask and DriveLocomotor use spinVelocity for normal turns. Only the old
    // single-pose restriction is neutralized; the native value is never modified.
    const neutral = Object.create(unit);
    Object.defineProperties(neutral, { direction: { value: 0 }, turretTrait: { value: { facing: 0 } }, spinVelocity: { value: 0 } });
    return singlePoseSupported(neutral, owner);
}
