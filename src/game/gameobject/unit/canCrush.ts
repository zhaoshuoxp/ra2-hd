export function canCrush(crusher: any, target: any): boolean {
    if (!crusher.crusher || target.invulnerableTrait?.isActive() || target.bunker) return false;
    return target.rules.crushable || !!(crusher.rules.omniCrusher && !target.rules.omniCrushResistant &&
        (target.isInfantry() || target.isVehicle() || target.isOverlay() && target.rules.wall));
}
