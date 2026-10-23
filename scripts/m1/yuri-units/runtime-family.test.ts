import { expect, test } from 'bun:test';
import { resolveSameDensityUnitFamily, type UnitFamilySelection } from '../../../src/engine/renderable/builder/resolveMixedUnitFamily';
import { unitHdFamiliesForEdition, type UnitHdFamilyContract } from '../../../src/engine/renderable/builder/unitHdFamilies';
import { sharedYuriUnitHdIdentity } from '../../../src/engine/renderable/builder/sharedYuriUnitHd';
import { ImageFinder } from '../../../src/engine/ImageFinder';
import { UnitHdDemand } from '../../../src/engine/renderable/builder/UnitHdDemand';

const worker = { filename: 'slav.shp' };
function shp(density: number): UnitFamilySelection {
    return { density, gpuBytes: 4, attempts: [], members: new Map([[worker.filename,
        { image: worker, override: { identity: 'SLAV', frames: [], pages: [] } }]]) };
}
function voxel(density: number): UnitFamilySelection {
    return { density, gpuBytes: 6, attempts: [], members: new Map(),
        vxl: { identity: 'SMIN', parts: [], dispose() {} } };
}

test('density mismatch releases both allocations then reloads the entire miner family at 2x', async () => {
    const released: UnitFamilySelection[] = [], requested: string[] = [];
    const firstShp = shp(4), firstVxl = voxel(2), secondShp = shp(2), secondVxl = voxel(2);
    const result = await resolveSameDensityUnitFamily(4, 10, () => false,
        async (budget, density) => { expect(budget).toBe(10); requested.push(`shp-${density}`); return density === 4 ? firstShp : secondShp; },
        async (budget, density) => { expect(budget).toBe(6); requested.push(`vxl-${density}`); return density === 4 ? firstVxl : secondVxl; },
        value => released.push(value));
    expect(requested).toEqual(['shp-4', 'vxl-4', 'shp-2', 'vxl-2']);
    expect(released).toEqual([firstShp, firstVxl]);
    expect(result.members).toBe(secondShp.members);
    expect(result.vxl).toBe(secondVxl.vxl);
    expect(result.density).toBe(2);
    expect(result.gpuBytes).toBe(10);
    expect(result.attempts).toEqual([{ density: 4, reason: 'mixed-density-mismatch' }]);
});

test('missing miner body at both densities releases worker pages and leaves no partial binding', async () => {
    const released: UnitFamilySelection[] = [];
    const result = await resolveSameDensityUnitFamily(4, 10, () => false,
        async (_, density) => shp(density), async () => ({ members: new Map(), density: 1, gpuBytes: 0, attempts: [] }),
        value => released.push(value));
    expect(released).toHaveLength(4);
    expect(result.members.size).toBe(0);
    expect(result.vxl).toBeUndefined();
    expect(result.gpuBytes).toBe(0);
    expect(result.attempts.map(a => a.density)).toEqual([4, 2]);
});

test('cancellation releases the private family and does not start a fallback load', async () => {
    const released: UnitFamilySelection[] = [];
    let stopped = false, loads = 0;
    await expect(resolveSameDensityUnitFamily(4, 10, () => stopped,
        async (_, density) => { loads++; return shp(density); },
        async (_, density) => { stopped = true; return voxel(density); },
        value => released.push(value))).rejects.toThrow('cancelled');
    expect(loads).toBe(1);
    expect(released).toHaveLength(2);
});

test('edition filtering preserves the guarded RA2 hero before the YR same-name contract is merged', () => {
    const native: UnitHdFamilyContract = { identity: 'YURIPR', edition: 'yr', familyHash: 'yr-only',
        members: [{ member: 'yurix.shp', frames: 288, totalFrames: 576, canvas: [164, 86], sourceHash: 'yr', manifestHash: 'yr' }], projectiles: [] };
    const additions = { YURIPR: native };
    const ra2 = unitHdFamiliesForEdition('ra2', additions).YURIPR;
    expect(ra2.members[0].member).toBe('yuripr.shp');
    expect(ra2.blockedReason).toContain('UPSTREAM_GAMEPLAY_BLOCKED');
    expect(unitHdFamiliesForEdition('yr', additions).YURIPR).toBe(native);
    expect(sharedYuriUnitHdIdentity('YENGINEER', { filename: 'engineer.shp' }, 'ra2')).toBe('YENGINEER');
    expect(sharedYuriUnitHdIdentity('YENGINEER', { filename: 'spy.shp' }, 'yr')).toBe('YENGINEER');
    expect(sharedYuriUnitHdIdentity('SLAV', { filename: 'engineer.shp' }, 'yr')).toBe('SLAV');
});

test('native slave lease shares the miner demand family while rejecting a different image object', async () => {
    let loads = 0;
    const selection = shp(4);
    const demand = new UnitHdDemand(new Set(['SMIN']), 10, async () => { loads++; return selection; }, () => {});
    const finder = new ImageFinder(new Map(), {}, undefined, undefined, undefined, undefined, {},
        { families: demand.families, report: demand.report, bind: demand.bind.bind(demand) }, 'yr');
    const seen: unknown[] = [];
    const release = finder.bindUnitHd('SLAV', worker, value => seen.push(value));
    await demand.idle();
    expect(loads).toBe(1);
    expect(seen).toEqual([selection.members.get('slav.shp')!.override]);
    expect(finder.getUnitHdOverride('SLAV', { filename: 'slav.shp' })).toBeUndefined();
    expect(demand.report.gpuBytes).toBe(4);
    release();
    demand.dispose();
    expect(demand.report.gpuBytes).toBe(0);
});
