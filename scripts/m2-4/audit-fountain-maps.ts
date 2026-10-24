import { readFileSync, writeFileSync } from 'node:fs';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { IniFile } from '../../src/data/IniFile';
import { originalSkirmishEntries } from '../../src/offline/officialSkirmish';

const names = ['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'];
const top = new Map(names.map(name => [name, readFileSync('.local/assets/' + (name.includes('md') ? 'yr/' : 'ra2/') + name)]));
const entries: any[] = [];
for (const edition of ['ra2', 'yr'] as const) {
    const tree = editionRetailTree(top, edition);
    for (const entry of originalSkirmishEntries(tree, edition)) {
        const name = entry.source.member.toLowerCase();
        const map = new IniFile(resolveMember(tree, name).file);
        const placed = [...(map.getSection('Structures')?.entries.values() ?? [])]
            .map(value => String(value)).filter(value => value.toUpperCase().includes('CAWASH18'));
        if (placed.length) entries.push({ edition, name, runtimeName: entry.runtimeName,
            theater: map.getSection('Map')?.getString('Theater'), placed });
    }
}
writeFileSync(process.argv[2], JSON.stringify(entries, null, 2) + '\n');
console.log(JSON.stringify(entries));
