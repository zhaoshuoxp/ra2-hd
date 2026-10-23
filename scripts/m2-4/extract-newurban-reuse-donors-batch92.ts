// Retain the full native inputs for target-owned registration of accepted artwork.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ShpFile } from '../../src/data/ShpFile';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

const root = '.artifacts/m2-4/newurban-cross-name-reuse-batch92-20261020';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const pin = (file: string) => ({ file, sha256: sha(readFileSync(file)), bytes: readFileSync(file).length });
const guideFile = '.artifacts/m2-4/newurban-native-v1/source.json', guide = read(guideFile);
const choices = [
    ['cnpars05.shp', 'cupars05.shp', 'urban'],
    ['cnmiam07.shp', 'ctmiam07.shp', 'temperate'],
    ['cnmsc10.shp', 'cumsc10.shp', 'urban'],
    ['cnrus11.shp', 'ctrus11.shp', 'temperate'],
    ['cnfncp.shp', 'cufncp.shp', 'urban'],
];
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const trees = ['yr', 'ra2'].map(edition => editionRetailTree(top, edition as 'yr' | 'ra2'));
function exact(name: string, expected: string) {
    for (const tree of trees) if (tree.some(({ mix }) => mix.containsFile(name))) {
        const file = resolveMember(tree, name).file;
        if (sha(file.getBytes()) === expected) return file;
    }
    throw Error(`Pinned source unavailable: ${name} ${expected}`);
}
mkdirSync(`${root}/donors-v1`);
const records = choices.map(([targetMember, member, theater]) => {
    const contract = read(`desktop/environment-${theater === 'temperate' ? '' : theater + '-'}hd-contract.json`);
    const manifestFile = path.join('.local/environment-packs', contract.selectedPack.revision, 'manifest.json');
    assert.equal(pin(manifestFile).sha256, contract.selectedPack.sha256);
    const descriptor = contract.sources[member], original = exact(member, descriptor.sha256);
    const native = new ShpFile(original), folder = `${root}/donors-v1/${member.replace('.', '-')}`;
    mkdirSync(folder);
    const file = `${folder}/${member}`;
    writeFileSync(file, original.getBytes(), { flag: 'wx' });
    const family = Object.entries(contract.families).find(([, value]: any) => value.members.includes(member));
    assert(family);
    const entry = read(manifestFile).families[family[0]].members.find((entry: any) => entry.member === member);
    const acceptedMetadata = pin(path.join(path.dirname(manifestFile), entry.path));
    assert.equal(acceptedMetadata.sha256, entry.sha256);
    const frames = native.images.slice(0, descriptor.bodyFrames).map((frame, slot) => {
        const palette = descriptor.framePalettes?.[String(slot)] ?? descriptor.palette;
        const paletteFile = `${folder}/${palette.sha256}.pal`;
        try { assert.equal(pin(paletteFile).sha256, palette.sha256); }
        catch { writeFileSync(paletteFile, exact(palette.member, palette.sha256).getBytes(), { flag: 'wx' }); }
        const indexFile = `${folder}/${slot}.index`;
        writeFileSync(indexFile, frame.imageData, { flag: 'wx' });
        return { slot, origin: [frame.x, frame.y], size: [frame.width, frame.height],
            index: pin(indexFile), palette: pin(paletteFile) };
    });
    return { targetMember, member, theater, descriptor, original: pin(file), frames, acceptedMetadata };
});
writeFileSync(`${root}/selected-donor-inputs-v1.json`, JSON.stringify({
    status: 'EXTRACTED_ORIGINAL_INPUTS_FOR_FIVE_CANDIDATES_NOT_COVERAGE', originalGuide: pin(guideFile),
    crossNameAudit: pin(`${root}/cross-name-donor-audit-v1.json`), records,
    originalArchivesEdited: false, windows: 'NOT_RUN', m24Complete: false
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ sources: records.length, frames: records.map(r => [r.targetMember, r.frames.length]) }));
