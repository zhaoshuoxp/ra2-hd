import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { readCampaignCatalog } from '../../src/data/campaign/CampaignCatalog';
import { campaignMediaReferences } from '../../src/data/campaign/CampaignMedia';
import { campaignCapabilities } from '../../src/game/campaign/CampaignRuntime';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { parseMix } from '../../src/offline/retail';
import { retailIni, retailMember } from '../test-support/resources';

const root = path.resolve(import.meta.dir, '../..');
const output = path.resolve(process.argv[2] ?? path.join(root, '../project-history/yr-campaign-implementation-20261104'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const previous = JSON.parse(await readFile(path.join(root, '../project-history/yr-campaign-planning-20261104/original-inventory.json'), 'utf8'));
const archiveFile = path.resolve(root, previous.archive.file);
if (await realpath(archiveFile) !== archiveFile || !(await stat(archiveFile)).isFile()) throw Error('Unsafe original map archive');
const bytes = await readFile(archiveFile);
if (sha(bytes) !== previous.archive.sha256 || bytes.length !== previous.archive.bytes) throw Error('Original YR map archive changed');
const maps = parseMix(bytes, 'mapsmd03.mix');
const selection = retailMember('yr', 'mapselmd.ini', previous.catalog.sha256);
if (selection.source !== previous.catalog.source) throw Error('Archived YR catalog source changed');
const catalog = readCampaignCatalog('yr', selection.file.readAsString());
if (catalog.length !== 14 || ['soviet', 'allied'].some(faction => catalog.filter(row => row.faction === faction).length !== 7)) {
    throw Error('Expected seven original YR missions per faction');
}
const art = retailIni('yr', 'art'), rules = retailIni('yr');
const rows = catalog.map(entry => {
    const map = maps.openFile(entry.filename), sourceSha256 = sha(map.getBytes());
    const expected = previous.rows.find((row: any) => row.filename === entry.filename);
    if (!expected || sourceSha256 !== expected.sourceSha256) throw Error('Original YR map identity changed: ' + entry.filename);
    const definition = new CampaignDefinition('yr', entry.filename, map.readAsString());
    const diagnostics = campaignPreflight(definition, campaignCapabilities);
    const instructions = [...definition.triggers.values()].flatMap(trigger => [
        ...trigger.events.map(line => ({ kind: 'event', ...line })),
        ...trigger.actions.map(line => ({ kind: 'action', ...line })),
    ]).concat([...definition.scripts.values()].flatMap(script => script.instructions.map(line => ({ kind: 'script', ...line }))));
    const capabilities = [...new Set(instructions.map(line => `${line.kind}:${line.opcode}`))].sort().map(key => ({ key,
        references: instructions.filter(line => `${line.kind}:${line.opcode}` === key) }));
    const placements = Object.fromEntries(['Structures', 'Units', 'Infantry', 'Aircraft', 'Terrain', 'Smudge'].map(section => [section,
        Object.fromEntries(definition.ini.getSection(section)?.entries ?? [])]));
    return { ...entry, source: { archive: archiveFile, archiveSha256: sha(bytes), bytes: map.getSize(), sha256: sourceSha256 },
        theater: definition.ini.getSection('Map')?.getString('Theater'), basic: Object.fromEntries(definition.ini.getSection('Basic')!.entries),
        houses: [...definition.houses.values()], variables: Object.fromEntries(definition.variables),
        counts: { triggers: definition.triggers.size, tags: definition.tags.size, cellTags: definition.cellTags.length,
            teams: definition.teams.size, taskForces: definition.taskForces.size, scripts: definition.scripts.size, aiTriggers: definition.aiTriggers.size },
        diagnostics, capabilities, media: campaignMediaReferences(definition, art), placements,
        taskForceTypes: [...new Set([...definition.taskForces.values()].flatMap(force => force.units.map(unit => unit.type)))].sort(),
        localRuleArtSections: [...definition.ini.sections.values()].filter(section => rules.getSection(section.name) || art.getSection(section.name))
            .map(section => section.name),
        sections: Object.fromEntries([...definition.ini.sections.values()].filter(section => !['IsoMapPack5', 'OverlayPack', 'OverlayDataPack', 'PreviewPack']
            .includes(section.name)).map(section => [section.name, Object.fromEntries(section.entries)])) };
});
const unsupported = [...new Set(rows.flatMap(row => row.diagnostics.map((issue: any) => issue.reason)))].map(reason => ({ reason,
    missions: rows.filter(row => row.diagnostics.some((issue: any) => issue.reason === reason)).map(row => row.filename),
    references: rows.flatMap(row => row.diagnostics.filter((issue: any) => issue.reason === reason).map((issue: any) => ({ mission: row.filename, ...issue }))) }));
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'source-inventory.json'), JSON.stringify({
    status: 'VERIFIED_ORIGINAL_SOURCE_REQUIREMENTS_NOT_PLAYABILITY_ACCEPTANCE', sourceMain: 'e285a7b0',
    archive: { file: archiveFile, bytes: bytes.length, sha256: sha(bytes) },
    catalog: { source: selection.source, sha256: selection.sha256 }, catalogEntries: catalog, rows, unsupported,
    sourcePolicy: 'Verified imported core archives and original mapsmd03.mix only; loose CnCNet rules, patches and extension behaviors excluded.',
}, null, 2) + '\n', { flag: 'wx' });
const ledger = path.join(root, 'docs/yr-campaign-current.json');
let exists = true;
try { await stat(ledger); } catch (error: any) { if (error.code !== 'ENOENT') throw error; exists = false; }
if (!exists) await writeFile(ledger, JSON.stringify({ schema: 'yr-campaign-implementation-v1', date: '2026-11-04',
    status: 'IMPLEMENTATION_IN_PROGRESS', sourceMain: 'e285a7b0', repository: root, branch: 'main',
    sourceInventory: '../project-history/yr-campaign-implementation-20261104/source-inventory.json',
    protectedApp: '/Users/Aone/RA2remaster/RA2-HD-Original-Campaigns-Mac-20261104-v56/Red Alert 2 HD.app',
    windows: 'NOT_RUN_ON_THIS_MAC', userAcceptance: 'PENDING', publication: 'LOCAL_ONLY_NO_PUSH',
    missions: [...rows].sort((a, b) => (a.faction === 'soviet' ? 0 : 1) - (b.faction === 'soviet' ? 0 : 1)
        || a.filename.localeCompare(b.filename)).map(row => ({ edition: row.edition, faction: row.faction, mission: row.filename,
            sourceSha256: row.source.sha256, theater: row.theater, next: row.next, media: row.media,
            status: 'SOURCE_VERIFIED_IMPLEMENTATION_PENDING', playable: false,
            requirements: { ...row.counts, diagnosticReferences: row.diagnostics.length,
                unresolved: [...new Set(row.diagnostics.map((issue: any) => issue.reason))] },
            hd: 'AUDIT_PENDING', difficulty: 'PENDING', objectives: 'PENDING', failure: 'PENDING',
            actualMedia: 'PENDING', saveRestart: 'PENDING', runtime: 'PENDING', visualReview: 'PENDING', userAcceptance: 'PENDING', evidence: [] }))
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: 'VERIFIED_14_ORIGINAL_YR_MAPS_AND_CATALOG', output,
    missions: rows.map(row => ({ mission: row.filename, theater: row.theater, ...row.counts, diagnosticReferences: row.diagnostics.length })),
    unsupported: unsupported.map(item => ({ reason: item.reason, missions: item.missions.length, references: item.references.length })) }, null, 2));
