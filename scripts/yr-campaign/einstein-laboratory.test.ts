import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { PNG } from 'pngjs';
import receipt from '../../docs/campaign-art/yr-v1/einstein-laboratory-registration.json';
import recipe from '../../docs/campaign-art/yr-v1/einstein-laboratory.json';
import { validateCampaignResources, registerCampaignEnvironmentResources } from '../../desktop/campaign-profile.mjs';
import { registerEnvironmentResources } from '../../desktop/environment-profile.mjs';
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
    await registerCampaignEnvironmentResources(profile);
    const contract = environmentHdContractForTheater('NEWURBAN')!;
    const selected = (profile.selections.get('/local-environment/newurban/selection.json') as any).families[receipt.family];
    const member = selected.members[0], descriptor = environmentMemberSource(contract, receipt.family, member.member)!;
    const { source } = nativeShpSource('yr', member.member, descriptor.sha256, descriptor.bodyFrames, 'NEWURBAN');
    const file = profile.routes.get(member.manifest)!, bytes = readFileSync(file);
    expect(sha256(bytes)).toBe(member.sha256);
    const entry = { image: { filename: member.member }, source, manifest: JSON.parse(bytes.toString()), manifestHash: member.sha256,
        read: async (filename: string, hash: string, size: number) => {
            const bytes = readFileSync(profile.routes.get(member.files[filename])!);
            expect(sha256(bytes)).toBe(hash); expect(bytes.length).toBe(size);
            const png = PNG.sync.read(bytes);
            return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
        } };
    return { profile, contract, entry };
})();

test('the original Allied01 laboratory preserves all six accepted body samples and its original target geometry', async () => {
    const { profile, contract, entry } = await registered;
    expect(entry.source.sha256).toBe(recipe.sourceSha256); expect(entry.source.frames).toHaveLength(4);
    expect(entry.manifest.logical.frames).toEqual(entry.source.frames);
    expect(receipt.sourceVerification.counts.preservedAcceptedDensityFrames).toBe(6);
    expect(receipt.acceptedPayloadsReplaced).toBe(0);
    const donor = recipe.acceptedNativeBodyFrames['cnlab.shp'];
    const route = [...profile.routes.keys()].find(route => route.endsWith('/' + basename(donor.manifestFile)))!;
    const raw = readFileSync(profile.routes.get(route)!); expect(sha256(raw)).toBe(donor.manifestSha256);
    const original = JSON.parse(raw.toString()), prefix = route.slice(0, route.lastIndexOf('/') + 1);
    const pixels = (image: PNG, rect: number[]) => {
        const [x, y, width, height] = rect, result = Buffer.alloc(width * height * 4);
        for (let row = 0; row < height; row++) image.data.copy(result, row * width * 4,
            ((y + row) * image.width + x) * 4, ((y + row) * image.width + x + width) * 4);
        return sha256(result);
    };
    for (const variant of entry.manifest.variants) {
        const prior = original.variants.find((item: any) => item.density === variant.density);
        for (const slot of [0, 1, 2]) {
            const frame = variant.frames[slot], before = prior.frames[slot];
            const page = variant.pages.find((page: any) => page.id === frame.page);
            const priorPage = prior.pages.find((page: any) => page.id === before.page);
            const selected = (profile.selections.get('/local-environment/newurban/selection.json') as any).families[receipt.family].members[0];
            for (const role of ['base', 'data']) {
                const actual = PNG.sync.read(readFileSync(profile.routes.get(selected.files[page[role]])!));
                const accepted = PNG.sync.read(readFileSync(profile.routes.get(prefix + priorPage[role])!));
                expect(pixels(actual, frame.sampleRect)).toBe(pixels(accepted, before.sampleRect));
            }
        }
    }
    const family = contract.families[receipt.family];
    expect(environmentFamilyScopeIssue(family, { campaign: { launch: {
        edition: 'yr', mission: receipt.mission.mission, sourceSha256: receipt.mission.sha256 } } })).toBeUndefined();
    expect(environmentFamilyScopeIssue(family, { campaign: { launch: {
        edition: 'ra2', mission: receipt.mission.mission, sourceSha256: receipt.mission.sha256 } } })).toBeDefined();
}, 60000);

for (const density of [2, 4] as const) test(`the complete source laboratory and new rubble bind, release and fall back at ${density}X`, async () => {
    const { entry } = await registered;
    const cap = (density === 2 ? 512 : 1536) * 1024 * 1024;
    let uploaded = 0, released = 0;
    const complete = await resolveEnvironmentFamily(receipt.family, [entry], density, cap, 8192, textures => {
        uploaded += textures.length; textures.forEach(texture => texture.addEventListener('dispose', () => released++));
    });
    expect(complete.attempts).toEqual([]); expect(complete.overrides.size).toBe(1); expect(complete.density).toBe(density);
    expect(complete.loadingPeakBytes).toBeLessThanOrEqual(cap);
    complete.overrides.forEach(disposeHdSprite); expect(released).toBe(uploaded);
    const broken = { ...entry, read: async () => { throw Error('Missing laboratory page'); } };
    const fallback = await resolveEnvironmentFamily(receipt.family, [broken], density, cap, 8192,
        () => { throw Error('An incomplete laboratory cannot upload'); });
    expect(fallback.overrides.size).toBe(0); expect(fallback.worldChargeBytes).toBe(0);
});
