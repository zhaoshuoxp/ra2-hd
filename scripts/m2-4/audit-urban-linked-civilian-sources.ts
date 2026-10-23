// Inspect original linked members before reusing any accepted civilian animation.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ImageFinder } from '../../src/engine/ImageFinder';
import { ShpFile } from '../../src/data/ShpFile';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

const output = process.argv[2];
assert(output);
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const accepted = read('desktop/environment-hd-contract.json');
const donorRoot = path.join('.local/environment-packs', accepted.selectedPack.revision);
const donorPack = read(path.join(donorRoot, 'manifest.json'));
assert.equal(sha(readFileSync(path.join(donorRoot, 'manifest.json'))), accepted.selectedPack.sha256);
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const scopedSources = read('.artifacts/m2-4/urban-civilians-native-batch49-v1/source.json').sources;
const rows = [];
for (const edition of ['ra2', 'yr'] as const) {
    const tree = editionRetailTree(top, edition);
    const urbanPalette = resolveMember(tree, 'uniturb.pal').file.getBytes();
    for (const identity of ['CAAIRP', 'CAOILD', 'CAHOSP', 'CAMACH']) {
        if (!scopedSources.some((source: any) => source.bindings.some((binding: any) =>
            binding.edition === edition && binding.id === identity))) continue;
        const family = accepted.identities[edition][identity] ?? accepted.identities.yr[identity];
        assert(family);
        const images = new Map();
        for (const name of accepted.families[family].members) {
            for (const candidate of new Set([name, name[0] + 'u' + name.slice(2),
                name[0] + 'g' + name.slice(2), name[0] + 'a' + name.slice(2)])) {
                if (tree.some(({ mix }) => mix.containsFile(candidate)))
                    images.set(candidate, resolveMember(tree, candidate).file);
            }
        }
        const finder = new ImageFinder(images, { settings: { extension: '.urb', newTheaterChar: 'U' } });
        for (const donorName of accepted.families[family].members) {
            const entry = donorPack.families[family].members.find((row: any) => row.member === donorName);
            const manifestFile = path.join(donorRoot, entry.path);
            assert.equal(sha(readFileSync(manifestFile)), entry.sha256);
            const metadata = read(manifestFile);
            const artName = (donorName[0] + 'a' + donorName.slice(2, -4)).toUpperCase();
            const actualName = finder.getFilename(artName, false);
            const file = images.get(actualName);
            assert(file, actualName);
            const bytes = file.getBytes(), sourceSha256 = sha(bytes), shp = new ShpFile(file);
            const descriptor = accepted.sources[donorName];
            const palette = resolveMember(tree, descriptor.palette.member).file.getBytes();
            assert.equal(sha(palette), descriptor.palette.sha256);
            const used = new Set<number>();
            for (const frame of shp.images.slice(0, descriptor.bodyFrames))
                for (const index of frame.imageData) if (index && (index < 16 || index > 31)) used.add(index);
            const paletteDifferences = [...used].filter(index => [0, 1, 2]
                .some(channel => palette[index * 3 + channel] !== urbanPalette[index * 3 + channel]));
            const body = !donorName.includes('_');
            const exact = sourceSha256 === descriptor.sha256 && paletteDifferences.length === 0;
            assert.deepEqual([shp.width, shp.height], descriptor.canvas);
            assert(shp.numImages >= descriptor.bodyFrames);
            rows.push({ edition, identity, acceptedFamily: family, artName, actualName, donorName,
                sourceSha256, acceptedSourceSha256: descriptor.sha256, body,
                requiredBodyFrames: descriptor.bodyFrames, totalNativeFrames: shp.numImages,
                paletteSha256: sha(urbanPalette), paletteDifferences,
                acceptedManifestFile: manifestFile, acceptedManifestSha256: entry.sha256,
                status: exact ? 'EXACT_ORIGINAL_MEMBER_AND_PALETTE_CANDIDATE'
                    : body ? 'BODY_RUBBLE_DIFFERENCE_REQUIRES_COMPLETE_FAMILY_WORK'
                        : 'LINKED_MEMBER_DIFFERENCE_REQUIRES_INVESTIGATION' });
        }
    }
}
writeFileSync(output, JSON.stringify({ schema: 'm2-4-linked-civilian-original-source-audit-v1',
    status: 'READ_ONLY_SOURCE_PREFLIGHT_NOT_HD_COVERAGE', donorSelectedPack: accepted.selectedPack,
    rows, resourcesChanged: false, runtimeOrVisualAcceptance: false, windows: 'NOT_RUN', m24Complete: false,
    policy: 'Actual ImageFinder Urban/generic fallback and edition archive priority; whole original source and used fixed palette pins. Even exact linked members still require complete HD payload transfer and native cycle checks.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ cells: rows.length, exactLinkedCells: rows.filter(row => !row.body && row.status.startsWith('EXACT_')).length,
    unresolvedLinkedCells: rows.filter(row => !row.body && !row.status.startsWith('EXACT_')).length }));
