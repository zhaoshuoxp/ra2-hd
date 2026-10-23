// Task E: read hash-pinned imports, retain selected members, and audit actual UI identities.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { editionRetailTree } from '../../../src/offline/editionRetail';
import { adaptRetailRules } from '../../../src/offline/retailCompatibility';
import { resolveMember } from '../../../src/offline/retail';
import { IniFile } from '../../../src/data/IniFile';
import { Palette } from '../../../src/data/Palette';
import { ShpFile } from '../../../src/data/ShpFile';
import { Rules } from '../../../src/game/rules/Rules';
import { Art } from '../../../src/game/art/Art';
import { ObjectType } from '../../../src/engine/type/ObjectType';
import { Production } from '../../../src/game/player/production/Production';
import { SideType } from '../../../src/game/SideType';

const sourceRoot = path.resolve(process.argv[2] ?? '../ra2-hd/.local');
const out = path.resolve(process.argv[3] ?? '.artifacts/yuri-cameos/inventory-v4');
mkdirSync(`${out}/native`, { recursive: true });
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const save = (name: string, bytes: Uint8Array | string) => {
    try {
        const previous = readFileSync(`${out}/${name}`);
        if (!previous.equals(Buffer.from(bytes))) throw Error(`Immutable evidence differs: ${name}`);
    } catch (error: any) {
        if (error.code !== 'ENOENT') throw error;
        writeFileSync(`${out}/${name}`, bytes, { flag: 'wx' });
    }
};
const imported = JSON.parse(readFileSync(`${sourceRoot}/yr-core-manifest.json`, 'utf8'));
const top = new Map<string, Uint8Array>();
const archives = imported.files.map((entry: any) => {
    const root = ['expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'].includes(entry.virtualName) ? 'yr' : 'ra2';
    const file = `${sourceRoot}/assets/${root}/${entry.virtualName}`;
    const bytes = readFileSync(file);
    if (hash(bytes) !== entry.sha256 || bytes.length !== entry.bytes) throw Error(`Import changed: ${file}`);
    top.set(entry.virtualName, bytes);
    return { ...entry, source: file, copiedArchive: false };
});
const tree = editionRetailTree(top, 'yr');
const memberIdentity = (name: string) => {
    const member = resolveMember(tree, name);
    return { member: name, archive: member.source, sha256: hash(member.file.getBytes()), bytes: member.file.getSize() };
};
for (const name of ['rulesmd.ini', 'artmd.ini', 'cameo.pal']) save(`native/${name}`, resolveMember(tree, name).file.getBytes());
const rulesIni = new IniFile(resolveMember(tree, 'rulesmd.ini').file);
const artIni = new IniFile(resolveMember(tree, 'artmd.ini').file);
const compatibility = adaptRetailRules(rulesIni);
const rules = new Rules(compatibility.rules) as any;
const art = new Art(rules, artIni, undefined, undefined);
const objects: any[] = [rules.buildingRules, rules.infantryRules, rules.vehicleRules, rules.aircraftRules]
    .flatMap(map => [...map.values()]);
const country = rules.getCountry('YuriCountry');
// Production uses native prerequisites and owners. No trainer technology or rule overrides.
const yuriBuildings = [...rules.buildingRules.values()].filter((r: any) => r.owner.includes('YuriCountry')
    && (rulesIni.getSection(r.name)?.getNumber('AIBasePlanningSide', -1) === 2 || r.owner.length === 1)
    && r.isAvailableTo(country));
const buildings = new Set(yuriBuildings.map((r: any) => ({ name: r.name, rules: r,
    factoryTrait: r.factory ? { type: r.factory } : undefined, isSpawned: true,
    isDestroyed: false, warpedOutTrait: { isActive: () => false } })));
