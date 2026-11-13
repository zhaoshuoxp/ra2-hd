import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import catalog from '../../desktop/yr-campaign-npc-contracts.json';
import { registerHdResources } from '../../desktop/hd-profile.mjs';
import { Engine } from '../../src/engine/Engine';
import { hdTextureBudget } from '../../src/engine/gfx/HdDensity';
import { TheaterType } from '../../src/engine/TheaterType';
import { campaignTaskNpcAllowed, isTaskNpcHdSource, isTaskNpcTiledHdSource,
    taskNpcContracts } from '../../src/engine/renderable/builder/campaignTaskNpcHd';
import { hdAtlasPageLimit } from '../../src/engine/renderable/builder/hdAtlasPageLimit';
import { loadSovietUnitsHd, resolveSovietUnitMembers } from '../../src/engine/renderable/builder/loadSovietUnitsHd';
import { disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import { unitHdFamiliesForEdition } from '../../src/engine/renderable/builder/unitHdFamilies';
import { nativeShpSource, requiredBytes, resourceRoot, retailMember, sha256 } from '../test-support/resources';

const contract = catalog.shp.CAML, member = contract.members[0];
const family = JSON.parse(requiredBytes(contract.familyPath).toString());
const directory = path.join(resourceRoot, 'hd-packs', family.members[0].packId, family.members[0].revision);
const bytes = readFileSync(path.join(directory, 'manifest.json')), manifest = JSON.parse(bytes.toString());
const native = nativeShpSource('yr', member.member, member.sourceHash, member.frames, contract.authoringTheater);
const read = async (name: string, hash: string, size: number) => {
    const bytes = readFileSync(path.join(directory, name));
    expect(sha256(bytes)).toBe(hash); expect(bytes.length).toBe(size);
    const png = PNG.sync.read(bytes);
    return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
};
const input = { image: native.image, manifest, manifestHash: member.manifestHash, source: native.source, read };

test('CAML loads every original body slot at independent densities, fixed colors and exact geometry, then releases all textures', async () => {
    expect(sha256(requiredBytes(contract.familyPath))).toBe(contract.familyHash);
    expect(sha256(bytes)).toBe(member.manifestHash);
    expect(native.image.numImages).toBe(328); expect(member.frames).toBe(164);
    expect(manifest.logical.frames).toEqual(native.source.frames);
    expect(isTaskNpcHdSource(native.source)).toBe(true);
    expect(isTaskNpcHdSource({ ...native.source, theater: 'SNOW' })).toBe(false);
    for (const density of [2, 4]) {
        let allocated = 0, released = 0;
        const result = await resolveSovietUnitMembers([input], density, 512*1024**2, 2048, textures => {
            allocated += textures.length;
            for (const texture of textures) texture.addEventListener('dispose', () => released++);
        }, () => false, true);
        expect(result.density).toBe(density); expect(result.attempts).toEqual([]);
        const override = result.members.get(member.member)!.override;
        expect(override.frames).toHaveLength(164);
        for (const [index, frame] of override.frames.entries()) {
            expect([frame.sampleRect.width, frame.sampleRect.height])
                .toEqual(native.source.frames[index].legacyRenderSize.map(value => value*density));
        }
        disposeHdSprite(override); expect(released).toBe(allocated);
    }
    for (const variant of manifest.variants) for (const page of variant.pages) {
        const png = PNG.sync.read(readFileSync(path.join(directory, page.data)));
        expect(png.data.every((value, index) => index%4 === 3 ? value === 255 : value === 0)).toBe(true);
    }
}, 30000);

test('CAML missing pages, incomplete sequences and exhausted allocation keep the complete actor Original without uploads', async () => {
    let uploads = 0;
    const incomplete = structuredClone(manifest);
    for (const variant of incomplete.variants) variant.frames.pop();
    for (const [candidate, reader, budget] of [
        [manifest, async () => { throw Error('missing-task-page'); }, 512*1024**2],
        [incomplete, read, 512*1024**2], [manifest, read, 0],
    ] as const) {
        const result = await resolveSovietUnitMembers([{ ...input, manifest: candidate, read: reader }],
            4, budget, 2048, () => { uploads++; }, () => false, true);
        expect(result.density).toBe(1); expect(result.members.size).toBe(0);
        expect(result.gpuBytes).toBe(0); expect(result.attempts).toHaveLength(2);
    }
    expect(uploads).toBe(0);
}, 30000);

test('CAML source scope admits exactly the two original Desert missions and matching palette', () => {
    const scope = catalog.sourceScopes[0];
    expect(unitHdFamiliesForEdition('ra2').CAML).toBeUndefined();
    for (const source of scope.campaignSources) {
        expect(sha256(requiredBytes(`campaign/yr/${source.mission.slice(0,-4)}/${source.mission}`))).toBe(source.sha256);
        const launch = { edition: 'yr', mission: source.mission, sourceSha256: source.sha256 };
        const allowed = (context: any = { campaign: { launch } }, theater = 'DESERT', palette = scope.unitPalette.sha256) =>
            campaignTaskNpcAllowed(taskNpcContracts.CAML, theater, context, palette);
        expect(allowed()).toBe(true); expect(allowed({})).toBe(false);
        expect(allowed({ campaign: { launch: { ...launch, edition: 'ra2' } } })).toBe(false);
        expect(allowed({ campaign: { launch: { ...launch, sourceSha256: '0'.repeat(64) } } })).toBe(false);
        expect(allowed({ campaign: { launch: { ...launch, mission: 'unknown.map' } } })).toBe(false);
        expect(allowed(undefined, 'SNOW')).toBe(false);
        expect(allowed(undefined, undefined, '0'.repeat(64))).toBe(false);
        expect(campaignTaskNpcAllowed({ ...taskNpcContracts.CAML, familyHash: '0'.repeat(64) },
            'DESERT', { campaign: { launch } } as any, scope.unitPalette.sha256)).toBe(false);
    }
});

test('the actual unit demand loader excludes CAML from skirmish and changed source worlds before fetching or allocating', async () => {
    const priorLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
    const priorFetch = globalThis.fetch, priorVfs = Engine.vfs;
    let fetches = 0, uploads = 0, applied = 0;
    Object.defineProperty(globalThis, 'location', { value: { href: 'ra2://game/' }, configurable: true });
    globalThis.fetch = (() => { fetches++; throw Error('Unexpected task NPC fetch'); }) as any;
    Engine.vfs = { openFile: (name: string) => retailMember('yr', name).file } as any;
    try {
        for (const context of [{}, { campaign: { launch: { edition: 'yr', mission: 'all04dmd.map', sourceSha256: '0'.repeat(64) } } }]) {
            const loaded = await loadSovietUnitsHd({ type: TheaterType.Desert, settings: { unitPaletteName: 'unitdes.pal' } },
                { renderer: { initTexture: () => uploads++ } }, true, 512*1024**2, () => false,
                undefined, 4, undefined, false, context as any);
            expect(loaded.report.families.CAML).toBeUndefined();
            loaded.bind!('CAML', native.image, () => applied++); await loaded.idle!();
            expect(loaded.report.gpuBytes).toBe(0); loaded.dispose!();
        }
        expect([fetches, uploads, applied]).toEqual([0,0,0]);
    } finally {
        Engine.vfs = priorVfs; globalThis.fetch = priorFetch;
        if (priorLocation) Object.defineProperty(globalThis, 'location', priorLocation);
        else delete (globalThis as any).location;
    }
});

test('desktop task NPC registration preserves existing availability totals and all required member routes', async () => {
    const registered = await registerHdResources(resourceRoot);
    const selection = registered.selections.get('/local-hd/unit-caml-selection.json') as any;
    expect(selection.familyHash).toBe(contract.familyHash);
    expect(selection.members[0].sha256).toBe(member.manifestHash);
    expect(registered.routes.has(`/local-hd/${member.manifestHash}/manifest.json`)).toBe(true);
    expect(registered.availability.sovietUnits).toContain('of 24 vanilla additions');
    expect(registered.availability.sovietUnits).toContain('of 7 YR additions');
    const dinosaur = catalog.shp.DNOB;
    const dinosaurSelection = registered.selections.get('/local-hd/unit-dnob-selection.json') as any;
    expect(dinosaurSelection.familyHash).toBe(dinosaur.familyHash);
    expect(registered.availability['unit-dnob']).toBe('HD available');
    const dinosaurFamily = JSON.parse(requiredBytes(dinosaur.familyPath).toString());
    const dinosaurMember = dinosaurFamily.members[0], hash = dinosaur.members[0].manifestHash;
    const dinosaurManifest = JSON.parse(requiredBytes(`hd-packs/${dinosaurMember.packId}/${dinosaurMember.revision}/manifest.json`).toString());
    for (const variant of dinosaurManifest.variants) for (const page of variant.pages) for (const role of ['base', 'data', 'map'])
        expect(registered.routes.has(`/local-hd/${hash}/${variant.density}/${page.id}/${role}.png`)).toBe(true);
}, 30000);

test('DNOB retains its four true empty slots and NoShadow policy at both densities within the existing budgets', async () => {
    const contract = catalog.shp.DNOB, member = contract.members[0];
    const family = JSON.parse(requiredBytes(contract.familyPath).toString());
    const directory = path.join(resourceRoot, 'hd-packs', family.members[0].packId, family.members[0].revision);
    const bytes = readFileSync(path.join(directory, 'manifest.json')), manifest = JSON.parse(bytes.toString());
    const native = nativeShpSource('yr', member.member, member.sourceHash, member.frames, contract.authoringTheater);
    expect(sha256(requiredBytes(contract.familyPath))).toBe(contract.familyHash);
    expect(sha256(bytes)).toBe(member.manifestHash);
    expect(native.image.numImages).toBe(502); expect(member.frames).toBe(251);
    expect(family.originalShadowRendering).toBe(false);
    expect(manifest.logical.frames).toEqual(native.source.frames);
    expect(native.source.frames.filter(frame => frame.empty).map(frame => frame.nativeFrame))
        .toEqual([213, 214, 215, 250]);
    expect(isTaskNpcTiledHdSource(native.source)).toBe(true);
    for (const changed of [{ sha256: '0'.repeat(64) }, { theater: 'TEMPERATE' }, { canvas: [430, 397] },
        { canvas: [430, 396, 0] }, { frames: native.source.frames.slice(0, 250) }, { member: 'other.shp' }])
        expect(isTaskNpcTiledHdSource({ ...native.source, ...changed })).toBe(false);
    expect(isTaskNpcTiledHdSource(input.source)).toBe(false);
    const read = async (name: string, hash: string, size: number) => {
        const bytes = readFileSync(path.join(directory, name));
        expect(sha256(bytes)).toBe(hash); expect(bytes.length).toBe(size);
        const png = PNG.sync.read(bytes);
        return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
    };
    for (const density of [2, 4] as const) {
        let allocated = 0, released = 0;
        const budget = hdTextureBudget(density);
        const variant = manifest.variants.find((variant: any) => variant.density === density);
        expect(variant.storage).toBe('lossless-four-pixel-pool-v1');
        expect(variant.pages.length).toBeLessThanOrEqual(8);
        expect(hdAtlasPageLimit(native.source, density, true, true)).toBe(8);
        const result = await resolveSovietUnitMembers([{ image: native.image, manifest,
            manifestHash: member.manifestHash, source: native.source, read }], density, budget, 2048, textures => {
            allocated += textures.length;
            for (const texture of textures) texture.addEventListener('dispose', () => released++);
        }, () => false, true);
        expect(result.attempts).toEqual([]); expect(result.density).toBe(density);
        expect(result.gpuBytes).toBeGreaterThan(0); expect(result.gpuBytes).toBeLessThanOrEqual(budget);
        expect(allocated).toBe(variant.pages.length*4);
        const override = result.members.get(member.member)!.override;
        expect(override.frames).toHaveLength(251);
        for (const [index, frame] of override.frames.entries()) {
            expect([frame.sampleRect.width, frame.sampleRect.height])
                .toEqual(native.source.frames[index].legacyRenderSize.map(value => value*density));
            if (native.source.frames[index].empty) expect([frame.sampleRect.width, frame.sampleRect.height]).toEqual([0, 0]);
        }
        disposeHdSprite(override); expect(released).toBe(allocated);
    }
    let uploads = 0;
    const missingMap = await resolveSovietUnitMembers([{ image: native.image, manifest,
        manifestHash: member.manifestHash, source: native.source, read: async (name, hash, size) => {
            if (name.endsWith('-map.png')) throw Error('missing-dnob-map');
            return read(name, hash, size);
        } }], 4, hdTextureBudget(4), 2048, () => { uploads++; }, () => false, true);
    expect(missingMap.density).toBe(1); expect(missingMap.members.size).toBe(0);
    expect(missingMap.gpuBytes).toBe(0); expect(uploads).toBe(0);
    expect(missingMap.attempts.map(attempt => attempt.density)).toEqual([4, 2]);
    expect(missingMap.attempts.every(attempt => attempt.reason.includes('missing-dnob-map'))).toBe(true);
}, 60000);

test('DNOB admits only the exact original Soviet01 NewUrban source and palette', () => {
    const contract = catalog.shp.DNOB, scope = catalog.sourceScopes.find(scope => scope.identity === 'DNOB')!;
    expect(scope.campaignSources).toHaveLength(1);
    const source = scope.campaignSources[0];
    expect(source.mission).toBe('sov01umd.map'); expect(scope.theater).toBe('NEWURBAN');
    expect(unitHdFamiliesForEdition('ra2').DNOB).toBeUndefined();
    expect(sha256(requiredBytes(`campaign/yr/sov01umd/${source.mission}`))).toBe(source.sha256);
    const launch = { edition: 'yr', mission: source.mission, sourceSha256: source.sha256 };
    const allowed = (context: any = { campaign: { launch } }, theater = 'NEWURBAN', palette = scope.unitPalette.sha256) =>
        campaignTaskNpcAllowed(contract, theater, context, palette);
    expect(allowed()).toBe(true); expect(allowed({})).toBe(false);
    expect(allowed(undefined, 'TEMPERATE')).toBe(false); expect(allowed(undefined, 'SNOW')).toBe(false);
    expect(allowed(undefined, undefined, '0'.repeat(64))).toBe(false);
    for (const changed of [{ edition: 'ra2' }, { mission: 'all06umd.map' }, { sourceSha256: '0'.repeat(64) }])
        expect(allowed({ campaign: { launch: { ...launch, ...changed } } })).toBe(false);
});

test('the actual DNOB demand loader fetches registered lookup routes and releases every uploaded texture', async () => {
    const registered = await registerHdResources(resourceRoot);
    const contract = catalog.shp.DNOB, member = contract.members[0];
    const scope = catalog.sourceScopes.find(scope => scope.identity === 'DNOB')!;
    const native = nativeShpSource('yr', member.member, member.sourceHash, member.frames, contract.authoringTheater);
    const prior = Object.fromEntries(['location', 'document', 'createImageBitmap'].map(key =>
        [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const priorFetch = globalThis.fetch, priorVfs = Engine.vfs, priorImages = Engine.getImages;
    const requests: string[] = [];
    let uploaded = 0, released = 0, loaded: Awaited<ReturnType<typeof loadSovietUnitsHd>> | undefined;
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { href: 'ra2://game/' } });
    Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async (blob: Blob) => {
        const png = PNG.sync.read(Buffer.from(await blob.arrayBuffer()));
        return { width: png.width, height: png.height, rgba: png.data, close() {} };
    } });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => {
        let image: any;
        return { width: 0, height: 0, getContext: () => ({ drawImage: (value: any) => { image = value; },
            getImageData: () => ({ data: image.rgba }) }) };
    } } });
    globalThis.fetch = (async (input: any) => {
        const route = String(input); requests.push(route);
        const selection = registered.selections.get(route);
        if (selection) return Response.json(selection);
        const file = registered.routes.get(route);
        if (!file) throw Error('Unexpected unregistered DNOB route: '+route);
        return new Response(new Uint8Array(readFileSync(file)));
    }) as typeof fetch;
    Engine.vfs = { openFile: (name: string) => retailMember('yr', name).file } as any;
    Engine.getImages = (() => new Map([[member.member, native.image]])) as any;
    try {
        const renderer = { renderer: { capabilities: { maxTextureSize: 2048 }, getContext: () => ({ getError: () => 0 }),
            initTexture: (texture: any) => {
            uploaded++; texture.addEventListener('dispose', () => released++);
        } } };
        loaded = await loadSovietUnitsHd({ type: TheaterType.NewUrban, settings: { unitPaletteName: scope.unitPalette.member } },
            renderer, true, hdTextureBudget(2), () => false, undefined, 2, undefined, false,
            { campaign: { launch: { edition: 'yr', mission: scope.campaignSources[0].mission,
                sourceSha256: scope.campaignSources[0].sha256 } } } as any);
        let frames = 0;
        loaded.bind!('DNOB', native.image, override => { if (override) frames = override.frames.length; });
        await loaded.idle!();
        expect(loaded.report.families.DNOB?.attempts).toEqual([]);
        expect(frames).toBe(251); expect(loaded.report.families.DNOB.density).toBe(2);
        expect(requests.filter(route => route.endsWith('/map.png'))).toHaveLength(2);
        expect(uploaded).toBe(8); expect(loaded.report.gpuBytes).toBeGreaterThan(0);
        loaded.dispose!(); expect(released).toBe(uploaded);
    } finally {
        loaded?.dispose!(); Engine.getImages = priorImages; Engine.vfs = priorVfs; globalThis.fetch = priorFetch;
        for (const key of ['location', 'document', 'createImageBitmap']) {
            if (prior[key]) Object.defineProperty(globalThis, key, prior[key]);
            else delete (globalThis as any)[key];
        }
    }
}, 30000);
