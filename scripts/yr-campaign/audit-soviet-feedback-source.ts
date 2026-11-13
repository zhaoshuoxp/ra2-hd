import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { IniFile } from '../../src/data/IniFile';
import { EvaSpecs } from '../../src/engine/sound/EvaSpecs';
import { SideType } from '../../src/game/SideType';
import { WavFile } from '../../src/data/WavFile';
import { retailMember, sha256 } from '../test-support/resources';

const out = path.resolve(process.argv[2]); mkdirSync(out, { recursive: true });
const save = (name: string, value: unknown) => writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n');
const stems = ['sov01umd', 'sov02smd', 'sov03umd', 'sov04dmd', 'sov05umd', 'sov06lmd', 'sov07tmd'];
const eva = new IniFile(retailMember('yr', 'evamd.ini').file.readAsString());
const specs = new EvaSpecs(SideType.Nod).readIni(eva);
const dialogs = eva.getSection('DialogList')!;
const labels = { ...JSON.parse(readFileSync('public/res/locale/retail-yr-zh-CN.json', 'utf8')).labels,
    ...JSON.parse(readFileSync('public/res/locale/zh-CN.json', 'utf8')) };
const speech = new Map<string, any>(), summaries: any[] = [];
for (const stem of stems) {
    const file = `.local/campaign/yr/${stem}/${stem}.map`, bytes = readFileSync(file);
    const definition = new CampaignDefinition('yr', stem + '.map', bytes.toString());
    const actions = [...definition.triggers.values()].flatMap(trigger => trigger.actions.map(action => ({ trigger, action })));
    const voices = actions.filter(({ action }) => action.opcode === 21);
    for (const { action } of voices) {
        const token = action.params[1], id = specs.getSpec(token) ? token : dialogs.entries.get(token) as string;
        const spec = id && specs.getSpec(id);
        if (!spec?.sound) throw Error(`Original speech reference unavailable: ${stem}/${action.raw}/${token}/${id}`);
        const existing = speech.get(id); if (existing) { if (!existing.missions.includes(stem)) existing.missions.push(stem); continue; }
        const source = retailMember('yr', spec.sound + '.wav');
        const pcm = new WavFile(source.file).getData();
        mkdirSync(path.join(out, 'speech'), { recursive: true });
        const pcmFile = path.join(out, 'speech', spec.sound + '.wav'); writeFileSync(pcmFile, pcm);
        const localized = !!labels[`hd:speech:${id}`.toLowerCase()] || !!labels[`vox:${spec.sound}`.toLowerCase()];
        speech.set(id, { id, missions: [stem], ...spec, localized,
            source: { archive: source.source, sha256: source.sha256 },
            pcm: { file: path.relative(process.cwd(), pcmFile), sha256: sha256(pcm) } });
    }
    const rawUnits = definition.ini.getSection('Units');
    summaries.push({ mission: stem + '.map', sourceSha256: sha256(bytes),
        initialNaval: [...(rawUnits?.entries ?? [])].map(([key, value]) => ({ key, value }))
            .filter(row => /(?:SQD|DRED|SUB|HYD),/.test(String(row.value))),
        sourceVoices: voices.length,
        tanyaTaskForces: [...definition.taskForces.values()].filter(force => force.units.some(unit => unit.type === 'TANY')),
        statueTriggers: [...definition.triggers.values()].filter(trigger => /statue|head/i.test(trigger.name)) });
}
save('speech.json', { rows: [...speech.values()] }); save('missions.json', summaries);
console.log(JSON.stringify({ voices: speech.size, missingCaptions: [...speech.values()].filter(row => !row.localized).length,
    initialNaval: summaries[0].initialNaval, tanya: summaries[2].tanyaTaskForces }));
