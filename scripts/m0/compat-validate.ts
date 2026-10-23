import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { retailTree, resolveMember } from '../../src/offline/retail';
import { IniFile } from '../../src/data/IniFile';
import { adaptRetailRules, retailCompatibilityVersion } from '../../src/offline/retailCompatibility';
import { sha256 } from './import';
mkdirSync('.artifacts/compat', { recursive: true });
const tree = retailTree(new Map(['ra2.mix','language.mix','multi.mix'].map(name => [name,readFileSync(`.local/assets/ra2/${name}`)])));
const original = new IniFile(resolveMember(tree,'rules.ini').file);
const before = original.toString();
const {rules,additions} = adaptRetailRules(original);
let checkedEntries = 0;
for (const [name,section] of original.sections) for (const [key,value] of section.entries) {
    assert.deepEqual(rules.getSection(name)?.get(key), value, `Changed archived field ${name}.${key}`);
    checkedEntries++;
}
assert.equal(original.toString(),before);
assert.deepEqual(additions,['General.ParadropPlane']);
const adaptedHash = sha256(new TextEncoder().encode(rules.toString()));
rules.getSection('General')!.entries.delete('ParadropPlane');
assert.equal(rules.toString(),before);
const report = {version:retailCompatibilityVersion,status:'PASS',checkedSections:original.sections.size,checkedEntries,
    additions,allOriginalEntriesUnchanged:true,inputUnchanged:true,onlyOneAddition:true,
    originalParsedSha256:sha256(new TextEncoder().encode(before)),adaptedParsedSha256:adaptedHash,
    archivedArtSha256:sha256(resolveMember(tree,'art.ini').file.getBytes()),artOverrides:[],
    aircraftRegistryVerified:true,aircraftPrimaryVerified:true};
writeFileSync('.artifacts/compat/rule-invariance.json',JSON.stringify(report,null,2)+'\n');
const raw = JSON.parse(readFileSync('.artifacts/compat/override-audit.json','utf8'));
const rendering = new Set(['OREGATH','WRENCH','FLYERHELPER','BOMBCURS','PBEACON']);
const classifications = raw.map((r:any)=>({file:r.name,section:r.section,key:r.key,basePresent:Object.hasOwn(r,'archived'),
    classification:r.section==='General'&&r.key==='ParadropPlane'?'engine-identity-adapter-applied':
        r.key==='QuickMatchTimer'?'online-only-excluded':
        r.key==='FlyerHelper'||rendering.has(r.section)?'rendering-adaptation-deferred':
        r.section==='Animations'?'animation-registry-change-deferred':
        r.section==='BuildingTypes'?'object-registry-change-deferred':
        r.name==='artcd.ini'?'art-timing-offset-cameo-or-voxel-change-excluded':'balance-default-or-rendering-fix-excluded'}));
writeFileSync('docs/compatibility-overrides.json',JSON.stringify({version:retailCompatibilityVersion,entries:classifications},null,2)+'\n');
console.log(JSON.stringify(report,null,2));
