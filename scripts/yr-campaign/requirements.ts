import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { IniFile } from '../../src/data/IniFile';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import type { CampaignInstruction } from '../../src/data/campaign/CampaignDefinition';
import { campaignStartingCredits } from '../../src/game/campaign/CampaignRuntime';
import { DifficultyRules } from '../../src/game/rules/DifficultyRules';
import { Rules } from '../../src/game/rules/Rules';
import { ObjectType } from '../../src/engine/type/ObjectType';
import { adaptRetailRules } from '../../src/offline/retailCompatibility';
import { retailIni, retailMember } from '../test-support/resources';

const root = path.resolve(import.meta.dir, '../..');
const history = path.resolve(root, '../project-history/yr-campaign-implementation-20261104');
const output = path.resolve(process.argv[2] ?? path.join(history, 'Requirements45'));
const ai = retailMember('yr', 'aimd.ini');
const aiIdentity = { member: 'aimd.ini', archive: ai.source, sha256: ai.sha256 };
const globalAi = new IniFile(ai.file);
const inventory = JSON.parse(await readFile(path.join(history, 'source-inventory.json'), 'utf8'));
const base = adaptRetailRules(retailIni('yr')).rules;
const index = [];
await mkdir(output, { recursive: true });
for (const row of inventory.rows) {
    const file = path.join(root, '.local/campaign/yr', row.filename.replace(/\.map$/, ''), row.filename);
    const bytes = await readFile(file), sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== row.source.sha256) throw Error('Original mission source changed: ' + row.filename);
    const definition = new CampaignDefinition('yr', row.filename, bytes.toString(), globalAi, { semanticsVersion: 45, sourceSha256: sha256 });
    const rules = new Rules(base.clone().mergeWith(definition.ini));
    const describe = (line: CampaignInstruction) => {
        const value: any = { ...line };
        const type = line.section === 'Events' && [19, 32, 57].includes(line.opcode) ? ObjectType.Building
            : line.section === 'Events' && line.opcode === 20 ? ObjectType.Vehicle
            : line.section === 'Events' && line.opcode === 21 ? ObjectType.Infantry
            : line.section === 'Events' && line.opcode === 22 ? ObjectType.Aircraft : undefined;
        if (type !== undefined) {
            const category = { [ObjectType.Building]: 'BuildingTypes', [ObjectType.Vehicle]: 'VehicleTypes',
                [ObjectType.Infantry]: 'InfantryTypes', [ObjectType.Aircraft]: 'AircraftTypes' }[type]!;
            const name = [...new Set<string>(rules.getIni().getSection(category)?.entries.values() ?? [])][Number(line.params[1])];
            if (!name) throw Error('Original type predicate is outside its source registry: ' + line.raw);
            value.runtimeType = name;
            value.hasDefinition = rules.hasObject(name, type);
        }
        return value;
    };
    const triggers = [...definition.triggers.values()].map(trigger => ({ ...trigger,
        events: trigger.events.map(describe), actions: trigger.actions.map(describe) }));
    const resultTriggers = triggers.filter(trigger => trigger.actions.some(line => [1, 2, 68].includes(line.opcode)));
    const goalBranches = triggers.filter(trigger => /(?:objective|obj\s?\d|win|lose|loser|victory|defeat)/i.test(trigger.name));
    const difficultyFilters = triggers.filter(trigger => new Set(Object.values(trigger.difficulties)).size > 1);
    const techChanges = triggers.flatMap(trigger => trigger.actions.filter(line => line.opcode === 106)
        .map(line => ({ trigger: trigger.id, name: trigger.name, difficulties: trigger.difficulties, instruction: line })));
    const difficulties = Object.fromEntries((['easy', 'normal', 'hard'] as const).map(difficulty => [difficulty, {
        human: DifficultyRules.readCampaign(rules.getIni() as any, true, difficulty),
        ai: DifficultyRules.readCampaign(rules.getIni() as any, false, difficulty),
        startingCredits: Object.fromEntries([...definition.houses.values()].filter(house => house.playerControl)
            .map(house => [house.id, campaignStartingCredits(house.credits, true, difficulty, rules.getIni() as any, true)])),
        admittedFilteredTriggers: difficultyFilters.filter(trigger => trigger.difficulties[difficulty]).map(trigger => trigger.id),
        admittedAiTriggers: [...definition.aiTriggers.values()].filter(trigger => trigger.difficulties[difficulty]).map(trigger => trigger.id),
    }]));
    const requirement = { schema: 'yr-original-mission-requirements-v2', semanticsVersion: 45, globalAi: aiIdentity, status: 'SOURCE_REQUIREMENTS_NOT_RUNTIME_ACCEPTANCE',
        mission: row.filename, theater: row.theater, sourceSha256: sha256, sourceArchive: inventory.archive,
        sourceCatalog: inventory.catalog, rawRecords: '../source-inventory.json#rows/' + row.filename,
        localRuleArtSections: row.localRuleArtSections, houses: [...definition.houses.values()],
        variables: Object.fromEntries(definition.variables), counts: row.counts, media: row.media,
        placements: Object.fromEntries(Object.entries(row.placements).map(([section, entries]: [string, any]) => [section, Object.keys(entries).length])),
        taskForceTypes: row.taskForceTypes, resultTriggers, goalBranches, difficultyFilters, techChanges, difficulties,
        aiTriggers: [...definition.aiTriggers.values()],
        qualification: 'Original source records and current engine index resolution. Names select navigation aids only; all raw events/actions/tags/teams/scripts remain available in the pinned inventory. Difficulty parameters do not establish played difficulty branches or full mission semantics.' };
    const name = row.filename.replace(/\.map$/, '.json');
    await writeFile(path.join(output, name), JSON.stringify(requirement, null, 2) + '\n');
    index.push({ mission: row.filename, sourceSha256: sha256, file: name, resultTriggers: resultTriggers.length,
        filteredTriggers: difficultyFilters.length, techChanges: techChanges.length });
}
await writeFile(path.join(output, 'index.json'), JSON.stringify({ schema: 'yr-original-requirements-index-v1', missions: index }, null, 2) + '\n');
console.log(JSON.stringify({ status: 'PASS_PINNED_14_ORIGINAL_SOURCE_REQUIREMENTS', missions: index }, null, 2));
