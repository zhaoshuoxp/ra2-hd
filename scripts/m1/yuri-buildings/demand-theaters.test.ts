import { expect, test } from 'bun:test';

(globalThis as any).location = { search: '?edition=yr' };
const { alliedBuildingDemand } = await import('../../../src/engine/renderable/builder/alliedBuildingDemand');
const { TheaterType } = await import('../../../src/engine/TheaterType');
const legacy = ['NAHAND', 'NAREFN', 'NAWEAP', 'NARADR', 'NADEPT', 'NATECH', 'NANRCT',
    'NALASR', 'NAFLAK', 'TESLA', 'NAIRON', 'NAMISL', 'NAWALL'];

test('existing Soviet families remain demand-loadable on all dry theaters under a Yuri player', () => {
    for (const type of [TheaterType.Temperate, TheaterType.Urban, TheaterType.NewUrban, TheaterType.Desert, TheaterType.Lunar]) {
        const demand = alliedBuildingDemand({}, { type }, {}, true, () => false, 4);
        for (const family of legacy) expect(demand.identities.has(family)).toBe(true);
    }
});

test('disabled and already resident families acquire no additional demand lease', () => {
    expect(alliedBuildingDemand({}, { type: TheaterType.Urban }, {}, false, () => false).identities.size).toBe(0);
    const families = { NAHAND: { overrides: new Map(), report: { density: 4, gpuBytes: 1, attempts: [] } } };
    expect(alliedBuildingDemand(families, { type: TheaterType.Urban }, {}, true, () => false).identities.has('NAHAND')).toBe(false);
});
