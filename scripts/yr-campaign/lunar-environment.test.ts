import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { environmentEntries } from '../test-support/environment';
import { registerEnvironmentResources } from '../../desktop/environment-profile.mjs';
import { resolveEnvironmentFamily } from '../../src/engine/renderable/builder/EnvironmentHd';
import { disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import { environmentFamilyScopeIssue } from '../../src/engine/renderable/builder/environmentHdContract';
import contract from '../../desktop/environment-lunar-hd-contract.json';

const identities = Object.keys(contract.families);
test('Lunar environment registers five complete YR mission families with native palettes and independent density routes', async () => {
    const selected = await registerEnvironmentResources('.local');
    const manifest = selected.selections.get('/local-environment/lunar/selection.json');
    expect(manifest.editions).toEqual(['yr']); expect(Object.keys(manifest.families)).toEqual(identities);
    expect(identities).toHaveLength(5);
    expect(Object.keys(contract.sources)).toHaveLength(36);
    expect(Object.keys(contract.identities.ra2)).toHaveLength(0);
    for (const identity of identities) {
        const family = contract.families[identity as keyof typeof contract.families];
        const source = family.sourceScope.campaignSources[0];
        expect(environmentFamilyScopeIssue(family, { campaign: { launch: { ...source, sourceSha256: source.sha256 } } })).toBeUndefined();
        for (const changed of [{ edition: 'ra2' }, { mission: 'all01umd.map' }, { sourceSha256: '0'.repeat(64) }])
            expect(environmentFamilyScopeIssue(family, { campaign: { launch: { ...source, sourceSha256: source.sha256, ...changed } } })).toBeDefined();
        for (const member of manifest.families[identity].members) {
            const hd = JSON.parse(readFileSync(selected.routes.get(member.manifest)!, 'utf8'));
            expect(hd.variants.map((variant: any) => variant.density)).toEqual([2, 4]);
            for (const variant of hd.variants) for (const page of variant.pages)
                for (const role of ['base', 'data']) expect(selected.routes.has(member.files[page[role]])).toBe(true);
        }
    }
});

for (const identity of identities) for (const density of [2, 4] as const)
    test(`${identity} ${density}X retains every source state and releases its complete allocation`, async () => {
        const entries = environmentEntries('LUNAR', identity);
        let uploads = 0, releases = 0;
        const loaded = await resolveEnvironmentFamily(identity, entries, density, 128 * 1024 * 1024, 8192, textures => {
            uploads += textures.length;
            textures.forEach(texture => texture.addEventListener('dispose', () => releases++));
        });
        expect(loaded.attempts).toEqual([]); expect(loaded.overrides.size).toBe(entries.length);
        expect(loaded.density).toBe(density); expect(loaded.retainedCpuBytes).toBeGreaterThan(0);
        expect(loaded.worldChargeBytes).toBe(loaded.gpuBytes + loaded.retainedCpuBytes);
        for (const entry of entries) {
            const hd = loaded.overrides.get(entry.image)!;
            expect(hd.frames).toHaveLength(entry.source.frames.length);
            if (identity.includes('smudges')) {
                expect(entry.source.frames[1].empty).toBe(true);
                expect(hd.frames[1].sampleRect.width).toBe(0); expect(hd.frames[1].sampleRect.height).toBe(0);
            }
        }
        loaded.overrides.forEach(disposeHdSprite); expect(releases).toBe(uploads);
    });

test('one invalid Lunar child, source change, cancellation or budget fault preserves complete family fallback', async () => {
    const identity = 'yr-sov06-lunar-yacomd-v1', normal = environmentEntries('LUNAR', identity);
    for (const fault of ['missing', 'source', 'page', 'ownership', 'cancelled', 'budget']) {
        const entries = normal.map(entry => ({ ...entry, source: structuredClone(entry.source) }));
        if (fault === 'missing') entries.pop();
        if (fault === 'source') entries[0].source.sha256 = '0'.repeat(64);
        if (fault === 'page') entries.at(-1)!.read = async () => { throw Error('missing complete-density page'); };
        if (fault === 'ownership') entries.at(-1)!.read = async filename => {
            const decoded = await normal.at(-1)!.read(filename), rgba = decoded.rgba.slice();
            if (filename.includes('data')) { rgba[0] = 255; rgba[1] = 255; }
            return { ...decoded, rgba };
        };
        const loaded = await resolveEnvironmentFamily(identity, entries, 4,
            fault === 'budget' ? 1 : 128 * 1024 * 1024, 8192,
            () => { throw Error('Invalid complete family cannot upload'); }, () => fault === 'cancelled');
        expect(loaded.overrides.size).toBe(0); expect(loaded.worldChargeBytes).toBe(0);
        expect(loaded.retainedCpuBytes).toBe(0); expect(loaded.attempts).toHaveLength(1);
    }
});
