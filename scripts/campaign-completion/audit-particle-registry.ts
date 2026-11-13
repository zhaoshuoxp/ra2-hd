import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { IniFile } from '../../src/data/IniFile';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, retailMember, sha256 } from '../test-support/resources';

// Read-only evidence. An importer allocation candidate does not authorize a
// runtime no-op or establish pristine-retail behavior from a patched binary.
const output = process.argv[2];
assert(output && !fs.existsSync(output));
const member = retailMember('ra2', 'rules.ini');
const source = parseMix(requiredBytes('assets/ra2/maps02.mix')).openFile('sov01t.map');
const rules = new IniFile(member.file.readAsString()), map = new IniFile(source.readAsString());
assert.equal(sha256(source.getBytes()), '7f4492961d30b5799367aa840ba007932057b19a22a77f95475a18ca1407b99f');
rules.mergeWith(map);
const declared = [...rules.getSection('ParticleSystems')!.entries.values()];
const references: { section: string; key: string; name: string }[] = [];
for (const [section, ini] of rules.sections) {
    for (const [key, value] of ini.entries) {
        if (!/^(?:DamageParticleSystems|DestroyParticleSystems|NaturalParticleSystem|AttachedParticleSystem|Default.*System|BarrelParticle)$/i.test(key)) continue;
        for (const name of value.split(',').map(name => name.trim()).filter(Boolean)) references.push({ section, key, name });
    }
}
const missing = references.filter(ref => !declared.some(name => name.toLowerCase() === ref.name.toLowerCase()));
assert.deepEqual(missing, [{ section: 'NACLON', key: 'DamageParticleSystems', name: 'SmallGreySmokeSys' }]);
assert(!rules.getSection('SmallGreySmokeSys'));
assert([...rules.getSection('BuildingTypes')!.entries.values()].includes('NACLON'));
const evidenceRoot = '../project-history/ra2-campaign-completion-20261026/Reference';
const files = ['particle-damage-types-loader-installed-v27-r1.txt', 'particle-find-or-allocate-installed-v27-r1.txt',
    'particle-type-defaults-installed-v27-r1.txt', 'particle-default-ai-installed-v27-r1.txt'];
const result = {
    status: 'INSTALLED_LOADER_DYNAMIC_INDEX12_CANDIDATE_CONFIRMED_RUNTIME_POLICY_PENDING',
    mission: 'sov01t.map', missionSha256: sha256(source.getBytes()),
    rules: { source: member.source, sha256: member.sha256 },
    declared: declared.map((name, index) => ({ index, name })), missing,
    candidate: { index: declared.length, name: missing[0].name, sectionPresent: false,
        firstReference: 'NACLON.DamageParticleSystems',
        loader: 'Installed0x6dc58e invokes0x620df0 for every nonempty damage-system token. Find-or-allocate0x620e46 creates a missing type;0x620756 appends it to0xa35dd4.',
        defaults: 'Constructor0x620613/619/61f sets HoldsWhat0x264, BehavesLike0x284 and SparkSpawnFrames0x288 to-1. No matching source section supplies overrides.',
        update: 'Installed0x60cb79/82 skips all five behavior handlers for unsigned enum-1; it then decrements the lifetime counter. This does not prove pristine-retail allocation order or full instance side effects.' },
    sourceTrigger: { id: '08E7C1C0', trigger: map.getSection('Triggers')!.getString('08E7C1C0'),
        event: map.getSection('Events')!.getString('08E7C1C0'), action: map.getSection('Actions')!.getString('08E7C1C0'),
        taggedBuildings: [...map.getSection('Structures')!.entries].filter(([, value]) => value.includes('08E7AE20')) },
    installedExe: { sha256: sha256(fs.readFileSync('../Resource/Command and Conquer Red Alert II/game.exe')),
        qualification: 'CnCNet-bearing local installation; supporting evidence, not pristine-retail identity.' },
    snippets: files.map(name => { const file = path.join(evidenceRoot, name); return { file, sha256: sha256(fs.readFileSync(file)) }; }),
    runtimeChanged: false,
    remaining: ['Confirm live source-tag reachability and original action execution.',
        'Qualify allocation order and full empty-system lifetime before implementing a narrowly pinned forward policy.',
        'Retain old first-mission particle mapping and save behavior until that policy is independently verified.'],
};
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, status: result.status, declared: declared.length, missing }));
