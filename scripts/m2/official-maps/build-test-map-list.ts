// Reproduce the shipped map titles and retain edition/member/source identity.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CsfFile } from '../../../src/data/CsfFile';
import { VirtualFile } from '../../../src/data/vfs/VirtualFile';
import { Strings } from '../../../src/data/Strings';
import { MapManifest } from '../../../src/engine/MapManifest';
import { editionRetailTree } from '../../../src/offline/editionRetail';
import { resolveMember } from '../../../src/offline/retail';

const [sourceFolder, output] = process.argv.slice(2);
assert(sourceFolder && output, 'Usage: bun build-test-map-list.ts <R5-folder> <new-output>');
const appName = 'Red Alert 2 HD M2.3 Temperate Review R5.app';
const resourceRoot = path.join(sourceFolder, 'RA2-HD-Editions-Resources');
const inventoryFile = '.artifacts/m2-3/inventory-v9/inventory.json';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const inventoryBytes = fs.readFileSync(inventoryFile);
const inventory = JSON.parse(inventoryBytes.toString());
const plan = JSON.parse(fs.readFileSync('.artifacts/m2-3/feedback-r5-v1/native-plan-v1.json', 'utf8'));
const nativeCases = new Set(plan.cases.map((row: any) => `${row.edition}:${row.map}`));
const names = ['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'];
const top = new Map(names.map(name => [name, fs.readFileSync(path.join(resourceRoot, 'assets',
    name.includes('md') ? 'yr' : 'ra2', name))]));
const generalBytes = fs.readFileSync(path.join(resourceRoot, 'upstream-support/general.csf'));
const general = new CsfFile(VirtualFile.fromBytes(generalBytes, 'general.csf'));
const localeBytes = fs.readFileSync(path.join(sourceFolder, appName, 'Contents/Resources/app/dist/res/locale',
    `${general.getIsoLocale()}.json`));
const locale = JSON.parse(localeBytes.toString());
const maps: any[] = [];
for (const edition of ['ra2', 'yr'] as const) {
    const tree = editionRetailTree(top, edition);
    const retail = new CsfFile(resolveMember(tree, edition === 'ra2' ? 'ra2.csf' : 'ra2md.csf').file);
    const strings = new Strings(general);
    strings.fromJson(locale);
    for (const [key, value] of Object.entries(retail.data)) if (!strings.has(key)) strings.fromJson({ [key]: value });
    const selected = inventory.maps.filter((row: any) => row.edition === edition && row.theater === 'TEMPERATE'
        && row.runtimeEligibility === 'ELIGIBLE_FOR_FOCUSED_NATIVE_MATCH');
    for (const row of selected) {
        assert.equal(row.classification, 'OFFICIAL_SKIRMISH');
        assert.equal(row.catalogVisibility, 'SELECTED_NATIVE_CATALOG');
        assert(row.nativeSkirmishMode.availableFilters.includes('standard'));
        const member = resolveMember(tree, row.declaration.member);
        assert.equal(hash(member.file.getBytes()), row.source.sha256, row.mapId);
        const label = row.declaration.metadata.Description;
        assert(strings.has(label), `Missing title: ${row.mapId} / ${label}`);
        const manifest = new MapManifest();
        manifest.uiName = label;
        manifest.maxSlots = Number(row.declaration.metadata.MaxPlayers);
        maps.push({ number: maps.length + 1, mapId: row.mapId, edition, member: row.declaration.member,
            catalogIndex: Number(row.catalogIndex), title: manifest.getFullMapTitle(strings),
            maxPlayers: manifest.maxSlots, source: row.source, titleLabel: label,
            previousR5Native2x4x: nativeCases.has(row.mapId),
            user2x: '', user4x: '', notes: '', fullMatchAcceptance: 'NOT_RECORDED' });
    }
}
assert.equal(maps.filter(row => row.edition === 'ra2').length, 17);
assert.equal(maps.filter(row => row.edition === 'yr').length, 44);
assert.equal(new Set(maps.map(row => row.mapId)).size, 61);
assert.equal(maps.filter(row => row.previousR5Native2x4x).length, 12);
fs.mkdirSync(output, { recursive: false });
const data = { schemaVersion: 1, status: 'COMPLETE_SELECTABLE_TEMPERATE_TEST_LIST',
    titlePolicy: 'Shipped general.csf, its shipped locale JSON, missing retail labels, and native MapManifest title suffix.',
    locale: general.getIsoLocale(), inventorySha256: hash(inventoryBytes), generalCsfSha256: hash(generalBytes),
    localeJsonSha256: hash(localeBytes), counts: { ra2: 17, yr: 44, total: 61, previousR5NativeCases: 12 },
    boundary: 'Complete declared reusable TEMPERATE artwork. Entries are selectable in Standard mode. This is not a full-match playthrough receipt. Other theaters remain outside M2.3.',
    maps };
fs.writeFileSync(path.join(output, 'M2.3-R5-Temperate-Map-Test-List.json'), JSON.stringify(data, null, 2) + '\n');
const prose = ['M2.3 R5 - Complete Selectable TEMPERATE Map Test List', '',
    '61 edition/map entries: RA2 17; Yuri\'s Revenge 44. Select Standard skirmish mode.',
    'Titles below reproduce the shipped game UI, including existing localized strings.',
    'The declared reusable TEMPERATE artwork is complete; full-match user acceptance is pending.',
    'Same-name maps in different editions remain separate tests. Other theaters are outside M2.3.',
    'Use [ ] 2X / [ ] 4X to record your tests. * = prior focused R5 native checks at both densities.', ''];
for (const edition of ['ra2', 'yr']) {
    prose.push(edition === 'ra2' ? 'RED ALERT 2 (17)' : "YURI'S REVENGE (44)", '');
    for (const row of maps.filter(row => row.edition === edition)) {
        prose.push(`${String(row.number).padStart(2, '0')}. [ ] 2X  [ ] 4X  ${row.title} | ${row.member}${row.previousR5Native2x4x ? ' | *' : ''}`);
    }
    prose.push('');
}
fs.writeFileSync(path.join(output, 'M2.3-R5-Temperate-Map-Test-List.txt'), prose.join('\n') + '\n');
const quote = (value: unknown) => '"' + String(value).replaceAll('"', '""') + '"';
const csv = [['Number', 'Edition', 'Game UI title', 'Map member', 'Players', 'Previous focused R5 2X/4X',
    'Your 2X result', 'Your 4X result', 'Notes'], ...maps.map(row => [row.number, row.edition, row.title,
    row.member, row.maxPlayers, row.previousR5Native2x4x ? 'PASS_FOCUSED_NATIVE_CASE' : 'SHARED_RESOURCE_COVERAGE', '', '', ''])];
fs.writeFileSync(path.join(output, 'M2.3-R5-Temperate-Map-Test-List.csv'), '\uFEFF' + csv.map(row => row.map(quote).join(',')).join('\r\n') + '\r\n');
console.log(JSON.stringify({ output, ...data.counts, titles: maps.map(row => [row.edition, row.title, row.member]) }));
