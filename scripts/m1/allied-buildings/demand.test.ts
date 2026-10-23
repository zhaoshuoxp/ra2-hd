import { expect, test } from 'bun:test';
import { UnitHdDemand, type DemandSelection } from '../../../src/engine/renderable/builder/UnitHdDemand';
import { disposePowerPlantHd } from '../../../src/engine/renderable/builder/resolvePowerPlantHd';

test('building metadata survives shared queue caching; a live unit retains its allocation during building capacity fallback', async () => {
    const image = { filename: 'building.shp' }, released: string[] = [];
    const building = { overrides: new Map([[image, { identity: 'complete-building', pages: [], frames: [] }]]),
        report: { density: 2, gpuBytes: 8, attempts: [] } };
    const demand = new UnitHdDemand(new Set(['UNIT', 'GAAIRC']), 12, async (name, budget): Promise<DemandSelection> => {
        if (budget < 8) return { members: new Map(), density: 1, gpuBytes: 0, attempts: [{ reason: 'combined-budget' }] };
        return { members: new Map([[image.filename, { image, override: { identity: name, pages: [], frames: [] } }]]),
            building: name === 'GAAIRC' ? building : undefined, density: 2, gpuBytes: 8, attempts: [] };
    }, family => {
        released.push(family.building ? 'GAAIRC' : 'UNIT');
        if (family.building) disposePowerPlantHd(family.building);
    });
    const unitRelease = demand.bind('UNIT', image, () => {});
    await demand.idle();
    let primary, alias;
    const first = demand.bindFamily('GAAIRC', family => { primary = family?.building; });
    await demand.idle();
    expect(demand.report.families.GAAIRC.status).toBe('BUDGET_FALLBACK');
    expect(released).toEqual([]);
    unitRelease();
    await demand.idle();
    const second = demand.bindFamily('GAAIRC', family => { alias = family?.building; });
    expect(primary).toBe(building);
    expect(alias).toBe(building);
    expect(demand.report.gpuBytes).toBe(8);
    first(); second(); demand.dispose();
    expect(released).toEqual(['UNIT', 'GAAIRC']);
    expect(building.overrides.size).toBe(0);
    expect(demand.report.gpuBytes).toBe(0);
});
