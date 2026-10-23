// Pin complete accepted faction families and their actual Urban original sources.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import allied from '../../desktop/allied-building-coverage.json';
import soviet from '../../desktop/soviet-building-coverage.json';
import yuri from '../../desktop/yuri-building-coverage.json';
import { hdIdentities, sovietBatchIdentities, sovietBatchRevisions } from '../../desktop/hd-profile.mjs';
import { sovietBuildingHdFamilies } from '../../src/engine/renderable/builder/sovietBuildingHdFamilies';
import { napowrHdFamily } from '../../src/engine/renderable/builder/napowrHdFamily';
import { ImageFinder } from '../../src/engine/ImageFinder';
import { ShpFile } from '../../src/data/ShpFile';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

const output = process.argv[2];
assert(output);
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const files = new Map<string, { file: string; sha256: string; bytes: number }>();
function pin(file: string, expected?: string) {
    const bytes = readFileSync(file), digest = files.get(file)?.sha256 ?? sha(bytes);
    if (expected) assert.equal(digest, expected, file);
    files.set(file, { file, sha256: digest, bytes: bytes.length });
    return bytes;
}
const originalFile = '.artifacts/m2-4/urban-building-preflight-batch48-v1/faction-original-closure-v3.json';
const original = JSON.parse(pin(originalFile).toString());
assert(original.rows.every((row: any) => row.status === 'PASS_ORIGINAL_COMPLETE_FACTION_SOURCE_AND_FIXED_PALETTE'));
const cells = [...original.rows, ...['ra2', 'yr'].map(edition => ({ edition, family: 'GAPOWR' }))];
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const rows = [];
for (const edition of ['ra2', 'yr'] as const) {
    const tree = editionRetailTree(top, edition);
    const palettes = ['unittem.pal', 'uniturb.pal'].map(name => resolveMember(tree, name).file.getBytes());
    const definitions: any[] = [...(edition === 'yr' ? Object.values(yuri) : []),
        ...Object.values(soviet).filter(d => edition !== 'yr' || !['NAPSIS', 'NACLON'].includes(d.family)), ...Object.values(allied)];
    for (const cell of cells.filter((row: any) => row.edition === edition)) {
        const name = cell.family;
        let definition = definitions.find(d => d.family === name && d.theater === 'URBAN')
            ?? definitions.find(d => d.family === name && d.theater === 'TEMPERATE');
        if (!definition && (sovietBuildingHdFamilies as any)[name]) {
            const key = name.toLowerCase();
            definition = { ...(sovietBuildingHdFamilies as any)[name], family: name,
                familyPath: `hd-packs/soviet-${key}-authored/${(sovietBatchRevisions as any)[key]}/family.json`,
                familyHash: (sovietBatchIdentities as any)[key] };
        }
        if (!definition && name === 'NAPOWR') definition = { ...napowrHdFamily, family: name,
            selection: 'soviet-power-plant', familyPath: 'hd-packs/soviet-power-plant-authored/owner-r3/family.json',
            familyHash: hdIdentities.napowr, members: napowrHdFamily.members.map((member, index) => ({ ...member,
                artName: ['NAPOWR', 'NAPOWR_A', 'NAPOWRMK'][index], canvas: napowrHdFamily.canvas })) };
        if (name === 'GAPOWR') {
            const familyPath = 'hd-packs/power-plant-authored/owner-r3/family.json';
            const family = JSON.parse(pin('.local/' + familyPath, hdIdentities.powerPlant).toString());
            definition = { family: name, theater: 'TEMPERATE', selection: 'power-plant', familyPath,
                familyHash: hdIdentities.powerPlant, members: family.members.map((member: any, index: number) => {
                    const manifest = JSON.parse(pin(`.local/hd-packs/${member.packId}/${member.revision}/manifest.json`, member.sha256).toString());
                    return { member: member.member, sha256: manifest.source.sha256, frames: manifest.logical.frames.length,
                        canvas: manifest.logical.canvas, artName: ['GAPOWR', 'GAPOWR_A', 'GAPOWRMK'][index] };
                }) };
        }
        assert(definition?.familyHash && definition.familyPath, name);
        const familyFile = '.local/' + definition.familyPath;
        const family = JSON.parse(pin(familyFile, definition.familyHash).toString());
        assert.equal(family.family, name); assert.equal(family.members.length, definition.members.length);
        const images = new Map();
        for (const member of definition.members) {
            const filename = member.artName.toLowerCase() + '.shp';
            for (const candidate of new Set([filename, filename[0] + 'u' + filename.slice(2), filename[0] + 'g' + filename.slice(2)]))
                if (tree.some(({ mix }) => mix.containsFile(candidate))) images.set(candidate, resolveMember(tree, candidate).file);
        }
        const finder = new ImageFinder(images, { settings: { extension: '.urb', newTheaterChar: 'U' } });
        const members = [];
        for (const [index, binding] of family.members.entries()) {
            const declared = definition.members[index], actualMember = finder.getFilename(declared.artName, false);
            const source = images.get(actualMember); assert(source, actualMember);
            assert.equal(sha(source.getBytes()), declared.sha256, actualMember);
            const shp = new ShpFile(source);
            const folder = `.local/hd-packs/${binding.packId}/${binding.revision}`;
            const manifest = JSON.parse(pin(folder + '/manifest.json', binding.sha256).toString());
            assert.equal(manifest.source.member, declared.member); assert.equal(manifest.source.sha256, declared.sha256);
            assert.equal(manifest.source.theater, family.theater);
            assert.deepEqual(manifest.logical.canvas, [shp.width, shp.height]);
            const logical = shp.images.slice(0, declared.frames).map((frame: any, nativeFrame: number) => ({
                nativeFrame, trimOrigin: [frame.x, frame.y], trimSize: [frame.width, frame.height],
                legacyRenderSize: [frame.width + frame.width % 2, frame.height + frame.height % 2],
                empty: !frame.imageData.some(Boolean) }));
            assert.deepEqual(manifest.logical.frames, logical);
            for (const frame of shp.images.slice(0, declared.frames)) for (const value of frame.imageData)
                if (value && (value < 16 || value > 31)) for (let channel = 0; channel < 3; channel++)
                    assert.equal(palettes[0][value * 3 + channel], palettes[1][value * 3 + channel]);
            assert(manifest.variants.some((variant: any) => variant.density === 4));
            for (const variant of manifest.variants) for (const page of variant.pages)
                for (const role of ['base', 'data', 'map']) if (page[role]) pin(path.join(folder, page[role]), page[role + 'Sha256']);
            members.push({ canonicalMember: declared.member, actualMember, sourceSha256: declared.sha256,
                manifestSha256: binding.sha256, logicalFrames: logical.length, canvas: manifest.logical.canvas,
                authoredDensities: manifest.variants.map((variant: any) => variant.density),
                density2: manifest.variants.some((variant: any) => variant.density === 2)
                    ? 'ACCEPTED_AUTHORED_2X' : 'EXISTING_ACCEPTED_RESOLVER_DERIVES_2X_FROM_4X',
                nativeShadowPolicy: 'Whole original source hash preserves separate shadows and original owner indices' });
        }
        const pinTree = (folder: string) => {
            for (const entry of readdirSync(folder, { withFileTypes: true })) {
                const file = path.join(folder, entry.name);
                if (entry.isDirectory()) pinTree(file); else if (entry.isFile()) pin(file);
            }
        };
        pinTree(path.dirname(familyFile));
        rows.push({ edition, family: name, selection: definition.selection, familyFile,
            familyHash: definition.familyHash, members, turrets: family.turrets ?? family.turret,
            sharedTurretSelection: family.sharedTurretSelection,
            status: 'PASS_ORIGINAL_SOURCES_LOGICAL_FRAMES_FIXED_COLORS_AND_ACCEPTED_PAYLOAD_PINS',
            actualNativeBinding: 'PENDING' });
    }
}
writeFileSync(output, JSON.stringify({ status: 'STATIC_PASS_ACTUAL_NATIVE_BINDING_PENDING', rows,
    files: [...files.values()], sourceAudit: originalFile, resourcesChanged: false,
    policy: 'Accepted payloads and original shadows remain byte-exact. No new artwork, atlas regeneration, budget change or coverage closure is inferred before actual renderer binding checks. Existing accepted 2X derivation remains explicit.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ cells: rows.length, families: new Set(rows.map(row => row.family)).size, pinnedFiles: files.size }));
