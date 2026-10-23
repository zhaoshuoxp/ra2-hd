import catalog from '../../../../desktop/soviet-building-coverage.json';
import alliedCatalog from '../../../../desktop/allied-building-coverage.json';
import yuriCatalog from '../../../../desktop/yuri-building-coverage.json';
import { activeEdition } from '@/editions/activeEdition';
import type { HdSource } from './resolveHdSprite';
import { canonicalAlliedBuildingHdFamily } from './alliedBuildingHdFamilies';

export type BuildingCoverage = ((typeof catalog)[keyof typeof catalog]
    | (typeof alliedCatalog)[keyof typeof alliedCatalog]) & { gpuBytes?: number };
// Edition-specific source contracts take priority over accepted RA2 designs.
// Old catalogs and their immutable pack paths remain unchanged.
const definitions: BuildingCoverage[] = [
    ...(activeEdition === 'yr' ? Object.values(yuriCatalog) as BuildingCoverage[] : []),
    ...Object.values(catalog).filter(d => activeEdition !== 'yr' || !['NAPSIS', 'NACLON'].includes(d.family)),
    ...Object.values(alliedCatalog),
];

export function buildingCoverageMemberCounts(family: string): number[] {
    family = canonicalAlliedBuildingHdFamily(family);
    return [...new Set(definitions.filter(d => d.family === family).map(d => d.members.length))];
}

export function buildingCoverage(family: string, theater: string): BuildingCoverage | undefined {
    family = canonicalAlliedBuildingHdFamily(family);
    const canonical = ['DESERT', 'LUNAR'].includes(theater) ? 'NEWURBAN' : theater;
    return definitions.find(d => d.family === family && d.theater === canonical)
        ?? (['URBAN', 'NEWURBAN'].includes(canonical)
            ? definitions.find(d => d.family === family && d.theater === 'TEMPERATE') : undefined);
}

export function isBuildingCoverageSource(source: Pick<HdSource, 'member' | 'sha256' | 'theater'>): boolean {
    return definitions.some(d => d.members.some(m => m.member === source.member
        && m.sha256 === source.sha256 && m.theater === source.theater));
}

export function matchesBuildingCoverage(family: string, sources: readonly HdSource[]): boolean {
    family = canonicalAlliedBuildingHdFamily(family);
    const members = new Map(sources.map(s => [s.member, s]));
    return members.size === sources.length && definitions.some(d => d.family === family
        && d.members.length === sources.length && d.members.every(m => {
            const s = members.get(m.member);
            return s?.sha256 === m.sha256 && s.theater === m.theater
                && s.canvas.length === 2 && s.canvas.every((v, i) => v === m.canvas[i])
                && s.frames.length === m.frames && s.frames.every((f, i) => f.nativeFrame === i);
        }));
}
