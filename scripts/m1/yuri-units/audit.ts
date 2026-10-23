// Native production closure and art identity audit, not natural-match acceptance.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { IniFile } from '../../../src/data/IniFile';
import { Rules } from '../../../src/game/rules/Rules';
import { Art } from '../../../src/game/art/Art';
import { Production } from '../../../src/game/player/production/Production';
import { adaptRetailRules } from '../../../src/offline/retailCompatibility';
import { SideType } from '../../../src/game/SideType';
import { unitHdFamilies } from '../../../src/engine/renderable/builder/unitHdFamilies';
import { hdTextureBudget } from '../../../src/engine/gfx/HdDensity';

const root = '.artifacts/yuri-units';
const source = `${root}/source-v2`;
const inv = JSON.parse(readFileSync(`${source}/inventory.json`, 'utf8'));
const ini = new IniFile(readFileSync(`${source}/rulesmd.ini`, 'utf8'));
const artIni = new IniFile(readFileSync(`${source}/artmd.ini`, 'utf8'));
const adapted = adaptRetailRules(ini);
const rules = new Rules(adapted.rules);
const art = new Art(rules, artIni, undefined, undefined);
const plain = (s: any) => Object.fromEntries(s?.entries ?? []);
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const rows = inv.families.map((family: any) => {
    const type = family.category === 'InfantryTypes' ? 3 : family.category === 'AircraftTypes' ? 1 : 7;
    const rule: any = rules.getObject(family.id, type);
    const native = art.getObject(family.id, type);
    assert.equal(native.imageName.toLowerCase(), family.stem);
    const gates = inv.yuriHouses.map((name: string) => {
        const country = rules.getCountry(name);
        const buildings: any[] = [];
        const add = (b: any) => buildings.push({ name: b.name, rules: b,
            factoryTrait: b.factory ? { type: b.factory } : undefined });
        add(rules.buildingRules.get('YACNST'));
        const player = { country, isAi: false, buildings, getOwnedObjects: () => [] };
        const prod = new Production(player, 10, { superWeapons: true }, rules, [rule]);
        for (let changed = true; changed;) {
            changed = false;
            for (const b of rules.buildingRules.values() as any) {
                if (buildings.some(x => x.name === b.name) || b.techLevel < 0 || b.techLevel > 10 ||
                    !b.hasOwner(country) || !b.isAvailableTo(country) || !prod.isAvailableForProduction(b)) continue;
                add(b); changed = true;
            }
        }
        const before = prod.isAvailableForProduction(rule);
        const stolen = [SideType.GDI, SideType.Nod, SideType.ThirdSide].map(side => {
            prod.addStolenTech(side);
            return { side, available: prod.isAvailableForProduction(rule) };
        });
        return { house: name, owner: rule.hasOwner(country), allowed: rule.isAvailableTo(country),
            reachableBuildings: buildings.map(b => b.name), factory: prod.hasFactoryFor(rule),
            prerequisites: prod.meetsPrerequisites(rule), beforeStolenTech: before, stolen,
            available: rule.hasOwner(country) && prod.isAvailableForProduction(rule) };
    });
    const included = gates.some((g: any) => g.available);
    const sharedId = family.id === 'YENGINEER' ? 'SENGINEER' : family.id;
    const contract = unitHdFamilies[sharedId];
    const match = contract && family.representation === 'SHP' && !contract.blockedReason
        && family.members.every((member: string) => contract.members.some(m =>
            m.member === member && m.sourceHash === inv.assets[member].sha256));
    return { ...family, included, gates, nativeContract: {
        image: native.imageName, noShadow: rule.noShadow, theaterExtension: native.useTheaterExtension,
        sequenceCount: native.sequences.size, turretOffset: native.turretOffset,
        remappableDeclaration: native.remapable, alternateArctic: rule.alternateArcticArt,
    }, reuse: match ? { identity: sharedId, familyHash: contract.familyHash,
        status: 'SOURCE_MATCHED_ACCEPTED_CONTRACT_RESOURCE_COPY_PENDING',
        missingBinding: sharedId !== family.id } : null,
    requiredActions: {
        INIT: ['movement', 'fire', 'garrison', 'damage/death'], BRUTE: ['movement', 'punch/smash', 'damage/death'],
        VIRUS: ['movement', 'snipe', 'fixed-color toxin effects', 'damage/death'],
        YURI: ['mind control', 'ownership change', 'psi wave'], YURIPR: ['hover silhouette', 'super mind control', 'psi wave'],
        YENGINEER: ['capture', 'repair', 'movement'], LTNK: ['body/turret/barrel independence', 'movement', 'fire'],
        YTNK: ['gattling stages', 'ground/air aim', 'owner colors'], TELE: ['magnetron lift', 'target occlusion'],
        MIND: ['mind-control capacity', 'ownership change'], CAOS: ['movement', 'chaos effects'],
        DISK: ['flight', 'drain', 'independent turret'], BSUB: ['water', 'submerge/reveal', 'CMISL launch'],
        SMIN: ['deployment/undeployment', 'slave spawning', 'harvesting', 'turret'],
        YHVR: ['water/shore', 'passengers/unload'], PCV: ['movement', 'deploy to YACNST'],
    }[family.id] ?? ['native action audit pending'],
    source: [...family.members, ...family.children.flatMap((c: any) => c.members),
        ...family.attachments.map((a: any) => a.member)].map(member => inv.assets[member]),
    activation: match && sharedId === family.id ? 'ACCEPTED_BASELINE_REUSE' : 'ORIGINAL',
    coverage: included ? (match ? 'ACCEPTED_REUSE_SOURCE_MATCH' : 'NEW_ART_REPRESENTATIVE_PENDING') : 'EXCLUDED_NATIVE_PRODUCTION_GATE' };
});
const selected = rows.filter((r: any) => r.included);
const children = [...new Map(selected.flatMap((r: any) => r.children).map((c: any) => [c.id, c])).values()] as any[];
const interfaces = selected.filter((r: any) => r.rules.DeploysInto).map((r: any) => {
    const target = r.rules.DeploysInto;
    const building = plain(ini.getSection(target));
    const buildingArt = plain(artIni.getSection(building.Image || target));
    return { unit: r.id, building: target, unitArt: r.image, buildingArt: building.Image || target,
        forward: r.rules.DeploysInto, reverse: building.UndeploysInto ?? null,
        unitDeployFacing: r.rules.DeployFacing ?? null, buildingDeployFacing: building.DeployFacing ?? null,
        nativeUnitTurretOffset: r.art.TurretOffset ?? '0', nativeBuildingTurret: {
            image: building.TurretAnim ?? null, voxel: building.TurretAnimIsVoxel ?? null,
            x: building.TurretAnimX ?? null, y: building.TurretAnimY ?? null, z: building.TurretAnimZAdjust ?? null,
        }, sharedMembers: r.id === 'SMIN' ? ['smintur.vxl', 'smintur.hva'] : [],
        nativeUnitSections: r.members.filter((m: string) => m.endsWith('.vxl')).map((m: string) => inv.assets[m]),
        slaves: { unitType: r.rules.Enslaves ?? null, buildingType: building.Enslaves ?? null,
            count: r.rules.SlavesNumber ?? null, regen: r.rules.SlaveRegenRate ?? null, reload: r.rules.SlaveReloadRate ?? null },
        buildingRules: building, buildingArtContract: buildingArt,
        ownership: 'D mobile unit, workers and unit bindings; C stationary body/turret and building bindings',
        integrationCheck: 'PENDING_C_PLUS_D_NATIVE_TRANSITION_AND_SHARED_ALLOCATION' };
});
for (const asset of Object.values(inv.assets) as any[]) {
    if (!asset.totalFrames) continue;
    const decoded = JSON.parse(readFileSync(`${source}/${asset.member}.json`, 'utf8'));
    assert.equal(decoded.frames.length, asset.totalFrames);
    for (const f of decoded.frames) {
        assert.equal(f.pixels.length, f.width * f.height);
        assert.equal(sha(new Uint8Array(f.pixels)), f.sha256);
        assert(f.x >= 0 && f.y >= 0 && f.x + f.width <= asset.canvas[0] && f.y + f.height <= asset.canvas[1]);
    }
}
assert.equal(hdTextureBudget(2), 256 * 1024 * 1024);
assert.equal(hdTextureBudget(4), 1280 * 1024 * 1024);
const ledger = { schemaVersion: 1, taskId: 'D', baseMainSha: inv.baseline,
    status: 'SOURCE_AUDIT_PASS_REPRESENTATIVE_PREPARATION', edition: 'yr',
    sourceRoot: source, sourceInputs: inv.inputs, sourceAuthenticity: inv.sourceAuthenticity,
    disclosure: 'Parsed native Production/Art, synthetic legal prerequisite closure and injected stolen flags. No natural production, HD match binding or complete-family acceptance claim.',
    count: { candidates: rows.length, roots: selected.length, children: children.length,
        acceptedReuse: selected.filter((r: any) => r.reuse).length,
        newRootArt: selected.filter((r: any) => !r.reuse).length },
    rows, children, interfaces, excluded: inv.excluded, missingSections: inv.missingSections,
    absentNativeParts: inv.absentParts, assets: inv.assets,
    worldBudgetMiB: { '2x': 256, '4x': 1280 }, defaultDensity: 4,
    technicalStatus: 'SOURCE_ONLY_PASS', visualStatus: 'NOT_REVIEWED', userAcceptance: 'NOT_REQUESTED',
    runtimeStatus: 'NOT_RUN', integration_status: 'NOT_MERGED' };
writeFileSync(process.argv[2] ?? `${root}/ledger.json`, JSON.stringify(ledger, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ count: ledger.count, included: selected.map((r: any) => r.id),
    excluded: rows.filter((r: any) => !r.included).map((r: any) => r.id),
    children: children.map(c => c.id), reuse: selected.filter((r: any) => r.reuse).map((r: any) => [r.id, r.reuse.identity]) }));
