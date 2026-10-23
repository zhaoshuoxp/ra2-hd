// Verify remaining legacy faction families through the unchanged source resolver and accepted payloads.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import allied from '../../desktop/allied-building-coverage.json';
import soviet from '../../desktop/soviet-building-coverage.json';
import yuri from '../../desktop/yuri-building-coverage.json';
import { hdIdentities, sovietBatchIdentities, sovietBatchRevisions } from '../../desktop/hd-profile.mjs';
import { ImageFinder } from '../../src/engine/ImageFinder';
import { ShpFile } from '../../src/data/ShpFile';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { sovietBuildingHdFamilies } from '../../src/engine/renderable/builder/sovietBuildingHdFamilies';

const root = '.artifacts/m2-4/legacy-faction-reuse-batch84-20261020';
mkdirSync(root, { recursive: false });
const names = ['GAPOWR', 'GAREFN', 'NATECH', 'NAHAND', 'NARADR', 'NAWEAP', 'NAREFN',
    'NAWALL', 'NALASR', 'NAIRON', 'NADEPT', 'GAGAP', 'NANRCT', 'NAFLAK'];
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const tree = editionRetailTree(top, 'yr');
const definitions: any[] = [...Object.values(yuri),
    ...Object.values(soviet).filter(d => !['NAPSIS', 'NACLON'].includes(d.family)), ...Object.values(allied)];
