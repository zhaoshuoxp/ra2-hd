import { alliedBuildingHdNames, canonicalAlliedBuildingHdFamily } from './alliedBuildingHdFamilies';
import { buildingCoverage } from './sovietBuildingCoverage';
import { TheaterType } from '@/engine/TheaterType';
import { activeEdition } from '@/editions/activeEdition';
import { yuriBuildingHdNames } from './yuriBuildingHdFamilies';
import { sovietBuildingHdNames } from './sovietBuildingHdFamilies';
import { loadPowerPlantHd } from './loadPowerPlantHd';
import { disposePowerPlantHd, type LoadedPowerPlantHd } from './resolvePowerPlantHd';
import type { LoadedSovietBuildingsHd } from './loadSovietBuildingsHd';
import type { DemandSelection } from './UnitHdDemand';

export interface AdditionalBuildingDemand {
    identities: Set<string>;
    load(identity: string, budget: number, stopped: () => boolean): Promise<DemandSelection>;
    release(building: LoadedPowerPlantHd): void;
}
export function alliedBuildingDemand(families: LoadedSovietBuildingsHd, theater: any, renderer: any,
    enabled: boolean, cancelled: () => boolean, preferredDensity: 2 | 4 = 4): AdditionalBuildingDemand {
    const available = [...new Set([...alliedBuildingHdNames, ...sovietBuildingHdNames,
        ...(activeEdition === 'yr' ? yuriBuildingHdNames : [])])];
    const theaterName = TheaterType[theater.type].toUpperCase();
    const names = available.filter(name => enabled && !['GAPOWR', 'NAPOWR', 'AMRADR'].includes(name) && !families[name]
        && (activeEdition === 'yr' || !['GAROBO', 'NAINDP', 'NABNKR'].includes(name))
        && (buildingCoverage(name, theaterName) || (['TEMPERATE', 'URBAN', 'NEWURBAN', 'DESERT', 'LUNAR'].includes(theaterName)
            && sovietBuildingHdNames.includes(name as any))));
    return {
        identities: new Set(names),
        async load(identity, budget, stopped) {
            const loaded = await loadPowerPlantHd(theater, renderer, !cancelled() && !stopped(), identity as any, budget, preferredDensity, () => cancelled() || stopped());
            const building = loaded ?? { overrides: new Map(), report: { density: 1, gpuBytes: 0, attempts: [{ density: 2, reason: 'disabled' }] } };
            if (cancelled() || stopped()) { disposePowerPlantHd(building); throw Error('cancelled'); }
            return { building, members: new Map([...building.overrides].map(([image, override]) =>
                [(image as any).filename, { image, override }])), ...building.report,
                attempts: building.report.attempts.map(a => ({ ...a,
                    reason: a.reason === 'combined-hd-memory-limit' ? 'combined-budget' : a.reason })) };
        },
        release(building) {
            for (const name of names) if (families[name] === building) delete families[name];
            disposePowerPlantHd(building);
        },
    };
}
export function publishAlliedBuilding(families: LoadedSovietBuildingsHd, identity: string, building?: LoadedPowerPlantHd) {
    const name = canonicalAlliedBuildingHdFamily(identity) as keyof LoadedSovietBuildingsHd;
    if (building) families[name] = building;
    else delete families[name];
}
