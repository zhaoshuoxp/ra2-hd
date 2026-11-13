import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseMix } from '../../src/offline/retail';
import { IniFile } from '../../src/data/IniFile';
import { requiredBytes, retailMember, sha256 } from '../test-support/resources';

// Preserve the original capture; enrich a sibling metadata file from the
// imported retail registries rather than inferring a class from its picture.
const [input, output] = process.argv.slice(2);
assert(input && output && path.dirname(path.resolve(input)) === path.dirname(path.resolve(output)));
assert(!fs.existsSync(output));
const original = JSON.parse(fs.readFileSync(input, 'utf8'));
const archive = original.mission.startsWith('sov') ? 'maps02.mix' : 'maps01.mix';
const member = parseMix(requiredBytes('assets/ra2/' + archive)).openFile(original.mission);
assert.equal(sha256(member.getBytes()), original.missionSha256);
const map = new IniFile(member.readAsString()), baseMember = retailMember('ra2', 'rules.ini');
const rules = new IniFile(baseMember.file.readAsString());
const registries = [['BuildingTypes', 2, 'building'], ['OverlayTypes', 4, 'overlay'], ['TerrainTypes', 6, 'terrain']] as const;
const sources = original.sources.map((source: any) => {
    assert.equal(source.format, 'shp');
    const matches = registries.filter(([registry]) => [...new Set([
        ...(rules.getSection(registry)?.entries.values() ?? []), ...(map.getSection(registry)?.entries.values() ?? []),
    ])].includes(source.identity));
    assert.equal(matches.length, 1, 'Original SHP identity must have one supported object registry: ' + source.identity);
    const [registry, objectType, kind] = matches[0];
    const merged = Object.fromEntries([...(rules.getSection(source.identity)?.entries ?? []),
        ...(map.getSection(source.identity)?.entries ?? [])]);
    assert.deepEqual(source.nativeRules, merged, 'Captured rules must match the imported original identity');
    return { ...source, remapable: objectType === 2 ? true : source.remapable,
        nativeObjectType: objectType, nativeKind: kind, nativeRegistry: registry };
});
const result = { ...original, sources, nativeRegistryQualification: { schema: 'retail-shp-object-kind-v1',
    inputSha256: sha256(fs.readFileSync(input)), rulesSha256: baseMember.sha256,
    sourceMapSha256: original.missionSha256,
    policy: 'Unique original registry identity; map-local type additions and rules are retained. No image, palette, geometry, shadow or state is changed.' },
    nativeRenderingQualification: { schema: 'native-building-house-palette-v1',
        renderer: 'src/engine/renderable/entity/Building.ts',
        rendererSha256: sha256(fs.readFileSync('src/engine/renderable/entity/Building.ts')),
        policy: 'Building constructs and updates its per-house palette independently of Art.Remapable. Native body indices16-31 remain ownership regions; the separate rubble Iso palette remains unremapped.' } };
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, sources: sources.map((source: any) => ({ identity: source.identity,
    objectType: source.nativeObjectType, kind: source.nativeKind, registry: source.nativeRegistry })) }));
