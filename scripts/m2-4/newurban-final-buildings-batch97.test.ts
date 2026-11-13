import { environmentEntries } from '../test-support/environment';
import { expect, test } from 'bun:test';
import { resolveEnvironmentFamily } from '../../src/engine/renderable/builder/EnvironmentHd';
import { disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import type { PowerPlantHdEntry } from '../../src/engine/renderable/builder/resolvePowerPlantHd';

function entries(identity: string): PowerPlantHdEntry[] { return environmentEntries('NEWURBAN', identity); }

const families = [
    'newurban-cabarr01', 'newurban-cabunk03', 'newurban-cabunk04', 'newurban-cala01', 'newurban-cala03',
    'newurban-cala05', 'newurban-cala06', 'newurban-cala13', 'newurban-canewy04', 'newurban-carus08',
    'newurban-carus10', 'newurban-casanf18', 'newurban-caslab',
];
for (const identity of families) {
    for (const density of [2, 4] as const) test(`${identity} ${density}X validates complete native slots and releases every allocation`, async () => {
        const inputs = entries(identity);
        const loaded = await resolveEnvironmentFamily(identity, inputs, density, 256 * 1024 * 1024, 8192, () => {});
        expect(loaded.attempts).toEqual([]);
        expect(loaded.overrides.size).toBe(inputs.length);
        expect(loaded.density).toBe(density);
        expect(loaded.retainedCpuBytes).toBeGreaterThan(0);
        expect(loaded.worldChargeBytes).toBe(loaded.gpuBytes + loaded.retainedCpuBytes);
        for (const entry of inputs) {
            const sprite = loaded.overrides.get(entry.image)!;
            expect(sprite.frames.length).toBe(entry.source.frames.length);
            const textures = new Set(sprite.pages.flatMap(p => [p.base, p.data, p.tiles?.map, p.tiles?.dataMap]).filter(Boolean));
            let releases = 0;
            textures.forEach(texture => texture!.addEventListener('dispose', () => releases++));
            disposeHdSprite(sprite);
            expect(releases).toBe(textures.size);
        }

    });
}

test('Secret Lab cannot publish a partial or corrupt linked loop and respects cancellation and budget', async () => {
    const identity = 'newurban-caslab';
    const normal = entries(identity);
    expect(normal.length).toBe(2);
    for (const fault of ['missing-linked', 'incomplete-loop', 'invalid-ownership', 'budget', 'cancelled']) {
        const inputs = normal.map(entry => ({ ...entry, manifest: structuredClone(entry.manifest) }));
        if (fault === 'missing-linked') inputs.pop();
        if (fault === 'incomplete-loop') inputs[1].manifest.variants.find((v: any) => v.density === 4).frames.pop();
        if (fault === 'invalid-ownership') inputs[1].read = async filename => {
            const value = await normal[1].read(filename), rgba = value.rgba.slice();
            if (filename.includes('data')) rgba[1] = 255;
            return { ...value, rgba };
        };
        const loaded = await resolveEnvironmentFamily(identity, inputs, 4,
            fault === 'budget' ? 1 : 256 * 1024 * 1024, 8192, () => {}, () => fault === 'cancelled');
        expect(loaded.overrides.size).toBe(0);
        expect(loaded.worldChargeBytes).toBe(0);
        expect(loaded.retainedCpuBytes).toBe(0);
        expect(loaded.attempts.length).toBe(1);
    }
});
