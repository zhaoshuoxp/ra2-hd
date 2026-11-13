import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { IniFile } from '../../src/data/IniFile';
import { retailTree, resolveMember } from '../../src/offline/retail';
import { unitHdFamiliesForEdition } from '../../src/engine/renderable/builder/unitHdFamilies';
import { isAlliedBuildingHdFamily } from '../../src/engine/renderable/builder/alliedBuildingHdFamilies';
import { isSovietBuildingHdFamily } from '../../src/engine/renderable/builder/sovietBuildingHdFamilies';
import { vxlUnitFamilies, vxlUnitAvailableInTheater } from '../../src/engine/renderable/unitVxl/identities';

(globalThis as any).window = globalThis;
await import('../../src/setupThreeGlobal');
const { campaignCapabilities } = await import('../../src/game/campaign/CampaignRuntime');
const json = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const definition = new CampaignDefinition('ra2', 'sov01t.map', readFileSync('.local/campaign/ra2/sov01t/sov01t.map', 'utf8'));
definition.assertValid();
const tree = retailTree(new Map(['language.mix', 'ra2.mix', 'multi.mix', 'maps01.mix', 'maps02.mix']
    .map(name => [name, readFileSync(`.local/assets/ra2/${name}`)])));
const rules = new IniFile(resolveMember(tree, 'rules.ini').file.readAsString()).mergeWith(definition.ini);
const art = new IniFile(resolveMember(tree, 'art.ini').file.readAsString());
const environment = json('desktop/environment-urban-hd-contract.json');
const unitFamilies = unitHdFamiliesForEdition('ra2');
const nativeReport = process.argv[2] ? json(process.argv[2]) : undefined;
const nativeBindings = nativeReport?.status === 'PASS_MATCHED_ORIGINAL_2X_4X_CONTINUITY_AND_RESTART'
    ? nativeReport.cases.filter((row: any) => row.density > 1).flatMap((row: any) => row.bindings.actors.map((actor: any) => ({
        name: actor.name, density: actor.vxlActive || actor.parts.some((part: any) => part.gpuHd) ? row.density : 1,
        evidence: process.argv[2], runtime: nativeReport.runtime.sourceHead, scope: 'Current changed-world native binding',
    }))) : [];
const priorPentagonFile = '.artifacts/m3-1/native-final-20261022/report.json';
const priorPentagon = json(priorPentagonFile);
if (priorPentagon.status === 'PASS_DIAGNOSTIC_ONLY') nativeBindings.push(...priorPentagon.cases.flatMap((row: any) =>
    (row.bindings ?? []).map((binding: any) => ({ ...binding, evidence: priorPentagonFile,
        runtime: '49c33325e6b1192a2beed470e2c10d53a033d38c', scope: 'Unchanged earlier source-matched Pentagon art; diagnostic reveal' }))));
