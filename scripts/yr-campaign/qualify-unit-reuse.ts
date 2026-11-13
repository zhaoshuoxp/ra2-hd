import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerHdResources, hdIdentities } from '../../desktop/hd-profile.mjs';
import { unitHdFamiliesForEdition } from '../../src/engine/renderable/builder/unitHdFamilies';
import { sharedAlliedUnitHdIdentity } from '../../src/engine/renderable/builder/sharedAlliedUnitHd';
import { sharedYuriUnitHdIdentity } from '../../src/engine/renderable/builder/sharedYuriUnitHd';
import { vxlUnitAvailableInTheater, vxlUnitFamilies } from '../../src/engine/renderable/unitVxl/identities';
import { vxlParent } from '../../src/engine/renderable/builder/loadSovietUnitsHd';
import { VxlFile } from '../../src/data/VxlFile';
import { campaignVxlReuseAllowed } from '../../src/engine/renderable/unitVxl/campaignVxlReuse';
import { campaignTaskNpcAllowed, taskNpcContracts } from '../../src/engine/renderable/builder/campaignTaskNpcHd';
import { nativeShpSource, retailMember, resourceRoot, sha256 } from '../test-support/resources';

const [output, inventoryFile] = process.argv.slice(2), out = path.resolve(output);
fs.mkdirSync(out, { recursive: false });
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const inventory = read(inventoryFile), registration: unknown[] = [];
const profile = await registerHdResources(resourceRoot, (record: unknown) => registration.push(record));
const families = unitHdFamiliesForEdition('yr'), palette = retailMember('yr', 'unittem.pal');
const cache = new Map<string, any>(), qualified: any[] = [], unresolved: any[] = [];
const palettes = new Map<string, Uint8Array>(), voxelIndices = new Map<string, number[]>();
const usedVoxels = (member: string, hash: string) => {
    if (!voxelIndices.has(hash)) {
        const source = new VxlFile(retailMember('yr', member, hash).file), indices = new Set<number>();
        for (const section of source.sections) for (const span of section.spans)
            for (const voxel of span.voxels) indices.add(voxel.colorIndex);
        voxelIndices.set(hash, [...indices]);
    }
    return voxelIndices.get(hash)!;
};
const paletteQualification = (target: any, usedIndices: number[]) => {
    if (target.sha256 === palette.sha256) return { status: 'FULL_ORIGINAL_PALETTE_IDENTICAL', sha256: target.sha256 };
    if (!palettes.has(target.sha256)) palettes.set(target.sha256,
        retailMember('yr', target.member, target.sha256).file.getBytes());
    const actual = palettes.get(target.sha256)!, baseline = palette.file.getBytes();
    const material = [...new Set(usedIndices)].filter(index => index && (index < 16 || index > 31)).sort((a, b) => a - b);
    const different = material.filter(index => [0, 1, 2].some(channel => actual[index * 3 + channel] !== baseline[index * 3 + channel]));
    assert.deepEqual(different, [], 'Actual native material indices require target palette adaptation');
    return { status: 'ALL_USED_NATIVE_MATERIAL_COLORS_IDENTICAL', paletteSha256: target.sha256,
        baselinePaletteSha256: palette.sha256, materialIndices: material };
};
const routed = (route: string, expected: string) => {
    const file = profile.routes.get(route); assert(file, 'Missing registered formal resource: ' + route);
    const bytes = fs.readFileSync(file); assert.equal(sha256(bytes), expected);
    return { route, file, sha256: expected, manifest: JSON.parse(bytes.toString()) };
};
const shpFamily = (identity: string) => {
    const key = 'shp/' + identity;
    if (cache.has(key)) return cache.get(key);
    const dedicated = identity === 'E2';
    let contract = families[identity]; assert(dedicated || contract && !contract.blockedReason, 'Unavailable SHP family');
    const route = dedicated ? '/local-hd/selection.json'
        : `/local-hd/${contract.selection ?? 'unit-' + identity.toLowerCase()}-selection.json`;
    const selection = profile.selections.get(route) as any;
    assert(selection, 'Missing registered unit selection');
    let originalTaskShadowRendering: boolean | undefined;
    if (taskNpcContracts[identity]) {
        const taskContract = taskNpcContracts[identity];
        const bytes = fs.readFileSync(path.join(resourceRoot, taskContract.familyPath));
        assert.equal(sha256(bytes), taskContract.familyHash);
        originalTaskShadowRendering = JSON.parse(bytes.toString()).originalShadowRendering;
        assert.equal(typeof originalTaskShadowRendering, 'boolean');
    }
    if (dedicated) {
        assert.equal(selection.sha256, hdIdentities.conscript);
        const { manifest } = routed(`/local-hd/${selection.sha256}/manifest.json`, selection.sha256);
        contract = { identity, familyHash: selection.sha256, members: [{ member: 'cons.shp',
            sourceHash: manifest.source.sha256, manifestHash: selection.sha256, frames: 301, totalFrames: 602,
            canvas: manifest.logical.canvas }], projectiles: [] };
    } else {
        assert(selection.familyHash === contract.familyHash && selection.rulesIdentity === identity);
        assert.equal(selection.members.length, contract.members.length);
    }
    const used = new Set<number>();
    const members = contract.members.map(member => {
        const binding = dedicated ? [selection] : selection.members.filter((entry: any) => entry.member === member.member);
        assert.equal(binding.length, 1); assert.equal(binding[0].sha256, member.manifestHash);
        const loaded = routed(`/local-hd/${member.manifestHash}/manifest.json`, member.manifestHash);
        const manifest = loaded.manifest;
        const native = nativeShpSource('yr', member.member, member.sourceHash, member.frames, contract.authoringTheater ?? 'TEMPERATE');
        assert.equal(native.image.numImages, member.totalFrames);
        for (const frame of native.image.images.slice(0, member.frames)) for (const index of frame.imageData) used.add(index);
        assert.deepEqual(native.source.canvas, [...member.canvas]);
        assert.equal(manifest.source.sha256, member.sourceHash);
        if (!dedicated) assert.deepEqual(manifest.rulesIdentities, [identity]);
        assert.deepEqual(manifest.logical, { canvas: native.source.canvas, frames: native.source.frames });
        const densities = manifest.variants.map((variant: any) => variant.density);
        assert(densities.includes(4), 'The requested 4X needs a complete accepted variant');
        for (const variant of manifest.variants) for (const page of variant.pages)
            for (const role of variant.storage ? ['base', 'data', 'map'] : ['base', 'data']) {
                const file = profile.routes.get(binding[0].files[page[role]]);
                assert(file && fs.statSync(file).size === page[role + 'Bytes'], 'Incomplete registered SHP page');
            }
        return { member: member.member, sourceSha256: member.sourceHash, manifest: loaded.file,
            manifestSha256: member.manifestHash, bodySlots: member.frames, totalNativeSlots: member.totalFrames,
            densities, acceptedDerived2X: !densities.includes(2) };
    });
    const value = { identity, selection: route, familyHash: contract.familyHash, members, originalTaskShadowRendering,
        usedIndices: [...used].sort((a, b) => a - b),
        geometry: 'Every original canvas, trim, frame ordinal, empty state and native shadow count matches.' };
    cache.set(key, value); return value;
};
const vxlFamily = (identity: string, theater: string, sources: any[], unitPaletteSha256: string) => {
    if (identity === 'HTNK') {
        if (cache.has('vxl/HTNK')) return cache.get('vxl/HTNK');
        const loaded = routed('/local-rhino/manifest.json', hdIdentities.rhino), manifest = loaded.manifest;
        const used = new Set<number>();
        for (const [member, hash] of Object.entries<string>(manifest.sources)) {
            retailMember('yr', member, hash);
            if (member.endsWith('.vxl')) for (const index of usedVoxels(member, hash)) used.add(index);
        }
        for (const part of ['body', 'turret']) for (const heading of [0, 45, 90, 135, 180, 225, 270, 315]) {
            const name = `${part}-${heading}`, descriptor = manifest.parts[name]; assert(descriptor);
            for (const [extension, expected] of [['png', descriptor.sha256], ['mask', descriptor.maskSha256]]) {
                const file = profile.routes.get(`/local-rhino/${name}.${extension}`); assert(file);
                assert.equal(sha256(fs.readFileSync(file)), expected);
                if (extension === 'mask') assert.equal(fs.statSync(file).size, 320 * 288);
            }
        }
        const value = { identity, usedIndices: [...used].sort((a, b) => a - b),
            geometry: 'Dedicated accepted Rhino material pipeline retains original VXL/HVA geometry and all sixteen heading materials.',
            variants: [2, 4].map(requestedDensity => ({ requestedDensity, sourceDensity: 4,
                acceptedDerived2X: requestedDensity === 2, sources: manifest.sources,
                manifest: loaded.file, manifestSha256: loaded.sha256 })) };
        cache.set('vxl/HTNK', value); return value;
    }
    const contract = vxlUnitFamilies[identity];
    assert(contract && (!contract.edition || contract.edition === 'yr')
        && (vxlUnitAvailableInTheater(contract, theater) || sources.length && sources.every(source =>
            campaignVxlReuseAllowed(identity, contract, theater, { campaign: { launch: {
                edition: 'yr', mission: source.mission, sourceSha256: source.sha256 } } }, unitPaletteSha256))),
        'Unavailable VXL family for edition/theater/source');
    const key = 'vxl/' + identity;
    if (cache.has(key)) return cache.get(key);
    const used = new Set<number>();
    const variants = [2, 4].map(requested => {
        const selected = contract.variants ? contract.variants.find(variant => variant.density === requested) : contract;
        assert(selected, 'Missing complete accepted VXL density');
        const loaded = routed(`/local-vxl/${selected.hash}/manifest.json`, selected.hash), manifest = loaded.manifest;
        assert.equal(manifest.schema, 'unit-vxl-family-v1'); assert.equal(manifest.identity, identity);
        assert(manifest.parts.length && manifest.density >= requested);
        for (const [member, expected] of Object.entries<string>(manifest.sources)) retailMember('yr', member, expected);
        for (const member of contract.members) assert(manifest.sources[member], 'Missing native VXL member: ' + member);
        for (const part of manifest.parts) {
            assert(contract.members.includes(part.member), 'Unqualified VXL part source');
            const hash = manifest.sources[part.member];
            for (const index of usedVoxels(part.member, hash)) used.add(index);
            assert(part.frames.length && part.frames.every((frame: any) => frame.rect.length === 4
                && frame.logicalSize.length === 2 && frame.offset.length === 2));
            for (const asset of Object.values<any>(part.files)) {
                const file = profile.routes.get(`/local-vxl/${selected.hash}/${asset.file}`);
                assert(file && fs.statSync(file).size === asset.bytes, 'Incomplete registered VXL page');
            }
        }
        return { requestedDensity: requested, sourceDensity: manifest.density, acceptedDerived2X: manifest.density > requested,
            manifest: loaded.file, manifestSha256: loaded.sha256, sources: manifest.sources,
            parts: manifest.parts.map((part: any) => ({ member: part.member, section: part.section, poses: part.frames.length })) };
    });
    const value = { identity, variants, usedIndices: [...used].sort((a, b) => a - b),
        geometry: 'Accepted part poses and offsets are retained; all original VXL/HVA sources are pinned.' };
    cache.set(key, value); return value;
};

