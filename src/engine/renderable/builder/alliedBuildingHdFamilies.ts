// Rules identities; only families with a verified coverage selection are loaded.
export const alliedBuildingHdNames = ['GAREFN', 'GACNST', 'GAPILE', 'GADEPT', 'GATECH',
    'GAWEAP', 'GAWALL', 'NASAM', 'GAYARD', 'GACSPH', 'GAWEAT', 'ATESLA', 'GASPYSAT',
    'GAGAP', 'GTGCAN', 'GAPILL', 'GAOREP', 'GAAIRC', 'AMRADR', 'GAROBO'] as const;
export type AlliedBuildingHdFamily = typeof alliedBuildingHdNames[number];
// Native inventory proves identical GAAIRC art, SHP sources and sequences for
// the American airfield. Country rules remain separate; textures are shared.
export function canonicalAlliedBuildingHdFamily<T extends string>(name: T): T | 'GAAIRC' {
    return name === 'AMRADR' ? 'GAAIRC' : name;
}
export function isAlliedBuildingHdFamily(name: string): name is AlliedBuildingHdFamily {
    return (alliedBuildingHdNames as readonly string[]).includes(name);
}
