import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { nativeShpSource, sha256 } from '../test-support/resources';
import { registerCampaignEnvironmentResources, validateCampaignResources } from '../../desktop/campaign-profile.mjs';
import { createHandler } from '../../desktop/protocol.mjs';
import { environmentFamilyScopeIssue, environmentHdContractForTheater } from '../../src/engine/renderable/builder/environmentHdContract';
import { resolveEnvironmentFamily } from '../../src/engine/renderable/builder/EnvironmentHd';
import { disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import type { PowerPlantHdEntry } from '../../src/engine/renderable/builder/resolvePowerPlantHd';

const directory = '.local/campaign/ra2/sov01t/';
const identity = 'campaign-sov01-memorial';
const contract = environmentHdContractForTheater('URBAN')!;
const family = contract.families[identity];
const json = (file: string) => JSON.parse(readFileSync(file, 'utf8'));

test('the memorial requires the pinned Soviet 01 source and cannot affect other maps or YR', () => {
    const sourceSha256 = json(directory + 'provenance.json').members.find((member: any) => member.name === 'sov01t.map').sha256;
    const launch = { edition: 'ra2', mission: 'sov01t.map', sourceSha256 };
    expect(environmentFamilyScopeIssue(family, { campaign: { launch } })).toBeUndefined();
    for (const context of [{}, { campaign: { launch: { ...launch, edition: 'yr' } } },
        { campaign: { launch: { ...launch, mission: 'sov02t.map' } } },
        { campaign: { launch: { ...launch, sourceSha256: 'a'.repeat(64) } } }]) {
        expect(environmentFamilyScopeIssue(family, context)).toBe('campaign-map-source-scope-mismatch');
    }
    for (const name of family.identities) {
        expect(contract.identities.ra2[name]).toBe(identity);
        expect(contract.identities.yr[name]).toBeUndefined();
    }
});

test('campaign extension registration is additive and rejects an incomplete flag family atomically', async () => {
    const registration = await validateCampaignResources('.local/campaign');
    const route = '/local-environment/urban/selection.json', baseline = { families: { existing: { retained: true } } };
    const profile = { root: '/unused-canonical-root', campaignRoot: registration.root,
        routes: new Map(registration.routes), selections: new Map([[route, baseline]]) };
    await registerCampaignEnvironmentResources(profile);
    const selected: any = profile.selections.get(route);
    expect(selected.families.existing).toBe(baseline.families.existing);
    expect(selected.families[identity].members.map((member: any) => member.member).sort()).toEqual(family.members);
    expect(baseline.families).toEqual({ existing: { retained: true } });
    for (const member of selected.families[identity].members) for (const page of Object.values(member.files) as string[]) {
        expect(page).toMatch(/^\/local-environment\/[a-f0-9]{64}\/[a-f0-9]{64}\/[24]\/p0\/(base|data)\.png$/);
        expect(profile.routes.has(page)).toBe(true);
        const handler = createHandler({ appRoot: registration.root, appFiles: new Set(), getProfile: () => profile, getError: () => '' });
        const response = await handler(new Request('ra2://game' + page));
        expect(response.status).toBe(200);
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(readFileSync(profile.routes.get(page)!)));
    }
    const missing = { routes: new Map(registration.routes), selections: new Map([[route, baseline]]) };
    const flag = selected.families[identity].members.find((member: any) => member.member === 'cuwa19_a.shp');
    const flagManifest = json(profile.routes.get(flag.manifest)!);
    const flagPage = flagManifest.variants.find((variant: any) => variant.density === 4).pages[0];
    missing.routes.delete('/local-campaign/ra2/sov01t/' + flagPage.base);
    const before = new Map(missing.routes), events: any[] = [];
    await registerCampaignEnvironmentResources(missing, (event: any) => events.push(event));
    const fallback: any = missing.selections.get(route);
    expect(fallback.families.existing).toBe(baseline.families.existing);
    expect(fallback.families[identity]).toBeUndefined();
    for (const [name, value] of Object.entries(selected.families)) {
        if (name !== identity) expect(fallback.families[name]).toEqual(value);
    }
    for (const [url, filename] of before) expect(missing.routes.get(url)).toBe(filename);
    const failedPrefix = '/local-environment/' + selected.families[identity].familyHash + '/';
    expect([...missing.routes.keys()].filter(url => !before.has(url) && url.startsWith(failedPrefix))).toEqual([]);
    expect(events.some(event => event.type === 'campaign-environment-original'
        && event.bundle === '/local-campaign/ra2/sov01t/memorial-family.json')).toBe(true);
});

async function entries(): Promise<PowerPlantHdEntry[]> {
    const bundle = json(directory + 'memorial-family.json');
    return bundle.members.map((member: any) => {
        const native = contract.sources[member.member];
        const bytes = readFileSync(directory + member.manifest), manifest = JSON.parse(bytes.toString());
        expect(sha256(bytes)).toBe(member.sha256);
        return { ...nativeShpSource('ra2', member.member, native.sha256, native.bodyFrames, 'URBAN'),
            manifest, manifestHash: member.sha256,
            read: async (filename: string, hash: string, length: number) => {
                const bytes = readFileSync(directory + filename);
                expect([bytes.length, sha256(bytes)]).toEqual([length, hash]);
                const png = PNG.sync.read(bytes);
                return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
            } };
    });
}

test('both HD densities preserve all four statue states and 48 flag slots, with bounded whole-family admission', async () => {
    const inputs = await entries();
    expect(inputs.map(entry => entry.source.frames.length).sort((a, b) => a-b)).toEqual([4, 48]);
    for (const density of [2, 4] as const) {
        const result = await resolveEnvironmentFamily(identity, inputs, density, 64 * 1024 * 1024, 2048, () => {});
        expect(result.attempts).toEqual([]); expect(result.overrides.size).toBe(2);
        expect(result.loadingPeakBytes).toBeLessThanOrEqual(64 * 1024 * 1024);
        for (const entry of inputs) expect(result.overrides.get(entry.image)!.frames.length).toBe(entry.source.frames.length);
        result.overrides.forEach(disposeHdSprite);
    }
    for (const changed of [inputs.slice(0, 1), inputs.map((entry, i) => i ? { ...entry,
        read: async () => { throw new Error('missing flag page'); } } : entry)]) {
        let uploads = 0;
        const result = await resolveEnvironmentFamily(identity, changed, 4, 64 * 1024 * 1024, 2048, () => { uploads++; });
        expect(result.overrides.size).toBe(0); expect(result.worldChargeBytes).toBe(0); expect(uploads).toBe(0);
    }
});