for (const row of inventory.rows.filter((row: any) => ['infantry', 'vehicle', 'aircraft'].includes(row.kind)
    && row.decision === 'EXISTING_HD_REUSE_REQUIRES_COMPLETE_BINDING_AND_PALETTE_AUDIT')) {
    const entry: any = { key: row.key, identity: row.id, theater: row.theater, kind: row.kind,
        source: row.source, missions: Object.keys(row.usage), palette: row.palette };
    try {
        assert(row.remapable || taskNpcContracts[row.id], 'Target neutral material policy needs independent qualification');
        if (row.source.member.endsWith('.shp')) {
            const identity = sharedYuriUnitHdIdentity(sharedAlliedUnitHdIdentity(row.id, { filename: row.source.member }),
                { filename: row.source.member }, 'yr');
            const family = shpFamily(identity), member = family.members.find((member: any) => member.member === row.source.member);
            if (taskNpcContracts[identity]) {
                const sources = Object.keys(row.usage).map(mission => {
                    const map = inventory.maps.find((map: any) => map.mission === mission);
                    assert(map); return { mission, sha256: map.sourceSha256 };
                });
                assert(sources.every(source => campaignTaskNpcAllowed(taskNpcContracts[identity], row.theater,
                    { campaign: { launch: { edition: 'yr', mission: source.mission, sourceSha256: source.sha256 } } },
                    row.palette.sha256)), 'Task NPC is outside its exact original mission or palette scope');
                entry.campaignSourceAdmission = sources;
            }
            assert(member?.sourceSha256 === row.source.sha256, 'Primary SHP does not match the runtime family');
            assert.equal(member.totalNativeSlots, row.source.totalFrames);
            if (family.originalTaskShadowRendering !== undefined) {
                assert.equal(row.hasShadow, family.originalTaskShadowRendering);
                assert.equal(member.totalNativeSlots, member.bodySlots * 2);
                entry.originalShadowRendering = row.hasShadow;
                entry.unusedEncodedNativeShadowSlots = row.hasShadow ? 0 : member.bodySlots;
            } else assert.equal(member.totalNativeSlots, member.bodySlots * (row.hasShadow ? 2 : 1));
            entry.paletteQualification = paletteQualification(row.palette, family.usedIndices);
            entry.family = 'shp/' + identity;
        } else {
            assert(row.source.member.endsWith('.vxl'), 'Unexpected unit source format');
            const identity = vxlParent(row.id);
            const sources = Object.keys(row.usage).map(mission => {
                const map = inventory.maps.find((map: any) => map.mission === mission);
                assert(map); return { mission, sha256: map.sourceSha256 };
            });
            const family = vxlFamily(identity, row.theater, sources, row.palette.sha256);
            if (vxlUnitFamilies[identity] && !vxlUnitAvailableInTheater(vxlUnitFamilies[identity], row.theater))
                entry.campaignSourceAdmission = sources;
            const unusedTurret = String(row.nativeRules.Turret).toLowerCase() === 'no';
            entry.unusedNativeReferences = unusedTurret ? row.dependencies
                .filter((dependency: any) => ['tur', 'barl'].includes(dependency.role)) : [];
            for (const variant of family.variants) {
                assert.equal(variant.sources[row.source.member], row.source.sha256);
                for (const dependency of row.dependencies) {
                    if (unusedTurret && ['tur', 'barl'].includes(dependency.role)) continue;
                    assert.equal(variant.sources[dependency.source.member], dependency.source.sha256);
                    if (dependency.hva) assert.equal(variant.sources[dependency.hva.member], dependency.hva.sha256);
                }
            }
            entry.paletteQualification = paletteQualification(row.palette, family.usedIndices);
            entry.family = 'vxl/' + identity;
        }
        entry.status = 'PASS_FORMAL_FAMILY_BINDING_SOURCE_PALETTE_AND_GEOMETRY_NATIVE_REVIEW_SEPARATE';
        qualified.push(entry);
    } catch (error) { unresolved.push({ ...entry, reason: String(error) }); }
}
const report = { schema: 'yr-formal-unit-source-qualification-v1',
    status: 'READ_ONLY_COMPLETE_FORMAL_SOURCE_CANDIDATES_NATIVE_REUSE_VALIDATION_PENDING',
    inventory: { file: path.resolve(inventoryFile), sha256: sha256(fs.readFileSync(inventoryFile)) },
    authoringPalette: { member: 'unittem.pal', sha256: palette.sha256 },
    policy: 'Actual edition/theater runtime selections, complete families, original source hashes, SHP geometry/slots/shadows, VXL/HVA sources, registered page identities and every used native material color are checked. Original owner indices retain their house-color semantics. Explicit Turret=no makes legacy turret/barrel references unused. Accepted derived 2X paths remain explicit. Native action, current world-cap admission and visual acceptance require separate evidence. No resource, selector, original source or actual user profile is modified.',
    families: Object.fromEntries(cache), qualified, unresolved, registration, runtimeSelectionsChanged: 0 };
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ families: cache.size, qualified: qualified.length, unresolved: unresolved.length, out }));
