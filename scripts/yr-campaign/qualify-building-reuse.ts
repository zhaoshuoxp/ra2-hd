import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerHdResources } from '../../desktop/hd-profile.mjs';
import { activeEdition } from '../../src/editions/activeEdition';
import { ImageFinder } from '../../src/engine/ImageFinder';
import { AnimProps } from '../../src/engine/AnimProps';
import { IniSection } from '../../src/data/IniSection';
import { ShpFile } from '../../src/data/ShpFile';
import { VxlFile } from '../../src/data/VxlFile';
import { buildingCoverage } from '../../src/engine/renderable/builder/sovietBuildingCoverage';
import { sovietBuildingHdFamilies } from '../../src/engine/renderable/builder/sovietBuildingHdFamilies';
import { canonicalAlliedBuildingHdFamily } from '../../src/engine/renderable/builder/alliedBuildingHdFamilies';
import { napowrHdFamily } from '../../src/engine/renderable/builder/napowrHdFamily';
import { powerPlantMembers } from '../../src/engine/renderable/builder/resolvePowerPlantHd';
import { configureWarFactoryLayerPose } from '../../src/engine/renderable/entity/building/WarFactoryLayerPose';
import { AnimationType } from '../../src/engine/renderable/entity/building/AnimationType';
import { BuildingShpHelper } from '../../src/engine/renderable/entity/building/BuildingShpHelper';
import { buildingAnimationDisplayFrame } from '../../src/engine/renderable/entity/building/BuildingAnimationFrame';
import { retailMember, sha256 } from '../test-support/resources';

assert.equal(activeEdition, 'yr', 'Use the YR browser-test preload');
const [output, inventoryFile] = process.argv.slice(2);
assert(output && inventoryFile); fs.mkdirSync(output, { recursive: false });
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const inventory = read(inventoryFile), profile = await registerHdResources('.local');
const unit: Record<string, string> = { TEMPERATE: 'unittem.pal', SNOW: 'unitsno.pal', URBAN: 'uniturb.pal',
    NEWURBAN: 'unitubn.pal', DESERT: 'unitdes.pal', LUNAR: 'unitlun.pal' };
const characters: Record<string, string> = { TEMPERATE: 'T', SNOW: 'A', URBAN: 'U',
    NEWURBAN: 'N', DESERT: 'D', LUNAR: 'L' };
