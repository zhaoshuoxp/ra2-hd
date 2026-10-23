import type { HdSpriteOverride } from './HdSpriteOverride';
import type { VxlFamily } from '../unitVxl/loadVxlFamily';

export interface UnitFamilySelection {
    members: Map<string, { image: any; override: HdSpriteOverride }>;
    vxl?: VxlFamily;
    density: number;
    gpuBytes: number;
    attempts: { density?: number; reason: string }[];
}

// Keep a mixed SHP/VXL family private until both representations fit and load.
// Every partial allocation belongs to this transaction until it is returned.
export async function resolveMixedUnitFamily(
    budget: number,
    stopped: () => boolean,
    loadShp: (budget: number) => Promise<UnitFamilySelection>,
    loadVxl: (budget: number) => Promise<UnitFamilySelection>,
    release: (selection: UnitFamilySelection) => void,
    requiredDensity?: 2 | 4,
): Promise<UnitFamilySelection> {
    let shp: UnitFamilySelection | undefined, vxl: UnitFamilySelection | undefined;
    let published = false;
    try {
        if (stopped()) throw Error('cancelled');
        shp = await loadShp(budget);
        if (stopped()) throw Error('cancelled');
        if (!shp.members.size) return { ...shp, members: new Map(), gpuBytes: 0 };
        if (requiredDensity && shp.density !== requiredDensity) throw Error('mixed-density-mismatch');
        if (shp.gpuBytes > budget) throw Error('combined-budget');
        vxl = await loadVxl(budget - shp.gpuBytes);
        if (stopped()) throw Error('cancelled');
        if (!vxl.vxl) throw Error('incomplete-vxl-family');
        if (requiredDensity && vxl.density !== requiredDensity) throw Error('mixed-density-mismatch');
        if (shp.gpuBytes + vxl.gpuBytes > budget) throw Error('combined-budget');
        published = true;
        return { members: shp.members, vxl: vxl.vxl,
            density: Math.min(shp.density, vxl.density), gpuBytes: shp.gpuBytes + vxl.gpuBytes,
            attempts: [...shp.attempts, ...vxl.attempts] };
    } catch (error) {
        if (error instanceof Error && error.message === 'combined-budget')
            return { members: new Map(), density: 1, gpuBytes: 0, attempts: [{ reason: 'combined-budget' }] };
        throw error;
    } finally {
        if (!published) {
            if (shp) release(shp);
            if (vxl) release(vxl);
        }
    }
}

// SMIN and its SLAV child must select the same density or revert together.
export async function resolveSameDensityUnitFamily(
    requested: 2 | 4,
    budget: number,
    stopped: () => boolean,
    loadShp: (budget: number, density: 2 | 4) => Promise<UnitFamilySelection>,
    loadVxl: (budget: number, density: 2 | 4) => Promise<UnitFamilySelection>,
    release: (selection: UnitFamilySelection) => void,
): Promise<UnitFamilySelection> {
    const attempts: UnitFamilySelection['attempts'] = [];
    for (const density of [4, 2] as const) {
        if (density > requested) continue;
        if (stopped()) throw Error('cancelled');
        try {
            const selected = await resolveMixedUnitFamily(budget, stopped,
                remaining => loadShp(remaining, density), remaining => loadVxl(remaining, density),
                release, density);
            if (selected.vxl && selected.members.size) {
                return { ...selected, attempts: [...attempts, ...selected.attempts] };
            }
            attempts.push({ density, reason: selected.attempts.at(-1)?.reason ?? 'incomplete-mixed-family' });
        } catch (error) {
            if (stopped() || (error instanceof Error && error.message === 'cancelled')) throw error;
            attempts.push({ density, reason: error instanceof Error ? error.message : 'mixed-load-failure' });
        }
    }
    return { members: new Map(), density: 1, gpuBytes: 0, attempts };
}
