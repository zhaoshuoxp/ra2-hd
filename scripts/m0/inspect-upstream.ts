import { readFileSync, writeFileSync } from 'node:fs';
import { parseMix } from '../../src/offline/retail';
import { mixDatabase } from '../../src/engine/mixDatabase';
const names = new Set([...mixDatabase.values()].flat().concat(['rulescd.ini', 'artcd.ini', 'mpmodescd.ini', 'nodogengikills.ini', 'uimd.ini', 'shroud.shp', 'ui.ini', 'mpbattle.ini']));
const output = [];
for (const filename of ['.local/upstream-support/ini.mix','.local/upstream-support/ra2cd.mix']) {
    const mix = parseMix(readFileSync(filename), filename);
    const entries = [...names].filter(name => mix.containsFile(name)).map(name => {
        const file = mix.openFile(name);
        return { name, bytes: file.getSize(), text: name.endsWith('.ini') ? file.readAsString() : undefined };
    });
    output.push({filename, count: mix.getEntries().length, entries});
}
writeFileSync('.artifacts/upstream-overrides.json', JSON.stringify(output,null,2));
console.log(output.map(x=>({filename:x.filename,count:x.count,entries:x.entries.map(e=>e.name)})));
