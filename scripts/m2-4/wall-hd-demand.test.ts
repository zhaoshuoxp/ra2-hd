import { expect, test } from 'bun:test';
import { ImageFinder } from '../../src/engine/ImageFinder';
import { UnitHdDemand } from '../../src/engine/renderable/builder/UnitHdDemand';

for (const name of ['GAWALL', 'NAWALL']) test(`${name} overlays share accepted building demand and release leases`, async () => {
    const image = { filename: name === 'GAWALL' ? 'guwall.shp' : 'nuwall.shp' };
    const override = { identity: 'accepted-wall', frames: [], pages: [] };
    const building = { overrides: new Map([[image, override]]),
        report: { density: 4, gpuBytes: 8, attempts: [] } };
    let loads = 0, releases = 0;
    const demand = new UnitHdDemand(new Set([name]), 8, async () => {
        loads++;
        return { members: new Map([[image.filename, { image, override }]]), building,
            density: 4, gpuBytes: 8, attempts: [] } as any;
    }, () => releases++);
    const buildings = {};
    const finder = new ImageFinder(new Map(), { type: 1 }, undefined, undefined, undefined, undefined,
        buildings, { report: demand.report, bindBuilding: (id: string, apply: any) => demand.bindFamily(id, value => apply(value?.building)) } as any);
    expect(finder.hasWallHdDemand(name)).toBe(true);
    expect(finder.hasWallHdDemand('GASAND')).toBe(false);
    const applied: any[][] = [[], []];
    const release = applied.map(values => finder.bindWallHd(name, image, value => values.push(value)));
    await demand.idle();
    expect(loads).toBe(1);
    expect(applied.every(values => values.at(-1) === override)).toBe(true);
    expect(finder.getHdOverride(image)).toBe(override);
    release.forEach(stop => stop());
    demand.dispose();
    expect(releases).toBe(1);
    expect(demand.report.gpuBytes).toBe(0);
});

test('unrelated overlays do not request faction wall artwork', () => {
    let calls = 0;
    const finder = new ImageFinder(new Map(), { type: 1 }, undefined, undefined, undefined, undefined,
        {}, { bindBuilding: () => { calls++; return () => {}; } } as any);
    finder.bindWallHd('GASAND', {}, () => {})();
    finder.bindWallHd('BRIDGE1', {}, () => {})();
    expect(calls).toBe(0);
});
