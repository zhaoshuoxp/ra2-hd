import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { IniFile } from '../../src/data/IniFile';
import { retailMember } from '../test-support/resources';

const root = path.resolve(import.meta.dir, '../..');
const out = path.resolve(process.argv[2] ?? '.artifacts/campaign-completion/feedback-v51-r1');
await mkdir(out, { recursive: true });
const rules = new IniFile(retailMember('ra2', 'rules.ini').file.readAsString());
const art = new IniFile(retailMember('ra2', 'art.ini').file.readAsString());
const section = (ini: IniFile, name: string) => Object.fromEntries(ini.getSection(name)?.entries ?? []);
const report: any = { status: 'READ_ONLY_ORIGINAL_SOURCE_AUDIT', missions: {}, rules: {}, movies: {}, speech: [] };
for (const mission of ['trn01t', 'trn02t', 'sov05u', 'sov09u', 'sov12s']) {
    const directory = path.join(root, '.local/campaign/ra2', mission);
    const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
    const bytes = await readFile(path.join(directory, mission + '.map'));
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (sha !== manifest.files.find((file: any) => file.name === mission + '.map').sha256) throw Error('Original map mismatch');
    const definition = new CampaignDefinition('ra2', mission + '.map', bytes.toString());
    const player = definition.ini.getSection('Basic')!.getString('Player');
    report.missions[mission] = { sha256: sha, player, basic: section(definition.ini, 'Basic'),
        houses: Object.fromEntries([...definition.ini.getSection('Houses')!.entries.values()].map(name => [name, section(definition.ini, String(name))])),
        teams: [...definition.teams.values()], scripts: [...definition.scripts.values()], triggers: [...definition.triggers.values()],
        taskForces: [...definition.taskForces.values()], waypoints: section(definition.ini, 'Waypoints'),
        placements: Object.fromEntries(['Units', 'Infantry', 'Structures', 'Terrain', 'Smudge'].map(name => [name, section(definition.ini, name)])),
        localRules: Object.fromEntries(['CAPARS01', 'EiffelBolt', 'YURI', 'AI', 'General'].map(name => [name, section(definition.ini, name)])) };
}
for (const name of ['SHK', 'CAPARS01', 'EiffelBolt', 'AssaultBolt', 'ElectricAssault', 'General']) report.rules[name] = section(rules, name);
report.movies.ra2 = section(art, 'Movies');
const eva = new IniFile(retailMember('ra2', 'eva.ini').file.readAsString());
for (const name of eva.getSection('DialogList')!.entries.values()) report.speech.push({ name, ...section(eva, String(name)) });
await writeFile(path.join(out, 'original-source-audit.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output: out, missions: Object.keys(report.missions), speeches: report.speech.length,
    eiffel: report.rules.EiffelBolt, assault: report.rules.AssaultBolt }, null, 2));
