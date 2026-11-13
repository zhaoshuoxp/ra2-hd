import { environmentEntries } from '../test-support/environment';
import { expect, test } from 'bun:test';
import { resolveEnvironmentFamily } from '../../src/engine/renderable/builder/EnvironmentHd';
import { disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import type { PowerPlantHdEntry } from '../../src/engine/renderable/builder/resolvePowerPlantHd';

function entries(identity: string): PowerPlantHdEntry[] { return environmentEntries('NEWURBAN', identity); }

for (const identity of ['newurban-civ1', 'newurban-gafwll', 'newurban-dnoa']) {
    for (const density of [2, 4] as const) test(`${identity} ${density}X resolves all native slots and owns its full allocation`, async () => {
        const inputs = entries(identity);
        const family = await resolveEnvironmentFamily(identity, inputs, density, 256 * 1024 * 1024, 8192, () => {});
        expect(family.attempts).toEqual([]);
        expect(family.density).toBe(density);
        expect(family.overrides.size).toBe(1);
        const override = family.overrides.get(inputs[0].image)!;
        expect(override.frames.length).toBe(identity === 'newurban-civ1' ? 238 : identity === 'newurban-dnoa' ? 424 : 48);
        for (const page of identity === 'newurban-dnoa' ? [] : override.pages) {
            const owner = page.data.image as { width: number; height: number; data: Uint8Array };
            expect([owner.width, owner.height]).toEqual([1, 1]);
            expect([...owner.data]).toEqual([0, 0]);
        }
        const textures = new Set(override.pages.flatMap(page => [page.base, page.data, page.tiles?.map, page.tiles?.dataMap].filter(Boolean)));
        const bytes = [...textures].reduce((sum, texture) => sum + (texture!.userData.hdSourceRetention?.retainedCpuBytes
            ?? (texture!.image as { data: Uint8Array }).data.byteLength), 0);
        expect(family.retainedCpuBytes).toBe(bytes);
        expect(family.worldChargeBytes).toBe(family.gpuBytes + bytes);
        let disposed = 0;
        for (const texture of textures) texture!.addEventListener('dispose', () => disposed++);
        family.overrides.forEach(disposeHdSprite);
        expect(disposed).toBe(textures.size);

    });
}

test('a missing pose, foreign source, corrupt data, cancellation or insufficient budget publishes no partial family', async () => {
    for (const fault of ['pose', 'source', 'data', 'cancel', 'budget']) {
        const inputs = entries('newurban-civ1');
        if (fault === 'pose') inputs[0].manifest.variants.find((v: any) => v.density === 4).frames.pop();
        if (fault === 'source') inputs[0].source.sha256 = '0'.repeat(64);
        if (fault === 'data') {
            const original = inputs[0].read;
            inputs[0].read = async (filename: string, hash: string, bytes: number) => {
                const image = await original(filename, hash, bytes);
                if (!filename.includes('data')) return image;
                const rgba = image.rgba.slice();
                rgba[2] = 1;
                return { ...image, rgba };
            };
        }
        const family = await resolveEnvironmentFamily('newurban-civ1', inputs, 4, fault === 'budget' ? 1 : 256 * 1024 * 1024,
            8192, () => {}, () => fault === 'cancel');
        expect(family.overrides.size).toBe(0);
        expect(family.gpuBytes).toBe(0);
        expect(family.retainedCpuBytes).toBe(0);
        expect(family.attempts.length).toBeGreaterThan(0);
    }
});
