import { environmentEntries } from '../test-support/environment';
import { expect, test } from 'bun:test';
import { resolveEnvironmentFamily } from '../../src/engine/renderable/builder/EnvironmentHd';
import { isEnvironmentHdSource }
    from '../../src/engine/renderable/builder/environmentHdContract';
import { disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import type { PowerPlantHdEntry } from '../../src/engine/renderable/builder/resolvePowerPlantHd';

const theater = process.env.M24_ENV_THEATER ?? 'URBAN';
if (!['URBAN', 'NEWURBAN', 'DESERT'].includes(theater)) throw Error('Unsupported bridge test theater');
const requestedFamilies = process.env.M24_ENV_FAMILIES?.split(',')
    ?? ['urban-bridge-high-concrete', 'urban-bridge-low-wood'];
for (const family of requestedFamilies) {
    const entries = environmentEntries(theater, family);
    for (const density of [2, 4] as const) test(`${family} ${density}X complete native slots, fallback and disposal`, async () => {
        expect(entries.every(entry => isEnvironmentHdSource(entry.source))).toBe(true);
        // Shared original sprites can legitimately bind in more than one theater.
        expect(entries.every(entry => !isEnvironmentHdSource({ ...entry.source, sha256: '0'.repeat(64) }))).toBe(true);
        for (const fault of ['none', 'missing-member', 'missing-page', 'corrupt-page', 'budget']) {
            const inputs = fault === 'missing-member' ? entries.slice(1) : entries.map(entry => ({ ...entry,
                read: fault === 'missing-page' ? async () => { throw Error('Missing page'); }
                    : fault === 'corrupt-page' ? async (file: string) => {
                        const page = await entry.read(file), rgba = page.rgba.slice();
                        rgba[100] ^= 1;
                        return { ...page, rgba };
                    } : entry.read }));
            const loaded = await resolveEnvironmentFamily(family, inputs, density,
                fault === 'budget' ? 1 : 128 * 1024 * 1024, 8192, () => {});
            if (fault === 'none') expect(loaded.attempts).toEqual([]);
            expect(loaded.overrides.size).toBe(fault === 'none' ? entries.length : 0);
            if (fault === 'none') {
                expect(loaded.attempts).toEqual([]);
                expect(loaded.worldChargeBytes).toBeGreaterThan(0);
                for (const entry of entries) {
                    const sprite = loaded.overrides.get(entry.image)!;
                    expect(sprite.frames.length).toBe(entry.source.frames.length);
                    let disposed = 0;
                    for (const page of sprite.pages) page.base.addEventListener('dispose', () => disposed++);
                    disposeHdSprite(sprite);
                    expect(disposed).toBe(sprite.pages.length);
                }
            } else expect(loaded.worldChargeBytes).toBe(0);
        }
    }, 60000);
}
