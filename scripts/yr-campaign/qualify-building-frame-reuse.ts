import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerHdResources } from '../../desktop/hd-profile.mjs';
import { ShpFile } from '../../src/data/ShpFile';
import { ObjectArt } from '../../src/game/art/ObjectArt';
import { ObjectType } from '../../src/engine/type/ObjectType';
import { retailIni, retailMember, sha256 } from '../test-support/resources';

const [output, inventoryFile] = process.argv.slice(2);
assert(output && inventoryFile, 'Expected a new output directory and current art inventory');
fs.mkdirSync(output, { recursive: false });
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const inventory = read(inventoryFile), profile = await registerHdResources('.local');
const art = retailIni('yr', 'art'), palettes = new Map<string, Uint8Array>();
const unit: Record<string, string> = { TEMPERATE: 'unittem.pal', SNOW: 'unitsno.pal', URBAN: 'uniturb.pal',
    NEWURBAN: 'unitubn.pal', DESERT: 'unitdes.pal', LUNAR: 'unitlun.pal' };
const iso: Record<string, string> = { TEMPERATE: 'isotem.pal', SNOW: 'isosno.pal', URBAN: 'isourb.pal',
    NEWURBAN: 'isoubn.pal', DESERT: 'isodes.pal', LUNAR: 'isolun.pal' };
const palette = (value: any) => {
    const key = value.member + '/' + (value.sha256 ?? '');
    if (!palettes.has(key)) palettes.set(key, retailMember('yr', value.member, value.sha256).file.getBytes());
    return palettes.get(key)!;
};
const original = (member: string, hash: string) => {
    for (const edition of ['yr', 'ra2'] as const) {
        try { return new ShpFile(retailMember(edition, member, hash).file); }
        catch { /* Accepted RA2-only donors keep their independently pinned source. */ }
    }
    throw Error('No pinned original source: ' + member + '/' + hash);
};
const signature = (frame: any) => sha256(Buffer.concat([Buffer.from(JSON.stringify([frame.width, frame.height])),
    frame.imageData]));