const unitTem = resolveMember(tree, 'unittem.pal').file.getBytes();
for (const theater of ['DESERT', 'NEWURBAN']) {
    const files = new Map<string, { file: string; bytes: number; sha256: string }>();
    const pin = (file: string, expected?: string) => {
        const bytes = readFileSync(file), hash = files.get(file)?.sha256 ?? sha(bytes);
        if (expected) assert.equal(hash, expected, file);
        files.set(file, { file, bytes: bytes.length, sha256: hash });
        return bytes;
    };
    const pinTree = (folder: string) => {
        for (const entry of readdirSync(folder, { withFileTypes: true })) {
            const file = path.join(folder, entry.name);
            if (entry.isDirectory()) pinTree(file); else if (entry.isFile()) pin(file);
        }
    };
    const settings = theater === 'DESERT' ? { extension: '.des', newTheaterChar: 'D' }
        : { extension: '.ubn', newTheaterChar: 'N' };
    const paletteName = theater === 'DESERT' ? 'unitdes.pal' : 'unitubn.pal';
    const targetPalette = resolveMember(tree, paletteName).file.getBytes();
    const rows: any[] = [];
    for (const name of names) {
        const row: any = { edition: 'yr', theater, family: name, members: [], issues: [] };
        rows.push(row);
        try {
            let definition = definitions.find(d => d.family === name && d.theater === 'NEWURBAN')
                ?? definitions.find(d => d.family === name && d.theater === 'TEMPERATE');
            if (!definition && (sovietBuildingHdFamilies as any)[name]) {
                const key = name.toLowerCase();
                definition = { ...(sovietBuildingHdFamilies as any)[name], family: name,
                    familyPath: `hd-packs/soviet-${key}-authored/${(sovietBatchRevisions as any)[key]}/family.json`,
                    familyHash: (sovietBatchIdentities as any)[key] };
            }
            if (name === 'GAPOWR') {
                const familyPath = 'hd-packs/power-plant-authored/owner-r3/family.json';
                const family = JSON.parse(pin('.local/' + familyPath, hdIdentities.powerPlant).toString());
                definition = { family: name, selection: 'power-plant', theater: 'TEMPERATE', familyPath,
                    familyHash: hdIdentities.powerPlant, members: family.members.map((member: any, index: number) => {
                        const manifest = JSON.parse(pin(`.local/hd-packs/${member.packId}/${member.revision}/manifest.json`, member.sha256).toString());
                        return { member: member.member, sha256: manifest.source.sha256,
                            frames: manifest.logical.frames.length, canvas: manifest.logical.canvas,
                            artName: ['GAPOWR', 'GAPOWR_A', 'GAPOWRMK'][index] };
                    }) };
            }
            assert(definition?.familyHash && definition.familyPath, name);
            row.selection = definition.selection;
            const familyFile = '.local/' + definition.familyPath;
            const family = JSON.parse(pin(familyFile, definition.familyHash).toString());
            assert.equal(family.family, name);
            assert.equal(family.members.length, definition.members.length);
            Object.assign(row, { familyFile, familyHash: definition.familyHash });
            const images = new Map();
            for (const member of definition.members) {
                const original = member.artName.toLowerCase() + '.shp';
                for (const filename of new Set([original, original[0] + settings.newTheaterChar.toLowerCase() + original.slice(2),
                    original[0] + 'g' + original.slice(2)])) {
                    if (tree.some(owner => owner.mix.containsFile(filename))) images.set(filename, resolveMember(tree, filename).file);
                }
            }
            const finder = new ImageFinder(images, { settings });
            for (const [index, binding] of family.members.entries()) {
                const declared = definition.members[index];
                const actualMember = finder.getFilename(declared.artName, false);
                const original = images.get(actualMember);
                assert(original, actualMember);
                assert.equal(sha(original.getBytes()), declared.sha256, actualMember);
                const shp = new ShpFile(original);
                const folder = `.local/hd-packs/${binding.packId}/${binding.revision}`;
                const manifest = JSON.parse(pin(folder + '/manifest.json', binding.sha256).toString());
                assert.equal(manifest.source.member, declared.member);
                assert.equal(manifest.source.sha256, declared.sha256);
                assert.equal(manifest.source.theater, declared.theater ?? family.theater);
                assert.deepEqual(manifest.logical.canvas, [shp.width, shp.height]);
                const logical = shp.images.slice(0, declared.frames).map((f: any, nativeFrame: number) => ({
                    nativeFrame, trimOrigin: [f.x, f.y], trimSize: [f.width, f.height],
                    legacyRenderSize: [f.width + f.width % 2, f.height + f.height % 2], empty: !f.imageData.some(Boolean) }));
                assert.deepEqual(manifest.logical.frames, logical);
                for (const f of shp.images.slice(0, declared.frames)) for (const value of f.imageData)
                    if (value && (value < 16 || value > 31)) for (let c = 0; c < 3; c++)
                        assert.equal(unitTem[value * 3 + c], targetPalette[value * 3 + c], actualMember);
                assert(manifest.variants.some((v: any) => v.density === 4));
                for (const variant of manifest.variants) for (const page of variant.pages)
                    for (const role of ['base', 'data', 'map']) if (page[role]) pin(path.join(folder, page[role]), page[role + 'Sha256']);
                row.members.push({ canonicalMember: declared.member, actualMember, sourceSha256: declared.sha256,
                    manifestSha256: binding.sha256, logicalFrames: logical.length, canvas: manifest.logical.canvas,
                    authoredDensities: manifest.variants.map((v: any) => v.density), density2: manifest.variants.some((v: any) => v.density === 2)
                        ? 'ACCEPTED_AUTHORED_2X' : 'EXISTING_ACCEPTED_RESOLVER_DERIVES_2X_FROM_4X' });
            }
            if (family.turret) {
                const file = path.join(path.dirname(familyFile), family.turret.manifest);
                const turret = JSON.parse(pin(file, family.turret.sha256).toString());
                for (const [member, expected] of Object.entries(turret.sources))
                    assert.equal(sha(resolveMember(tree, member).file.getBytes()), expected);
                row.turret = { sha256: family.turret.sha256, sources: turret.sources,
                    density: turret.density, headings: turret.headings.length };
            }
            pinTree(path.dirname(familyFile));
            row.status = 'PASS_ORIGINAL_COMPLETE_FAMILY_FIXED_PALETTE_AND_ACCEPTED_PAYLOADS';
        } catch (error) {
            row.status = 'REQUIRES_SPECIFIC_SOURCE_OR_PAYLOAD_INVESTIGATION';
            row.issues.push(String(error));
        }
    }
    const result = { status: 'STATIC_AUDIT_ONLY_ACTUAL_NATIVE_BINDING_PENDING', theater, rows,
        palette: { member: paletteName, sha256: sha(targetPalette) }, files: [...files.values()],
        resourcesChanged: false, gameSourceChanged: false, newArtwork: false, coverageDelta: 0,
        policy: 'Verify actual existing legacy loaders before crediting source groups. Preserve accepted material, source geometry, owner indices, shadows, density derivation and budgets.',
        windows: 'NOT_RUN', m24Complete: false };
    writeFileSync(`${root}/${theater.toLowerCase()}-authority-v1.json`, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ theater, families: rows.length, passed: rows.filter(r => r.status.startsWith('PASS')).length,
        issues: rows.filter(r => r.issues.length).map(r => ({ family: r.family, issues: r.issues })), files: files.size }));
}