const originals = new Map<string, ReturnType<typeof retailMember>>(), images = new Map<string, ShpFile>();
const original = (member: string, hash?: string) => {
    const key = member + '/' + (hash ?? '');
    if (!originals.has(key)) originals.set(key, retailMember('yr', member, hash));
    return originals.get(key)!;
};
const image = (source: any) => {
    if (!images.has(source.sha256)) images.set(source.sha256,
        new ShpFile(original(source.member, source.sha256).file));
    return images.get(source.sha256)!;
};
const routed = (route: string, hash: string) => {
    const file = profile.routes.get(route); assert(file, 'Missing formal route: ' + route);
    const bytes = fs.readFileSync(file); assert.equal(sha256(bytes), hash);
    return { file, sha256: hash, manifest: JSON.parse(bytes.toString()) };
};
const palette = (target: any, baselineTheater: string, indices: Iterable<number>, remapable: boolean) => {
    const a = original(target.member, target.sha256), b = original(unit[baselineTheater]);
    const material = [...new Set(indices)].filter(index => index && !(remapable && index >= 16 && index <= 31));
    const x = a.file.getBytes(), y = b.file.getBytes();
    const different = material.filter(index => [0, 1, 2].some(c => x[index * 3 + c] !== y[index * 3 + c]));
    assert.deepEqual(different, [], 'Different actual native material colors');
    return { targetSha256: a.sha256, acceptedNativePaletteSha256: b.sha256,
        status: a.sha256 === b.sha256 ? 'IDENTICAL_FULL_NATIVE_PALETTE' : 'IDENTICAL_ALL_USED_NATIVE_MATERIAL_COLORS',
        materialIndices: material.sort((a, b) => a - b), ownerIndices: remapable ? 'ORIGINAL_16_TO_31' : 'FIXED_MATERIAL' };
};
const familyCache = new Map<string, any>();
const familyFor = (identity: string, theater: string) => {
    identity = canonicalAlliedBuildingHdFamily(identity);
    const key = identity + '/' + theater;
    if (familyCache.has(key)) return familyCache.get(key);
    const coverage = buildingCoverage(identity, theater), batch = (sovietBuildingHdFamilies as any)[identity];
    const selectionName = coverage?.selection ?? batch?.selection
        ?? (identity === 'NAPOWR' ? 'soviet-power-plant' : identity === 'GAPOWR' ? 'power-plant' : undefined);
    assert(selectionName, 'No runtime building family');
    const route = `/local-hd/${selectionName}-selection.json`, selection = profile.selections.get(route) as any;
    assert(selection, 'Missing registered runtime selection');
    const members = coverage?.members ?? batch?.members ?? (identity === 'NAPOWR' ? napowrHdFamily.members
        : [...powerPlantMembers].map(([member, frames]) => ({ member, frames, artName: member.slice(0, -4).toUpperCase() })));
    assert.equal(selection.members.length, members.length);
    const finder = new ImageFinder({ has: (name: string) => {
        try { original(name); return true; } catch { return false; }
    } } as any, { settings: { newTheaterChar: characters[theater] } });
    const entries = members.map((member: any, index: number) => {
        const binding = selection.members[index]; assert.equal(binding.member, member.member);
        const loaded = routed(`/local-hd/${binding.sha256}/manifest.json`, binding.sha256);
        const source = loaded.manifest.source;
        const actual = original(finder.getFilename(member.artName ?? member.member.slice(0, -4).toUpperCase(), false));
        assert.equal(actual.sha256, source.sha256, 'Actual runtime-resolved building source differs');
        const native = image({ member: actual.file.filename, sha256: actual.sha256 });
        assert.equal(loaded.manifest.logical.frames.length, member.frames);
        assert.deepEqual(loaded.manifest.logical.canvas, [native.width, native.height]);
        for (const [ordinal, frame] of loaded.manifest.logical.frames.entries()) {
            const f = native.images[ordinal];
            assert.deepEqual(frame, { nativeFrame: ordinal, trimOrigin: [f.x, f.y], trimSize: [f.width, f.height],
                legacyRenderSize: [f.width + f.width % 2, f.height + f.height % 2], empty: !f.imageData.some(Boolean) });
        }
        for (const variant of loaded.manifest.variants) for (const page of variant.pages) for (const role of ['base', 'data']) {
            const file = profile.routes.get(binding.files[page[role]]); assert(file);
            assert.equal(fs.statSync(file).size, page[role + 'Bytes']);
        }
        assert(loaded.manifest.variants.some((variant: any) => variant.density === 4));
        return { member: member.member, actualMember: actual.file.filename, sourceSha256: actual.sha256,
            bodySlots: member.frames, totalNativeSlots: native.numImages, canvas: [native.width, native.height],
            manifest: loaded.file, manifestSha256: binding.sha256, native,
            acceptedDerived2X: !loaded.manifest.variants.some((variant: any) => variant.density === 2) };
    });
    const value = { identity, theater: coverage?.theater ?? 'TEMPERATE', route, entries, selection };
    familyCache.set(key, value); return value;
};
const qualified: any[] = [], unresolved: any[] = [];
for (const row of inventory.rows.filter((row: any) => ['building', 'overlay'].includes(row.kind)
    && row.decision === 'EXISTING_HD_REUSE_REQUIRES_COMPLETE_BINDING_AND_PALETTE_AUDIT')) {
    try {
        const family = familyFor(row.id, row.theater), members: any[] = [];
        const attachments = [family.selection.turret, ...Object.values(family.selection.turrets ?? {})]
            .filter(Boolean).map((binding: any) => routed(`/local-hd/${binding.sha256}/turret/manifest.json`, binding.sha256));
        for (const request of [{ role: 'BODY', source: row.source, palette: row.palette,
            remapable: row.remapable, hasShadow: row.hasShadow }, ...row.dependencies]) {
            if (request.source?.status === 'ORIGINAL_MEMBER_ABSENT' && request.role === 'ACTIVE'
                && ((row.id === 'GAREFN' && request.animation === 'GAREFNL4' && request.source.member === 'garefnl4.shp')
                    || (row.id === 'GAGAP' && request.animation === 'GAGAP_A' && request.source.member === 'gagap_a.shp'))) {
                assert.throws(() => original(request.source.member), 'The declared original image must actually be absent');
                const finder = new ImageFinder(new Map(), { settings: { newTheaterChar: characters[row.theater] } });
                assert.equal(finder.getFilename(request.animation, false), request.source.member);
                const helper = new BuildingShpHelper(finder), warnings: string[] = [], warn = console.warn;
                let skipped;
                try {
                    console.warn = (...values) => warnings.push(values.join(' '));
                    skipped = helper.collectAnimShpFiles({ getAll: () => new Map([['ACTIVE', [{ image: request.animation }]]]) },
                        { useTheaterExtension: false });
                } finally { console.warn = warn; }
                assert.equal(skipped.size, 0); assert.equal(warnings.length, 1);
                members.push({ role: request.role, member: request.source.member,
                    disposition: 'DECLARED_ORIGINAL_IMAGE_ABSENT_EXISTING_RENDERER_SKIPS_CHILD', warnings,
                    originalArt: request.nativeArt, authoredReplacementRequired: false });
                continue;
            }
            if (request.nativeVoxelAttachment) {
                const matching = attachments.filter(entry => entry.manifest.sources[request.source.member] === request.source.sha256);
                assert(matching.length && request.source.sha256, 'Unbound original voxel attachment: ' + request.source.member);
                original(request.source.member, request.source.sha256);
                members.push({ role: request.role, member: request.source.member, sourceSha256: request.source.sha256,
                    attachmentManifests: matching.map(entry => entry.sha256) });
                continue;
            }
            const entry = family.entries.find((entry: any) => entry.sourceSha256 === request.source?.sha256);
            assert(entry, 'Unbound original dependency: ' + request.role + '/' + request.source?.member);
            const native = image(request.source); assert.equal(native.numImages, entry.totalNativeSlots);
            assert.deepEqual([native.width, native.height], entry.canvas);
            let needed = request.hasShadow ? native.numImages / 2 : native.numImages;
            if (request.nativeArt) {
                const variants = [request.nativeArt, request.damagedNativeArt ?? request.nativeArt];
                needed = Math.max(...variants.map((fields, damaged) => {
                    const props = new AnimProps(new IniSection('original').fromJson(fields), native);
                    configureWarFactoryLayerPose(props, row.id, (AnimationType as any)[request.role], !!damaged);
                    // Building uses endLoop(), never endLoopAndPlayToEnd().
                    // Forward playback stops at loopEnd even for finite loops;
                    // reverse playback also starts at the explicit end frame.
                    const last = Math.max(props.start, props.loopStart, props.loopEnd, props.reverse ? props.end : 0);
                    return buildingAnimationDisplayFrame('yr', row.id, props, last) + 1;
                }));
            } else if (request.role === 'BIB' && request.hasShadow === undefined) needed = native.numImages / 2;
            assert(entry.bodySlots >= needed, 'Missing original animation display range: ' + request.role);
            const used = new Set<number>();
            for (const frame of native.images.slice(0, entry.bodySlots)) for (const index of frame.imageData) used.add(index);
            members.push({ role: request.role, member: request.source.member, sourceSha256: request.source.sha256,
                displayedSlots: entry.bodySlots, requiredNativeSlots: needed, totalNativeSlots: native.numImages,
                manifestSha256: entry.manifestSha256,
                palette: palette(request.palette ?? row.palette, family.theater, used, request.remapable ?? row.remapable) });
        }
        const turrets: any[] = [];
        for (const binding of [family.selection.turret, ...Object.values(family.selection.turrets ?? {})].filter(Boolean) as any[]) {
            const loaded = routed(`/local-hd/${binding.sha256}/turret/manifest.json`, binding.sha256), used = new Set<number>();
            for (const [member, hash] of Object.entries<string>(loaded.manifest.sources)) {
                const source = original(member, hash);
                if (member.endsWith('.vxl')) {
                    source.file.stream.seek(0);
                    for (const section of new VxlFile(source.file).sections)
                        for (const span of section.spans) for (const voxel of span.voxels) used.add(voxel.colorIndex);
                }
            }
            assert.equal(loaded.manifest.headings.length, 8);
            for (const heading of loaded.manifest.headings) for (const [field, hash] of [
                [heading.base, heading.baseSha256], [heading.mask, heading.maskSha256]]) {
                const file = profile.routes.get(`/local-hd/${binding.sha256}/turret/${field}`); assert(file);
                assert.equal(sha256(fs.readFileSync(file)), hash);
            }
            turrets.push({ manifest: loaded.file, sha256: binding.sha256, density: loaded.manifest.density,
                sources: loaded.manifest.sources, palette: palette(row.palette, 'TEMPERATE', used, true) });
        }
        qualified.push({ key: row.key, identity: row.id, theater: row.theater, kind: row.kind,
            selection: family.route, members, turrets, missions: Object.keys(row.usage) });
    } catch (error) {
        unresolved.push({ key: row.key, identity: row.id, theater: row.theater, kind: row.kind,
            missions: Object.keys(row.usage), reason: error instanceof Error ? error.message : String(error) });
    }
}
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({
    schema: 'yr-existing-building-overlay-source-reuse-v1', status: 'READ_ONLY_SOURCE_QUALIFICATION_NATIVE_ACTIONS_AND_CAP_ADMISSION_SEPARATE',
    inventory: inventoryFile, qualified, unresolved,
    policy: 'Use actual runtime family and theater resolution. Pin every original body, animation, construction/reverse and turret source; compare all admitted geometry and used native material colors. Target gameplay, animation ranges and native shadows remain original. Formal registration verifies payload hashes. No source, resource, selector or save is changed.',
    families: familyCache.size,
}, null, 2) + '\n');
console.log(JSON.stringify({ qualified: qualified.length, unresolved: unresolved.length, families: familyCache.size, output }));