const demand = new Map<string, { name: string; placements: number; sections: Set<string> }>();
function use(name: string, section: string, count: number): void {
    const item = demand.get(name) ?? { name, placements: 0, sections: new Set() };
    item.placements += count; item.sections.add(section); demand.set(name, item);
}
for (const section of ['Structures', 'Units', 'Infantry', 'Aircraft', 'Terrain']) {
    for (const raw of definition.ini.getSection(section)?.entries.values() ?? []) {
        use(section === 'Terrain' ? String(raw) : String(raw).split(',')[1], section, 1);
    }
}
for (const force of definition.taskForces.values()) for (const unit of force.units) use(unit.type, `TaskForce:${force.id}`, 0);
const declaredResourceIdentities = demand.size;
for (const binding of nativeBindings) use(binding.name, 'NativeRuntime', 0);
function source(name: string) {
    const rule = rules.getSection(name);
    const image = rule?.getString('Image') || name;
    const spec = art.getSection(image);
    const imageName = spec?.getString('Image') || image;
    const extension = spec?.getBool('Voxel') ? '.vxl' : spec?.getBool('Theater') ? '.urb' : '.shp';
    const original = imageName.toLowerCase() + extension;
    const candidates = /^[GNCY][ATUDLN]/.test(imageName) && extension !== '.vxl'
        ? [original[0] + 'u' + original.slice(2), original[0] + 'g' + original.slice(2), original] : [original];
    for (const filename of [...new Set(candidates)]) {
        try { const member = resolveMember(tree, filename); return { member: filename, archive: member.source, sha256: sha(member.file.getBytes()) }; }
        catch (error) { if (!String(error).includes('Required archive member missing')) throw error; }
    }
    return { member: original, unavailable: true };
}
const resources = [...demand.values()].map(item => {
    const native = source(item.name), family = environment.identities.ra2[item.name];
    let status: string, contract: string | null = null;
    if (family && environment.sources[native.member]?.sha256 === native.sha256) {
        status = 'REUSE_SOURCE_HASH_VERIFIED'; contract = family;
    } else if (unitFamilies[item.name]) {
        status = 'REUSE_UNIT_CONTROLLER_MISSION_BINDING_PENDING'; contract = unitFamilies[item.name].familyHash;
    } else if (vxlUnitFamilies[item.name] && vxlUnitAvailableInTheater(vxlUnitFamilies[item.name], 'URBAN')) {
        status = 'REUSE_VXL_CONTROLLER_MISSION_BINDING_PENDING'; contract = vxlUnitFamilies[item.name].hash;
    } else if (isAlliedBuildingHdFamily(item.name) || isSovietBuildingHdFamily(item.name)
        || ['GAPOWR', 'NAPOWR', 'E2', 'HTNK', 'HARV', 'SMCV', 'FV', 'HTK', 'SAPC'].includes(item.name)) {
        status = 'REUSE_EXISTING_WORLD_CONTROLLER_MISSION_BINDING_PENDING';
    } else status = 'NO_CURRENT_THEATER_SHP_CONTRACT_FOUND';
    const observed = nativeBindings.filter((binding: any) => binding.name === item.name);
    if (observed.length && observed.every((binding: any) => binding.density === 1)) status = 'ORIGINAL_FALLBACK_CONFIRMED';
    else if ([2, 4].every(density => observed.some((binding: any) => binding.density === density))) {
        status = item.name.startsWith('CAWA2') ? 'REUSE_UNCHANGED_EARLIER_NATIVE_BINDING' : 'REUSE_NATIVE_MISSION_HD_BINDING_CONFIRMED';
    }
    return { name: item.name, placements: item.placements, referencedBy: [...item.sections], original: native, status, contract,
        ...(observed.length ? { nativeEvidence: observed } : {}) };
}).sort((a, b) => a.name.localeCompare(b.name));
const issues = campaignPreflight(definition, campaignCapabilities);
const inventory = json('docs/campaign-support-matrix.json');
const prepared = json('.artifacts/m3-1/preparation/report.json');
const sourceHash = sha(readFileSync('.local/campaign/ra2/sov01t/sov01t.map'));
const summary = { schemaVersion: 1, status: 'SOURCE_PREFLIGHT_READY_SEE_SEPARATE_NATIVE_ACCEPTANCE', sourceHash,
    priorAssessmentSourceMatches: inventory.candidates.find((candidate: any) => candidate.name === 'sov01t.map').sha256 === sourceHash,
    admission: {
        formalPlay: issues.length === 0, difficulties: ['easy', 'normal', 'hard'],
        reason: 'Source preflight covers all three difficulty flags. Native completion, display and platform status are separate; retain the Normal acceptance record and see m3-1-feedback-r5 for the expanded difficulty checks.',
        events: [...campaignCapabilities.events].sort((a, b) => a - b),
        actions: [...campaignCapabilities.actions].sort((a, b) => a - b),
        scripts: [...campaignCapabilities.scripts].sort((a, b) => a - b),
        subsystems: campaignCapabilities.subsystems,
    },
    declared: { triggers: definition.triggers.size, tags: definition.tags.size, houses: definition.houses.size,
        teams: definition.teams.size, scripts: definition.scripts.size, taskForces: definition.taskForces.size,
        waypoints: definition.waypoints.size, cellTags: definition.cellTags.length,
        actions: [...definition.triggers.values()].reduce((sum, trigger) => sum + trigger.actions.length, 0),
        events: [...definition.triggers.values()].reduce((sum, trigger) => sum + trigger.events.length, 0) },
    currentGaps: issues.map(({ raw: _raw, ...issue }) => issue),
    unimplementedOpcodes: {
        actions: [...new Set(issues.filter(issue => issue.section === 'Actions').map(issue => /opcode (\d+)/.exec(issue.reason)?.[1]).filter(Boolean))].map(Number),
        scripts: [...new Set(issues.filter(issue => definition.scripts.has(issue.section)).map(issue => /opcode (\d+)/.exec(issue.reason)?.[1]).filter(Boolean))].map(Number),
    },
    resources, declaredResourceIdentities, nativeAdditionalResourceIdentities: resources.length - declaredResourceIdentities,
    resourceCounts: resources.reduce<Record<string, number>>((counts, resource) => {
        counts[resource.status] = (counts[resource.status] ?? 0) + 1;
        return counts;
    }, {}),
    resourceScope: 'Primary techno/terrain images, including task-force-only references and observed produced/deployed actors. Subordinate animations, rubble, overlays and TMP coverage are not a complete HD audit.',
    media: { speech: prepared.speech, movies: prepared.media },
    artworkPolicy: 'No authored art or accepted resource is changed. Resource contracts are source-matched where stated; presence does not establish mission runtime activation.',
    missionSpecificArt: ['CAWA2A', 'CAWA2B', 'CAWA2C', 'CAWA2D'].map(name => resources.find(resource => resource.name === name)),
    sourceNotes: 'All original map bytes and records stay in controlled ignored local resources. This metadata does not substitute for gameplay acceptance.' };
writeFileSync('.artifacts/m3-1/current-audit.json', JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ declared: summary.declared, gaps: issues.length, missing: summary.unimplementedOpcodes,
    resources: resources.length, missionSpecificArt: summary.missionSpecificArt?.map(item => ({ name: item?.name, status: item?.status })) }));
