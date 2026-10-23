// Read actual animation sequences and legacy decal rules before authoring new material.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { IniFile } from '../../src/data/IniFile';
import { ShpFile } from '../../src/data/ShpFile';
import { SequenceReader } from '../../src/game/art/SequenceReader';
import { SequenceType } from '../../src/game/art/SequenceType';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

const root = '.artifacts/m2-4/newurban-final-actors-batch98-20261021';
mkdirSync(root, { recursive: true });
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const tree = editionRetailTree(top, 'yr');
const artFile = resolveMember(tree, 'artmd.ini').file;
const rulesFile = resolveMember(tree, 'rulesmd.ini').file;
const art = new IniFile(artFile), rules = new IniFile(rulesFile);
const guide = read('.artifacts/m2-4/newurban-native-v1/source.json');
const actors = ['CIV1', 'DNOA', 'GAFWLL'].map(id => {
    const source = guide.sources.find((s: any) => s.bindings.some((b: any) => b.id === id));
    assert(source);
    const original = resolveMember(tree, source.member).file;
    assert.equal(sha(original.getBytes()), source.sha256);
    const shp = new ShpFile(original);
    const sequenceName = art.getSection(id)?.getString('Sequence');
    const section = sequenceName ? art.getSection(sequenceName) : undefined;
    const sequences = section ? [...new SequenceReader().readIni(section)].map(([type, params]) => {
        const facings = params.onlyFacing === undefined ? Array.from({ length: 8 }, (_, n) => n) : [params.onlyFacing];
        const frames = [...new Set(facings.flatMap(facing => Array.from({ length: params.frameCount },
            (_, n) => params.startFrame + facing * params.facingMult + n)))].sort((a, b) => a - b);
        assert(frames.every(n => n >= 0 && n < shp.images.length));
        return { name: SequenceType[type], ...params, facings, frames };
    }) : [];
    const active = [...new Set(sequences.flatMap(seq => seq.frames))].sort((a, b) => a - b);
    const populated = shp.images.flatMap((frame, slot) => frame.imageData.some(Boolean) ? [slot] : []);
    return { id, member: source.member, sourceSha256: source.sha256,
        nativeArt: Object.fromEntries(art.getSection(id)?.entries ?? []),
        nativeRules: Object.fromEntries(rules.getSection(id)?.entries ?? []),
        sequenceName, rawSequence: Object.fromEntries(section?.entries ?? []), sequences,
        declaredSequenceFrames: active, populatedFrames: populated,
        populatedOutsideDeclaredSequences: populated.filter(n => !active.includes(n)),
        declaredTrimPixels: active.reduce((sum, n) => sum + shp.images[n].width * shp.images[n].height, 0),
        totalFrames: shp.images.length, authored: false };
});
const smudges = [...rules.getSection('SmudgeTypes')!.entries].map(([index, name]) => {
    const section = rules.getSection(String(name));
    const values = Object.fromEntries(section?.entries ?? []);
    return { index, id: name, nativeRules: values, nativeArt: Object.fromEntries(art.getSection(String(name))?.entries ?? []),
        crater: section?.getBool('Crater', false) ?? false,
        burn: section?.getBool('Burn', false) ?? false,
        width: section?.getNumber('Width', 1) ?? 1, height: section?.getNumber('Height', 1) ?? 1 };
});
const output = `${root}/original-sequences-and-smudges-v1.json`;
writeFileSync(output, JSON.stringify({ schema: 'm2-4-final-actor-original-audit-v1',
    status: 'READ_ONLY_NO_COVERAGE_CREDIT', edition: 'yr', artSha256: sha(artFile.getBytes()),
    rulesSha256: sha(rulesFile.getBytes()), actors, smudges,
    originalSourcesEdited: false, windows: 'NOT_RUN', m24Complete: false }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, actors: actors.map(a => ({ id: a.id, total: a.totalFrames,
    sequences: a.sequences.map(s => [s.name, s.frames.length]),
    declared: a.declaredSequenceFrames.length, populated: a.populatedFrames.length,
    unusedPopulated: a.populatedOutsideDeclaredSequences.length, declaredTrimPixels: a.declaredTrimPixels })),
    smudges: smudges.map(s => [s.id, s.crater, s.burn]) }));
