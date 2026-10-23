import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sovietUnitHdFamilies } from '../../../src/engine/renderable/builder/sovietUnitHdFamilies';
const root = '.artifacts/allied-units';
const hash = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
const audit = JSON.parse(readFileSync(`${root}/rules-audit-v1.json`, 'utf8'));
const rows: any[] = [];
const excluded: any[] = [];
for (const edition of ['ra2', 'yr']) {
  const inv = JSON.parse(readFileSync(`${root}/source-v2/${edition}/inventory.json`, 'utf8'));
  for (const family of inv.families) {
    const gate = audit.editions[edition].rows.find((r: any) => r.id === family.id);
    if (!gate.included) { excluded.push({ edition, id: family.id, reason: gate.reason }); continue; }
    const members = [...new Set([...family.members, ...family.children.flatMap((c: any) => c.members),
      ...family.attachments.map((a: any) => a.member)])] as string[];
    const source = members.map(member => ({ member, ...inv.assets[member] }));
    const accepted = Object.values(sovietUnitHdFamilies).find(f => f.members.length === source.length &&
      f.members.every(m => source.some(s => s.member === m.member && s.sha256 === m.sourceHash)));
    rows.push({ edition, id: family.id, houses: family.houses, category: family.category,
      image: family.image, resolvedStem: family.stem, representation: family.representation,
      rules: family.rules, art: family.art, sequences: family.sequences, source,
      dependencies: { children: family.children, attachments: family.attachments,
        declaredUnresolved: family.unresolvedArtDependencies, sharedNative: family.retainedOriginal },
      weapons: family.weapons, stolenTech: family.stolenTech, production: gate,
      sourceGroup: hash(JSON.stringify(source.map(s => [s.member, s.sha256]))),
      mappingGroup: hash(JSON.stringify([source.map(s => [s.member,s.sha256]), family.sequences, family.art])),
      acceptedReuseCandidate: accepted?.identity ?? null,
      reuseStatus: accepted ? 'SOURCE_IDENTICAL_MAPPING_AND_VISUAL_SUITABILITY_PENDING' : 'NEW_ART_REQUIRED',
      plannedDensity: 2, producedDensities: [], selectedResource: null,
      review: 'PENDING_GROUPED_REPRESENTATIVES', nativeRuntime: 'NOT_RUN',
      complete: false,
      actions: family.sequences ? Object.keys(family.sequences) : ['movement','independent_native_parts','weapon','removal'],
      nativeContract: { preserveShadow: true, preserveGeometryAndPivots: true, ownerIndependentIdentity: true,
        noShadow: String(family.rules.NoShadow).toLowerCase() === 'yes',
        bodyShadowSlots: source.filter(s => s.totalFrames).map(s => ({ member: s.member, slots: s.totalFrames,
          status: 'REQUIRES_ROUTE_SPECIFIC_VISIBLE_SHADOW_PARTITION' })) },
      theaters: (edition === 'ra2' ? ['TEMPERATE','SNOW','URBAN'] : ['TEMPERATE','SNOW','URBAN','NEWURBAN','DESERT','LUNAR'])
        .map(theater => ({ theater, status: 'NATIVE_LOOKUP_AND_PALETTE_VERIFICATION_PENDING' })),
    });
  }
  excluded.push(...inv.excluded.map((r: any) => ({ edition, id: r.id, reason: r.reason })),
    ...inv.missingSections.map((r: any) => ({ edition, ...r })));
}
const protectedFiles = ['desktop/allied-building-coverage.json', 'src/engine/renderable/builder/UnitHdDemand.ts',
 'src/engine/renderable/builder/alliedBuildingDemand.ts', 'src/engine/renderable/builder/loadSovietUnitsHd.ts',
 'src/engine/ImageFinder.ts', 'desktop/hd-profile.mjs', 'src/engine/renderable/unitVxl/VxlUnitRenderer.ts'];
const acceptance = JSON.parse(readFileSync('docs/allied-buildings-hd-acceptance.json', 'utf8'));
// Pin only selected Task A manifests, not the entire historical resource tree.
function selections(value: any): any[] {
  if (!value || typeof value !== 'object') return [];
  if (value.familyPath && value.familyHash) return [value];
  return Object.values(value).flatMap(selections);
}
const pins = protectedFiles.map(path => ({ path, sha256: hash(readFileSync(path)) }));
for (const s of selections(acceptance)) {
  const path = `.local/${s.familyPath}`;
  const sha256 = hash(readFileSync(path));
  if (sha256 !== s.familyHash) throw Error(`Accepted selection changed: ${path}`);
  pins.push({path,sha256});
}
const output = { schemaVersion: 1, baseline: '3b1bec1', status: 'SOURCE_AUDIT_AND_REPRESENTATIVE_PRODUCTION',
  counts: { ra2: rows.filter(r=>r.edition==='ra2').length, yr: rows.filter(r=>r.edition==='yr').length,
    unionRoots: new Set(rows.map(r=>r.id)).size, uniqueSourceFamilies: new Set(rows.map(r=>r.sourceGroup)).size,
    completeNewRuntimeFamilies: 0 }, rows, excluded, protectedFiles: pins,
  limitations: ['Theater mapping, shadow partition and action completeness remain open.',
    'Source-identical accepted artwork reuse requires mapping and suitability checks before activation.',
    'Native reference captures are controlled posed Original rendering, not HD or gameplay evidence.'] };
writeFileSync(`${root}/coverage-ledger-v1.json`, JSON.stringify(output,null,2)+'\n',{flag:'wx'});
console.log(output.counts, 'Protected identities', pins.length);
