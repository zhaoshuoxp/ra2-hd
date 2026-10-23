import { readFileSync, writeFileSync } from 'node:fs';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

const root = '.artifacts/m2-1/authoring-v7';
const input = JSON.parse(readFileSync(`${root}/export-input-unresolved.json`, 'utf8'));
const tree = editionRetailTree(new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix',
    'langmd.mix', 'ra2md.mix', 'multimd.mix'].map(name =>
    [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)])), 'yr');
for (const group of input.groups) for (const member of group.members) {
    if (member.nativeOffsets) continue;
    const bytes = resolveMember(tree, member.member).file.getBytes();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    member.nativeOffsets = member.images.map((_: unknown, index: number) => view.getInt32(16 + index * 4, true));
}
writeFileSync(`${root}/export-input.json`, JSON.stringify(input, null, 2) + '\n');
