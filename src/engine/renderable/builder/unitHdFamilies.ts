import catalog from '../../../../desktop/allied-unit-contracts.json';
import yuriCatalog from '../../../../desktop/yuri-unit-contracts.json';
import { sovietUnitHdFamilies } from './sovietUnitHdFamilies';
import { unitHdAvailableInEdition } from './sharedAlliedUnitHd';

export interface UnitHdFamilyContract {
    identity: string;
    edition?: string;
    blockedReason?: string;
    selection?: string;
    sameDensity?: boolean;
    familyHash: string;
    members: readonly {
        member: string; frames: number; totalFrames: number; canvas: readonly number[];
        sourceHash: string; manifestHash: string;
    }[];
    projectiles: readonly { weapon: string; projectile: string; member: string }[];
}

// Both catalogs use the existing shared demand controller and world budget.
export const unitHdFamilies: Record<string, UnitHdFamilyContract> = {
    ...sovietUnitHdFamilies,
    ...catalog.shp,
};

// Filter before merging: YR yurix.shp must not hide RA2's legacy yuripr.shp.
export function unitHdFamiliesForEdition(edition: string,
    additions: Record<string, UnitHdFamilyContract> = yuriCatalog.shp) {
    const available = Object.fromEntries(Object.entries(unitHdFamilies)
        .filter(([, family]) => unitHdAvailableInEdition(family, edition)));
    for (const [identity, family] of Object.entries(additions)) {
        if (family.edition === edition) available[identity] = family;
    }
    return available;
}
