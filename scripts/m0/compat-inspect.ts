import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { retailTree, resolveMember, parseMix } from '../../src/offline/retail';
import { IniFile } from '../../src/data/IniFile';
mkdirSync('.artifacts/compat', { recursive: true });
const tree = retailTree(new Map(['ra2.mix','language.mix','multi.mix'].map(name => [name, readFileSync(`.local/assets/ra2/${name}`)])));
const rules = new IniFile(resolveMember(tree, 'rules.ini').file);
const art = new IniFile(resolveMember(tree, 'art.ini').file);
const support = parseMix(readFileSync('.local/upstream-support/ra2cd.mix'),'ra2cd.mix');
const rows = [];
for (const [name, base] of [['rulescd.ini', rules], ['artcd.ini', art]] as const) {
    const custom = new IniFile(support.openFile(name));
    for (const section of custom.getOrderedSections()) for (const [key,value] of section.entries) {
        rows.push({name,section:section.name,key,archived:base.getSection(section.name)?.get(key),upstream:value});
    }
}
writeFileSync('.artifacts/compat/override-audit.json', JSON.stringify(rows,null,2));
console.log('AircraftTypes:', rules.getSection('AircraftTypes')?.toString());
console.log('PDPLANE:', rules.getSection('PDPLANE')?.toString());
console.log('Required support:', rows.filter(x=>['General','AudioVisual','BuildingTypes','Animations'].includes(x.section)));
console.log('Custom art sections:', [...new Set(rows.filter(x=>x.name==='artcd.ini').map(x=>x.section))]);
for (const name of ['OREGATH','WRENCH','FLYERHELPER','BOMBCURS','BBBLELRG','PBEACON']) {
    console.log(name, 'retail rules',!!rules.getSection(name),'retail art',art.getSection(name)?.toString());
}
