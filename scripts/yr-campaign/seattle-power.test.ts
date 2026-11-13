import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import receipt from '../../docs/campaign-art/yr-v1/seattle-power-plant-registration-r2.json';
import bindings from '../../docs/campaign-art/yr-v1/seattle-power-plant-bindings.json';
import { validateCampaignResources, registerCampaignEnvironmentResources } from '../../desktop/campaign-profile.mjs';
import { registerEnvironmentResources } from '../../desktop/environment-profile.mjs';
import { CampaignMapFile } from '../../src/data/campaign/CampaignMapFile';
import { IniFile } from '../../src/data/IniFile';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { Rules } from '../../src/game/rules/Rules';
import { Art } from '../../src/game/art/Art';
import { ObjectType } from '../../src/engine/type/ObjectType';
import { ImageFinder } from '../../src/engine/ImageFinder';
import { adaptRetailRules } from '../../src/offline/retailCompatibility';
import { environmentHdContractForTheater, environmentMemberSource, environmentFamilyScopeIssue }
    from '../../src/engine/renderable/builder/environmentHdContract';
import { resolveEnvironmentFamily } from '../../src/engine/renderable/builder/EnvironmentHd';
import { disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import { nativeShpSource, retailIni, retailMember, sha256 } from '../test-support/resources';

const registered = (async () => {
    const campaign = await validateCampaignResources('.local/campaign');
    const environment = await registerEnvironmentResources('.local');
    const profile = { routes: new Map([...environment.routes, ...campaign.routes]),
        selections: new Map([...environment.selections, ...campaign.selections]) };
    const records: any[] = [];
    await registerCampaignEnvironmentResources(profile, row => records.push(row));
    const contract = environmentHdContractForTheater('NEWURBAN')!;
    const selected = (profile.selections.get('/local-environment/newurban/selection.json') as any).families[receipt.family];
    const entries = selected.members.map((member: any) => {
        const descriptor = environmentMemberSource(contract, receipt.family, member.member)!;
        const { source } = nativeShpSource('yr', member.member, descriptor.sha256, descriptor.bodyFrames, 'NEWURBAN');
        const bytes = readFileSync(profile.routes.get(member.manifest)!);
        expect(sha256(bytes)).toBe(member.sha256);
        return { image: { filename: member.member }, source, manifest: JSON.parse(bytes.toString()), manifestHash: member.sha256,
            read: async (filename: string, hash: string, size: number) => {
                const bytes = readFileSync(profile.routes.get(member.files[filename])!);
                expect(sha256(bytes)).toBe(hash); expect(bytes.length).toBe(size);
                const png = PNG.sync.read(bytes);
                return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
            } };
    });
    return { profile, contract, selected, entries, records };
})();

test('24 original Seattle plant aliases resolve the same complete source artwork only in their three original YR maps', async () => {
    const { profile, contract, entries } = await registered;
    expect(bindings.identities).toHaveLength(24); expect(entries).toHaveLength(2);
    expect(entries.map((entry: any) => entry.source.frames.length)).toEqual([30, 4]);
    expect(receipt.acceptedPayloadsReplaced).toBe(0);
    const family = contract.families[receipt.family];
    expect(family.familyHash).toBe(bindings.familyHash);
    expect(family.identities).toEqual(bindings.identities);
    for (const scope of bindings.campaignSources) {
        const bytes = readFileSync(profile.routes.get(`/local-campaign/yr/${scope.mission.slice(0, -4)}/${scope.mission}`)!);
        expect(sha256(bytes)).toBe(scope.sha256);
        const map = new CampaignMapFile(VirtualFile.fromBytes(bytes, scope.mission),
            { semanticsVersion: 45, sourceSha256: scope.sha256 });
        const rules = new Rules(adaptRetailRules(retailIni('yr')).rules.mergeWith(map));
        const art = new Art(rules, retailIni('yr', 'art').mergeWith(map.artOverrides ?? new IniFile()), map, undefined);
        const finder = new ImageFinder({ has: (name: string) => {
            try { return !!retailMember('yr', name); } catch { return false; }
        } } as any, { settings: { extension: '.ubn', newTheaterChar: 'N', type: 32 } } as any);
        for (const row of bindings.bindings.filter(row => row.missions.includes(scope.mission))) {
            expect(contract.identities.yr[row.identity]).toBe(receipt.family);
            const original = art.getObject(row.identity, ObjectType.Building);
            const member = finder.getFilename(original.imageName, original.useTheaterExtension);
            expect(member).toBe('cnpowr.shp');
            expect(retailMember('yr', member).sha256).toBe(entries[1].source.sha256);
            expect(original.art.getString('ActiveAnim')).toBe('CAPOWR_A');
        }
        expect(environmentFamilyScopeIssue(family, { campaign: { launch: {
            edition: 'yr', mission: scope.mission, sourceSha256: scope.sha256 } } })).toBeUndefined();
        expect(environmentFamilyScopeIssue(family, { campaign: { launch: {
            edition: 'ra2', mission: scope.mission, sourceSha256: scope.sha256 } } })).toBeDefined();
    }
    for (const entry of entries) expect(entry.manifest.logical.frames).toEqual(entry.source.frames);
}, 60000);

for (const density of [2, 4] as const) test(`the complete plant and active poses publish, fall back atomically and release at ${density}X`, async () => {
    const { entries } = await registered;
    const cap = (density === 2 ? 512 : 1536) * 1024 * 1024;
    let uploaded = 0, released = 0;
    const result = await resolveEnvironmentFamily(receipt.family, entries, density, cap, 8192, textures => {
        uploaded += textures.length; textures.forEach(texture => texture.addEventListener('dispose', () => released++));
    });
    expect(result.attempts).toEqual([]); expect(result.overrides.size).toBe(2); expect(result.density).toBe(density);
    expect(result.loadingPeakBytes).toBeLessThanOrEqual(cap); expect(result.worldChargeBytes).toBeGreaterThan(0);
    result.overrides.forEach(disposeHdSprite); expect(released).toBe(uploaded);
    const broken = entries.map((entry: any, index: number) => index ? entry
        : { ...entry, read: async () => { throw Error('Missing active animation page'); } });
    const fallback = await resolveEnvironmentFamily(receipt.family, broken, density, cap, 8192,
        () => { throw Error('An incomplete plant family must not upload'); });
    expect(fallback.overrides.size).toBe(0); expect(fallback.worldChargeBytes).toBe(0);
});
