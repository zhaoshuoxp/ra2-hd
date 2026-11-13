import { environmentEntries } from '../test-support/environment';
import { expect, test } from 'bun:test';
import { resolveEnvironmentFamily } from '../../src/engine/renderable/builder/EnvironmentHd';
import { environmentHdContractForTheater, isEnvironmentHdSource }
    from '../../src/engine/renderable/builder/environmentHdContract';
import { disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import type { PowerPlantHdEntry } from '../../src/engine/renderable/builder/resolvePowerPlantHd';

const cases = [['URBAN', 'CIVSF'], ['URBAN', 'CIVSTM'], ['NEWURBAN', 'CIVSTM']] as const;
for (const [theater, identity] of cases) {
    const contract = environmentHdContractForTheater(theater)!;
    const id = contract.identities.yr[identity];
    const entries = environmentEntries(theater, id);
    for (const density of [2, 4] as const) test(`${theater} ${identity} ${density}X loads all native states and refuses incomplete families`, async () => {
        expect(entries.every(entry => isEnvironmentHdSource(entry.source))).toBe(true);
        for (const fault of ['none', 'missing-member', 'missing-page', 'corrupt-page', 'budget']) {
            const inputs = fault === 'missing-member' ? [] : entries.map(entry => ({ ...entry,
                read: fault === 'missing-page' ? async () => { throw Error('Missing page'); }
                    : fault === 'corrupt-page' ? async (file: string) => {
                        const page = await entry.read(file), rgba = page.rgba.slice();
                        rgba[100] ^= 1;
                        return { ...page, rgba };
                    } : entry.read }));
            const loaded = await resolveEnvironmentFamily(id, inputs, density,
                fault === 'budget' ? 1 : 128 * 1024 * 1024, 8192, () => {});
            expect(loaded.overrides.size).toBe(fault === 'none' ? entries.length : 0);
            if (fault === 'none') {
                expect(loaded.attempts).toEqual([]);
                expect(loaded.worldChargeBytes).toBeGreaterThan(0);
                for (const entry of entries) {
                    const sprite = loaded.overrides.get(entry.image)!;
                    expect(sprite.frames.length).toBe(entry.source.frames.length);
                    let disposed = 0;
                    sprite.pages[0].base.addEventListener('dispose', () => disposed++);
                    disposeHdSprite(sprite);
                    expect(disposed).toBe(1);
                }
            } else expect(loaded.worldChargeBytes).toBe(0);
        }
    });
}

test('NewUrban retains the earlier accepted cow instead of replacing its art with another donor', () => {
    const contract = environmentHdContractForTheater('NEWURBAN')!;
    expect(contract.identities.yr.COW).toBe('newurban-cow');
    expect(Object.keys(contract.families)).not.toContain('newurban-snow-cow');
});
