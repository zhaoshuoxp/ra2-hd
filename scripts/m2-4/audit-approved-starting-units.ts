// Audit only the two source-pinned entries affected by the approved rule classification.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { adaptRetailRules } from '../../src/offline/retailCompatibility';
import { applyOfficialStartingUnitRules } from '../../src/offline/officialSkirmish';
import { IniFile } from '../../src/data/IniFile';
import catalog from '../../src/offline/officialSkirmishCatalog.json';

const output = process.argv[2];
assert(output, 'A new audit output file is required');
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const names = ['HTNK', 'E2', 'SHK', 'LTNK', 'MTNK', 'HOWI', 'E1'];
const archives = ['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'];
const top = new Map(archives.map(name => [name,
    readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const rows = [];
for (const edition of ['ra2', 'yr'] as const) {
    const tree = editionRetailTree(top, edition);
    const entry = catalog.maps.find(entry => entry.mapId === `${edition}:mp13s4mw.map@a4f07f9b9271`)!;
    const source = resolveMember(tree, entry.source.member);
    assert.equal(sha(source.file.getBytes()), entry.source.sha256);
    const native = new IniFile(source.file);
    const base = resolveMember(tree, edition === 'yr' ? 'rulesmd.ini' : 'rules.ini');
    const mode = resolveMember(tree, 'mpbattle.ini');
    const standard = adaptRetailRules(new IniFile(base.file)).rules.mergeWith(new IniFile(mode.file));
    const merged = standard.clone().mergeWith(native);
    const before = merged.clone();
    applyOfficialStartingUnitRules(merged, standard, entry);
    const values = names.map(name => {
        assert.equal(native.getSection(name)?.getBool('AllowedToStartInMultiplayer', true), false);
        const raw = standard.getSection(name)?.get('AllowedToStartInMultiplayer');
        assert.equal(merged.getSection(name)?.get('AllowedToStartInMultiplayer'), raw);
        return { name, original: native.getSection(name)?.get('AllowedToStartInMultiplayer'),
            standardRaw: raw ?? null, standardAllowed: standard.getSection(name)?.getBool('AllowedToStartInMultiplayer', true) ?? true,
            restoredRaw: merged.getSection(name)?.get('AllowedToStartInMultiplayer') ?? null };
    });
    for (const [name, section] of before.sections) {
        const expected = section.clone(), actual = merged.getSection(name)!.clone();
        if (names.includes(name)) {
            expected.entries.delete('AllowedToStartInMultiplayer');
            actual.entries.delete('AllowedToStartInMultiplayer');
        }
        assert.equal(actual.toString(), expected.toString(), `Unrelated map mechanism changed: ${name}`);
    }
    assert.equal(sha(source.file.getBytes()), entry.source.sha256);
    rows.push({ edition, mapId: entry.mapId, runtimeName: entry.runtimeName, source: entry.source,
        standardSources: [{ member: edition === 'yr' ? 'rulesmd.ini' : 'rules.ini', archive: base.source,
            sha256: sha(base.file.getBytes()) },
            { member: 'mpbattle.ini', archive: mode.source, sha256: sha(mode.file.getBytes()) }], values,
        preservedSections: before.sections.size, status: 'PASS_EXACT_STANDARD_VALUES_AND_OTHER_MAP_MECHANISMS' });
}
writeFileSync(output, JSON.stringify({ schema: 'm2-4-approved-starting-unit-source-audit-v1',
    status: 'PASS', policy: 'Only seven approved source-specific keys change at runtime; original bytes remain exact.', rows }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: 'PASS', maps: rows.length, values: rows.map(row => ({ edition: row.edition, values: row.values })) }));
