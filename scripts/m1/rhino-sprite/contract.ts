export const identity = {
    source: '9162a8950bc397e26a806e87abf9a7c2e47fa4616507543ab75142cf310f5e38',
    target: '5057d3d610ee4bfdf3c5a3784f4588d31ea63acbd2496c939823631187efa523',
    export: '045fab22c03abf380d07a3d10b70c51fb1105f1e4ea6f9aef45fddd938c2f1c7',
};
export const registration = { width: 64, height: 48, x: -31, y: -32.1, pixels: [256, 192] };
export function supported(unit: any, owner: any): boolean {
    const zero = (n: number) => Number.isFinite(n) && Math.abs(((n % 360) + 360) % 360) < 1e-6;
    return unit.name === 'HTNK' && unit.owner === owner && zero(unit.direction)
        && zero(unit.turretTrait?.facing) && !unit.isDestroyed && !unit.isFiring
        && !unit.onBridge && !unit.tile?.rampType && !unit.tileElevation && !unit.spinVelocity
        && !unit.warpedOutTrait?.isActive() && !unit.cloakableTrait?.isCloaked()
        && !unit.invulnerableTrait?.isActive() && !unit.submergibleTrait?.isSubmerged();
}
export async function verifyBytes(bytes: ArrayBuffer, expected: string): Promise<void> {
    const actual = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
        .map(v => v.toString(16).padStart(2, '0')).join('');
    if (actual !== expected) throw Error('Rhino diagnostic image identity mismatch');
}