const player: any = { country, buildings, isAi: false, getOwnedObjects: () => [] };
const production = new Production(player, 10, { superWeapons: true }, rules, objects);
for (const side of [SideType.GDI, SideType.Nod, SideType.ThirdSide]) production.addStolenTech(side);
const rows = objects.filter(r => r.owner.includes('YuriCountry')).map(r => {
    const ini = rulesIni.getSection(r.name)!;
    const a = art.getObject(r.name, r.type);
    const normal = `${a.cameo}.shp`, alternate = `${a.altCameo}.shp`;
    const natural = production.isAvailableForProduction(r);
    const yuriExclusive = r.owner.length === 1;
    const inScope = r.techLevel >= 0 && r.techLevel <= 10 && (natural || yuriExclusive);
    return { id: r.name, type: ObjectType[r.type], artSection: r.imageName,
        owners: r.owner, requiredHouses: r.requiredHouses, forbiddenHouses: r.forbiddenHouses,
        techLevel: r.techLevel, buildLimit: r.buildLimit, trainable: r.trainable,
        prerequisites: r.prerequisite, prerequisiteOverride: r.prerequisiteOverride,
        stolenTech: { allied: !!r.requiresStolenAlliedTech, soviet: !!r.requiresStolenSovietTech, third: !!r.requiresStolenThirdTech },
        nativeYuriProduction: natural, inScope,
        inclusion: inScope ? natural ? 'NATIVE_YURI_OR_STOLEN_TECH' : 'YURI_EXCLUSIVE_SPECIAL' : 'SHARED_CAPTURE_OR_NONBUILDABLE_AUDIT_ONLY',
        normal, alternate, distinctAlternate: normal !== alternate,
        alternateVisibility: normal === alternate ? 'NO_DISTINCT_NATIVE_VARIANT' : r.trainable
            ? 'Veteran factory type enabled by native infiltration; CombatantSidebarModel selects AltCameo.'
            : 'Declared but untrainable: native sidebar uses normal cameo.',
        theaterLookup: 'Cameo / AltCameo filenames are independent of world theater and AlternateArcticArt.',
        superWeapons: [ini.getString('SuperWeapon'), ini.getString('SuperWeapon2')].filter(Boolean),
        visibility: 'Native production eligibility, prerequisite ownership, house filters, technology and factory; labels/queue/progress are live.' };
});
const scoped = rows.filter(r => r.inScope);
const powerNames = new Set(scoped.flatMap(r => r.superWeapons));
const powers = [...powerNames].map(name => {
    const sw = rules.getSuperWeapon(name);
    return { id: name, nativeType: sw.type, normal: sw.sidebarImage ? `${sw.sidebarImage}.shp` : null,
        buildings: scoped.filter(r => r.superWeapons.includes(name)).map(r => r.id),
        visibility: 'Native granting structure, charge state, power/hold state and superweapon game option.' };
});
const selected = JSON.parse(readFileSync(`${sourceRoot}/ui-selection.json`, 'utf8'));
const baseBytes = readFileSync(`${sourceRoot}/ui-packs/${selected.revision}/manifest.json`);
if (hash(baseBytes) !== selected.sha256) throw Error('Accepted UI selection hash mismatch');
const base = JSON.parse(baseBytes.toString());
const aliases = JSON.parse(readFileSync('scripts/ui/cameo-aliases.json', 'utf8'));
const palette = new Palette(resolveMember(tree, 'cameo.pal').file);
const names = [...new Set([...scoped.flatMap(r => [r.normal, r.alternate]), ...powers.flatMap(p => p.normal ? [p.normal] : [])])].sort();
const entries = names.map(name => {
    const accepted = base.assets.find((a: any) => a.id === name);
    const uses = scoped.filter(r => [r.normal, r.alternate].includes(name)).map(r => r.id);
    try {
        const member = resolveMember(tree, name), shp = new ShpFile(member.file), frame = shp.getImage(0);
        save(`native/${name}`, member.file.getBytes());
        const rgba = new Uint8Array(shp.width * shp.height * 4);
        for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
            const index = frame.imageData[y * frame.width + x], color = palette.colors[index];
            rgba.set([color.r, color.g, color.b, index ? 255 : 0], ((frame.y + y) * shp.width + frame.x + x) * 4);
        }
        save(`native/${name}.rgba`, rgba);
        return { ...memberIdentity(name), uses, powers: powers.filter(p => p.normal === name).map(p => p.id),
            nativeSize: [shp.width, shp.height], frameCount: shp.numImages,
            sourceRect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
            alias: aliases[name] ?? null, acceptedEntry: accepted ?? null,
            status: accepted ? 'ACCEPTED_SHARED_REUSE' : 'NEW_ART_REQUIRED',
            exports: { '4x': [shp.width * 4, shp.height * 4], '2x': [shp.width * 2, shp.height * 2] },
            colorPolicy: 'Fixed cameo palette RGB; no world owner remap.',
            bakedRank: name !== aliases[name] && !!aliases[name] ? 'EXISTING_SHARED_RANK_OVERLAY' : 'AUDIT_NATIVE_PAIR_BEFORE_EXPORT' };
    } catch (error: any) {
        if (!String(error.message).startsWith('Required archive member missing:')) throw error;
        return { member: name, uses, acceptedEntry: accepted ?? null, status: 'MISSING_NATIVE_MEMBER_KEEP_ORIGINAL_PLACEHOLDER' };
    }
});
const allCameoIds = [...new Set(objects.flatMap(r => {
    const a = art.getObject(r.name, r.type); return [`${a.cameo}.shp`, `${a.altCameo}.shp`];
}))];
const alternatePairs = [...new Map(scoped.filter(r => r.distinctAlternate).map(r => [r.alternate, r.normal]))]
    .map(([alternate, normal]) => {
        const alternateEntry = entries.find(e => e.member === alternate);
        const normalEntry = entries.find(e => e.member === normal);
        if (!alternateEntry?.sha256 || !normalEntry?.sha256) return { alternate, normal, status: 'ABSENT_NATIVE_VARIANT', export: false };
        const normalPixels = readFileSync(`${out}/native/${normal}.rgba`);
        const alternatePixels = readFileSync(`${out}/native/${alternate}.rgba`);
        let differences = 0, outsideRankDifferences = 0;
        const [width, height] = normalEntry.nativeSize!;
        if (normalPixels.length !== alternatePixels.length) throw Error(`Alternate canvas differs: ${alternate}`);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * 4;
            if (!normalPixels.subarray(offset, offset + 4).equals(alternatePixels.subarray(offset, offset + 4))) {
                differences++;
                if (x > 20 || y > 12) outsideRankDifferences++;
            }
        }
        const foreignIdentity = outsideRankDifferences ? scoped.find(r => r.normal !== normal
            && r.alternate !== alternate && entries.some(e => [r.normal, r.alternate].includes(e.member)
                && e.sha256 === alternateEntry.sha256)) : undefined;
        const status = alternateEntry.acceptedEntry ? 'PRESERVE_ACCEPTED_ALIAS'
            : foreignIdentity ? 'LOCALIZED_NATIVE_SOURCE_COLLISION_USE_CORRECT_RULE_BASE_AND_SHARED_RANK'
            : outsideRankDifferences ? 'DISTINCT_ART_REVIEW_REQUIRED' : 'SHARED_BASE_AND_NATIVE_RANK';
        return { alternate, normal, status, export: true, differences, outsideRankDifferences,
            foreignIdentity: foreignIdentity?.id ?? null, runtimeTrainable: scoped.some(r => r.alternate === alternate && r.trainable),
            selectedBase: normal, selectedOverlay: 'cameo-rank' };
    });
