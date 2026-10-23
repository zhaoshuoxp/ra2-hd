import { hdTextureBudget } from '@/engine/gfx/HdDensity';
import { buildingCoverage } from './sovietBuildingCoverage';
import { TheaterType } from '@/engine/TheaterType';
import { activeEdition } from '@/editions/activeEdition';
import { loadPowerPlantHd } from './loadPowerPlantHd';
import { disposePowerPlantHd, type LoadedPowerPlantHd } from './resolvePowerPlantHd';
import { sovietBuildingHdNames, type SovietBuildingHdFamily } from './sovietBuildingHdFamilies';
import { alliedBuildingHdNames, type AlliedBuildingHdFamily } from './alliedBuildingHdFamilies';
import type { YuriBuildingHdFamily } from './yuriBuildingHdFamilies';

type BatchBuildingFamily = SovietBuildingHdFamily | AlliedBuildingHdFamily | YuriBuildingHdFamily;
export type LoadedSovietBuildingsHd = Partial<Record<BatchBuildingFamily, LoadedPowerPlantHd>>;
// Total optional authored texture storage, including accepted assets. Existing
// assets load first at their requested densities; only this batch uses the rest.
export const combinedHdTextureBudget = hdTextureBudget(4);
// Measured complete 2x lossless-pool allocations for the accepted revisions.
// Later families retain a conservative minimum reservation; complete 4x is preferred.
export const sovietBuildingMinimumBytes: Record<SovietBuildingHdFamily, number> = {
    NAHAND: 1152280, NAREFN: 3655296, NAWEAP: 5270868, NACNST: 10358616,
    NARADR: 8908056,
    NADEPT: 4473684,
    NAYARD: 22767120,
    NATECH: 2179080,
    NANRCT: 4047264,
    NACLON: 2916584,
    NAPSIS: 5759356,
    NALASR: 1330996,
    NAFLAK: 1357396,
    TESLA: 1168648,
    NAIRON: 12744396,
    NAMISL: 14910216,
    NAWALL: 1492560,
    NAINDP: 6556912, NABNKR: 1100820,
};
export function disposeSovietBuildingsHd(families: LoadedSovietBuildingsHd) {
    Object.values(families).forEach(disposePowerPlantHd);
}
export async function loadSovietBuildingsHd(theater: any, renderer: any,
    enabled: (family: BatchBuildingFamily) => boolean, baselineBytes: number,
    cancelled: () => boolean, onProgress: (fraction: number) => void = () => {}, preferredDensity: 2 | 4 = 4,
    initialFamilies?: ReadonlySet<string>): Promise<LoadedSovietBuildingsHd> {
    const families: LoadedSovietBuildingsHd = {};
    const budget = hdTextureBudget(preferredDensity);
    let bytes = baselineBytes;
    const theaterName = TheaterType[theater.type].toUpperCase();
    // Allied additions share the existing unit demand queue. GAPOWR already
    // owns its accepted/coverage allocation and must not be loaded twice.
    const order: BatchBuildingFamily[] = sovietBuildingHdNames.filter(name => !initialFamilies || initialFamilies.has(name));
    const applicable = (name: BatchBuildingFamily) => activeEdition === 'ra2'
        ? !['NAINDP', 'NABNKR', 'GAROBO'].includes(name) : !['NACLON', 'NAPSIS'].includes(name);
    try {
        for (const [index, family] of order.entries()) {
            if (cancelled()) break;
            const reserved = order.slice(index + 1).filter(name => applicable(name) && enabled(name))
                .reduce((sum, name) => sum + (buildingCoverage(name, theaterName)?.gpuBytes
                    ?? sovietBuildingMinimumBytes[name as SovietBuildingHdFamily] ?? 0), 0);
            const loaded = await loadPowerPlantHd(theater, renderer, applicable(family) && enabled(family), family,
                Math.max(0, budget - bytes - reserved), preferredDensity);
            if (loaded) { families[family] = loaded; bytes += loaded.report.gpuBytes; }
            onProgress((index + 1) / order.length);
        }
        if (!order.length) onProgress(1);
        console.info('[Soviet building HD budget]', { limit: budget, baselineBytes,
            gpuBytes: bytes, order, families: Object.fromEntries(
                Object.entries(families).map(([name, family]) => [name, family?.report])) });
        return families;
    } catch (error) { disposeSovietBuildingsHd(families); throw error; }
}
