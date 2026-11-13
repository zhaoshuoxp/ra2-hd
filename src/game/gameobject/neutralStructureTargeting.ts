export function neutralStructureRules(rules: any): boolean {
    return !!(rules.needsEngineer || rules.civilian || rules.techLevel < 0 && rules.owner?.length === 0);
}

// Occupation changes ownership, not the original civilian/technology identity.
// This gate applies to unsolicited acquisition; explicit attacks and damage
// retaliation retain the ordinary weapon and diplomacy checks.
export function protectsNeutralStructure(game: any, target: any): boolean {
    const options = game.gameOpts?.campaign ?? game.gameOpts;
    if (options?.edition === 'yr' && options.semanticsVersion >= 46
        && target?.garrisonTrait?.isOccupied() && (target.primaryWeapon || target.secondaryWeapon)) return false;
    return options?.neutralStructureTargetingVersion === 1 && !!target?.isBuilding()
        && (target.neutralTargetOrigin === true || neutralStructureRules(target.rules));
}
