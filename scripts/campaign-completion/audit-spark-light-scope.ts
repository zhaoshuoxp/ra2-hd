import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { campaignMissionSemantics } from '../../src/data/campaign/CampaignMission';
import { IniFile } from '../../src/data/IniFile';
import { resourceRoot, retailMember, sha256 } from '../test-support/resources';

const output = process.argv[2]; assert(output && !fs.existsSync(output));
const rulesSource = retailMember('ra2', 'rules.ini'), baseRules = rulesSource.file.readAsString();
const directory = path.join(resourceRoot, 'campaign/ra2'), missions: any[] = [], actions: any[] = [];
for (const folder of fs.readdirSync(directory).sort()) {
    const file = path.join(directory, folder, 'manifest.json'); if (!fs.existsSync(file)) continue;
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    const entry = manifest.files.find((entry: any) => entry.name === manifest.mission);
    const bytes = fs.readFileSync(path.join(directory, folder, manifest.mission));
    assert.equal(sha256(bytes), entry.sha256); assert.equal(bytes.length, entry.bytes);
    const definition = new CampaignDefinition('ra2', manifest.mission, bytes.toString('utf8'), undefined,
        { semanticsVersion: campaignMissionSemantics(manifest.mission), sourceSha256: entry.sha256 });
    definition.assertValid();
    const rules = new IniFile(baseRules).mergeWith(definition.ini);
    const systems = [...rules.getSection('ParticleSystems')!.entries.values()];
    missions.push({ mission: manifest.mission, sourceSha256: entry.sha256 });
    for (const trigger of definition.triggers.values()) for (const action of trigger.actions) if (action.opcode === 88) {
        const index = Number(action.params[1]), name = systems[index];
        const spec = name ? rules.getSection(name) : undefined;
        const behavior = spec?.getString('BehavesLike');
        actions.push({ mission: manifest.mission, trigger: trigger.id, raw: action.raw, index,
            ...(name ? { name, behavior } : { resolution: 'UNDECLARED_INDEX_REQUIRES_QUALIFIED_DYNAMIC_REGISTRY' }),
            ...(behavior?.toLowerCase() === 'spark' ? { light: { size: spec!.getNumber('LightSize'),
                particleCap: spec!.getNumber('ParticleCap'), oneFrame: spec!.getBool('OneFrameLight'),
                heldParticle: spec!.getString('HoldsWhat') } } : {}) });
    }
}
assert.equal(missions.length, 26);
const sparks = actions.filter(action => action.light);
const report = { status: 'SOURCE_ONLY_ALL26_ACTION88_LIGHT_SCOPE_NOT_REACHABILITY_OR_PRISTINE_PROOF',
    rules: { sha256: rulesSource.sha256, archive: rulesSource.source }, missions, actions, sparks,
    qualification: 'Every source record is retained. Static resolution does not prove execution, complete compatibility or unreachable records. Unresolved dynamic ordinals remain explicit. Actual Allied03 source execution and native light behavior have separate evidence.' };
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ missions: missions.length, particleActions: actions.length,
    sparkActions: sparks.map(action => ({ mission: action.mission, trigger: action.trigger, light: action.light })) }));
