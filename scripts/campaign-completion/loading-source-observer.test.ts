import { expect, test } from 'bun:test';
import { verifyNativeLoadingSourceWorld } from './loading-composition.mjs';

test('native source observer preserves Soviet red and Allied blue grids and rejects a missing or swapped grid', async () => {
    const observe = (grid: unknown[]) => verifyNativeLoadingSourceWorld({ evaluate: async () => ({
        samples: [], grid, absentLegacyGrid: [], extensionRegions: [],
    }) }, {});
    await expect(observe([{ state: 'red', actual: [104, 0, 0] }, { state: 'blue', actual: [0, 0, 76] }]))
        .resolves.toMatchObject({ status: 'PASS_ORIGINAL_SOURCE_REGION_AND_GRID_SAMPLES' });
    await expect(observe([{ actual: [0, 0, 76] }])).resolves.toBeDefined();
    for (const sample of [{ state: 'red', actual: [0, 0, 104] }, { state: 'blue', actual: [104, 0, 0] },
        { state: 'red', actual: [0, 0, 0] }, { state: 'blue', actual: [0, 0, 0] },
        { state: 'green', actual: [0, 104, 0] }]) await expect(observe([sample])).rejects.toThrow();
});
