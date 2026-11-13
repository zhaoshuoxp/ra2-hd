import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import receipt from '../../docs/campaign-art/yr-v1/transylvania-castle-collapse-registration.json';
import { validateCampaignResources, registerCampaignEnvironmentResources } from '../../desktop/campaign-profile.mjs';
import { registerEnvironmentResources } from '../../desktop/environment-profile.mjs';
import { environmentHdContractForTheater, environmentMemberSource, environmentFamilyScopeIssue }
    from '../../src/engine/renderable/builder/environmentHdContract';
import { resolveEnvironmentFamily } from '../../src/engine/renderable/builder/EnvironmentHd';
import { disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import { hdAtlasPageLimit } from '../../src/engine/renderable/builder/hdAtlasPageLimit';
import { nativeShpSource, sha256 } from '../test-support/resources';

const registered = (async () => {
    const campaign = await validateCampaignResources('.local/campaign');
    const environment = await registerEnvironmentResources('.local');
    const profile = { routes: new Map([...environment.routes, ...campaign.routes]),
        selections: new Map([...environment.selections, ...campaign.selections]) };
    await registerCampaignEnvironmentResources(profile);
    const contract = environmentHdContractForTheater('TEMPERATE')!;
    const family = contract.identities.yr.CATR03DM;
    const selected = (profile.selections.get('/local-environment/selection.json') as any).families[family];
    const member = selected.members[0], descriptor = environmentMemberSource(contract, family, member.member)!;
    const { source } = nativeShpSource('yr', member.member, descriptor.sha256, descriptor.bodyFrames, 'TEMPERATE');
    const metadata = readFileSync(profile.routes.get(member.manifest)!);
    expect(sha256(metadata)).toBe(member.sha256);
    const entry = { image: { filename: member.member }, source, manifest: JSON.parse(metadata.toString()), manifestHash: member.sha256,
        read: async (filename: string, hash: string, bytes: number) => {
            const payload = readFileSync(profile.routes.get(member.files[filename])!);
            expect(sha256(payload)).toBe(hash); expect(payload.length).toBe(bytes);
            const png = PNG.sync.read(payload);
            return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
        } };
    return { entry, contract, family, selected, descriptor };
})();

test('the original complete collapse keeps source geometry, native shadows and a source-bounded 4X page admission', async () => {
    const { entry, contract, family, descriptor } = await registered;
    expect(descriptor.totalFrames).toBe(174); expect(descriptor.bodyFrames).toBe(87);
    expect(descriptor.hasShadow).toBe(true); expect(descriptor.remapable).toBe(false);
    expect(entry.manifest.logical.frames).toEqual(entry.source.frames);
    expect(entry.manifest.variants.map((variant: any) => variant.pages.length)).toEqual([4, 17]);
    expect(hdAtlasPageLimit(entry.source, 4, true, true)).toBe(17);
    for (const change of [{ sha256: '0'.repeat(64) }, { theater: 'SNOW' }, { canvas: [260, 240] },
        { frames: entry.source.frames.slice(0, 86) }, { member: 'other.shp' }])
        expect(hdAtlasPageLimit({ ...entry.source, ...change }, 4, true, true)).toBe(8);
    expect(hdAtlasPageLimit(entry.source, 4, false, true)).toBe(8);
    expect(environmentFamilyScopeIssue(contract.families[family], { campaign: { launch: {
        edition: 'yr', mission: receipt.mission.mission, sourceSha256: receipt.mission.sha256 } } })).toBeUndefined();
    expect(environmentFamilyScopeIssue(contract.families[family], { campaign: { launch: {
        edition: 'ra2', mission: receipt.mission.mission, sourceSha256: receipt.mission.sha256 } } })).toBeDefined();
});

for (const density of [2, 4] as const) test(`all 87 collapse states publish and release within the unchanged ${density}X world cap`, async () => {
    const { entry, family } = await registered;
    const cap = (density === 2 ? 512 : 1536) * 1024 * 1024;
    let uploads = 0, released = 0;
    const complete = await resolveEnvironmentFamily(family, [entry], density, cap, 8192, textures => {
        uploads += textures.length;
        textures.forEach(texture => texture.addEventListener('dispose', () => released++));
    });
    expect(complete.attempts).toEqual([]); expect(complete.overrides.size).toBe(1);
    expect(complete.density).toBe(density); expect(complete.loadingPeakBytes).toBeLessThanOrEqual(cap);
    expect(complete.worldChargeBytes).toBeGreaterThan(0);
    expect([...complete.overrides.values()][0].frames.length).toBe(87);
    complete.overrides.forEach(disposeHdSprite); expect(released).toBe(uploads);
    const broken = { ...entry, read: async () => { throw Error('Missing collapse page'); } };
    const fallback = await resolveEnvironmentFamily(family, [broken], density, cap, 8192,
        () => { throw Error('An incomplete family cannot upload'); });
    expect(fallback.overrides.size).toBe(0); expect(fallback.gpuBytes).toBe(0);
    expect(fallback.worldChargeBytes).toBe(0);
}, 120000);
