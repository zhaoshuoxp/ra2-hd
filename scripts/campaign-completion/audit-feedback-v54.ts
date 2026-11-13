import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseMix } from '../../src/offline/retail';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { MapFile } from '../../src/data/MapFile';
import { IniFile } from '../../src/data/IniFile';
import { requiredBytes, retailIni, sha256 } from '../test-support/resources';

const output = path.resolve(process.argv[2]);
mkdirSync(output, { recursive: true });
const maps = parseMix(requiredBytes('assets/ra2/maps01.mix'), 'maps01.mix');
const rules = retailIni('ra2');
const report: any = { base: '2bd58e34', maps: {}, rules: {} };
const art = retailIni('ra2', 'art');
report.art = { DBRIS4LG: Object.fromEntries(art.getSection('DBRIS4LG')?.entries ?? []) };
for (const name of ['all01t.map', 'all03u.map', 'all09t.map', 'all10s.map', 'all11t.map', 'all12s.map']) {
    const bytes = maps.openFile(name).getBytes(), text = new TextDecoder().decode(bytes);
    const definition = new CampaignDefinition('ra2', name, text);
    const map = new MapFile(); IniFile.prototype.fromString.call(map, text);
    const [x, y, width, height] = definition.ini.getSection('Map')!.getNumberArray('Size');
    map.fullSize = { x, y, width, height }; map.readTiles(); map.readOverlays();
    const section = (key: string) => Object.fromEntries(definition.ini.getSection(key)?.entries ?? []);
    writeFileSync(path.join(output, name + '.ini'), text);
    report.maps[name] = { sha256: sha256(bytes), basic: section('Basic'), general: section('General'),
        specialFlags: section('SpecialFlags'), houses: Object.fromEntries(definition.houses),
        teams: Object.fromEntries(definition.teams), scripts: Object.fromEntries(definition.scripts),
        taskForces: Object.fromEntries(definition.taskForces), triggers: Object.fromEntries(definition.triggers),
        aiTriggers: Object.fromEntries(definition.aiTriggers), infantry: section('Infantry'), units: section('Units'), aircraft: section('Aircraft'), structures: section('Structures'), base: section('Base'),
        highBridges: map.overlays.filter(o => o.id === 24 || o.id === 25).map(o => ({ ...o,
            terrain: [-1, 0, 1].map(n => map.tiles.find(t => t && t.rx === o.rx + (o.id === 24 ? n : 0)
                && t.ry === o.ry + (o.id === 25 ? n : 0))) })) };
}
for (const key of ['C4Delay', 'C4Warhead', 'DeathWeapon', 'Explosive', 'CollateralDamageCoefficient']) {
    report.rules[key] = rules.getSection('CombatDamage')?.get(key);
}
for (const key of ['TANY', 'GHOST', 'CAOUTP', 'ENGINEER', 'FV', 'CMIN', 'CIVAN', 'CIVBBP', 'CIVBFM', 'CIV1', 'CTECH',
    'CAWASH07', 'DBRIS4LG', 'Super', 'HE', 'C4', 'Demolition', 'General', 'C4Warhead', 'Sapper', 'SapperE', 'FakeC4', 'SAPC', 'TUG', 'CRUISE', 'SQD', 'SQDG', 'GTGCAN', 'GAPILE', 'NAFLAK', 'CAPOWR', 'CAOILD']) {
    report.rules[key] = Object.fromEntries(rules.getSection(key)?.entries ?? []);
}
writeFileSync(path.join(output, 'original-source-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ maps: Object.fromEntries(Object.entries<any>(report.maps).map(([name, data]) => [name,
    { sha256: data.sha256, teams: Object.keys(data.teams).length, aircraft: data.aircraft }])),
    c4Delay: report.rules.C4Delay, c4Warhead: report.rules.C4Warhead }));
