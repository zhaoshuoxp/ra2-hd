import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';

const out = path.resolve(process.argv[2]); mkdirSync(out, { recursive: false });
const mapFile = '.local/campaign/ra2/sov01t/sov01t.map', bytes = readFileSync(mapFile);
const sha256 = createHash('sha256').update(bytes).digest('hex');
assert.equal(sha256, '7f4492961d30b5799367aa840ba007932057b19a22a77f95475a18ca1407b99f');
const definition = new CampaignDefinition('ra2', 'sov01t.map', bytes.toString()); definition.assertValid();
const types: Record<string, number> = { Structures: 2, Units: 7, Infantry: 3, Aircraft: 1, Terrain: 6, Smudge: 5 };
const rows = new Map<string, { name: string; type: number; placements: any[]; references: any[] }>();
function row(name: string, type: number) {
    if (!rows.has(name)) rows.set(name, { name, type, placements: [], references: [] });
    return rows.get(name)!;
}
const sections: Record<string, number> = {};
for (const [section, type] of Object.entries(types)) {
    const entries = [...(definition.ini.getSection(section)?.entries ?? [])]; sections[section] = entries.length;
    for (const [key, raw] of entries) {
        const fields = String(raw).split(','), terrain = section === 'Terrain';
        const name = terrain ? fields[0] : fields[1];
        row(name, type).placements.push({ section, key, house: terrain ? null : fields[0],
            tile: terrain ? [Number(key) % 1000, Math.floor(Number(key) / 1000)] : [Number(fields[3]), Number(fields[4])] });
    }
}
const unitNames = new Map<string, number>();
for (const [section, type] of [['InfantryTypes', 3], ['VehicleTypes', 7], ['AircraftTypes', 1]] as const) {
    for (const name of definition.ini.getSection(section)?.entries.values() ?? []) unitNames.set(String(name), type);
}
// The native resolver fills object types from the actual merged rules where the map has no local registry.
for (const force of definition.taskForces.values()) for (const unit of force.units) {
    const teams = [...definition.teams.values()].filter(team => team.taskForce === force.id);
    row(unit.type, unitNames.get(unit.type) ?? 0).references.push({ section: 'TaskForces', taskForce: force.id,
        countPerForce: unit.count, teams: teams.map(team => ({ id: team.id, house: team.house,
            paradrop: team.properties.Droppod?.toLowerCase() === 'yes' || team.properties.Droppod === '1' })) });
}
const result = { schemaVersion: 1, status: 'SOURCE_INVENTORY_FOR_NATIVE_HD_COVERAGE_AUDIT',
    sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    map: { path: mapFile, bytes: bytes.length, sha256, theater: definition.ini.getSection('Map')?.getString('Theater') },
    sections, houses: [...definition.houses.values()].map(house => ({ id: house.id, country: house.country })),
    taskForces: definition.taskForces.size, teams: definition.teams.size,
    rows: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name)),
    scope: 'All original placements and all declared task forces. Native audit adds produced/deployed actors and implicit paradrop aircraft; no map or resource export is run.' };
writeFileSync(path.join(out, 'inventory.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ map: result.map, sections, identities: rows.size, out }));
