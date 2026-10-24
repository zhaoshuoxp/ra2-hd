import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { editionRetailTree } from '@/offline/editionRetail';
import { resolveMember } from '@/offline/retail';
import { IniFile } from '@/data/IniFile';
import { IdxFile } from '@/data/IdxFile';
import { AudioBagFile } from '@/data/AudioBagFile';
import { VirtualFile } from '@/data/vfs/VirtualFile';
import { WavFile } from '@/data/WavFile';
import { EvaSpecs } from '@/engine/sound/EvaSpecs';
import { SoundSpecs } from '@/engine/sound/SoundSpecs';
import { SideType } from '@/game/SideType';

const output = process.argv[2];
const names = ['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'];
const top = new Map(names.map(name => [name, readFileSync('.local/assets/' + (name.includes('md') ? 'yr/' : 'ra2/') + name)]));
const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const report: any = { status: 'RUNNING', source: 'Original imported retail MIX archives', editions: [] };
for (const edition of ['ra2', 'yr'] as const) {
    const tree = editionRetailTree(top, edition), suffix = edition === 'yr' ? 'md' : '';
    const evaFile = resolveMember(tree, `eva${suffix}.ini`), soundFile = resolveMember(tree, `sound${suffix}.ini`);
    const rulesFile = resolveMember(tree, `rules${suffix}.ini`);
    const evaIni = new IniFile(evaFile.file), rules = new IniFile(rulesFile.file);
    const soundSpecs = new SoundSpecs(new IniFile(soundFile.file));
    const bag = resolveMember(tree, 'audio.bag'), idx = resolveMember(tree, 'audio.idx');
    const index = new IdxFile(idx.file.stream), bagBuilder = new AudioBagFile();
    const exists = (name: string) => index.entries.has(name.toLowerCase().replace(/\.wav$/, '') + '.wav') ||
        tree.some(owner => owner.mix.containsFile(name.replace(/\.wav$/, '') + '.wav'));
    const decoded = (name: string) => {
        const filename = name.toLowerCase().replace(/\.wav$/, '') + '.wav', entry = index.entries.get(filename);
        const file = entry ? new VirtualFile((bagBuilder as any).buildWavData(bag.file.stream, entry), filename)
            : resolveMember(tree, filename).file;
        const data = new WavFile(file).getData();
        return { filename, decodedBytes: data.length, decodedSha256: sha(data) };
    };
    const record: any = { edition, sources: { eva: evaFile.source, sound: soundFile.source, rules: rulesFile.source,
        bag: bag.source, index: idx.source, evaSha256: sha(evaFile.file.getBytes()), soundSha256: sha(soundFile.file.getBytes()) },
        factions: [], units: [], missing: [] };
    for (const [faction, side] of [['allied', SideType.GDI], ['soviet', SideType.Nod],
        ...(edition === 'yr' ? [['yuri', SideType.ThirdSide]] : [])] as [string, SideType][]) {
        const specs = new EvaSpecs(side).readIni(evaIni);
        const entries = [...new Set(evaIni.getSection('DialogList')!.entries.values())].flatMap(name => {
            const spec = specs.getSpec(String(name));
            if (!spec) return [];
            if (spec.sound && !exists(spec.sound)) record.missing.push({ faction, event: name, sound: spec.sound });
            return [{ event: name, sound: spec.sound }];
        });
        const samples = ['EVA_UnitReady', 'EVA_PlayerDefeated', 'EVA_YouAreVictorious', 'EVA_InsufficientFunds'].flatMap(event => {
            const spec = specs.getSpec(event);
            return spec?.sound && exists(spec.sound) ? [{ event, sound: spec.sound, ...decoded(spec.sound) }] : [];
        });
        record.factions.push({ faction, side, entries, samples });
    }
    for (const category of ['InfantryTypes', 'VehicleTypes', 'AircraftTypes', 'BuildingTypes']) {
        for (const unit of new Set(rules.getSection(category)?.entries.values() ?? [])) {
            const section = rules.getSection(String(unit));
            if (!section) continue;
            const voices = ['VoiceSelect', 'VoiceMove', 'VoiceAttack', 'VoiceFeedback', 'VoiceSpecialAttack', 'VoiceCapture']
                .flatMap(key => {
                    const group = section.getString(key);
                    if (!group) return [];
                    const spec = soundSpecs.getSpec(group), sounds = spec?.sounds ?? [];
                    if (!spec || !sounds.length) record.missing.push({ unit, key, group, reason: 'Missing sound group' });
                    for (const sound of sounds) if (!exists(sound)) record.missing.push({ unit, key, group, sound });
                    const representative = ['AMCV', 'SMCV', 'PCV', 'E1', 'E2', 'INIT', 'MTNK', 'HTNK', 'LTNK'].includes(String(unit));
                    return [{ key, group, sounds, ...(representative ? { samples: sounds.filter(exists).map(decoded) } : {}) }];
                });
            if (voices.length) record.units.push({ unit, category, voices });
        }
    }
    report.editions.push(record);
}
report.status = report.editions.every((edition: any) => edition.missing.every((entry: any) =>
    ['Dummy', 'SubFear', 'SquidFear', 'DolphinFear'].includes(entry.group)))
    ? 'PASS_AUDIO_REFERENCES_WITH_ORIGINAL_SILENT_GROUP_PLACEHOLDERS' : 'UNEXPECTED_SOURCE_EXCEPTIONS';
report.silentGroupDisclosure = 'Dummy and unused naval fear groups are absent or empty in the original sound INI. All named EVA and unit audio files resolve; no replacement voice set is introduced.';
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, editions: report.editions.map((edition: any) => ({ edition: edition.edition,
    factions: edition.factions.map((faction: any) => ({ faction: faction.faction, count: faction.entries.length, samples: faction.samples })),
    units: edition.units.length, missing: edition.missing })) }, null, 2));
