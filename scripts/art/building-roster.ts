// Account for every retail BuildingTypes entry, including non-production scenery.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { IniFile } from '../../src/data/IniFile';
import { resolveMember } from '../../src/offline/retail';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { GAME_EDITIONS, type GameEdition } from '../../src/editions/GameEdition';

const output = process.argv[2];
if (!output) throw Error('Provide a new output filename');
const top = new Map(GAME_EDITIONS.yr.archives.map(name => [name,
    readFileSync(`.local/assets/${GAME_EDITIONS.ra2.archives.includes(name as any) ? 'ra2' : 'yr'}/${name}`)]));
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const editions: Record<string, unknown> = {};
for (const edition of ['ra2', 'yr'] as GameEdition[]) {
    const tree = editionRetailTree(top, edition);
    const rulesFile = resolveMember(tree, GAME_EDITIONS[edition].rules).file;
    const artFile = resolveMember(tree, GAME_EDITIONS[edition].art).file;
    const rules = new IniFile(rulesFile.readAsString()), art = new IniFile(artFile.readAsString());
    const ids = [...new Set([...rules.getSection('BuildingTypes')!.entries.values()]
        .flatMap(value => Array.isArray(value) ? value : [value]).map(String))];
    const rows = ids.map(id => {
        const rule = rules.getSection(id);
        if (!rule) return { id, status: 'LISTED_WITHOUT_NATIVE_RULE_SECTION' };
        const image = rule.getString('Image') || id, config = art.getSection(image);
        const buildup = config?.getString('Buildup') || null;
        return { id, image, buildup, name: rule.getString('Name'), techLevel: rule.getNumber('TechLevel', -1),
            owners: rule.getString('Owner'), constructionYard: rule.getBool('ConstructionYard'),
            status: buildup ? 'NATIVE_BUILDUP_DECLARED' : 'NO_NATIVE_BUILDUP_DECLARED' };
    });
    editions[edition] = { rulesSha256: hash(rulesFile.getBytes()), artSha256: hash(artFile.getBytes()), rows };
}
writeFileSync(output, JSON.stringify({ schema: 'complete-retail-building-roster-v1', editions }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(Object.fromEntries(Object.entries(editions).map(([edition, value]: any) =>
    [edition, { entries: value.rows.length, withBuildup: value.rows.filter((row: any) => row.buildup).length }]))));
