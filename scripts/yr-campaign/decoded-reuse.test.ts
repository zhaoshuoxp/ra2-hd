import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import ledger from '../../docs/campaign-art/yr-v1/decoded-reused-families.json';
import { validateCampaignResources, registerCampaignEnvironmentResources } from '../../desktop/campaign-profile.mjs';
import { registerEnvironmentResources } from '../../desktop/environment-profile.mjs';
import { registerCampaignEnvironmentAliases } from '../../desktop/campaign-environment-aliases.mjs';
import { environmentHdContractForTheater, environmentMemberSource, environmentFamilyScopeIssue }
    from '../../src/engine/renderable/builder/environmentHdContract';
import { resolveEnvironmentFamily } from '../../src/engine/renderable/builder/EnvironmentHd';
import { disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import { nativeShpSource, sha256 } from '../test-support/resources';

const registered = (async () => {
    const campaign = await validateCampaignResources('.local/campaign');
    const environment = await registerEnvironmentResources('.local');
    const profile = { routes: new Map([...environment.routes, ...campaign.routes]),
        selections: new Map([...environment.selections, ...campaign.selections]) };
    const records: any[] = [];
    await registerCampaignEnvironmentResources(profile); await registerCampaignEnvironmentAliases(profile, row => records.push(row));
    return { profile, records };
})();

test('decoded-source aliases retain complete donor pages and original target source identities', async () => {
    const { profile, records } = await registered;
    expect(ledger.families).toHaveLength(3); expect(ledger.copiedPngFiles).toBe(0);
    expect(ledger.replacedAcceptedPayloads).toBe(0);
    for (const item of ledger.families) {
        const contract = environmentHdContractForTheater(item.theater)!;
        const route = `/local-environment/${item.theater.toLowerCase()}/selection.json`;
        const selected = (profile.selections.get(route) as any).families[item.family];
        expect(selected.familyHash).toBe(item.familyHash);
        expect(records.some(row => row.type === 'campaign-environment-alias-ready' && row.identity === item.family)).toBe(true);
        for (const member of selected.members) {
            const descriptor = environmentMemberSource(contract, item.family, member.member)!;
            const raw = readFileSync(profile.routes.get(member.manifest)!); expect(sha256(raw)).toBe(member.sha256);
            const metadata = JSON.parse(raw.toString());
            expect(metadata.source.sha256).toBe(descriptor.sha256); expect(metadata.source.theater).toBe(item.theater);
            expect(metadata.logical.frames).toHaveLength(descriptor.bodyFrames);
            for (const variant of metadata.variants) for (const page of variant.pages) for (const role of ['base', 'data']) {
                const file = profile.routes.get(member.files[page[role]])!;
                expect(sha256(readFileSync(file))).toBe(page[role + 'Sha256']);
            }
        }
        for (const scope of item.campaignSources) {
            expect(environmentFamilyScopeIssue(contract.families[item.family], { campaign: { launch: {
                ...scope, sourceSha256: scope.sha256 } } })).toBeUndefined();
            expect(environmentFamilyScopeIssue(contract.families[item.family], { campaign: { launch: {
                ...scope, edition: 'ra2', sourceSha256: scope.sha256 } } })).toBeDefined();
        }
    }
}, 60000);

for (const item of ledger.families) for (const density of [2, 4] as const)
test(`${item.theater}/${item.id} binds its complete source states and releases at ${density}X`, async () => {
    const { profile } = await registered, contract = environmentHdContractForTheater(item.theater)!;
    const selected = (profile.selections.get(`/local-environment/${item.theater.toLowerCase()}/selection.json`) as any).families[item.family];
    const entries = selected.members.map((member: any) => {
        const descriptor = environmentMemberSource(contract, item.family, member.member)!;
        const { source } = nativeShpSource('yr', member.member, descriptor.sha256, descriptor.bodyFrames, item.theater);
        return { image: { filename: member.member }, source, manifestHash: member.sha256,
            manifest: JSON.parse(readFileSync(profile.routes.get(member.manifest)!, 'utf8')),
            read: async (name: string, hash: string, size: number) => {
                const bytes = readFileSync(profile.routes.get(member.files[name])!);
                expect(sha256(bytes)).toBe(hash); expect(bytes.length).toBe(size);
                const png = PNG.sync.read(bytes);
                return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
            } };
    });
    let uploads = 0, releases = 0;
    const cap = (density === 2 ? 512 : 1536) * 1024 * 1024;
    const loaded = await resolveEnvironmentFamily(item.family, entries, density, cap, 8192, textures => {
        uploads += textures.length; textures.forEach(texture => texture.addEventListener('dispose', () => releases++));
    });
    expect(loaded.attempts).toEqual([]); expect(loaded.overrides.size).toBe(entries.length); expect(loaded.density).toBe(density);
    expect(loaded.loadingPeakBytes).toBeLessThanOrEqual(cap);
    loaded.overrides.forEach(disposeHdSprite); expect(releases).toBe(uploads);
    const broken = entries.map((entry: any, index: number) => index ? entry
        : { ...entry, read: async () => { throw Error('Missing reused source page'); } });
    const fallback = await resolveEnvironmentFamily(item.family, broken, density, cap, 8192,
        () => { throw Error('An incomplete alias cannot upload'); });
    expect(fallback.overrides.size).toBe(0); expect(fallback.worldChargeBytes).toBe(0);
});
