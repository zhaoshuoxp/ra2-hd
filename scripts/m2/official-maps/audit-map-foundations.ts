// Resolve actual retail/map art and compare the legacy parser with native footprints.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { IniFile } from '../../../src/data/IniFile';
import { MapFile } from '../../../src/data/MapFile';
import { editionRetailTree } from '../../../src/offline/editionRetail';
import { resolveMember } from '../../../src/offline/retail';
import { Rules } from '../../../src/game/rules/Rules';
import { Art } from '../../../src/game/art/Art';
import { ObjectType } from '../../../src/engine/type/ObjectType';
import { adaptRetailRules } from '../../../src/offline/retailCompatibility';

const output = process.argv[2];
if (!output || fs.existsSync(output)) throw Error('A new evidence filename is required');
const names = ['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'];
const top = new Map(names.map(name => [name, fs.readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const inventory = JSON.parse(fs.readFileSync('.artifacts/m2-3/inventory-v9/inventory.json', 'utf8'));
const maps: any[] = [];
for (const edition of ['ra2', 'yr'] as const) {
    const tree = editionRetailTree(top, edition);
    const rawRules = new IniFile(resolveMember(tree, edition === 'yr' ? 'rulesmd.ini' : 'rules.ini').file);
    const rawArt = new IniFile(resolveMember(tree, edition === 'yr' ? 'artmd.ini' : 'art.ini').file);
    for (const row of inventory.maps.filter((value: any) => value.edition === edition
        && value.runtimeEligibility === 'ELIGIBLE_FOR_FOCUSED_NATIVE_MATCH')) {
        const file = resolveMember(tree, row.declaration.member).file;
        const sourceSha256 = createHash('sha256').update(file.getBytes()).digest('hex');
        if (sourceSha256 !== row.source.sha256) throw Error(`Map source drift: ${row.mapId}`);
        const map = new MapFile(file);
        const rules = new Rules(adaptRetailRules(rawRules.clone()).rules.mergeWith(map));
        const art = new Art(rules, rawArt.clone().mergeWith(map.artOverrides ?? new IniFile()), map, undefined);
        const buildings = [...new Set(map.structures.map(value => value.name))].map(name => {
            const native = art.getObject(name, ObjectType.Building);
            const declaration = native.art.getString('Foundation', '1x1')!;
            const legacy = declaration.split('x').map(value => parseInt(value, 10));
            const current = native.foundation;
            return { name, declaration, legacy, current,
                legacyValid: legacy.length === 2 && legacy.every(value => Number.isFinite(value) && value > 0),
                currentValid: Number.isFinite(current.width) && Number.isFinite(current.height)
                    && current.width > 0 && current.height > 0 };
        });
        maps.push({ mapId: row.mapId, theater: row.theater, sourceSha256, buildings });
    }
}
const legacyAffected = maps.filter(row => row.buildings.some((building: any) => !building.legacyValid));
const currentAffected = maps.filter(row => row.buildings.some((building: any) => !building.currentValid));
const result = { status: currentAffected.length ? 'FAIL_NONFINITE_NATIVE_FOUNDATION' : 'PASS_ALL_SELECTABLE_NATIVE_FOUNDATIONS',
    mapCount: maps.length, buildingIdentityCount: maps.reduce((sum, row) => sum+row.buildings.length, 0),
    legacyAffected, currentAffected, maps };
fs.writeFileSync(output, JSON.stringify(result, null, 2)+'\n', { flag: 'wx' });
console.log(JSON.stringify({ status: result.status, mapCount: result.mapCount,
    legacyAffected: legacyAffected.map(row => row.mapId), currentAffected: currentAffected.length }));
if (currentAffected.length) throw Error(result.status);
