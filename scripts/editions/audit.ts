// Read only explicitly named retail containers; never execute installation files.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, realpathSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseMix, retailTree, resolveMember, type Container } from '../../src/offline/retail';
import { MixFile } from '../../src/data/MixFile';
import { IniFile } from '../../src/data/IniFile';
const source = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3] ?? '.artifacts/editions/audit');
if (realpathSync(source) !== source || out === source || out.startsWith(source + path.sep)) throw Error('Use a real read-only source and separate output');
mkdirSync(out, { recursive: true });
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const archiveNames = ['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'];
const names = readdirSync(source);
const archives = archiveNames.map(name => {
    const matches = names.filter(n => n.toLowerCase() === name);
    if (matches.length !== 1) throw Error(`Missing or ambiguous source: ${name}`);
    const file = path.join(source, matches[0]);
    if (!lstatSync(file).isFile() || realpathSync(file) !== file) throw Error(`Unsafe source: ${name}`);
    const bytes = readFileSync(file); return { name, bytes, sha256: hash(bytes) };
});
const base = retailTree(new Map(archives.filter(a => ['ra2.mix', 'language.mix', 'multi.mix'].includes(a.name)).map(a => [a.name, a.bytes])));
const expansion: Container[] = [];
function visit(name: string, mix: MixFile, depth = 0) {
    if (depth > 4 || expansion.length > 128) throw Error('Expansion nesting limit');
    expansion.push({ path: name, mix });
    for (const child of ['localmd.mix', 'cachemd.mix', 'conqmd.mix', 'sidec01md.mix', 'sidec02md.mix', 'sidec03.mix', 'loadmd.mix', 'cameomd.mix', 'audiomd.mix', 'isotemmd.mix', 'isosnomd.mix', 'isoubn.mix', 'isodes.mix', 'isolun.mix', 'urbann.mix', 'desert.mix', 'lunar.mix']) {
        if (mix.containsFile(child)) visit(`${name}/${child}`, new MixFile(mix.openFile(child).stream), depth + 1);
    }
}
for (const name of ['expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']) {
    const archive = archives.find(a => a.name === name)!; visit(name, parseMix(archive.bytes, name));
}
const catalogs: any = {};
for (const edition of ['ra2', 'yr']) {
    const tree = edition === 'ra2' ? base : [...expansion, ...base];
    const members: any = {};
    for (const name of edition === 'ra2' ? ['rules.ini', 'art.ini', 'ai.ini', 'ra2.csf', 'missions.pkt'] : ['rulesmd.ini', 'artmd.ini', 'aimd.ini', 'ra2md.csf', 'missionsmd.pkt']) {
        const member = resolveMember(tree, name), bytes = member.file.getBytes();
        members[name] = { source: member.source, sha256: hash(bytes), bytes: bytes.length };
        writeFileSync(path.join(out, name), bytes);
    }
    const ini = new IniFile(resolveMember(tree, edition === 'ra2' ? 'rules.ini' : 'rulesmd.ini').file.readAsString());
    const values = (name: string) => [...(ini.getSection(name)?.entries.values() ?? [])].map(v => Array.isArray(v) ? v[0] : v);
    const registry: any = {};
    for (const name of ['Countries', 'Sides', 'InfantryTypes', 'VehicleTypes', 'AircraftTypes', 'BuildingTypes', 'SuperWeaponTypes']) {
        registry[name] = values(name).map(id => ({ id, rules: Object.fromEntries(ini.getSection(id)?.entries ?? []) }));
    }
    const countries = registry.Countries.filter((r: any) => !['yes', 'true'].includes(String(r.rules.MultiplayPassive).toLowerCase()) && r.rules.Side && !['Civilian', 'Mutant'].includes(r.rules.Side));
    catalogs[edition] = { edition, members, countries, registry, general: Object.fromEntries(ini.getSection('General')!.entries), containers: tree.map(t => t.path) };
    writeFileSync(path.join(out, `${edition}-catalog.json`), JSON.stringify(catalogs[edition], null, 2));
}
const differences: any = {};
for (const key of ['InfantryTypes', 'VehicleTypes', 'AircraftTypes', 'BuildingTypes', 'SuperWeaponTypes']) {
    const before = new Map(catalogs.ra2.registry[key].map((r: any) => [r.id, r.rules]));
    differences[key] = catalogs.yr.registry[key].flatMap((r: any) => {
        const old: any = before.get(r.id);
        if (!old) return [{ id: r.id, added: true, rules: r.rules }];
        const changes = Object.fromEntries([...new Set([...Object.keys(old), ...Object.keys(r.rules)])].filter(k => JSON.stringify(old[k]) !== JSON.stringify(r.rules[k])).map(k => [k, { ra2: old[k] ?? null, yr: r.rules[k] ?? null }]));
        return Object.keys(changes).length ? [{ id: r.id, changes }] : [];
    });
}
writeFileSync(path.join(out, 'differences.json'), JSON.stringify(differences, null, 2));
writeFileSync(path.join(out, 'sources.json'), JSON.stringify({ authenticity: 'LOCAL_ARCHIVES_NOT_INDEPENDENTLY_AUTHENTICATED', archives: archives.map(({ bytes, ...r }) => ({ ...r, bytes: bytes.length })) }, null, 2));
console.log(JSON.stringify({ countries: Object.fromEntries(Object.entries(catalogs).map(([k, v]: any) => [k, v.countries.map((c: any) => c.id)])), changes: Object.fromEntries(Object.entries(differences).map(([k, v]: any) => [k, v.length])) }));
