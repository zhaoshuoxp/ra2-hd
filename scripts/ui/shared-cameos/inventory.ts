// Audit both editions against the selected HD catalog and actual native production rules.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { editionRetailTree } from '../../../src/offline/editionRetail';
import { adaptRetailRules } from '../../../src/offline/retailCompatibility';
import { resolveMember } from '../../../src/offline/retail';
import { IniFile } from '../../../src/data/IniFile';
import { ShpFile } from '../../../src/data/ShpFile';
import { Palette } from '../../../src/data/Palette';
import { Rules } from '../../../src/game/rules/Rules';
import { Art } from '../../../src/game/art/Art';
import { ObjectType } from '../../../src/engine/type/ObjectType';
import { Production } from '../../../src/game/player/production/Production';
import { SideType } from '../../../src/game/SideType';

const root = path.resolve(process.argv[2] ?? '.local');
const out = path.resolve(process.argv[3] ?? '.artifacts/shared-cameos/inventory-v1');
mkdirSync(out, { recursive: true });
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const selected = JSON.parse(readFileSync(`${root}/ui-selection.json`, 'utf8'));
const pack = `${root}/ui-packs/${selected.revision}`;
const manifestBytes = readFileSync(`${pack}/manifest.json`);
if (sha(manifestBytes) !== selected.sha256) throw Error('UI manifest identity mismatch');
const manifest = JSON.parse(manifestBytes.toString());
const assets = new Map<string, any>(manifest.assets.map((entry: any) => [entry.id, entry]));
const fileErrors = manifest.assets.flatMap((a: any) => {
    const file = `${pack}/${a.file}`;
    return !existsSync(file) ? [{ id: a.id, error: 'FILE_MISSING' }]
        : sha(readFileSync(file)) !== a.sha256 ? [{ id: a.id, error: 'HASH_MISMATCH' }] : [];
});
const top = new Map<string, Uint8Array>();
const imported = JSON.parse(readFileSync(`${root}/yr-core-manifest.json`, 'utf8'));
for (const entry of imported.files) {
    const edition = ['expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'].includes(entry.virtualName) ? 'yr' : 'ra2';
    const bytes = readFileSync(`${root}/assets/${edition}/${entry.virtualName}`);
    if (sha(bytes) !== entry.sha256 || bytes.length !== entry.bytes) throw Error(`Import changed: ${entry.virtualName}`);
    top.set(entry.virtualName, bytes);
}
const editions: any[] = [];
for (const edition of ['ra2', 'yr'] as const) {
    const nativeOut = `${out}/${edition}`;
    mkdirSync(nativeOut, { recursive: true });
    const tree = editionRetailTree(top, edition);
    const rulesIni = new IniFile(resolveMember(tree, edition === 'yr' ? 'rulesmd.ini' : 'rules.ini').file);
    const artIni = new IniFile(resolveMember(tree, edition === 'yr' ? 'artmd.ini' : 'art.ini').file);
    const rules = new Rules(adaptRetailRules(rulesIni).rules) as any;
    const art = new Art(rules, artIni, undefined, undefined);
    const palette = new Palette(resolveMember(tree, 'cameo.pal').file);
    const objects: any[] = [rules.buildingRules, rules.infantryRules, rules.vehicleRules, rules.aircraftRules]
        .flatMap(map => [...map.values()]);
    const countries: any[] = rules.getMultiplayerCountries().filter((c: any) => [SideType.GDI, SideType.Nod].includes(c.side));
    const productions = countries.map(country => {
        // Full faction prerequisites, including captured technology; no trainer or eligibility overrides.
        const faction = country.side === SideType.GDI ? 0 : 1;
        const buildings = new Set([...rules.buildingRules.values()].filter((r: any) => {
            const plan = rulesIni.getSection(r.name)?.getNumber('AIBasePlanningSide', -1);
            return r.isAvailableTo(country) && (plan === faction ||
                (plan === -1 && r.owner.includes(country.name) && !r.owner.includes('YuriCountry')));
        }).map((r: any) => ({ name: r.name, rules: r, factoryTrait: r.factory ? { type: r.factory } : undefined,
            isSpawned: true, isDestroyed: false, warpedOutTrait: { isActive: () => false } })));
        const player: any = { country, buildings, isAi: false, getOwnedObjects: () => [] };
        const production = new Production(player, 10, { superWeapons: true }, rules, objects);
        for (const side of [SideType.GDI, SideType.Nod, SideType.ThirdSide]) production.addStolenTech(side);
        return { country, production, buildings: [...buildings].map((b: any) => b.name) };
    });
    const rows = objects.map(r => {
        const ini = rulesIni.getSection(r.name)!;
        const a = art.getObject(r.name, r.type);
        const availability = productions.filter(p => p.production.isAvailableForProduction(r)).map(p => p.country.name);
        return { id: r.name, type: ObjectType[r.type], artSection: r.imageName, techLevel: r.techLevel,
            owners: r.owner, trainable: r.trainable, prerequisites: r.prerequisite,
            requiredHouses: r.requiredHouses, forbiddenHouses: r.forbiddenHouses,
            normal: `${a.cameo}.shp`, alternate: `${a.altCameo}.shp`, availability,
            scope: availability.length ? 'NATIVE_ALLIED_SOVIET_OR_STOLEN_TECH' : 'DECLARED_AUDIT_ONLY',
            superWeapons: [ini.getString('SuperWeapon'), ini.getString('SuperWeapon2')].filter(Boolean) };
    });
    const powers = [...rulesIni.getSection('SuperWeaponTypes')!.entries.values()].map(raw => {
        const id = String(raw), sw = rules.getSuperWeapon(id);
        const granting = rows.filter(r => r.superWeapons.includes(id) && r.availability.length);
        return { id, normal: sw.sidebarImage ? `${sw.sidebarImage}.shp` : null,
            granting: granting.map(r => r.id), inScope: granting.length > 0 };
    });
    const names = [...new Set([...rows.flatMap(r => [r.normal, r.alternate]), ...powers.flatMap(p => p.normal ? [p.normal] : [])])].sort();
    const entries = names.map(name => {
        const uses = rows.filter(r => [r.normal, r.alternate].includes(name));
        const inScope = uses.some(r => r.availability.length && (r.normal === name || r.trainable)) ||
            powers.some(p => p.normal === name && p.inScope);
        const accepted = assets.get(name);
        const base = { member: name, uses: uses.map(r => r.id), powers: powers.filter(p => p.normal === name).map(p => p.id),
            inScope, acceptedEntry: accepted ?? null };
        try {
            const member = resolveMember(tree, name), shp = new ShpFile(member.file), frame = shp.getImage(0);
            const rgba = new Uint8Array(shp.width * shp.height * 4);
            for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
                const index = frame.imageData[y * frame.width + x], color = palette.colors[index];
                rgba.set([color.r, color.g, color.b, index ? 255 : 0], ((frame.y + y) * shp.width + frame.x + x) * 4);
            }
            writeFileSync(`${nativeOut}/${name}.rgba`, rgba);
            return { ...base, nativeSize: [shp.width, shp.height], archive: member.source,
                sha256: sha(member.file.getBytes()), status: accepted ? 'HD_CATALOG_PRESENT' : 'HD_CATALOG_MISSING' };
        } catch (error: any) {
            if (!String(error.message).startsWith('Required archive member missing:')) throw error;
            return { ...base, status: 'NATIVE_MEMBER_MISSING' };
        }
    });
    const result = { edition, rows, powers, entries, prerequisiteFixtures: productions.map(p => ({ country: p.country.name, buildings: p.buildings })),
        counts: { nativeProductionRules: rows.filter(r => r.availability.length).length,
            scopedCameos: entries.filter(e => e.inScope).length,
            missingHd: entries.filter(e => e.inScope && e.status === 'HD_CATALOG_MISSING').length,
            missingNative: entries.filter(e => e.inScope && e.status === 'NATIVE_MEMBER_MISSING').length } };
    editions.push(result);
    console.log(JSON.stringify({ edition, counts: result.counts, missing: entries.filter(e => e.status !== 'HD_CATALOG_PRESENT').map(e => ({ id: e.member, scope: e.inScope, uses: e.uses, powers: e.powers, status: e.status })) }, null, 2));
}
writeFileSync(`${out}/inventory.json`, JSON.stringify({ status: 'SOURCE_AUDIT_COMPLETE_RUNTIME_BINDINGS_PENDING',
    selected, acceptedEntries: manifest.assets.length, fileErrors, editions,
    boundary: 'Both actual edition rules; all multiplayer Allied/Soviet houses, full faction prerequisites and stolen tech. Nonbuildable/native-missing declarations remain explicit.' }, null, 2) + '\n');
