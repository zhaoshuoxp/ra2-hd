import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { retailTree, resolveMember } from '../../src/offline/retail';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { readCampaignCatalog } from '../../src/data/campaign/CampaignCatalog';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { campaignCapabilities } from '../../src/game/campaign/CampaignRuntime';
import { IniFile } from '../../src/data/IniFile';
import { campaignMediaReferences } from '../../src/data/campaign/CampaignMedia';

const root = path.resolve(import.meta.dir, '../..');
const output = path.resolve(process.argv[2] ?? path.join(root, '../project-history/ra2-campaign-completion-20261026'));
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const top = new Map<string, Uint8Array>(), archives: any[] = [];
const receipts = await Promise.all(['core', 'campaign'].map(async name =>
    JSON.parse(await readFile(path.join(root, `.local/ra2-${name}-manifest.json`), 'utf8'))));
for (const name of ['language.mix', 'ra2.mix', 'multi.mix', 'maps01.mix', 'maps02.mix']) {
    const bytes = await readFile(path.join(root, '.local/assets/ra2', name));
    const expected = receipts.flatMap(receipt => receipt.files).find(entry => entry.virtualName === name);
    if (!expected || expected.bytes !== bytes.length || expected.sha256 !== hash(bytes)) throw new Error(`Unverified imported archive: ${name}`);
    top.set(name, bytes); archives.push({ name, bytes: bytes.length, sha256: hash(bytes) });
}
const tree = retailTree(top), catalog = readCampaignCatalog('ra2', resolveMember(tree, 'mapsel.ini').file.readAsString());
const art = new IniFile(resolveMember(tree, 'art.ini').file.readAsString());
const rows: any[] = [];
for (const entry of catalog) {
    const source = resolveMember(tree, entry.filename), bytes = source.file.getBytes();
    const definition = new CampaignDefinition('ra2', entry.filename, source.file.readAsString());
    const instructions = [
        ...[...definition.triggers.values()].flatMap(trigger => [
            ...trigger.events.map(instruction => ({ kind: 'event', ...instruction })),
            ...trigger.actions.map(instruction => ({ kind: 'action', ...instruction })),
        ]),
        ...[...definition.scripts.values()].flatMap(script => script.instructions.map(instruction => ({ kind: 'script', ...instruction }))),
    ];
    const diagnostics = campaignPreflight(definition, campaignCapabilities);
    const capabilities = [...new Set(instructions.map(line => `${line.kind}:${line.opcode}`))].map(key => ({ key,
        references: instructions.filter(line => `${line.kind}:${line.opcode}` === key) }));
    const basic = definition.ini.getSection('Basic')!, media = campaignMediaReferences(definition, art);
    const placements = Object.fromEntries(['Structures', 'Units', 'Infantry', 'Aircraft', 'Terrain'].map(section => [section,
        [...(definition.ini.getSection(section)?.entries.values() ?? [])].map(String)]));
    rows.push({ ...entry, source: { archive: source.source, bytes: bytes.length, sha256: hash(bytes) },
        theater: definition.ini.getSection('Map')?.getString('Theater'), player: basic.getString('Player'),
        basic: Object.fromEntries(basic.entries), houses: [...definition.houses.values()],
        counts: { triggers: definition.triggers.size, scripts: definition.scripts.size, teams: definition.teams.size,
            taskForces: definition.taskForces.size, aiTriggers: definition.aiTriggers.size },
        diagnostics, distinctReasons: [...new Set(diagnostics.map(issue => issue.reason))], capabilities, media, placements,
        taskForceTypes: [...new Set([...definition.taskForces.values()].flatMap(force => force.units.map(unit => unit.type)))].sort(),
        sections: Object.fromEntries([...definition.ini.sections.values()].filter(section => !['IsoMapPack5', 'OverlayPack', 'OverlayDataPack',
            'PreviewPack'].includes(section.name)).map(section => [section.name, Object.fromEntries(section.entries)])) });
}
const reasons = [...new Set(rows.flatMap(row => row.distinctReasons))].map(reason => ({ reason,
    missions: rows.filter(row => row.distinctReasons.includes(reason)).map(row => row.filename),
    references: rows.flatMap(row => row.diagnostics.filter(issue => issue.reason === reason).map(issue => ({ mission: row.filename, ...issue }))) }));
await mkdir(output, { recursive: true });
const filename = process.argv[3] ?? 'original-campaign-inventory.json';
if (path.basename(filename) !== filename) throw new Error('Inventory filename must be a basename');
await writeFile(path.join(output, filename), JSON.stringify({
    qualification: 'Hash-verified original archive inventory and lossless capability diagnostics; no playable availability or gameplay acceptance',
    archives, catalog, rows, reasons,
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ missions: rows.map(row => ({ filename: row.filename, theater: row.theater, ...row.counts,
    diagnosticReferences: row.diagnostics.length, distinctReasons: row.distinctReasons.length, media: row.media.length })),
    distinctCapabilities: reasons.map(reason => [reason.reason, reason.missions.length]) }, null, 2));
