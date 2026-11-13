import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { retailTree, resolveMember } from '../../src/offline/retail';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { readCampaignCatalog } from '../../src/data/campaign/CampaignCatalog';
import { IniFile } from '../../src/data/IniFile';

const root = path.resolve(import.meta.dir, '../..');
const evidence = path.resolve(root, '../project-history/m3-2-first-batch-20261025');
const output = path.join(root, '.local/campaign/ra2/sov02t');
const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const top = new Map<string, Uint8Array>();
for (const name of ['language.mix', 'ra2.mix', 'multi.mix', 'maps01.mix', 'maps02.mix']) {
    top.set(name, await readFile(path.join(root, '.local/assets/ra2', name)));
}
const tree = retailTree(top);
const source = resolveMember(tree, 'sov02t.map');
const bytes = source.file.getBytes();
const definition = new CampaignDefinition('ra2', 'sov02t.map', source.file.readAsString());
definition.assertValid();
await mkdir(output, { recursive: true });
await mkdir(evidence, { recursive: true });
const mapFile = path.join(output, 'sov02t.map');
try { if (sha(await readFile(mapFile)) !== sha(bytes)) throw new Error('Existing Soviet 02 map differs'); }
catch (error: any) { if (error.code !== 'ENOENT') throw error; await writeFile(mapFile, bytes, { flag: 'wx' }); }
const catalog = readCampaignCatalog('ra2', resolveMember(tree, 'mapsel.ini').file.readAsString());
const art = new IniFile(resolveMember(tree, 'art.ini').file.readAsString());
const rules = new IniFile(resolveMember(tree, 'rules.ini').file.readAsString());
const instructions = [...definition.triggers.values()].flatMap(trigger => [
    ...trigger.events.map(event => ({ ...event, kind: 'event', name: trigger.name })),
    ...trigger.actions.map(action => ({ ...action, kind: 'action', name: trigger.name })),
]).concat([...definition.scripts.values()].flatMap(script => script.instructions.map(line => ({ ...line, kind: 'script', name: script.name }))));
const capabilities = [...new Set(instructions.map(line => `${line.kind}:${line.opcode}`))].map(key => {
    const refs = instructions.filter(line => `${line.kind}:${line.opcode}` === key);
    return { key, references: refs.map(({ raw: _raw, ...line }) => line) };
});
const sections = Object.fromEntries([...definition.ini.sections.values()].map(section => [section.name, Object.fromEntries(section.entries)]));
const report = { qualification: 'Original archive inventory; not gameplay acceptance',
    source: { filename: definition.filename, archive: source.source, bytes: bytes.length, sha256: sha(bytes) },
    catalog, capabilities, sections, movies: Object.fromEntries(art.getSection('Movies')?.entries ?? []),
    difficultyRules: Object.fromEntries(['Easy', 'Normal', 'Difficult'].map(name => [name, Object.fromEntries(rules.getSection(name)?.entries ?? [])])),
    selectors: Object.fromEntries(await Promise.all(['environment', 'environment-urban', 'environment-snow', 'environment-desert', 'environment-newurban',
        'terrain', 'terrain-urban', 'terrain-snow', 'terrain-desert', 'terrain-newurban', 'ui'].map(async name => {
        const bytes = await readFile(path.join(root, `.local/${name}-selection.json`));
        return [name, { sha256: sha(bytes), selection: JSON.parse(bytes.toString()) }];
    }))),
};
await writeFile(path.join(evidence, 'original-sov02-inventory.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ source: report.source, sections: Object.keys(sections), capabilities: capabilities.map(entry => [entry.key, entry.references.length]) }));