const collisions = entries.filter(e => e.status === 'NEW_ART_REQUIRED').flatMap(e => {
    const ra2Tree = editionRetailTree(top, 'ra2');
    try { const m = resolveMember(ra2Tree, e.member); return [{ id: e.member, ra2Sha256: hash(m.file.getBytes()), yrSha256: e.sha256 }]; }
    catch { return []; }
});
const inventory = { schemaVersion: 1, taskId: 'E', edition: 'yr', status: 'INVENTORY_PREPARED_ART_REVIEW_PENDING',
    archives, sources: ['rulesmd.ini', 'artmd.ini', 'cameo.pal'].map(memberIdentity),
    acceptedUi: { ...selected, entries: base.assets.length, sourceRoot, preserved: true },
    runtimePolicy: { density: 4, uiBudgetBytes: 16 * 1024 * 1024, companion2x: 'EXPORT_ONLY_NOT_RUNTIME_SELECTED',
        existingRetailCompatibility: compatibility.additions,
        eligibilityEvidence: 'Synthetic complete native Yuri prerequisite/factory ownership plus explicit stolen-tech flags; no trainer technology, map or gameplay rule changes. This is parser/production eligibility evidence, not an actual-match result.',
        actualMatchValidation: 'NOT_RUN_BEFORE_ART_DIRECTION_APPROVAL',
        references: ['src/game/art/Art.ts', 'src/game/art/ObjectArt.ts', 'src/game/player/production/Production.ts',
            'src/gui/screen/game/GameLoader.ts', 'src/gui/screen/game/component/Hud.ts',
            'src/gui/screen/game/component/hud/viewmodel/CombatantSidebarModel.ts'],
        allNativeCameoIds: allCameoIds },
    counts: { ownerCandidates: rows.length, scopedRules: scoped.length, buildings: scoped.filter(r => r.type === 'Building').length,
        units: scoped.filter(r => r.type !== 'Building').length, powers: powers.length, uniqueReferences: entries.length,
        reuse: entries.filter(e => e.status === 'ACCEPTED_SHARED_REUSE').length,
        newReferences: entries.filter(e => e.status === 'NEW_ART_REQUIRED').length },
    rows, powers, entries, alternatePairs, collisions,
    peerDependencies: { C: 'No stable accepted Task C master bound.', D: 'No stable accepted Task D master bound.',
        bugfix: 'fix/allied-animation-sidebar owns category switching flashes; no timing/cache patch in E.' } };
save('inventory.json', JSON.stringify(inventory, null, 2) + '\n');
console.log(JSON.stringify({ counts: inventory.counts, scoped: scoped.map(r => r.id), powers, collisions }, null, 2));
