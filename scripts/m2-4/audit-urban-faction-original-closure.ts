// Audit original complete faction sources through the application's actual filename resolver.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import allied from '../../desktop/allied-building-coverage.json';
import soviet from '../../desktop/soviet-building-coverage.json';
import yuri from '../../desktop/yuri-building-coverage.json';
import { ImageFinder } from '../../src/engine/ImageFinder';
import { ShpFile } from '../../src/data/ShpFile';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { sovietBuildingHdFamilies } from '../../src/engine/renderable/builder/sovietBuildingHdFamilies';
import { napowrHdFamily } from '../../src/engine/renderable/builder/napowrHdFamily';

const output = process.argv[2];
assert(output);
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const gaps = read('.artifacts/m2-4/urban-props-batch47-v1/coverage-delta.json').remainingGaps;
const families = new Set(gaps.filter((row: any) => row.kind === 'building').flatMap((row: any) => row.identities));
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const rows = [];
for (const edition of ['ra2', 'yr'] as const) {
    const tree = editionRetailTree(top, edition);
    const unitTem = resolveMember(tree, 'unittem.pal').file.getBytes();
    const unitUrban = resolveMember(tree, 'uniturb.pal').file.getBytes();
    const definitions: any[] = [...(edition === 'yr' ? Object.values(yuri) : []),
        ...Object.values(soviet).filter(d => edition !== 'yr' || !['NAPSIS', 'NACLON'].includes(d.family)),
        ...Object.values(allied)];
    for (const name of families as Set<string>) {
        if (!gaps.some((row: any) => row.kind === 'building' && row.identities.includes(name)
            && row.maps.some((map: string) => map.startsWith(edition + ':')))) continue;
        let definition = definitions.find(d => d.family === name && d.theater === 'URBAN')
            ?? definitions.find(d => d.family === name && d.theater === 'TEMPERATE');
        definition ??= (sovietBuildingHdFamilies as any)[name];
        if (name === 'NAPOWR' && !definition) definition = { ...napowrHdFamily,
            members: napowrHdFamily.members.map((member, index) => ({ ...member,
                artName: ['NAPOWR', 'NAPOWR_A', 'NAPOWRMK'][index], canvas: napowrHdFamily.canvas })) };
        if (!definition) continue;
        if (edition === 'ra2' && (['NAINDP', 'NABNKR'].includes(name)
            || Object.values(yuri).some(d => d.family === name) && !['NAPSIS', 'NACLON'].includes(name))) continue;
        const images = new Map();
        for (const member of definition.members) {
            const original = member.artName.toLowerCase() + '.shp';
            for (const filename of new Set([original, original[0] + 'u' + original.slice(2),
                original[0] + 'g' + original.slice(2)])) {
                if (tree.some(({ mix }) => mix.containsFile(filename)))
                    images.set(filename, resolveMember(tree, filename).file);
            }
        }
        const finder = new ImageFinder(images, { settings: { extension: '.urb', newTheaterChar: 'U' } });
        const members = [], issues = [];
        for (const member of definition.members) {
            const filename = finder.getFilename(member.artName, false), file = images.get(filename);
            if (!file) { issues.push(filename + ': missing original member'); continue; }
            const bytes = file.getBytes(), hash = sha(bytes), shp = new ShpFile(file);
            const used = new Set<number>();
            for (const frame of shp.images.slice(0, member.frames))
                for (const index of frame.imageData) if (index && (index < 16 || index > 31)) used.add(index);
            const paletteDifferences = [...used].filter(index => [0, 1, 2]
                .some(channel => unitTem[index * 3 + channel] !== unitUrban[index * 3 + channel]));
            if (hash !== member.sha256) issues.push(filename + ': accepted source hash differs');
            if (paletteDifferences.length) issues.push(filename + ': used fixed palette differs');
            if (shp.numImages < member.frames) issues.push(filename + ': missing body slots');
            const canvas = member.canvas ?? definition.canvas;
            if (shp.width !== canvas[0] || shp.height !== canvas[1]) issues.push(filename + ': source canvas differs');
            members.push({ canonicalMember: member.member, actualMember: filename, sha256: hash,
                expectedSha256: member.sha256, totalNativeFrames: shp.numImages, requiredBodyFrames: member.frames,
                usedFixedIndices: [...used].sort((a, b) => a - b), paletteDifferences });
        }
        rows.push({ edition, family: name, selection: definition.selection,
            status: issues.length ? 'REQUIRES_SOURCE_OR_PALETTE_INVESTIGATION'
                : 'PASS_ORIGINAL_COMPLETE_FACTION_SOURCE_AND_FIXED_PALETTE', members, issues,
            hdPayloadAndNativeBinding: 'PENDING_SEPARATE_AUTHORITY_AND_RUNTIME_CHECK' });
    }
}
writeFileSync(output, JSON.stringify({ status: 'READ_ONLY_ORIGINAL_CLOSURE_AUDIT_NOT_RESOURCE_COVERAGE',
    rows, resourcesChanged: false, coverageDeltaChanged: false,
    policy: 'Uses ImageFinder NewTheater fallback and edition-specific catalog priority. Source/hash/palette success alone does not close HD family coverage or user acceptance.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ editionFamilyCells: rows.length,
    originalClosurePass: rows.filter(row => row.status.startsWith('PASS_')).length,
    unresolved: rows.filter(row => !row.status.startsWith('PASS_')).length }));
