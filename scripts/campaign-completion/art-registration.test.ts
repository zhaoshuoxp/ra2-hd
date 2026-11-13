import { expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { validateCampaignResources, registerCampaignEnvironmentResources } from '../../desktop/campaign-profile.mjs';
import { createHandler } from '../../desktop/protocol.mjs';
import { environmentFamilyScopeIssue } from '../../src/engine/renderable/builder/environmentHdContract';
import temperate from '../../desktop/environment-hd-contract.json';
import urban from '../../desktop/environment-urban-hd-contract.json';
import snow from '../../desktop/environment-snow-hd-contract.json';
import { resourceRoot, requiredBytes, retailMember, sha256 } from '../test-support/resources';
import { IniFile } from '../../src/data/IniFile';
import { MapFile } from '../../src/data/MapFile';
import { ShpFile } from '../../src/data/ShpFile';
import { parseMix } from '../../src/offline/retail';

const identity = 'campaign-sov06-camiam08', family = temperate.families[identity];
const json = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const prefix = '/local-campaign/ra2/sov06t/';
const sourceFor = (contract: any, family: any) => family.sourceOverrides?.[family.members[0]]
    ?? contract.sources[family.members[0]];

test('Urban low bridge registers all26 original frame1 dependencies with independent material and retained empty slots', async () => {
    const data = await profile(); await registerCampaignEnvironmentResources(data);
    const family = urban.families[urban.identities.ra2.LOBRDB01];
    expect(family.members).toHaveLength(26); expect(family.kinds).toEqual(['overlay']);
    const selected = data.selections.get('/local-environment/urban/selection.json').families[urban.identities.ra2.LOBRDB01];
    expect(selected.members).toHaveLength(26);
    for (const [index, member] of selected.members.entries()) {
        const name = `LOBRDB${String(index + 1).padStart(2, '0')}`;
        expect(urban.identities.ra2[name]).toBe(urban.identities.ra2.LOBRDB01);
        const source = urban.sources[member.member];
        expect(source.remapable).toBe(false); expect(source.bodyFrames).toBe(3);
        const original = new ShpFile(retailMember('ra2', member.member, source.sha256).file);
        const hd = json(data.routes.get(member.manifest)!);
        expect(hd.color.bridgePlanarMaterial.sourceSha256).toBe(source.sha256);
        expect(hd.color.bridgePlanarMaterial.nativeFrame).toBe(1);
        expect(hd.color.bridgePlanarMaterial.nativePoints).toHaveLength(4);
        expect(hd.color.bridgePlanarMaterial.masterPoints).toHaveLength(4);
        expect(hd.variants.map(variant => variant.density)).toEqual([2, 4]);
        expect(hd.logical.frames.map(frame => frame.empty)).toEqual([true, false, true]);
        expect(hd.logical.frames[1].trimOrigin).toEqual([original.images[1].x, original.images[1].y]);
        expect(hd.logical.frames[1].trimSize).toEqual([original.images[1].width, original.images[1].height]);
        for (const variant of hd.variants) {
            expect(variant.frames[1].sampleRect.slice(2)).toEqual(hd.logical.frames[1].legacyRenderSize.map(size => size * variant.density));
            for (const page of variant.pages) {
                const bytes = fs.readFileSync(data.routes.get(member.files[page.data])!);
                const pixels = PNG.sync.read(bytes);
                expect(pixels.data.every((value, index) => index % 4 === 3 ? value === 255 : value === 0)).toBe(true);
            }
        }
    }
});

test('one missing4X bridge page rejects the complete26-member family and preserves accepted neighboring resources', async () => {
    const data = await profile(), prefix = '/local-campaign/ra2/all08u/';
    const route = [...data.routes.keys()].find(route => route.startsWith(prefix + 'environment-family-')
        && json(data.routes.get(route)!).identity === urban.identities.ra2.LOBRDB01)!;
    const bundle = json(data.routes.get(route)!);
    const member = bundle.members[12], metadata = json(data.routes.get(prefix + member.manifest)!);
    const page = metadata.variants.find(variant => variant.density === 4).pages[0];
    data.routes.delete(prefix + page.base);
    await registerCampaignEnvironmentResources(data);
    const selected = data.selections.get('/local-environment/urban/selection.json').families;
    expect(selected[urban.identities.ra2.LOBRDB01]).toBeUndefined();
    expect(selected[urban.identities.ra2.CASTL04]).toBeDefined();
    const family = urban.families[urban.identities.ra2.LOBRDB01];
    const currentAliases = bundle.members.map(member => `/local-environment/${family.familyHash}/${member.sha256}/`);
    expect([...data.routes.keys()].some(route => currentAliases.some(prefix => route.startsWith(prefix)))).toBe(false);
});

test.each([['MAYAN', temperate, 'ctmex01.shp', false, '/local-environment/selection.json'],
    ['CALAB', snow, 'calab.shp', true, '/local-environment/snow/selection.json']] as const)(
    '%s retains source building states/house palette and its original rubble-use flag', async (identity, contract, name, used, selection) => {
        const data = await profile(); await registerCampaignEnvironmentResources(data);
        const family = contract.families[contract.identities.ra2[identity]], source = sourceFor(contract, family);
        expect(source.remapable).toBe(true); expect(source.hasShadow).toBe(true);
        expect(source.framePalettes['3'].runtimeUsed).toBe(used);
        expect(source.framePalettes['3'].remapable).toBe(false);
        const original = new ShpFile(retailMember('ra2', name, source.sha256).file);
        const member = data.selections.get(selection).families[contract.identities.ra2[identity]].members[0];
        const hd = json(data.routes.get(member.manifest)!);
        for (let slot = 0; slot < 4; slot++) {
            expect(hd.logical.frames[slot].trimOrigin).toEqual([original.images[slot].x, original.images[slot].y]);
            expect(hd.logical.frames[slot].trimSize).toEqual([original.images[slot].width, original.images[slot].height]);
        }
        for (const variant of hd.variants) {
            const frame = variant.frames[3], page = variant.pages.find(page => page.id === frame.page);
            const pixels = PNG.sync.read(fs.readFileSync(data.routes.get(member.files[page.data])!));
            const [x, y, width, height] = frame.contentRect;
            let ownerPixels = 0;
            for (let row = y; row < y + height; row++) for (let column = x; column < x + width; column++)
                if (pixels.data[(row * pixels.width + column) * 4]) ownerPixels++;
            expect(ownerPixels).toBe(0);
        }
    });

test('current campaign building ownership masks retain original source ramps while preserving global accepted descriptors', async () => {
    const data = await profile(); await registerCampaignEnvironmentResources(data);
    const { registerEnvironmentResources } = await import('../../desktop/environment-profile.mjs');
    const { registerCampaignEnvironmentAliases } = await import('../../desktop/campaign-environment-aliases.mjs');
    const environment = await registerEnvironmentResources(resourceRoot);
    const complete = { routes: new Map([...environment.routes, ...data.routes]),
        selections: new Map([...environment.selections]) };
    await registerCampaignEnvironmentResources(complete); await registerCampaignEnvironmentAliases(complete);
    for (const [contract, theater, identities] of [[urban, 'urban', ['CACHIG05', 'CASTL04']],
        [snow, 'snow', ['CARUS03', 'CARUFGL', 'CAUSFGL', 'CAGEFGL']]] as const) {
        for (const identity of identities) {
            const family = contract.families[contract.identities.ra2[identity]], source = sourceFor(contract, family);
            const member = family.members.find(name => !name.endsWith('_a.shp'))!;
            expect(source.remapable).toBe(true); expect(contract.sources[member].remapable).toBe(false);
            const original = new ShpFile(retailMember('ra2', member, source.sha256).file);
            const selected = complete.selections.get(`/local-environment/${theater}/selection.json`)
                .families[contract.identities.ra2[identity]].members.find(part => part.member === member);
            const hd = json(complete.routes.get(selected.manifest)!);
            for (const frame of hd.variants[0].frames) {
                if (source.framePalettes?.[frame.nativeFrame]?.role === 'rubble') continue;
                const owner = original.images[frame.nativeFrame].imageData.filter(index => index >= 16 && index < 32);
                if (!owner.length) continue;
                const page = hd.variants[0].pages.find(page => page.id === frame.page);
                const pixels = PNG.sync.read(fs.readFileSync(complete.routes.get(selected.files[page.data])!));
                const [x, y, width, height] = frame.contentRect;
                expect(Array.from({ length: height }, (_, row) => pixels.data.subarray(
                    ((y + row) * pixels.width + x) * 4, ((y + row) * pixels.width + x + width) * 4))
                    .some(row => row.some((value, channel) => channel % 4 === 0 && value > 0))).toBe(true);
            }
        }
    }
});

async function profile() {
    const campaign = await validateCampaignResources(path.join(resourceRoot, 'campaign'));
    return { root: '/unused-base-root', campaignRoot: campaign.root, routes: new Map(campaign.routes),
        selections: new Map<string, any>([['/local-environment/selection.json', { families: { retained: { value: true } } }],
            ['/local-environment/urban/selection.json', { families: {} }],
            ['/local-environment/snow/selection.json', { families: {} }]]) };
}

test('original Snow lamp names register both complete densities with native shadows and fixed ownership', async () => {
    const data = await profile(), events: any[] = [];
    await registerCampaignEnvironmentResources(data, (event: any) => events.push(event));
    for (const name of ['LT_GEN01', 'LT_GEN04']) {
        const family = snow.families[snow.identities.ra2[name]], source = sourceFor(snow, family);
        expect(family.kinds).toEqual(['terrain']); expect(source.remapable).toBe(false);
        expect(source.hasShadow).toBe(true); expect(source.totalFrames).toBe(2);
        const original = new ShpFile(retailMember('ra2', family.members[0], source.sha256).file);
        retailMember('ra2', source.palette.member, source.palette.sha256);
        const selected = data.selections.get('/local-environment/snow/selection.json').families[snow.identities.ra2[name]];
        expect(selected.members).toHaveLength(1);
        const member = selected.members[0]; expect(member.manifest).toContain(name.toLowerCase());
        const metadata = json(data.routes.get(member.manifest)!);
        expect(metadata.logical.frames).toHaveLength(1);
        expect(metadata.logical.frames[0].trimOrigin).toEqual([original.images[0].x, original.images[0].y]);
        expect(metadata.logical.frames[0].trimSize).toEqual([original.images[0].width, original.images[0].height]);
        expect(metadata.color.authoredTerrainRegistration.geometryProof.alphaAuthority)
            .toBe('APPROVED_FULL_RESOLUTION_MASTER_NOT_INDEXED_MASK');
        expect(metadata.variants.map((variant: any) => variant.density)).toEqual([2, 4]);
        for (const variant of metadata.variants) for (const page of variant.pages) {
            const bytes = fs.readFileSync(data.routes.get(member.files[page.data])!);
            expect(sha256(bytes)).toBe(page.dataSha256);
            const pixels = PNG.sync.read(bytes);
            expect(pixels.data.every((value, index) => index % 4 === 3 ? value === 255 : value === 0)).toBe(true);
            const base = PNG.sync.read(fs.readFileSync(data.routes.get(member.files[page.base])!));
            const [left, top, width] = variant.frames[0].contentRect;
            const widths = [8, 10, 17, 23, 27].map(row => {
                let coverage = 0;
                for (let x = left; x < left + width; x++) coverage += base.data[((top + row * variant.density) * base.width + x) * 4 + 3] / 255;
                return coverage;
            });
            // Authored edge sampling may vary by0.05 logical pixels; a native
            // one-pixel shaft-width step must not survive in either density.
            expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(.05 * variant.density);
        }
        expect(events.some(event => event.type === 'campaign-environment-registered'
            && event.identity === snow.identities.ra2[name])).toBe(true);
    }
});

test('an incomplete lamp or invalid metadata path rejects that entire family without affecting its neighbor', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ra2-lamp-route-'));
    try {
        for (const failure of ['missing-page', '../invalid.json', '/absolute.json', 'nested/file.json', 'extra.json.json']) {
            const data = await profile(), events: any[] = [], prefix = '/local-campaign/ra2/sov07s/';
            const bundleRoute = [...data.routes.keys()].find(route => route.startsWith(prefix + 'environment-family-')
                && json(data.routes.get(route)!).identity === snow.identities.ra2.LT_GEN01)!;
            const bundle = json(data.routes.get(bundleRoute)!);
            if (failure === 'missing-page') {
                const metadata = json(data.routes.get(prefix + bundle.members[0].manifest)!);
                data.routes.delete(prefix + metadata.variants.find((variant: any) => variant.density === 4).pages[0].base);
            } else {
                bundle.members[0].manifest = failure;
                const file = path.join(directory, 'invalid-bundle.json');
                fs.writeFileSync(file, JSON.stringify(bundle)); data.routes.set(bundleRoute, file);
            }
            await registerCampaignEnvironmentResources(data, (event: any) => events.push(event));
            const selected = data.selections.get('/local-environment/snow/selection.json').families;
            expect(selected[snow.identities.ra2.LT_GEN01]).toBeUndefined();
            expect(selected[snow.identities.ra2.LT_GEN04]).toBeDefined();
            const family = snow.families[snow.identities.ra2.LT_GEN01];
            expect([...data.routes.keys()].some(route => route.startsWith('/local-environment/' + family.familyHash
                + '/' + bundle.members[0].sha256 + '/'))).toBe(false);
            expect(events.some(event => event.type === 'campaign-environment-original' && event.bundle === bundleRoute)).toBe(true);
        }
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('approved shoreline rocks use their original overlay class and resolve both independent densities without duplicate bundles', async () => {
    const rules = new IniFile(retailMember('ra2', 'rules.ini').file.readAsString());
    const original = parseMix(requiredBytes('assets/ra2/maps01.mix')).openFile('all01t.map');
    expect(sha256(original.getBytes())).toBe('ad64c9293a8bccb85c38f5871a974ed9c09b8b5da11bb346e990423bf625c79c');
    const map = new MapFile(); IniFile.prototype.fromString.call(map, original.readAsString());
    const [x, y, width, height] = map.getSection('Map')!.getNumberArray('Size');
    map.fullSize = { x, y, width, height }; map.readOverlays(); rules.mergeWith(map);
    // Rules assign consecutive IDs after removing duplicate type values.
    // Numeric INI keys are not the engine's overlay IDs.
    const typeNames = [...new Set([...rules.getSection('OverlayTypes')!.entries]
        .filter(([key, value]) => !Number.isNaN(Number(key)) && typeof value === 'string').map(([, value]) => value))];
    const placements = map.overlays.filter(overlay => ['SROCK02', 'SROCK03', 'SROCK04'].includes(typeNames[overlay.id]))
        .map(overlay => [typeNames[overlay.id], overlay.rx, overlay.ry]).sort();
    expect(placements).toEqual([['SROCK02', 74, 89], ['SROCK03', 77, 90], ['SROCK04', 48, 92], ['SROCK04', 74, 88]]);
    const overlays = [...rules.getSection('OverlayTypes')!.entries.values()];
    const terrains = [...rules.getSection('TerrainTypes')!.entries.values()];
    const data = await profile(), events: any[] = [];
    await registerCampaignEnvironmentResources(data, (event: any) => events.push(event));
    const selected = data.selections.get('/local-environment/urban/selection.json');
    for (const name of ['SROCK02', 'SROCK03', 'SROCK04']) {
        expect(overlays).toContain(name); expect(terrains).not.toContain(name);
        const family = urban.families[urban.identities.ra2[name]];
        expect(family.kinds).toEqual(['overlay']);
        const member = selected.families[urban.identities.ra2[name]].members[0];
        const metadata = json(data.routes.get(member.manifest)!);
        const source = urban.sources[family.members[0]];
        retailMember('ra2', family.members[0], source.sha256);
        retailMember('ra2', source.palette.member, source.palette.sha256);
        expect(metadata.source.sha256).toBe(source.sha256);
        expect(metadata.color.sourcePinnedStructuralCoverage.kind).toBe('overlay');
        expect(metadata.variants.map((variant: any) => variant.density)).toEqual([2, 4]);
        expect(metadata.logical.frames).toHaveLength(1);
        for (const variant of metadata.variants) for (const page of variant.pages) for (const role of ['base', 'data']) {
            const payload = fs.readFileSync(data.routes.get(member.files[page[role]])!);
            expect(sha256(payload)).toBe(page[role + 'Sha256']);
            expect(payload.length).toBe(page[role + 'Bytes']);
        }
        const bundles = [...data.routes.keys()].filter(route => route.startsWith('/local-campaign/ra2/all01t/environment-family-')
            && json(data.routes.get(route)!).identity === urban.identities.ra2[name]);
        expect(bundles).toHaveLength(1);
        expect(events.filter(event => event.type === 'campaign-environment-original' && event.bundle?.includes(name.toLowerCase()))).toEqual([]);
    }
});

test('new complete campaign scenery registers additively and uses the original protocol without cloning accepted packs', async () => {
    const data = await profile(), events: any[] = [], previous = data.selections.get('/local-environment/selection.json');
    await registerCampaignEnvironmentResources(data, (event: any) => events.push(event));
    expect(events.filter(event => event.type === 'campaign-environment-original')).toEqual([]);
    const selected = data.selections.get('/local-environment/selection.json');
    expect(selected.families.retained).toBe(previous.families.retained);
    expect(previous.families[identity]).toBeUndefined();
    const entry = selected.families[identity]; expect(entry.familyHash).toBe(family.familyHash);
    expect(entry.members.map((member: any) => member.member)).toEqual(['ctmiam08.shp']);
    expect(data.selections.get('/local-environment/urban/selection.json').families['campaign-sov01-memorial']).toBeDefined();
    const member = entry.members[0], hd = json(data.routes.get(member.manifest)!);
    expect(hd.logical.frames.length).toBe(4); expect(hd.variants.map((variant: any) => variant.density)).toEqual([2, 4]);
    const handler = createHandler({ appRoot: resourceRoot, appFiles: new Set(), getProfile: () => data, getError: () => '' });
    for (const variant of hd.variants) for (const page of variant.pages) for (const role of ['base', 'data']) {
        const route = member.files[page[role]], response = await handler(new Request('ra2://game' + route));
        expect(response.status).toBe(200); const bytes = new Uint8Array(await response.arrayBuffer());
        expect(bytes.byteLength).toBe(page[role + 'Bytes']); expect(sha256(bytes)).toBe(page[role + 'Sha256']);
    }
});

test('Chicago water tower retains complete source states, duplicate damage, owner policy and independent density routes', async () => {
    const data = await profile(); await registerCampaignEnvironmentResources(data);
    const family = urban.families[urban.identities.ra2.CACHIG06];
    expect(family.kinds).toEqual(['building']);
    const source = sourceFor(urban, family);
    retailMember('ra2', family.members[0], source.sha256);
    retailMember('ra2', source.palette.member, source.palette.sha256);
    expect(source.bodyFrames).toBe(4); expect(source.hasShadow).toBe(true);
    const entry = data.selections.get('/local-environment/urban/selection.json').families[urban.identities.ra2.CACHIG06];
    const member = entry.members[0], hd = json(data.routes.get(member.manifest)!);
    expect(hd.source.sha256).toBe(source.sha256); expect(hd.logical.frames).toHaveLength(4);
    expect(hd.variants.map((variant: any) => variant.density)).toEqual([2, 4]);
    for (const variant of hd.variants) {
        expect(variant.frames.map((frame: any) => frame.nativeFrame)).toEqual([0, 1, 2, 3]);
        expect(variant.frames[2].sharedWith).toBe(1);
        expect(variant.frames[2].sampleRect).toEqual(variant.frames[1].sampleRect);
        for (const page of variant.pages) for (const role of ['base', 'data']) {
            const payload = fs.readFileSync(data.routes.get(member.files[page[role]])!);
            expect(sha256(payload)).toBe(page[role + 'Sha256']); expect(payload.length).toBe(page[role + 'Bytes']);
        }
    }
});

test('lower Sears Tower admits only the original Allied04 source and resolves every complete density page', async () => {
    const data = await profile(); await registerCampaignEnvironmentResources(data);
    const family = urban.families[urban.identities.ra2.CACHIG05];
    expect(family.sourceScope.campaignSources).toEqual([{ mission: 'all04u.map',
        sha256: '09e52db16946a330c032e988679ef61ff7745670ddad5e9bfcf96f916d18d093' }]);
    expect(environmentFamilyScopeIssue(family, { campaign: { launch: { edition: 'ra2',
        mission: 'all04u.map', sourceSha256: family.sourceScope.campaignSources[0].sha256 } } })).toBeUndefined();
    expect(environmentFamilyScopeIssue(family, {})).toBeDefined();
    const source = sourceFor(urban, family);
    retailMember('ra2', family.members[0], source.sha256);
    retailMember('ra2', source.palette.member, source.palette.sha256);
    retailMember('ra2', source.framePalettes[3].member, source.framePalettes[3].sha256);
    const entry = data.selections.get('/local-environment/urban/selection.json').families[urban.identities.ra2.CACHIG05];
    const member = entry.members[0], hd = json(data.routes.get(member.manifest)!);
    expect(hd.source.sha256).toBe(source.sha256); expect(hd.logical.frames).toHaveLength(4);
    expect(hd.variants.map((variant: any) => variant.density)).toEqual([2, 4]);
    for (const variant of hd.variants) {
        expect(variant.frames.map((frame: any) => frame.nativeFrame)).toEqual([0, 1, 2, 3]);
        for (const page of variant.pages) for (const role of ['base', 'data']) {
            const payload = fs.readFileSync(data.routes.get(member.files[page[role]])!);
            expect(sha256(payload)).toBe(page[role + 'Sha256']); expect(payload.length).toBe(page[role + 'Bytes']);
        }
    }
});

test('the Snow chapel retains all source states and the exact normal-frame duplicate at both densities', async () => {
    const data = await profile(); await registerCampaignEnvironmentResources(data);
    const family = snow.families[snow.identities.ra2.CACOLO01], source = snow.sources[family.members[0]];
    retailMember('ra2', family.members[0], source.sha256);
    retailMember('ra2', source.palette.member, source.palette.sha256);
    retailMember('ra2', source.framePalettes[3].member, source.framePalettes[3].sha256);
    const entry = data.selections.get('/local-environment/snow/selection.json').families[snow.identities.ra2.CACOLO01];
    const member = entry.members[0], hd = json(data.routes.get(member.manifest)!);
    expect(hd.source.sha256).toBe(source.sha256); expect(hd.logical.frames).toHaveLength(4);
    expect(hd.variants.map((variant: any) => variant.density)).toEqual([2, 4]);
    for (const variant of hd.variants) {
        expect(variant.frames.map((frame: any) => frame.nativeFrame)).toEqual([0, 1, 2, 3]);
        expect(variant.frames[2].sharedWith).toBe(0);
        expect(variant.frames[2].sampleRect).toEqual(variant.frames[0].sampleRect);
        for (const page of variant.pages) for (const role of ['base', 'data']) {
            const payload = fs.readFileSync(data.routes.get(member.files[page[role]])!);
            expect(sha256(payload)).toBe(page[role + 'Sha256']); expect(payload.length).toBe(page[role + 'Bytes']);
        }
    }
});

test('the complete Snow Kremlin preserves all original states and admits only its Soviet11 and Allied12 sources', async () => {
    const data = await profile(); await registerCampaignEnvironmentResources(data);
    const family = snow.families[snow.identities.ra2.CARUS03], source = sourceFor(snow, family);
    expect(family.sourceScope.campaignSources.map(source => source.mission)).toEqual(['sov11s.map', 'all12s.map']);
    expect(environmentFamilyScopeIssue(family, {})).toBeDefined();
    for (const pair of family.sourceScope.campaignSources) {
        expect(environmentFamilyScopeIssue(family, { campaign: { launch: { edition: 'ra2',
            mission: pair.mission, sourceSha256: pair.sha256 } } })).toBeUndefined();
    }
    retailMember('ra2', family.members[0], source.sha256);
    retailMember('ra2', source.palette.member, source.palette.sha256);
    retailMember('ra2', source.framePalettes[3].member, source.framePalettes[3].sha256);
    const entry = data.selections.get('/local-environment/snow/selection.json').families[snow.identities.ra2.CARUS03];
    const member = entry.members[0], hd = json(data.routes.get(member.manifest)!);
    expect(hd.source.sha256).toBe(source.sha256); expect(hd.logical.frames).toHaveLength(4);
    for (const variant of hd.variants) {
        expect(variant.frames.map((frame: any) => frame.nativeFrame)).toEqual([0, 1, 2, 3]);
        for (const page of variant.pages) for (const role of ['base', 'data']) {
            const payload = fs.readFileSync(data.routes.get(member.files[page[role]])!);
            expect(sha256(payload)).toBe(page[role + 'Sha256']); expect(payload.length).toBe(page[role + 'Bytes']);
        }
    }
});

test('a missing or substituted 4X scenery page rejects its entire family while the accepted memorial still registers', async () => {
    const complete = await profile(); await registerCampaignEnvironmentResources(complete);
    const unaffected = { ...complete.selections.get('/local-environment/selection.json').families };
    delete unaffected[identity];
    for (const substitute of [false, true]) {
        const data = await profile(), before = data.selections.get('/local-environment/selection.json'), events: any[] = [];
        const bundle = json(data.routes.get(prefix + 'environment-family-camiam08-r1.json')!);
        const hd = json(data.routes.get(prefix + bundle.members[0].manifest)!);
        const page = hd.variants.find((variant: any) => variant.density === 4).pages[0];
        if (substitute) data.routes.set(prefix + page.base, data.routes.get(prefix + page.data)!);
        else data.routes.delete(prefix + page.base);
        await registerCampaignEnvironmentResources(data, (event: any) => events.push(event));
        const selection = data.selections.get('/local-environment/selection.json');
        expect(selection.families.retained).toBe(before.families.retained);
        expect(selection.families[identity]).toBeUndefined();
        expect(selection.families).toEqual(unaffected);
        expect([...data.routes.keys()].some(route => route.startsWith('/local-environment/' + family.familyHash + '/'))).toBe(false);
        expect(events.some(event => event.type === 'campaign-environment-original'
            && event.bundle.endsWith('environment-family-camiam08-r1.json'))).toBe(true);
        expect(data.selections.get('/local-environment/urban/selection.json').families['campaign-sov01-memorial']).toBeDefined();
    }
});

test('campaign scenery and civilian reuse require their explicit source pairs and retain old first-mission admissions', () => {
    for (const candidate of [family, urban.families['campaign-sov01-civ1'], urban.families['campaign-sov01-civ3'],
        urban.families['campaign-sov09-pres'], urban.families['campaign-sov09-ssrv'], urban.families['campaign-all03-castrt05'],
        snow.families['campaign-sov11-camsc11'], snow.families['campaign-sov11-carufgl'],
        ...['CAWASH09', 'CAMSC02', 'CAHSE02', 'CAHSE03', 'CAHSE04', 'CAPARK03', 'CAWA2A', 'CAWA2B', 'CACHIG03', 'CACHIG06', 'TRFF04']
            .map(identity => urban.families[urban.identities.ra2[identity]])]) {
        for (const source of candidate.sourceScope.campaignSources) {
            const launch = { edition: 'ra2', mission: source.mission, sourceSha256: source.sha256 };
            expect(environmentFamilyScopeIssue(candidate, { campaign: { launch } })).toBeUndefined();
            expect(environmentFamilyScopeIssue(candidate, { campaign: { launch: { ...launch, edition: 'yr' } } })).toBeDefined();
            expect(environmentFamilyScopeIssue(candidate, { campaign: { launch: { ...launch, sourceSha256: '0'.repeat(64) } } })).toBeDefined();
        }
        expect(environmentFamilyScopeIssue(candidate, {})).toBeDefined();
    }
    expect(urban.identities.ra2.CTECH).toBe(urban.identities.ra2.CIV3);
    expect(urban.families['campaign-sov01-civ3'].sourceScope.campaignSources.map(source => source.mission))
        .toEqual(['sov01t.map', 'sov08u.map', 'all03u.map', 'all06u.map', 'all08u.map']);
});

test('both new ship densities retain native loaded/empty bodies, exact accepted ASW identity and transparent ownership integrity', () => {
    const ship = temperate.vxl.CDEST;
    expect(ship.variants.map(variant => variant.density)).toEqual([2, 4]);
    for (const variant of ship.variants) {
        const file = path.join(resourceRoot, variant.path), bytes = fs.readFileSync(file); expect(sha256(bytes)).toBe(variant.hash);
        const hd = JSON.parse(bytes.toString()); expect(hd.density).toBe(variant.density);
        expect(hd.parts.map((part: any) => part.member)).toEqual(['cdest.vxl', 'cdestwo.vxl', 'asw.vxl']);
        for (const [member, hash] of Object.entries(hd.sources)) retailMember('ra2', member, hash as string);
        for (const part of hd.parts) {
            expect(part.frames.map((frame: any) => frame.heading)).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
            for (const resource of Object.values(part.files) as any[]) {
                const payload = fs.readFileSync(path.join(path.dirname(file), resource.file));
                expect(payload.length).toBe(resource.bytes); expect(sha256(payload)).toBe(resource.sha256);
            }
            const base = PNG.sync.read(fs.readFileSync(path.join(path.dirname(file), part.files.base.file)));
            const data = PNG.sync.read(fs.readFileSync(path.join(path.dirname(file), part.files.data.file)));
            expect([base.width, base.height]).toEqual([data.width, data.height]);
            let outside = 0;
            for (let pixel = 0; pixel < base.data.length; pixel += 4) {
                if (base.data[pixel + 3] === 0 && data.data[pixel] !== 0) outside++;
            }
            expect(outside).toBe(0);
        }
    }
});
