import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import ledger from '../../docs/campaign-art/yr-v1/reused-families.json';
import { registerEnvironmentResources } from '../../desktop/environment-profile.mjs';
import { validateCampaignResources, registerCampaignEnvironmentResources } from '../../desktop/campaign-profile.mjs';
import { registerCampaignEnvironmentAliases } from '../../desktop/campaign-environment-aliases.mjs';
import { environmentHdContractForTheater, environmentMemberSource, environmentFamilyScopeIssue }
    from '../../src/engine/renderable/builder/environmentHdContract';
import { resolveEnvironmentFamily } from '../../src/engine/renderable/builder/EnvironmentHd';
import { disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import { nativeShpSource, sha256 } from '../test-support/resources';

const registered = (async () => {
    const environment = await registerEnvironmentResources('.local'), campaign = await validateCampaignResources('.local/campaign');
    const profile = { routes: new Map([...environment.routes, ...campaign.routes]),
        selections: new Map([...environment.selections, ...campaign.selections]) };
    const records: any[] = [];
    await registerCampaignEnvironmentResources(profile, record => records.push(record));
    await registerCampaignEnvironmentAliases(profile, record => records.push(record));
    return { profile, records };
})();
const route = (theater: string) => `/local-environment${theater === 'TEMPERATE' ? '' : '/' + theater.toLowerCase()}/selection.json`;

test('all 38 YR reuse families publish complete immutable donor pages only for their original campaign sources', async () => {
    const { profile, records } = await registered;
    expect(ledger.families).toHaveLength(38);
    expect(ledger.copiedPngFiles).toBe(0); expect(ledger.replacedAcceptedPayloads).toBe(0);
    for (const item of ledger.families) {
        const contract = environmentHdContractForTheater(item.theater)!;
        const family = contract.families[item.family], selected = profile.selections.get(route(item.theater)).families[item.family];
        expect(family.editions).toEqual(['yr']); expect(selected.familyHash).toBe(item.familyHash);
        expect(selected.members.map((member: any) => member.member).sort()).toEqual(family.members);
        expect(records.some(record => record.type === 'campaign-environment-alias-ready' && record.identity === item.family)).toBe(true);
        for (const source of item.campaignSources) {
            expect(environmentFamilyScopeIssue(family, { campaign: { launch: { ...source, sourceSha256: source.sha256 } } })).toBeUndefined();
            expect(environmentFamilyScopeIssue(family, { campaign: { launch: { ...source, edition: 'ra2', sourceSha256: source.sha256 } } })).toBeDefined();
        }
        for (const member of selected.members) {
            const bytes = readFileSync(profile.routes.get(member.manifest)); expect(sha256(bytes)).toBe(member.sha256);
            const metadata = JSON.parse(bytes.toString());
            expect(metadata.source.theater).toBe(item.theater);
            expect(metadata.variants.map((variant: any) => variant.density)).toEqual([2, 4]);
            for (const variant of metadata.variants) for (const page of variant.pages)
                for (const role of ['base', 'data']) expect(profile.routes.has(member.files[page[role]])).toBe(true);
        }
    }
});

for (const density of [2, 4] as const) test(`reused complete Psychic Beacon binds and releases every member at ${density}X`, async () => {
    const { profile } = await registered, identity = 'yr-reuse-newurban-napsyb-v1';
    const contract = environmentHdContractForTheater('NEWURBAN')!;
    const selected = profile.selections.get(route('NEWURBAN')).families[identity];
    const entries = selected.members.map((member: any) => {
        const descriptor = environmentMemberSource(contract, identity, member.member)!;
        const { source } = nativeShpSource('yr', member.member, descriptor.sha256, descriptor.bodyFrames, 'NEWURBAN');
        const manifest = JSON.parse(readFileSync(profile.routes.get(member.manifest), 'utf8'));
        return { image: { filename: member.member }, source, manifest, manifestHash: member.sha256,
            read: async (filename: string, hash: string, size: number) => {
                const bytes = readFileSync(profile.routes.get(member.files[filename]));
                expect(sha256(bytes)).toBe(hash); expect(bytes.length).toBe(size);
                const png = PNG.sync.read(bytes);
                return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
            } };
    });
    expect(entries).toHaveLength(3);
    let uploads = 0, releases = 0;
    const loaded = await resolveEnvironmentFamily(identity, entries, density, 128 * 1024 * 1024, 8192, textures => {
        uploads += textures.length; textures.forEach(texture => texture.addEventListener('dispose', () => releases++));
    });
    expect(loaded.attempts).toEqual([]); expect(loaded.overrides.size).toBe(entries.length);
    expect(loaded.density).toBe(density); expect(loaded.worldChargeBytes).toBeGreaterThan(0);
    loaded.overrides.forEach(disposeHdSprite); expect(releases).toBe(uploads);
    const broken = entries.map((entry: any) => ({ ...entry }));
    broken.at(-1)!.read = async () => { throw Error('Missing member page'); };
    const fallback = await resolveEnvironmentFamily(identity, broken, density, 128 * 1024 * 1024, 8192,
        () => { throw Error('Incomplete family must not upload'); });
    expect(fallback.overrides.size).toBe(0); expect(fallback.worldChargeBytes).toBe(0);
});
