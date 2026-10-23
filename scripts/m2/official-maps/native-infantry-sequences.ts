// Pin native actor sequences for authored facing and action registration.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { IniFile } from '../../../src/data/IniFile';
import { editionRetailTree } from '../../../src/offline/editionRetail';
import { resolveMember } from '../../../src/offline/retail';

const [prepared, output] = process.argv.slice(2);
if (!prepared || !output) throw Error('Usage: native-infantry-sequences.ts <prepared> <new-output>');
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const sources = JSON.parse(readFileSync(`${prepared}/source.json`, 'utf8')).sources;
const names = ['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'];
const top = new Map(names.map(name => [name,
    readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const records = [];
for (const edition of ['ra2', 'yr'] as const) {
    const tree = editionRetailTree(top, edition);
    const artFile = resolveMember(tree, edition === 'yr' ? 'artmd.ini' : 'art.ini').file;
    const art = new IniFile(artFile);
    for (const source of sources.filter((row: any) => row.bindings.some((binding: any) =>
        binding.edition === edition && binding.kind === 'infantry'))) {
        const name = source.bindings.find((binding: any) =>
            binding.edition === edition && binding.kind === 'infantry').nativeArt.Sequence;
        const sequence = art.getSection(name);
        if (!sequence) throw Error(`Missing native sequence: ${edition}:${name}`);
        const bodyFrames = source.hasShadow ? source.totalFrames / 2 : source.totalFrames;
        const nativeBodyOverruns = [...sequence.entries].flatMap(([action, value]) => {
            const [start, count, stride] = value.split(',').slice(0, 3).map(Number);
            if (![start, count, stride].every(Number.isInteger) || count < 1 || stride < 0) return [];
            const lastFrame = start + count - 1 + stride * 7;
            return lastFrame >= bodyFrames ? [{ action, value, lastFrame, bodyFrames }] : [];
        });
        records.push({ member: source.member, sourceSha256: source.sha256, edition,
            sequence: name, artSha256: sha(artFile.getBytes()), bodyFrames, nativeBodyOverruns,
            entries: Object.fromEntries(sequence.entries) });
    }
}
writeFileSync(output, JSON.stringify({ schema: 'm2-3-native-infantry-sequences-v1',
    preparedSourceSha256: sha(readFileSync(`${prepared}/source.json`)), records }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(records));
