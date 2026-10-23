// Buildings whose aggregated SHP atlas is packed during loading.
//
// Construction yards have TechLevel=-1 and normally exist only after an MCV
// deploys, so the map/tech-level rule alone left their atlases (150-250
// frames each) to be packed on the main thread in the deploy frame. Every
// building a unit can deploy into is reachable in play and is prepared too.
export function selectBuildingsToPrepare(
    buildingRules: Map<string, { techLevel: number }>,
    structuresOnMap: Iterable<string>,
    deployers: Iterable<{ deploysInto?: string }>,
): string[] {
    const onMap = new Set(structuresOnMap);
    const deployTargets = new Set<string>();
    for (const rules of deployers) if (rules.deploysInto) deployTargets.add(rules.deploysInto);
    const result: string[] = [];
    for (const [name, building] of buildingRules) {
        if (onMap.has(name) || building.techLevel !== -1 || deployTargets.has(name)) result.push(name);
    }
    return result;
}
