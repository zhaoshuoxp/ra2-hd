import { resourceRoot } from '../test-support/resources';
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { retailTree, resolveMember } from '../../src/offline/retail';
import { ShpFile } from '../../src/data/ShpFile';
import { resolveHdSprite, disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import { sovietUnitHdFamilies, isSovietUnitHdSource } from '../../src/engine/renderable/builder/sovietUnitHdFamilies';
import { loadSovietUnitsHd, resolveSovietUnitMembers } from '../../src/engine/renderable/builder/loadSovietUnitsHd';
import { ImageFinder } from '../../src/engine/ImageFinder';
import { GraphicsOptions } from '../../src/gui/screen/options/GraphicsOptions';
import { registerHdResources, sovietUnitIdentities } from '../../desktop/hd-profile.mjs';

const local = test;
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function inputs(member = 'dron.shp') {
    const contract = Object.values(sovietUnitHdFamilies).find(f => f.members.some(m => m.member === member))!;
    const family = JSON.parse(readFileSync(`${resourceRoot}/` + sovietUnitIdentities[contract.identity].familyPath, 'utf8'));
    const binding = family.members.find((m: any) => m.member === member);
    const packRoot = `${resourceRoot}/hd-packs/${binding.packId}/${binding.revision}`;
    const frames = contract.members.find(m => m.member === member)!.frames;
    const ra2 = ['ra2.mix', 'language.mix', 'multi.mix'].map(name => [name, readFileSync(`${resourceRoot}/assets/ra2/${name}`)] as const);
    const tree = 'edition' in contract && contract.edition === 'yr'
        ? editionRetailTree(new Map([...ra2, ...['expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
            .map(name => [name, readFileSync(`${resourceRoot}/assets/yr/${name}`)] as const)]), 'yr')
        : retailTree(new Map(ra2));
    const file = resolveMember(tree, member).file;
    const image = new ShpFile(file);
    const bytes = readFileSync(`${packRoot}/manifest.json`);
    const manifest = JSON.parse(bytes.toString());
    const source = { member, sha256: hash(Buffer.from(file.getBytes())), theater: 'TEMPERATE',
        canvas: [image.width, image.height], frames: image.images.slice(0, frames).map((frame: any, nativeFrame: number) => ({ nativeFrame,
            trimOrigin: [frame.x, frame.y], trimSize: [frame.width, frame.height],
            legacyRenderSize: [frame.width + frame.width % 2, frame.height + frame.height % 2], empty: !frame.imageData.some(Boolean) })) };
    const read = async (filename: string, expectedHash: string, expectedBytes: number) => {
        const bytes = readFileSync(`${packRoot}/${filename}`);
        expect(hash(bytes)).toBe(expectedHash); expect(bytes.length).toBe(expectedBytes);
        const page = PNG.sync.read(bytes);
        return { width: page.width, height: page.height, rgba: new Uint8Array(page.data) };
    };
    return { image, manifest, manifestHash: hash(bytes), source, read };
}

local('SQD keeps both native members atomic, preserves partial collar remap and respects the combined cap', async () => {
    const entries = [inputs('sqd.shp'), inputs('sqdg.shp')];
    expect(entries.map(e => e.image.numImages)).toEqual([296, 240]);
    let allocated = 0, disposed = 0;
    const loaded = await resolveSovietUnitMembers(entries, 4, 128 * 1024 * 1024, 2048, textures => {
        allocated += textures.length;
        textures.forEach(t => t.addEventListener('dispose', () => disposed++));
    });
    expect(loaded.density).toBe(2);
    expect(loaded.gpuBytes).toBe(109314048);
    expect(loaded.attempts).toEqual([{ density: 4, reason: 'missing-density' }]);
    for (const input of entries) {
        const hd = loaded.members.get(input.source.member)!.override;
        expect(hd.frames.length).toBe(input.source.frames.length);
        for (const [index, frame] of hd.frames.entries()) {
            const page = hd.pages[frame.page], data = page.data.image.data, base = page.base.image.data;
            let remap = 0, flesh = 0;
            for (let y = frame.sampleRect.y; y < frame.sampleRect.y + frame.sampleRect.height; y++)
                for (let x = frame.sampleRect.x; x < frame.sampleRect.x + frame.sampleRect.width; x++) {
                    const offset = (y * page.data.image.width + x) * 4;
                    if (data[offset]) {
                        remap++;
                        expect(base[offset + 3]).toBeGreaterThan(0);
                        expect(data[offset + 1]).toBeLessThan(16);
                    }
                    if (base[offset + 3] && base[offset + 1] - base[offset + 2] >= (base[offset] - base[offset + 2]) * 0.25) {
                        flesh++;
                        expect(data[offset]).toBe(0);
                    }
                }
            expect(flesh).toBeGreaterThan(0);
            const absent = input.source.member === 'sqdg.shp' && index < 80 && index % 10 < 6;
            expect(remap > 0).toBe(!absent);
        }
    }
    loaded.members.forEach(m => disposeHdSprite(m.override));
    expect(disposed).toBe(allocated);
    let reads = 0;
    const fallback = await resolveSovietUnitMembers(entries.map(e => ({ ...e, read: async (...args: Parameters<typeof e.read>) => {
        reads++; return e.read(...args);
    } })), 2, 59673888, 2048, () => {});
    expect(fallback.density).toBe(1);
    expect(fallback.members.size).toBe(0);
    expect(fallback.gpuBytes).toBe(0);
    expect(reads).toBe(0);
    expect(fallback.attempts).toEqual([{ density: 2, reason: 'combined-budget' }]);
}, 60000);

test('SQDG binding requires the parasite identity, animation and member, and returns its lifetime lease', () => {
    const calls: any[] = []; let releases = 0;
    const units = { families: new Map(), report: { gpuBytes: 0, budget: 0, families: {} },
        bind: (identity: string, image: any, apply: any) => { calls.push({ identity, image, apply }); return () => releases++; } };
    const finder = new ImageFinder(new Map(), {}, undefined, undefined, undefined, undefined, {}, units);
    const image = { filename: 'sqdg.shp' }, apply = () => {};
    finder.bindUnitAnimationHd('DRED', 'SQDG', image, apply)();
    finder.bindUnitAnimationHd('SQD', 'WAKE', image, apply)();
    finder.bindUnitAnimationHd('SQD', 'SQDG', { filename: 'sqd.shp' }, apply)();
    expect(calls.length).toBe(0);
    const release = finder.bindUnitAnimationHd('SQD', 'SQDG', image, apply);
    expect(calls).toEqual([{ identity: 'SQD', image, apply }]);
    release(); expect(releases).toBe(1);
});

local('pooled unit families reconstruct every color/remap byte and reject over-budget uploads atomically', async () => {
    for (const family of Object.values(sovietUnitHdFamilies)) {
        const entries = family.members.map(m => inputs(m.member));
        let allocated = 0, disposed = 0;
        const loaded = await resolveSovietUnitMembers(entries, 2, 128 * 1024 * 1024, 2048, textures => {
            allocated += textures.length;
            textures.forEach(t => t.addEventListener('dispose', () => disposed++));
        }, () => false, true);
        expect(loaded.density).toBe(2);
        let physicalBytes = 0;
        for (const entry of entries) {
            const hd = loaded.members.get(entry.source.member)!.override;
            const variant = entry.manifest.variants.find((v: any) => v.density === 2);
            for (const [index, page] of hd.pages.entries()) {
                const descriptor = variant.pages[index], base = page.base.image, data = page.data.image;
                const color = Buffer.alloc(descriptor.size[0] * descriptor.size[1] * 4);
                const remap = Buffer.alloc(color.length);
                const map = page.tiles?.map.image;
                for (let y = 0; y < descriptor.size[1]; y++) for (let x = 0; x < descriptor.size[0]; x++) {
                    let px = x, py = y;
                    if (map) {
                        const at = (Math.floor(y / 4) * map.width + Math.floor(x / 4)) * 4;
                        const id = map.data[at] + map.data[at + 1] * 256 + map.data[at + 2] * 65536;
                        const columns = base.width / 4;
                        px = (id % columns) * 4 + x % 4; py = Math.floor(id / columns) * 4 + y % 4;
                    }
                    const from = py * base.width + px, to = (y * descriptor.size[0] + x) * 4;
                    for (let channel = 0; channel < 4; channel++) color[to + channel] = base.data[from * 4 + channel];
                    remap[to] = data.data[from * 2]; remap[to + 1] = data.data[from * 2 + 1]; remap[to + 3] = 255;
                }
                const originalBase = await entry.read(descriptor.base, descriptor.baseSha256, descriptor.baseBytes);
                const originalData = await entry.read(descriptor.data, descriptor.dataSha256, descriptor.dataBytes);
                expect(hash(color)).toBe(hash(Buffer.from(originalBase.rgba)));
                expect(hash(remap)).toBe(hash(Buffer.from(originalData.rgba)));
                physicalBytes += base.data.byteLength + data.data.byteLength + (map?.data.byteLength ?? 0);
            }
        }
        expect(physicalBytes).toBe(loaded.gpuBytes);
        loaded.members.forEach(m => disposeHdSprite(m.override)); expect(disposed).toBe(allocated);
    }
    let uploads = 0;
    const failed = await resolveSovietUnitMembers([inputs('sqd.shp'), inputs('sqdg.shp')], 2, 1, 2048,
        () => uploads++, () => false, true);
    expect(failed.density).toBe(1); expect(failed.members.size).toBe(0); expect(uploads).toBe(0);
    expect(failed.attempts).toEqual([{ density: 2, reason: 'combined-budget' }]);
}, 120000);

local('DRON complete native slots, owner-color coverage, byte budget and disposal', async () => {
    const { image, manifest, manifestHash, source, read } = inputs();
    expect(image.numImages).toBe(176);
    expect(manifestHash).toBe(sovietUnitHdFamilies.DRON.members[0].manifestHash);
    for (const density of [2, 4]) {
        let allocated = 0, disposed = 0;
        const loaded = await resolveHdSprite(manifest, manifestHash, source, density, 2048, read, textures => {
            allocated += textures.length; textures.forEach(t => t.addEventListener('dispose', () => disposed++));
        });
        expect(loaded.density).toBe(density); expect(loaded.override?.frames.length).toBe(88);
        expect(loaded.gpuBytes).toBe(density === 4 ? 7077888 : 2228224);
        for (const frame of loaded.override!.frames) {
            const page = loaded.override!.pages[frame.page], pixels = page.data.image.data, base = page.base.image.data;
            let remap = 0;
            for (let y = frame.sampleRect.y; y < frame.sampleRect.y + frame.sampleRect.height; y++) {
                for (let x = frame.sampleRect.x; x < frame.sampleRect.x + frame.sampleRect.width; x++) {
                    const index = (y * page.data.image.width + x) * 4;
                    if (pixels[index]) { remap++; expect(base[index + 3]).toBeGreaterThan(0); expect(pixels[index + 1]).toBeLessThan(16); }
                }
            }
            expect(remap).toBeGreaterThan(0);
        }
        disposeHdSprite(loaded.override); expect(disposed).toBe(allocated);
    }
    expect(258507328 + 7077888).toBeLessThanOrEqual(256 * 1024 * 1024);
}, 30000);

local('incomplete member and failed uploads choose complete lower density or Original', async () => {
    const { manifest, manifestHash, source, read } = inputs();
    manifest.variants.find((v: any) => v.density === 4).frames.pop();
    const lower = await resolveHdSprite(manifest, manifestHash, source, 4, 2048, read);
    expect(lower.density).toBe(2); expect(lower.attempts[0].reason).toBe('incomplete-animation'); disposeHdSprite(lower.override);
    let allocated = 0, disposed = 0;
    const failed = await resolveHdSprite(manifest, manifestHash, source, 4, 2048, read, textures => {
        allocated += textures.length; textures.forEach(t => t.addEventListener('dispose', () => disposed++)); throw Error('fixture-upload-failure');
    });
    expect(failed.density).toBe(1); expect(failed.gpuBytes).toBe(0); expect(disposed).toBe(allocated);
    expect(allocated).toBeGreaterThan(0);
    expect(isSovietUnitHdSource({ ...source, sha256: '0'.repeat(64) })).toBe(false);
    expect(isSovietUnitHdSource({ ...source, theater: 'SNOW' })).toBe(false);
    const wrong = await resolveHdSprite(manifest, manifestHash, { ...source, member: 'engineer.shp' }, 4, 2048, read);
    expect(wrong.density).toBe(1);
}, 30000);

local('rules identity and image jointly bind unit art; another identity stays Original', async () => {
    const { image, manifest, manifestHash, source, read } = inputs();
    const loaded = await resolveHdSprite(manifest, manifestHash, source, 2, 2048, read);
    const units = { families: new Map([['DRON', { members: new Map([['dron.shp', { image, override: loaded.override! }]]) }]]), report: { gpuBytes: loaded.gpuBytes, budget: loaded.gpuBytes, families: {} } };
    const finder = new ImageFinder(new Map([['dron.shp', image]]), {}, undefined, undefined, undefined, undefined, {}, units);
    expect(finder.getUnitHdOverride('DRON', image)).toBe(loaded.override);
    expect(finder.getUnitHdOverride('ENGINEER', image)).toBeUndefined();
    expect(finder.getUnitHdOverride('DRON', {})).toBeUndefined();
    expect(finder.getHdOverride(image)).toBeUndefined();
    disposeHdSprite(loaded.override);
});

local('desktop registers only pinned complete unit resources', async () => {
    const result = await registerHdResources(resourceRoot);
    const selection = result.selections.get('/local-hd/unit-dron-selection.json');
    expect(selection.rulesIdentity).toBe('DRON'); expect(selection.familyHash).toBe(sovietUnitHdFamilies.DRON.familyHash);
    expect(selection.members.map((m: any) => m.member)).toEqual(['dron.shp', 'dronp.shp']);
    expect(result.availability.sovietUnits).toStartWith('22 of 24');
    expect(result.availability['unit-yuripr']).toBe('Original fallback');
    expect(result.selections.has('/local-hd/unit-yuripr-selection.json')).toBe(false);
    expect(result.availability['unit-sqd']).toBe('Original fallback');
    expect(result.selections.has('/local-hd/unit-sqd-selection.json')).toBe(false);
    expect(sovietUnitHdFamilies.SQD.blockedReason).toStartWith('USER_REQUESTED_ORIGINAL');
    expect(sovietUnitHdFamilies.YURIPR.blockedReason).toStartWith('UPSTREAM_GAMEPLAY_BLOCKED');
    const engineer = result.selections.get('/local-hd/unit-sengineer-selection.json');
    expect(engineer.familyHash).toBe(sovietUnitHdFamilies.SENGINEER.familyHash);
    expect(engineer.members.map((m: any) => m.member)).toEqual(['engineer.shp']);
    for (const member of selection.members) for (const route of Object.values(member.files)) expect(result.routes.has(route)).toBe(true);
}, 30000);

local('Soviet engineer completes every slot, protects gold from remap, and isolates the shared Allied source', async () => {
    const input = inputs('engineer.shp');
    expect(input.image.numImages).toBe(506);
    expect(input.manifestHash).toBe(sovietUnitHdFamilies.SENGINEER.members[0].manifestHash);
    for (const density of [2, 4]) {
        const loaded = await resolveSovietUnitMembers([input], density, 32 * 1024 * 1024, 2048, () => {});
        expect(loaded.density).toBe(density);
        expect(loaded.gpuBytes).toBe(density === 2 ? 6553600 : 23855104);
        const override = loaded.members.get('engineer.shp')!.override;
        expect(override.frames.length).toBe(253);
        for (const [nativeFrame, frame] of override.frames.entries()) {
            const page = override.pages[frame.page], data = page.data.image.data, base = page.base.image.data;
            let paint = 0;
            for (let y = frame.sampleRect.y; y < frame.sampleRect.y + frame.sampleRect.height; y++) {
                for (let x = frame.sampleRect.x; x < frame.sampleRect.x + frame.sampleRect.width; x++) {
                    const i = (y * page.data.image.width + x) * 4;
                    if (!data[i]) continue;
                    paint++;
                    expect(base[i + 3]).toBeGreaterThan(0);
                    expect(data[i + 1]).toBeLessThan(16);
                    expect(base[i + 1] - base[i + 2]).toBeLessThan((base[i] - base[i + 2]) * 0.25);
                }
            }
            expect(paint).toBeGreaterThan(0);
            const original = input.image.getImage(nativeFrame);
            let missingShadow = 0;
            for (let y = 0; y < original.height; y++) for (let x = 0; x < original.width; x++) {
                if (original.imageData[y * original.width + x] !== 12) continue;
                for (let sy = 0; sy < density; sy++) for (let sx = 0; sx < density; sx++) {
                    const i = ((frame.sampleRect.y + y * density + sy) * page.base.image.width + frame.sampleRect.x + x * density + sx) * 4;
                    if (base[i + 3] !== 255) missingShadow++;
                }
            }
            expect(missingShadow).toBe(0);
        }
        const finder = new ImageFinder(new Map([['engineer.shp', input.image]]), {}, undefined, undefined, undefined, undefined, {},
            { families: new Map([['SENGINEER', { members: loaded.members }]]), report: { gpuBytes: loaded.gpuBytes, budget: loaded.gpuBytes, families: {} } });
        expect(finder.getUnitHdOverride('SENGINEER', input.image)).toBe(override);
        expect(finder.getUnitHdOverride('ENGINEER', input.image)).toBe(override);
        expect(finder.getUnitHdOverride('ENGINEER', { filename: 'engineer.shp' })).toBeUndefined();
        expect(finder.getUnitHdOverride('SENGINEER', { filename: 'engineer.shp' })).toBeUndefined();
        loaded.members.forEach(m => disposeHdSprite(m.override));
    }
    const budget = 256 * 1024 * 1024 - 258507328 - 3276800;
    const combined = await resolveSovietUnitMembers([input], 4, budget, 2048, () => {});
    expect(combined.density).toBe(2);
    expect(combined.gpuBytes).toBeLessThanOrEqual(budget);
    combined.members.forEach(m => disposeHdSprite(m.override));
    const failed = await resolveSovietUnitMembers([{ ...input, read: async () => { throw Error('fixture-missing-engineer-page'); } }], 4, budget, 2048, () => {});
    expect(failed.density).toBe(1); expect(failed.members.size).toBe(0);
}, 30000);

test('unit HD follows the accepted global preference and preserves explicit off saves', () => {
    const previous = '2,2,,native,1,1,1,1,1,1,1,1';
    const options = new GraphicsOptions().unserialize(previous);
    expect(options.sovietUnitsHd).toBe(options.hdEnabled);
    expect(options.sovietUnitsHd.value).toBe(true);
    expect(options.hdDensity.value).toBe(4);
    expect(options.serialize()).toBe(previous + ',1,4');
    options.hdDensity.value = 2;
    const restored = new GraphicsOptions().unserialize(options.serialize());
    expect(restored.hdDensity.value).toBe(2);
    expect(restored.serialize()).toBe(options.serialize());
    expect(new GraphicsOptions().unserialize(options.serialize()).sovietUnitsHd.value).toBe(true);
    options.hdEnabled.value = false;
    expect(new GraphicsOptions().unserialize(options.serialize()).sovietUnitsHd.value).toBe(false);
    expect(new GraphicsOptions().unserialize(options.serialize()).hdDensity.value).toBe(2);
    expect(new GraphicsOptions().unserialize(previous + ',0').hdEnabled.value).toBe(false);
    expect(new GraphicsOptions().unserialize(previous + ',0').hdDensity.value).toBe(4);
});

local('unit and limbo representation commit together within budget; cancellation and member failure dispose everything', async () => {
    const body = inputs(), jump = inputs('dronp.shp');
    expect(jump.image.numImages).toBe(64);
    const high = await resolveSovietUnitMembers([body, jump], 4, 16000000, 2048, () => {});
    expect(high.density).toBe(4); expect(high.gpuBytes).toBe(10616832); expect(high.members.size).toBe(2);
    high.members.forEach(m => disposeHdSprite(m.override));
    const combined = await resolveSovietUnitMembers([body, jump], 4, 9928128, 2048, () => {});
    expect(combined.density).toBe(2); expect(combined.gpuBytes).toBe(3276800);
    expect(combined.attempts[0].reason).toBe('combined-budget');
    const finder = new ImageFinder(new Map(), {}, undefined, undefined, undefined, undefined, {},
        { families: new Map([['DRON', { members: combined.members }]]), report: { gpuBytes: 0, budget: 0, families: {} } });
    const projectile = { fromObject: { name: 'DRON' }, fromWeapon: { rules: { name: 'DroneJump', limboLaunch: true } }, rules: { name: 'JUMP' } };
    expect(finder.getUnitProjectileHdOverride(projectile, jump.image)).toBe(combined.members.get('dronp.shp')!.override);
    expect(finder.getUnitProjectileHdOverride({ ...projectile, fromObject: { name: 'DOG' } }, jump.image)).toBeUndefined();
    expect(finder.getUnitProjectileHdOverride(projectile, body.image)).toBeUndefined();
    combined.members.forEach(m => disposeHdSprite(m.override));
    for (const cancellation of [false, true]) {
        let uploads = 0, disposals = 0, stop = false;
        const brokenJump = { ...jump, read: async () => { throw Error('fixture-missing-leap-page'); } };
        const result = await resolveSovietUnitMembers([body, brokenJump], 4, 16000000, 2048, textures => {
            uploads += textures.length; textures.forEach(t => t.addEventListener('dispose', () => disposals++));
            if (cancellation) stop = true;
        }, () => stop);
        expect(result.members.size).toBe(0); expect(result.density).toBe(1); expect(result.gpuBytes).toBe(0);
        expect(uploads).toBeGreaterThan(0); expect(disposals).toBe(uploads);
    }
}, 30000);

local('DOG body and 32 leap bearings commit together, preserve native shadows, and isolate the Allied dog', async () => {
    const body = inputs('dog.shp'), leap = inputs('dogp.shp');
    for (const density of [2, 4]) {
        const loaded = await resolveSovietUnitMembers([body, leap], density, 32 * 1024 * 1024, 2048, () => {});
        expect(loaded.density).toBe(density);
        expect(loaded.gpuBytes).toBe(density === 2 ? 6553600 : 22020096);
        expect([...loaded.members.keys()]).toEqual(['dog.shp', 'dogp.shp']);
        for (const input of [body, leap]) {
            const override = loaded.members.get(input.source.member)!.override;
            for (const [nativeFrame, frame] of override.frames.entries()) {
                const original = input.image.getImage(nativeFrame), page = override.pages[frame.page];
                const base = page.base.image.data, data = page.data.image.data;
                let missingShadow = 0, remap = 0;
                for (let y = 0; y < original.height; y++) for (let x = 0; x < original.width; x++)
                    for (let sy = 0; sy < density; sy++) for (let sx = 0; sx < density; sx++) {
                        const index = ((frame.sampleRect.y + y * density + sy) * page.base.image.width + frame.sampleRect.x + x * density + sx) * 4;
                        if (original.imageData[y * original.width + x] === 12 && base[index + 3] !== 255) missingShadow++;
                        if (data[index]) { remap++; expect(base[index]).toBeGreaterThan(base[index + 1] * 1.5); }
                    }
                expect(missingShadow).toBe(0); expect(remap).toBeGreaterThan(0);
            }
        }
        const finder = new ImageFinder(new Map(), {}, undefined, undefined, undefined, undefined, {},
            { families: new Map([['DOG', { members: loaded.members }]]), report: { gpuBytes: loaded.gpuBytes, budget: loaded.gpuBytes, families: {} } });
        const projectile = { fromObject: { name: 'DOG' }, fromWeapon: { rules: { name: 'BadTeeth', limboLaunch: true } }, rules: { name: 'DOGJUMP' } };
        expect(finder.getUnitProjectileHdOverride(projectile, leap.image)).toBe(loaded.members.get('dogp.shp')!.override);
        projectile.fromObject.name = 'ADOG';
        expect(finder.getUnitProjectileHdOverride(projectile, leap.image)).toBeUndefined();
        expect(finder.getUnitHdOverride('ADOG', body.image)).toBeUndefined();
        loaded.members.forEach(member => disposeHdSprite(member.override));
    }
});

local('FLAKT preserves 301 native slots and embedded shadows without owner-coloring muzzle flames', async () => {
    const input = inputs('flakt.shp');
    expect(input.image.numImages).toBe(602);
    expect(input.manifestHash).toBe(sovietUnitHdFamilies.FLAKT.members[0].manifestHash);
    for (const density of [2, 4]) {
        let allocated = 0, disposed = 0, flamePixels = 0;
        const loaded = await resolveSovietUnitMembers([input], density, 64 * 1024 * 1024, 2048, textures => {
            allocated += textures.length;
            textures.forEach(t => t.addEventListener('dispose', () => disposed++));
        });
        expect(loaded.density).toBe(density);
        expect(loaded.gpuBytes).toBe(density === 2 ? 12976128 : 47316992);
        const override = loaded.members.get('flakt.shp')!.override;
        expect(override.frames.length).toBe(301);
        for (const [nativeFrame, frame] of override.frames.entries()) {
            const original = input.image.getImage(nativeFrame), page = override.pages[frame.page];
            const base = page.base.image.data, data = page.data.image.data;
            let missingShadow = 0, remap = 0;
            for (let y = 0; y < original.height; y++) for (let x = 0; x < original.width; x++)
                for (let sy = 0; sy < density; sy++) for (let sx = 0; sx < density; sx++) {
                    const i = ((frame.sampleRect.y + y * density + sy) * page.base.image.width + frame.sampleRect.x + x * density + sx) * 4;
                    if (original.imageData[y * original.width + x] === 12 && base[i + 3] !== 255) missingShadow++;
                    if (data[i]) { remap++; expect(base[i + 1] - base[i + 2]).toBeLessThan((base[i] - base[i + 2]) * 0.25); }
                    if (base[i + 3] > 0 && base[i] > 180 && base[i + 1] > 70 && base[i + 1] - base[i + 2] >= (base[i] - base[i + 2]) * 0.25) {
                        expect(data[i]).toBe(0); flamePixels++;
                    }
                }
            expect(missingShadow).toBe(0); expect(remap).toBeGreaterThan(0);
        }
        expect(flamePixels).toBeGreaterThan(100);
        loaded.members.forEach(member => disposeHdSprite(member.override));
        expect(disposed).toBe(allocated);
    }
    const failed = await resolveSovietUnitMembers([{ ...input, read: async () => { throw Error('fixture-missing-flakt-page'); } }], 4, 64 * 1024 * 1024, 2048, () => {});
    expect(failed.density).toBe(1); expect(failed.members.size).toBe(0); expect(failed.gpuBytes).toBe(0);
}, 30000);

local('SHK preserves 301 native slots, shadows and non-remapped gold coils and hair', async () => {
    const input = inputs('shk.shp');
    expect(input.image.numImages).toBe(602);
    expect(input.manifestHash).toBe(sovietUnitHdFamilies.SHK.members[0].manifestHash);
    for (const density of [2, 4]) {
        let allocated = 0, disposed = 0, goldPixels = 0;
        const loaded = await resolveSovietUnitMembers([input], density, 64 * 1024 * 1024, 2048, textures => {
            allocated += textures.length;
            textures.forEach(t => t.addEventListener('dispose', () => disposed++));
        });
        expect(loaded.density).toBe(density);
        expect(loaded.gpuBytes).toBe(density === 2 ? 8519680 : 32374784);
        const override = loaded.members.get('shk.shp')!.override;
        expect(override.frames.length).toBe(301);
        for (const [nativeFrame, frame] of override.frames.entries()) {
            const original = input.image.getImage(nativeFrame), page = override.pages[frame.page];
            const base = page.base.image.data, data = page.data.image.data;
            let missingShadow = 0, remap = 0;
            for (let y = 0; y < original.height; y++) for (let x = 0; x < original.width; x++)
                for (let sy = 0; sy < density; sy++) for (let sx = 0; sx < density; sx++) {
                    const i = ((frame.sampleRect.y + y * density + sy) * page.base.image.width + frame.sampleRect.x + x * density + sx) * 4;
                    if (original.imageData[y * original.width + x] === 12 && base[i + 3] !== 255) missingShadow++;
                    if (data[i]) { remap++; expect(base[i + 1] - base[i + 2]).toBeLessThan((base[i] - base[i + 2]) * 0.25); }
                    if (base[i + 3] > 0 && base[i] > 180 && base[i + 1] > 70 && base[i + 1] - base[i + 2] >= (base[i] - base[i + 2]) * 0.25) {
                        expect(data[i]).toBe(0); goldPixels++;
                    }
                }
            expect(missingShadow).toBe(0); expect(remap).toBeGreaterThan(0);
        }
        expect(goldPixels).toBeGreaterThan(100);
        loaded.members.forEach(member => disposeHdSprite(member.override));
        expect(disposed).toBe(allocated);
    }
    const failed = await resolveSovietUnitMembers([{ ...input, read: async () => { throw Error('fixture-missing-shk-page'); } }], 4, 64 * 1024 * 1024, 2048, () => {});
    expect(failed.density).toBe(1); expect(failed.members.size).toBe(0); expect(failed.gpuBytes).toBe(0);
}, 30000);

local('IVAN preserves 267 native slots, shadows and non-remapped skin and tan clothing', async () => {
    const input = inputs('ivan.shp');
    expect(input.image.numImages).toBe(534);
    expect(input.manifestHash).toBe(sovietUnitHdFamilies.IVAN.members[0].manifestHash);
    for (const density of [2, 4]) {
        let allocated = 0, disposed = 0, skinPixels = 0;
        const loaded = await resolveSovietUnitMembers([input], density, 64 * 1024 * 1024, 2048, textures => {
            allocated += textures.length;
            textures.forEach(t => t.addEventListener('dispose', () => disposed++));
        });
        expect(loaded.density).toBe(density);
        expect(loaded.gpuBytes).toBe(density === 2 ? 7340032 : 26214400);
        const override = loaded.members.get('ivan.shp')!.override;
        expect(override.frames.length).toBe(267);
        for (const [nativeFrame, frame] of override.frames.entries()) {
            const original = input.image.getImage(nativeFrame), page = override.pages[frame.page];
            const base = page.base.image.data, data = page.data.image.data;
            let missingShadow = 0, remap = 0;
            for (let y = 0; y < original.height; y++) for (let x = 0; x < original.width; x++)
                for (let sy = 0; sy < density; sy++) for (let sx = 0; sx < density; sx++) {
                    const i = ((frame.sampleRect.y + y * density + sy) * page.base.image.width + frame.sampleRect.x + x * density + sx) * 4;
                    if (original.imageData[y * original.width + x] === 12 && base[i + 3] !== 255) missingShadow++;
                    if (data[i]) { remap++; expect(base[i + 1] - base[i + 2]).toBeLessThan((base[i] - base[i + 2]) * 0.25); }
                    if (base[i + 3] > 0 && base[i] > 180 && base[i + 1] > 70 && base[i + 1] - base[i + 2] >= (base[i] - base[i + 2]) * 0.25) {
                        expect(data[i]).toBe(0); skinPixels++;
                    }
                }
            expect(missingShadow).toBe(0); expect(remap).toBeGreaterThan(0);
        }
        expect(skinPixels).toBeGreaterThan(100);
        loaded.members.forEach(member => disposeHdSprite(member.override));
        expect(disposed).toBe(allocated);
    }
    const failed = await resolveSovietUnitMembers([{ ...input, read: async () => { throw Error('fixture-missing-ivan-page'); } }], 4, 64 * 1024 * 1024, 2048, () => {});
    expect(failed.density).toBe(1); expect(failed.members.size).toBe(0); expect(failed.gpuBytes).toBe(0);
}, 30000);

local('YURI preserves 316 native slots, shadows and non-remapped skin', async () => {
    const input = inputs('yuri.shp');
    expect(input.image.numImages).toBe(632);
    expect(input.manifestHash).toBe(sovietUnitHdFamilies.YURI.members[0].manifestHash);
    for (const density of [2, 4]) {
        let allocated = 0, disposed = 0, skinPixels = 0;
        const loaded = await resolveSovietUnitMembers([input], density, 64 * 1024 * 1024, 2048, textures => {
            allocated += textures.length;
            textures.forEach(t => t.addEventListener('dispose', () => disposed++));
        });
        expect(loaded.density).toBe(density);
        expect(loaded.gpuBytes).toBe(density === 2 ? 7208960 : 25296896);
        const override = loaded.members.get('yuri.shp')!.override;
        expect(override.frames.length).toBe(316);
        for (const [nativeFrame, frame] of override.frames.entries()) {
            const original = input.image.getImage(nativeFrame), page = override.pages[frame.page];
            const base = page.base.image.data, data = page.data.image.data;
            let missingShadow = 0, remap = 0;
            for (let y = 0; y < original.height; y++) for (let x = 0; x < original.width; x++)
                for (let sy = 0; sy < density; sy++) for (let sx = 0; sx < density; sx++) {
                    const i = ((frame.sampleRect.y + y * density + sy) * page.base.image.width + frame.sampleRect.x + x * density + sx) * 4;
                    if (original.imageData[y * original.width + x] === 12 && base[i + 3] !== 255) missingShadow++;
                    if (data[i]) { remap++; expect(base[i + 1] - base[i + 2]).toBeLessThan((base[i] - base[i + 2]) * 0.25); }
                    if (base[i + 3] > 0 && base[i] > 180 && base[i + 1] > 70 && base[i + 1] - base[i + 2] >= (base[i] - base[i + 2]) * 0.25) {
                        expect(data[i]).toBe(0); skinPixels++;
                    }
                }
            expect(missingShadow).toBe(0); expect(remap).toBeGreaterThan(0);
        }
        expect(skinPixels).toBeGreaterThan(100);
        loaded.members.forEach(member => disposeHdSprite(member.override));
        expect(disposed).toBe(allocated);
    }
    const failed = await resolveSovietUnitMembers([{ ...input, read: async () => { throw Error('fixture-missing-yuri-page'); } }], 4, 64 * 1024 * 1024, 2048, () => {});
    expect(failed.density).toBe(1); expect(failed.members.size).toBe(0); expect(failed.gpuBytes).toBe(0);
}, 30000);

local('TERROR preserves 188 native slots, shadows and non-remapped skin', async () => {
    const input = inputs('trst.shp');
    expect(input.image.numImages).toBe(376);
    expect(input.manifestHash).toBe(sovietUnitHdFamilies.TERROR.members[0].manifestHash);
    for (const density of [2, 4]) {
        let allocated = 0, disposed = 0, skinPixels = 0;
        const loaded = await resolveSovietUnitMembers([input], density, 64 * 1024 * 1024, 2048, textures => {
            allocated += textures.length;
            textures.forEach(t => t.addEventListener('dispose', () => disposed++));
        });
        expect(loaded.density).toBe(density);
        expect(loaded.gpuBytes).toBe(density === 2 ? 4587520 : 16777216);
        const override = loaded.members.get('trst.shp')!.override;
        expect(override.frames.length).toBe(188);
        for (const [nativeFrame, frame] of override.frames.entries()) {
            const original = input.image.getImage(nativeFrame), page = override.pages[frame.page];
            const base = page.base.image.data, data = page.data.image.data;
            let missingShadow = 0, remap = 0;
            for (let y = 0; y < original.height; y++) for (let x = 0; x < original.width; x++)
                for (let sy = 0; sy < density; sy++) for (let sx = 0; sx < density; sx++) {
                    const i = ((frame.sampleRect.y + y * density + sy) * page.base.image.width + frame.sampleRect.x + x * density + sx) * 4;
                    if (original.imageData[y * original.width + x] === 12 && base[i + 3] !== 255) missingShadow++;
                    if (data[i]) { remap++; expect(base[i + 1] - base[i + 2]).toBeLessThan((base[i] - base[i + 2]) * 0.25); }
                    if (base[i + 3] > 0 && base[i] > 180 && base[i + 1] > 70 && base[i + 1] - base[i + 2] >= (base[i] - base[i + 2]) * 0.25) {
                        expect(data[i]).toBe(0); skinPixels++;
                    }
                }
            expect(missingShadow).toBe(0); if ([180, 181, 182, 184, 186, 187].includes(nativeFrame)) {
                expect([...original.imageData].some(p => p >= 16 && p <= 31)).toBe(false);
                // owner-r3 covers authored red paint even where native cheer art had no owner indices.
                expect(remap).toBeGreaterThan(0);
            } else expect(remap).toBeGreaterThan(0);
        }
        expect(skinPixels).toBeGreaterThan(100);
        loaded.members.forEach(member => disposeHdSprite(member.override));
        expect(disposed).toBe(allocated);
    }
    const failed = await resolveSovietUnitMembers([{ ...input, read: async () => { throw Error('fixture-missing-trst-page'); } }], 4, 64 * 1024 * 1024, 2048, () => {});
    expect(failed.density).toBe(1); expect(failed.members.size).toBe(0); expect(failed.gpuBytes).toBe(0);
}, 30000);

local('DESO preserves 322 native slots, shadows and non-remapped green canisters/effects', async () => {
    const input = inputs('deso.shp');
    expect(input.image.numImages).toBe(644);
    expect(input.manifestHash).toBe(sovietUnitHdFamilies.DESO.members[0].manifestHash);
    for (const density of [2, 4]) {
        let allocated = 0, disposed = 0, effectPixels = 0;
        const loaded = await resolveSovietUnitMembers([input], density, 64 * 1024 * 1024, 2048, textures => {
            allocated += textures.length;
            textures.forEach(t => t.addEventListener('dispose', () => disposed++));
        });
        expect(loaded.density).toBe(density);
        expect(loaded.gpuBytes).toBe(density === 2 ? 11403264 : 41287680);
        const override = loaded.members.get('deso.shp')!.override;
        const firingBodyWidths: number[] = [];
        expect(override.frames.length).toBe(322);
        for (const [nativeFrame, frame] of override.frames.entries()) {
            const original = input.image.getImage(nativeFrame), page = override.pages[frame.page];
            const base = page.base.image.data, data = page.data.image.data;
            let missingShadow = 0, remap = 0, greenPixels = 0;
            let redLeft = Infinity, redRight = -Infinity;
            for (let y = 0; y < original.height; y++) for (let x = 0; x < original.width; x++)
                for (let sy = 0; sy < density; sy++) for (let sx = 0; sx < density; sx++) {
                    const i = ((frame.sampleRect.y + y * density + sy) * page.base.image.width + frame.sampleRect.x + x * density + sx) * 4;
                    if (original.imageData[y * original.width + x] === 12 && base[i + 3] !== 255) missingShadow++;
                    if (nativeFrame >= 206 && nativeFrame <= 211 && base[i + 3] > 200 &&
                        base[i] > 70 && base[i] > base[i + 1] * 1.5 && base[i] > base[i + 2] * 1.5) {
                        redLeft = Math.min(redLeft, x * density + sx);
                        redRight = Math.max(redRight, x * density + sx);
                    }
                    if (data[i]) { remap++; expect(base[i + 1] - base[i + 2]).toBeLessThan((base[i] - base[i + 2]) * 0.25); }
                    if (base[i + 3] > 64 && base[i + 1] > 130 && base[i + 1] > base[i] * 1.8 && base[i + 1] > base[i + 2] * 1.8) {
                        expect(data[i]).toBe(0); effectPixels++; greenPixels++;
                    }
                }
            expect(missingShadow).toBe(0); expect(remap).toBeGreaterThan(0);
            if (nativeFrame < 8) expect(greenPixels).toBeGreaterThan(4);
            if (nativeFrame >= 206 && nativeFrame <= 211)
                firingBodyWidths.push(redRight - redLeft + 1);
        }
        // The muzzle flash changes extent; the armored body must not grow with it.
        expect(firingBodyWidths.length).toBe(6);
        expect(Math.min(...firingBodyWidths)).toBeGreaterThan(0);
        expect(Math.max(...firingBodyWidths) / Math.min(...firingBodyWidths)).toBeLessThan(1.1);
        expect(effectPixels).toBeGreaterThan(100);
        loaded.members.forEach(member => disposeHdSprite(member.override));
        expect(disposed).toBe(allocated);
    }
    const failed = await resolveSovietUnitMembers([{ ...input, read: async () => { throw Error('fixture-missing-deso-page'); } }], 4, 64 * 1024 * 1024, 2048, () => {});
    expect(failed.density).toBe(1); expect(failed.members.size).toBe(0); expect(failed.gpuBytes).toBe(0);
}, 30000);

local('CIVAN preserves 267 native slots, shadows and non-remapped skin and tan clothing', async () => {
    const input = inputs('civan.shp');
    expect(input.image.numImages).toBe(534);
    expect(input.manifestHash).toBe(sovietUnitHdFamilies.CIVAN.members[0].manifestHash);
    for (const density of [2, 4]) {
        let allocated = 0, disposed = 0, skinPixels = 0;
        const loaded = await resolveSovietUnitMembers([input], density, 64 * 1024 * 1024, 2048, textures => {
            allocated += textures.length;
            textures.forEach(t => t.addEventListener('dispose', () => disposed++));
        });
        expect(loaded.density).toBe(density);
        expect(loaded.gpuBytes).toBe(density === 2 ? 7471104 : 27525120);
        const override = loaded.members.get('civan.shp')!.override;
        expect(override.frames.length).toBe(267);
        for (const [nativeFrame, frame] of override.frames.entries()) {
            const original = input.image.getImage(nativeFrame), page = override.pages[frame.page];
            const base = page.base.image.data, data = page.data.image.data;
            let missingShadow = 0, remap = 0;
            for (let y = 0; y < original.height; y++) for (let x = 0; x < original.width; x++)
                for (let sy = 0; sy < density; sy++) for (let sx = 0; sx < density; sx++) {
                    const i = ((frame.sampleRect.y + y * density + sy) * page.base.image.width + frame.sampleRect.x + x * density + sx) * 4;
                    if (original.imageData[y * original.width + x] === 12 && base[i + 3] !== 255) missingShadow++;
                    if (data[i]) { remap++; expect(base[i + 1] - base[i + 2]).toBeLessThan((base[i] - base[i + 2]) * 0.25); }
                    if (base[i + 3] > 0 && base[i] > 180 && base[i + 1] > 70 && base[i + 1] - base[i + 2] >= (base[i] - base[i + 2]) * 0.25) {
                        expect(data[i]).toBe(0); skinPixels++;
                    }
                }
            expect(missingShadow).toBe(0); expect(remap).toBeGreaterThan(0);
        }
        expect(skinPixels).toBeGreaterThan(100);
        loaded.members.forEach(member => disposeHdSprite(member.override));
        expect(disposed).toBe(allocated);
    }
    const failed = await resolveSovietUnitMembers([{ ...input, read: async () => { throw Error('fixture-missing-civan-page'); } }], 4, 64 * 1024 * 1024, 2048, () => {});
    expect(failed.density).toBe(1); expect(failed.members.size).toBe(0); expect(failed.gpuBytes).toBe(0);
}, 30000);

local('YURIPR preserves 315 native slots, shadows and non-remapped skin and psychic effects', async () => {
    const input = inputs('yuripr.shp');
    expect(input.image.numImages).toBe(630);
    expect(input.manifestHash).toBe(sovietUnitHdFamilies.YURIPR.members[0].manifestHash);
    for (const density of [2, 4]) {
        let allocated = 0, disposed = 0, skinPixels = 0, effectPixels = 0;
        const loaded = await resolveSovietUnitMembers([input], density, 64 * 1024 * 1024, 2048, textures => {
            allocated += textures.length;
            textures.forEach(t => t.addEventListener('dispose', () => disposed++));
        });
        expect(loaded.density).toBe(density);
        expect(loaded.gpuBytes).toBe(density === 2 ? 8126464 : 29753344);
        const override = loaded.members.get('yuripr.shp')!.override;
        expect(override.frames.length).toBe(315);
        for (const [nativeFrame, frame] of override.frames.entries()) {
            const original = input.image.getImage(nativeFrame), page = override.pages[frame.page];
            const base = page.base.image.data, data = page.data.image.data;
            let missingShadow = 0, remap = 0;
            for (let y = 0; y < original.height; y++) for (let x = 0; x < original.width; x++)
                for (let sy = 0; sy < density; sy++) for (let sx = 0; sx < density; sx++) {
                    const i = ((frame.sampleRect.y + y * density + sy) * page.base.image.width + frame.sampleRect.x + x * density + sx) * 4;
                    if (original.imageData[y * original.width + x] === 12 && base[i + 3] !== 255) missingShadow++;
                    if (base[i + 3] > 64 && base[i + 2] > 140 && base[i + 2] > base[i] * 1.35 && base[i + 2] > base[i + 1] * 1.1) {
                        expect(data[i]).toBe(0); effectPixels++;
                    }
                    if (data[i]) { remap++; expect(base[i + 1] - base[i + 2]).toBeLessThan((base[i] - base[i + 2]) * 0.25); }
                    if (base[i + 3] > 0 && base[i] > 180 && base[i + 1] > 70 && base[i + 1] - base[i + 2] >= (base[i] - base[i + 2]) * 0.25) {
                        expect(data[i]).toBe(0); skinPixels++;
                    }
                }
            expect(missingShadow).toBe(0); expect(remap).toBeGreaterThan(0);
        }
        expect(skinPixels).toBeGreaterThan(100);
        expect(effectPixels).toBeGreaterThan(20);
        loaded.members.forEach(member => disposeHdSprite(member.override));
        expect(disposed).toBe(allocated);
    }
    const failed = await resolveSovietUnitMembers([{ ...input, read: async () => { throw Error('fixture-missing-yuripr-page'); } }], 4, 64 * 1024 * 1024, 2048, () => {});
    expect(failed.density).toBe(1); expect(failed.members.size).toBe(0); expect(failed.gpuBytes).toBe(0);
}, 30000);


test('snow and temperate unit families request HD and fail closed on missing resources', async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
    const oldFetch = globalThis.fetch;
    Object.defineProperty(globalThis, 'location', { value: { href: 'ra2://game/' }, configurable: true });
    const routes: string[] = [];
    globalThis.fetch = (async (url: any) => {
        routes.push(String(url));
        return new Response('', { status: 404 });
    }) as any;
    try {
        const { TheaterType } = await import('../../src/engine/TheaterType');
        for (const type of [TheaterType.Temperate, TheaterType.Snow]) {
            let applied = 0, uploads = 0;
            routes.length = 0;
            const loaded = await loadSovietUnitsHd({ type },
                { renderer: { initTexture: () => uploads++ } }, true, 1000000, () => false);
            expect(loaded.bind).toBeFunction();
            expect(loaded.bindVxl).toBeFunction();
            const releases = [loaded.bind!('SHK', { filename: 'shk.shp' }, () => applied++),
                loaded.bindVxl!('APOC', () => applied++)];
            for (let i = 0; i < 40; i++) await Promise.resolve();
            expect(routes).toContain('/local-hd/unit-shk-selection.json');
            expect(routes.some(route => route.startsWith('/local-vxl/'))).toBe(true);
            for (const id of ['SHK', 'APOC']) expect(loaded.report.families[id].status).toBe('FAILED');
            expect(loaded.families.size).toBe(0);
            expect([loaded.report.gpuBytes, applied, uploads]).toEqual([0, 0, 0]);
            releases.forEach(release => release()); loaded.dispose!();
        }
        for (const [type, enabled] of [[TheaterType.None, true], [TheaterType.Snow, false]] as const) {
            const loaded = await loadSovietUnitsHd({ type }, {}, enabled, 1000000, () => false);
            expect(loaded.bind).toBeUndefined();
            expect(loaded.report.gpuBytes).toBe(0);
        }
    } finally {
        globalThis.fetch = oldFetch;
        if (previous) Object.defineProperty(globalThis, 'location', previous);
        else delete (globalThis as any).location;
    }
});

test('user-disabled SQD body and attachment stay Original without fetch or allocation', async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
    const oldFetch = globalThis.fetch;
    let fetches = 0, uploads = 0, applied = 0;
    Object.defineProperty(globalThis, 'location', { value: { href: 'ra2://game/' }, configurable: true });
    globalThis.fetch = (() => { fetches++; throw Error('Unexpected disabled-family fetch'); }) as any;
    try {
        const { TheaterType } = await import('../../src/engine/TheaterType');
        const loaded = await loadSovietUnitsHd({ type: TheaterType.Temperate },
            { renderer: { initTexture: () => uploads++ } }, true, 1000000, () => false);
        const releases = ['sqd.shp', 'sqdg.shp'].map(filename => loaded.bind!('SQD', { filename }, () => applied++));
        for (let i = 0; i < 8; i++) await Promise.resolve();
        expect(loaded.report.families.SQD.attempts).toEqual([{ reason: 'USER_REQUESTED_ORIGINAL' }]);
        expect(loaded.report.gpuBytes).toBe(0);
        expect(loaded.families.size).toBe(0);
        expect([fetches, uploads, applied]).toEqual([0, 0, 0]);
        releases.forEach(release => release()); loaded.dispose!();
    } finally {
        globalThis.fetch = oldFetch;
        if (previous) Object.defineProperty(globalThis, 'location', previous);
        else delete (globalThis as any).location;
    }
});