const donors = new Map<string, any[]>(), seen = new Set<string>();
const add = (selection: any, native: any, theater: string, family: string) => {
    const route = selection.manifest ?? `/local-hd/${selection.sha256}/manifest.json`;
    const file = profile.routes.get(route);
    assert(file, 'Missing registered donor manifest: ' + route);
    const bytes = fs.readFileSync(file); assert.equal(sha256(bytes), selection.sha256);
    const manifest = JSON.parse(bytes.toString());
    const key = selection.sha256 + '/' + JSON.stringify(native);
    if (seen.has(key)) return;
    seen.add(key);
    const image = original(native.member, native.sha256);
    for (const logical of manifest.logical.frames) {
        const frame = image.images[logical.nativeFrame]; assert(frame);
        assert.deepEqual(logical.trimSize, [frame.width, frame.height]);
        assert.deepEqual(logical.trimOrigin, [frame.x, frame.y]);
        if (!frame.imageData.some(Boolean)) continue;
        const key = signature(frame), choices = donors.get(key) ?? [];
        choices.push({ family, theater, member: native.member, sourceSha256: native.sha256,
            frame: logical.nativeFrame, canvas: [image.width, image.height], origin: [frame.x, frame.y],
            size: [frame.width, frame.height], palette: native.framePalettes?.[logical.nativeFrame] ?? native.palette,
            remapable: native.framePalettes?.[logical.nativeFrame]?.remapable ?? native.remapable,
            manifest: file, manifestSha256: selection.sha256 });
        donors.set(key, choices);
    }
};
for (const name of ['soviet', 'allied', 'yuri']) {
    const coverage = read(`desktop/${name}-building-coverage.json`);
    for (const family of Object.values<any>(coverage)) {
        const selection = profile.selections.get(`/local-hd/${family.selection}-selection.json`);
        if (!selection) continue;
        for (const member of family.members) {
            const registered = selection.members.find((item: any) => item.member === member.member); assert(registered);
            const section = art.getSection(family.family);
            const remapable = ObjectArt.getDefaultRemapability(ObjectType.Building)
                && !section?.getBool('TerrainPalette') && !section?.getBool('AnimPalette');
            const nativePalette = section?.getBool('TerrainPalette') ? iso[family.theater]
                : section?.getBool('AnimPalette') ? 'anim.pal' : unit[family.theater];
            add(registered, { member: member.member, sha256: member.sha256,
                palette: { member: nativePalette }, remapable }, family.theater, family.family);
        }
    }
}
for (const theater of Object.keys(unit)) {
    const suffix = theater === 'TEMPERATE' ? '' : '-' + theater.toLowerCase();
    const file = `desktop/environment${suffix}-hd-contract.json`;
    if (!fs.existsSync(file)) continue;
    const contract = read(file);
    const route = `/local-environment${theater === 'TEMPERATE' ? '' : '/' + theater.toLowerCase()}/selection.json`;
    const selection = profile.selections.get(route);
    for (const [family, selected] of Object.entries<any>(selection?.families ?? {})) {
        const declared = contract.families[family];
        assert.equal(selected.familyHash, declared.familyHash);
        for (const member of selected.members) {
            const native = declared.sourceOverrides?.[member.member] ?? contract.sources[member.member];
            if (native) add(member, { ...native, member: member.member }, theater, family);
        }
    }
}
const rows: any[] = [];
for (const row of inventory.rows.filter((item: any) => item.kind === 'building'
    && item.decision === 'MISSING_AUTHORED_FAMILY')) {
    const image = original(row.source.member, row.source.sha256);
    const body = row.hasShadow ? image.numImages / 2 : image.numImages;
    const frames = image.images.slice(0, body).map((frame, ordinal) => {
        const targetPalette = { ...(body === 4 && ordinal === 3 ? { member: iso[row.theater] } : row.palette) };
        const targetRemap = body === 4 && ordinal === 3 ? false : row.remapable;
        const choices = (donors.get(signature(frame)) ?? []).map(donor => {
            const a = palette(targetPalette), b = palette(donor.palette), differences = new Set<number>();
            for (const index of frame.imageData) {
                if (!index) continue;
                if (index >= 16 && index <= 31 && targetRemap && donor.remapable) continue;
                if (index >= 16 && index <= 31 && !!targetRemap !== !!donor.remapable) differences.add(index);
                else if ([0, 1, 2].some(channel => a[index * 3 + channel] !== b[index * 3 + channel])) differences.add(index);
            }
            return { ...donor, paletteAndOwnershipMatch: !differences.size,
                differingIndices: [...differences].sort((a, b) => a - b),
                exactCanvasAndOrigin: image.width === donor.canvas[0] && image.height === donor.canvas[1]
                    && frame.x === donor.origin[0] && frame.y === donor.origin[1] };
        });
        return { frame: ordinal, empty: !frame.imageData.some(Boolean), origin: [frame.x, frame.y],
            size: [frame.width, frame.height], signature: signature(frame), targetPalette,
            targetRemapable: targetRemap, donors: choices };
    });
    rows.push({ key: row.key, identity: row.id, theater: row.theater, source: row.source,
        canvas: [image.width, image.height], nativeBodyFrames: body, frames });
}
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({
    schema: 'yr-original-building-frame-reuse-candidates-v1', inventory: inventoryFile,
    status: 'READ_ONLY_NOT_REGISTERED',
    policy: 'Exact native trimmed indices and dimensions locate donors. Actual palette and owner semantics are compared separately. Reuse still requires complete target state coverage, target-owned canvas, origins and shadows, verified HD samples and native density validation. No source, payload or selection is modified.',
    donorManifests: seen.size, rows,
}, null, 2) + '\n');
console.log(JSON.stringify({ donorManifests: seen.size, buildings: rows.length,
    completeBodyCandidates: rows.filter(row => row.frames.every((frame: any) => frame.empty
        || frame.donors.some((donor: any) => donor.paletteAndOwnershipMatch))).map(row => row.theater + '/' + row.identity),
    partialBodyCandidates: rows.filter(row => row.frames.some((frame: any) => frame.donors.length))
        .map(row => ({ identity: row.identity, matchedFrames: row.frames.filter((frame: any) => frame.donors.length).map((frame: any) => frame.frame) })),
    output,
}));
