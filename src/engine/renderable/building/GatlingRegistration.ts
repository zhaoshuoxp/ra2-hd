import contract from '../../../../desktop/gatling-pivots.json';

// Register the rotating black semicircle center to the fixed bearing center.
// Density changes physical pixels only; world/HVA/rules coordinates stay native.
export const gatlingPoseOffsets: Record<number, readonly [number, number]> = Object.fromEntries(
    Object.entries(contract.pivots).map(([heading, point]) => [heading,
        [contract.targetPivot[0] - point[0], contract.targetPivot[1] - point[1]]]),
);
export function gatlingRegistration(heading: number, nativePivot = false): { x: number; y: number } {
    // Native-reference exports already encode HVA/yaw placement. A visible
    // side disk is an offset pitch bearing and must not become the yaw axis.
    if (nativePivot) return { x: 0, y: 0 };
    const [x, y] = gatlingPoseOffsets[heading];
    return { x, y };
}
