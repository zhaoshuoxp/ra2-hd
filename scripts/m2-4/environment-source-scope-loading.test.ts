import { expect, test } from 'bun:test';
import { loadEnvironmentHd } from '../../src/engine/renderable/builder/loadEnvironmentHd';
import { environmentHdContractForTheater } from '../../src/engine/renderable/builder/environmentHdContract';
import { TheaterType } from '../../src/engine/TheaterType';

test('scope refusal returns a complete Original family before native or PNG allocation', async () => {
    const contract = environmentHdContractForTheater(TheaterType.Snow)!;
    const [id, family] = Object.entries(contract.families)[0];
    const previous = family.sourceScope, originalFetch = globalThis.fetch;
    const calls: string[] = [];
    const source = 'a4f07f9b927148f871136237e48253cadff9ff631602cb79de46e86e1100c574';
    family.sourceScope = { officialMapSha256s: [source],
        visualAdaptationStatus: 'APPLIED_SOURCE_PINNED_ORIGINAL_LIBRARY_PALETTE' };
    globalThis.fetch = (async url => {
        calls.push(String(url));
        if (String(url) !== '/local-environment/snow/selection.json') throw Error('Unexpected payload read');
        return Response.json({ schema: 'environment-shp-pack-v1', theater: 'SNOW', editions: ['ra2', 'yr'],
            families: { [id]: { familyHash: family.familyHash,
                members: family.members.map(member => ({ member })) } } });
    }) as typeof fetch;
    try {
        for (const context of [{}, { officialSkirmishSourceSha256: source,
            officialVisualAdaptations: { status: 'IMAGE_SOURCE_MISMATCH' } }]) {
            const result = await loadEnvironmentHd({ type: TheaterType.Snow }, {}, true, 4, 1280 * 1024 ** 2,
                new Set(family.identities), () => false, context);
            expect(result.report.families[id].status).toBe('ORIGINAL');
            expect(result.report.families[id].reason).toMatch(/official-(map-source-scope-mismatch|visual-adaptation-not-applied)/);
            expect(result.report.worldChargeBytes).toBe(0);
            expect(result.report.gpuBytes).toBe(0);
            expect(result.overrides.size).toBe(0);
            result.dispose();
        }
        expect(calls).toEqual(['/local-environment/snow/selection.json', '/local-environment/snow/selection.json']);
    } finally {
        family.sourceScope = previous;
        globalThis.fetch = originalFetch;
    }
});
