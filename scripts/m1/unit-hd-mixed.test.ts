import { expect, test } from 'bun:test';
import { resolveMixedUnitFamily, type UnitFamilySelection } from '../../src/engine/renderable/builder/resolveMixedUnitFamily';
import { UnitHdDemand } from '../../src/engine/renderable/builder/UnitHdDemand';

function fixture() {
    const image = { filename: 'schpdepl.shp' };
    const shp: UnitFamilySelection = { density: 2, gpuBytes: 4, attempts: [], members: new Map([
        [image.filename, { image, override: { identity: 'SCHP', frames: [], pages: [] } }],
    ]) };
    const vxl: UnitFamilySelection = { density: 4, gpuBytes: 6, attempts: [], members: new Map(),
        vxl: { identity: 'SCHP', parts: [], dispose() {} } };
    return { image, shp, vxl };
}

test('mixed load shares one allocation and publishes body and transition only after the second resource completes', async () => {
    const { image, shp, vxl } = fixture();
    let finish!: (value: UnitFamilySelection) => void;
    const shown: string[] = [], released: unknown[] = [];
    const demand = new UnitHdDemand(new Set(['SCHP']), 10,
        (_, budget, stopped) => resolveMixedUnitFamily(budget, stopped, async () => shp,
            async remaining => { expect(remaining).toBe(6); return new Promise(resolve => { finish = resolve; }); },
            selection => released.push(selection)), family => released.push(family));
    demand.bind('SCHP', image, value => shown.push(value ? 'transition-hd' : 'original'));
    demand.bindFamily('SCHP', value => shown.push(value?.vxl ? 'body-hd' : 'original'));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(shown).toEqual([]);
    finish(vxl);
    await demand.idle();
    expect(shown).toEqual(['transition-hd', 'body-hd']);
    expect(demand.report.gpuBytes).toBe(10);
    expect(released).toEqual([]);
    demand.dispose();
    expect(released).toHaveLength(1);
});

test('missing or corrupt child disposes the loaded body without exposing a partial family', async () => {
    const { shp } = fixture(), released: unknown[] = [];
    await expect(resolveMixedUnitFamily(10, () => false, async () => shp,
        async () => { throw Error('missing-vxl-resource'); }, value => released.push(value))).rejects.toThrow('missing-vxl-resource');
    expect(released).toEqual([shp]);
});

test('capacity rejection releases both components and reports retryable whole-family fallback', async () => {
    const { shp, vxl } = fixture(), released: unknown[] = [];
    const result = await resolveMixedUnitFamily(9, () => false, async () => shp, async () => vxl,
        value => released.push(value));
    expect(result.members.size).toBe(0);
    expect(result.vxl).toBeUndefined();
    expect(result.gpuBytes).toBe(0);
    expect(result.attempts).toEqual([{ reason: 'combined-budget' }]);
    expect(released).toEqual([shp, vxl]);
});

test('cancellation after child completion releases both allocations', async () => {
    const { shp, vxl } = fixture(), released: unknown[] = [];
    let stopped = false;
    await expect(resolveMixedUnitFamily(10, () => stopped, async () => shp,
        async () => { stopped = true; return vxl; }, value => released.push(value))).rejects.toThrow('cancelled');
    expect(released).toEqual([shp, vxl]);
});

test('SHP fallback never requests a VXL-only substitute', async () => {
    const empty: UnitFamilySelection = { members: new Map(), density: 1, gpuBytes: 0,
        attempts: [{ reason: 'combined-budget' }] };
    const result = await resolveMixedUnitFamily(2, () => false, async () => empty,
        async () => { throw Error('must not load child'); }, () => {});
    expect(result.members.size).toBe(0);
    expect(result.attempts).toEqual(empty.attempts);
});
