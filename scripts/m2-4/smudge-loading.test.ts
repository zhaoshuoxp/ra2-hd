import { environmentEntries } from '../test-support/environment';
import { expect, test } from 'bun:test';
import { resolveEnvironmentFamily } from '../../src/engine/renderable/builder/EnvironmentHd';
import { disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import type { PowerPlantHdEntry } from '../../src/engine/renderable/builder/resolvePowerPlantHd';

const theater = process.env.M24_SMUDGE_THEATER ?? 'SNOW';
expect(['SNOW', 'URBAN', 'NEWURBAN', 'DESERT']).toContain(theater);
const families = [`${theater.toLowerCase()}-burnt01`, `${theater.toLowerCase()}-crater01`];
function entryFor(family: string): PowerPlantHdEntry { return environmentEntries(theater, family)[0]; }
for (const family of families) for (const density of [2, 4] as const) {
    test(`${family} ${density}X keeps the native empty slot and rejects incomplete families`, async () => {
        const entry = entryFor(family);
        expect(entry.source.frames[1].empty).toBe(true);
        expect(entry.source.frames[1].trimSize).toEqual([0, 0]);
        let uploads = 0, disposals = 0;
        const loaded = await resolveEnvironmentFamily(family, [entry], density, 32 * 1024 * 1024, 2048,
            textures => { uploads += textures.length;
                textures.forEach(texture => texture.addEventListener('dispose', () => disposals++)); });
        expect(loaded.attempts).toEqual([]);
        expect(loaded.overrides.size).toBe(1);
        const frames = loaded.overrides.get(entry.image)!.frames;
        expect(frames.length).toBe(2);
        expect(frames[1].sampleRect.width).toBe(0);
        expect(frames[1].sampleRect.height).toBe(0);
        loaded.overrides.forEach(disposeHdSprite);
        expect(disposals).toBe(uploads);
        for (const [inputs, budget] of [
            [[], 32 * 1024 * 1024],
            [[{ ...entry, manifest: { ...entry.manifest, logical: {} } }], 32 * 1024 * 1024],
            [[{ ...entry, read: async () => { throw Error('page hash mismatch or missing file'); } }], 32 * 1024 * 1024],
            [[entry], 1],
        ] as [PowerPlantHdEntry[], number][]) {
            const rejected = await resolveEnvironmentFamily(family, inputs, density, budget, 2048,
                () => { throw Error('An invalid family must never publish textures'); });
            expect(rejected.overrides.size).toBe(0);
            expect(rejected.worldChargeBytes).toBe(0);
        }
    });
}
