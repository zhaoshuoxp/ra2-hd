import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import ledger from '../../docs/campaign-art/yr-v1/scenery.json';
import overlays from '../../docs/campaign-art/yr-v1/task-overlays.json';
import { validateCampaignResources, registerCampaignEnvironmentResources } from '../../desktop/campaign-profile.mjs';
import { registerEnvironmentResources } from '../../desktop/environment-profile.mjs';
import { registerCampaignEnvironmentAliases } from '../../desktop/campaign-environment-aliases.mjs';
import { environmentHdContractForTheater, environmentMemberSource, environmentFamilyScopeIssue }
    from '../../src/engine/renderable/builder/environmentHdContract';
import { resolveEnvironmentFamily } from '../../src/engine/renderable/builder/EnvironmentHd';
import { disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import { nativeShpSource, retailMember, sha256 } from '../test-support/resources';

const registered = (async () => {
    const environment = await registerEnvironmentResources('.local');
    const campaign = await validateCampaignResources('.local/campaign');
    const profile = { routes: new Map([...environment.routes, ...campaign.routes]),
        selections: new Map([...environment.selections, ...campaign.selections]) };
    await registerCampaignEnvironmentResources(profile); await registerCampaignEnvironmentAliases(profile);
    return profile;
})();

const families = [...ledger.families.map(item => ({ ...item, kind: 'terrain' })),
    ...overlays.families.map(item => ({ ...item, kind: 'overlay' }))];
for (const item of families) test(`${item.theater}/${item.identity} retains original scenery geometry, fixed material and complete independent densities`, async () => {
    const profile = await registered, contract = environmentHdContractForTheater(item.theater)!;
    const family = contract.families[item.family];
    expect(family.kinds).toEqual([item.kind]); expect(family.editions).toEqual(['yr']);
    if (item.kind === 'overlay') {
        expect(item.theater).toBe('NEWURBAN');
        expect(['TROCK03', 'SROCK05']).toContain(item.identity);
    }
    const suffix = item.theater === 'TEMPERATE' ? '' : '/' + item.theater.toLowerCase();
    const selection = (profile.selections.get(`/local-environment${suffix}/selection.json`) as any).families[item.family];
    expect(selection.familyHash).toBe(family.familyHash); expect(selection.members).toHaveLength(1);
    const selected = selection.members[0], descriptor = environmentMemberSource(contract, item.family, selected.member)!;
    expect(descriptor.sha256).toBe(item.sourceSha256); expect(descriptor.hasShadow).toBe(true);
    expect(descriptor.bodyFrames).toBe(1); expect(descriptor.totalFrames).toBe(2); expect(descriptor.remapable).toBe(false);
    expect(retailMember('yr', descriptor.palette.member).sha256).toBe(descriptor.palette.sha256);
    const { source } = nativeShpSource('yr', selected.member, descriptor.sha256, 1, item.theater);
    const bytes = readFileSync(profile.routes.get(selected.manifest)!);
    expect(sha256(bytes)).toBe(selected.sha256);
    const manifest = JSON.parse(bytes.toString());
    expect(manifest.logical.canvas).toEqual(source.canvas); expect(manifest.logical.frames).toEqual(source.frames);
    expect(manifest.color.authoredScenery.declaration.sourceSha256).toBe(source.sha256);
    expect(manifest.color.authoredScenery.declaration.paletteSha256).toBe(descriptor.palette.sha256);
    expect(manifest.color.authoredScenery.inspection.independentDensityCapacity).toBeGreaterThanOrEqual(4);
    const entry = { image: { filename: selected.member }, source, manifest, manifestHash: selected.sha256,
        read: async (name: string, hash: string, size: number) => {
            const bytes = readFileSync(profile.routes.get(selected.files[name])!);
            expect(sha256(bytes)).toBe(hash); expect(bytes.length).toBe(size);
            const png = PNG.sync.read(bytes);
            return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
        } };
    for (const density of [2, 4] as const) {
        const cap = (density === 2 ? 512 : 1536) * 1024 ** 2;
        let uploaded = 0, released = 0;
        const bound = await resolveEnvironmentFamily(item.family, [entry], density, cap, 8192, textures => {
            uploaded += textures.length; textures.forEach(texture => texture.addEventListener('dispose', () => released++));
        });
        expect(bound.attempts).toEqual([]); expect(bound.density).toBe(density);
        expect(bound.overrides.size).toBe(1); expect(bound.loadingPeakBytes).toBeLessThanOrEqual(cap);
        for (const page of manifest.variants.find((variant: any) => variant.density === density).pages) {
            const data = PNG.sync.read(readFileSync(profile.routes.get(selected.files[page.data])!)).data;
            for (let offset = 0; offset < data.length; offset += 4) {
                if (data[offset] !== 0 || data[offset + 2] !== 0) throw Error('Original scenery has fixed visible material');
            }
        }
        bound.overrides.forEach(disposeHdSprite); expect(released).toBe(uploaded);
        const missing = await resolveEnvironmentFamily(item.family, [{ ...entry,
            read: async () => { throw Error('Missing scenery page'); } }], density, cap, 8192,
            () => { throw Error('Incomplete scenery cannot upload'); });
        expect(missing.overrides.size).toBe(0); expect(missing.worldChargeBytes).toBe(0);
    }
    for (const mission of family.sourceScope!.campaignSources!) {
        const launch = { ...mission, sourceSha256: mission.sha256 };
        expect(environmentFamilyScopeIssue(family, { campaign: { launch } })).toBeUndefined();
        expect(environmentFamilyScopeIssue(family, { campaign: { launch: { ...launch, edition: 'ra2' } } })).toBeDefined();
    }
}, 30000);
