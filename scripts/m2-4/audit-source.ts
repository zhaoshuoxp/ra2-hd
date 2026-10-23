// Audit imported bytes without changing maps, archives, or accepted resources.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { MapFile } from '../../src/data/MapFile';
import { IniFile } from '../../src/data/IniFile';
import { TileSets } from '../../src/game/theater/TileSets';
import { TmpFile } from '../../src/data/TmpFile';

const [inventoryPath, output] = process.argv.slice(2);
if (!inventoryPath || !output) throw Error('Usage: audit-source.ts <inventory.json> <new-output-directory>');
mkdirSync(output, { recursive: false });
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const inventoryBytes = readFileSync(inventoryPath);
const inventory = JSON.parse(inventoryBytes.toString());
const names = ['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'];
const top = new Map(names.map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const maps: any[] = [], placeholders: any[] = [];
for (const edition of ['ra2', 'yr'] as const) {
    const tree = editionRetailTree(top, edition);
    const shortMembers = edition === 'yr' ? [['mslop13.des', 'desertmd.ini', '.des'],
        ['mslpx13.ubn', 'urbannmd.ini', '.ubn']] : [];
    for (const [name, iniName, extension] of shortMembers) {
        const resolved = resolveMember(tree, name), bytes = resolved.file.getBytes();
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const header = Array.from({ length: Math.min(5, bytes.length / 4) }, (_, i) => view.getInt32(i * 4, true));
        const sets = new TileSets(new IniFile(resolveMember(tree, iniName).file));
        sets.loadTileData({ get(member: string) {
            try { return new TmpFile(resolveMember(tree, member).file); }
            catch { return undefined; }
        } }, extension);
        const tileNumbers = Array.from({ length: sets.readMaxTileNum() }, (_, i) => i)
            .filter(i => sets.getTile(i)?.owner.fileName.toLowerCase() === name.slice(0, -6)
                && sets.getTile(i)?.index === 12);
        let decoder;
        try { const file = new TmpFile(resolved.file); decoder = { status: 'PASS', images: file.images.length }; }
        catch (error) { decoder = { status: 'FAIL', error: String(error) }; }
        placeholders.push({ edition, member: name, archive: resolved.source, bytes: bytes.length,
            sha256: sha(bytes), hex: Buffer.from(bytes).toString('hex'), header, tileNumbers, decoder });
    }
    for (const row of inventory.maps.filter((row: any) => row.edition === edition && row.classification === 'OFFICIAL_SKIRMISH')) {
        const source = row.source;
        const owner = tree.find(container => container.path === source.archive)!;
        let file: VirtualFile;
        if (source.memberId !== undefined) {
            const entry = owner.mix.getEntries().find(entry => entry.hash === source.memberId)!;
            const mix = owner.mix as any;
            file = VirtualFile.factory(mix.stream, source.member, mix.dataStart + entry.offset, entry.length);
        } else file = owner.mix.openFile(source.member);
        if (sha(file.getBytes()) !== source.sha256) throw Error(`Map source drift: ${row.mapId}`);
        const map = new MapFile(file), basic = map.getSection('Basic');
        const ruleOverrides = Object.fromEntries([...map.sections].filter(([name]) =>
            ['General', 'MultiplayerDialogSettings', 'SpecialFlags', 'CAOILD', 'E1', 'E2', 'HTNK', 'MTNK', 'SHK',
                'HOWI', 'LTNK'].includes(name)).map(([name, section]) => [name, Object.fromEntries(section.entries)]));
        maps.push({ mapId: row.mapId, edition, source, catalogVisibility: row.catalogVisibility,
            metadata: row.declaration.metadata,
            originalModes: row.declaration.metadata.GameMode ? String(row.declaration.metadata.GameMode).split(/,\s*/) : [],
            modeProvenance: row.declaration.metadata.GameMode ? 'CATALOG_DECLARATION' : 'NO_CATALOG_MODE_DECLARATION',
            basicModes: basic?.getArray('GameMode'), basic: Object.fromEntries(basic?.entries ?? []),
            starts: map.startingLocations.length, originalName: basic?.getString('Name'),
            theater: row.theater, tileUsage: [...new Set(map.tiles.map(tile => tile.tileNum))],
            ruleOverrides, specialFlags: map.specialFlags, triggers: map.triggers,
            unknownActions: map.unknownActionTypes, unknownEvents: map.unknownEventTypes,
            geometryHash: row.geometryHash, placementHash: row.placementHash });
    }
}
for (const row of placeholders) row.referencedBy = maps.filter(map => map.edition === row.edition
    && row.tileNumbers.some((tile: number) => map.tileUsage.includes(tile))).map(map => map.mapId);
const count = (key: string) => Object.fromEntries([...new Set(maps.map(map => map[key]))]
    .map(value => [value, maps.filter(map => map[key] === value).length]));
const report = { schema: 'm2-4-source-audit-v1', inventoryPath, inventorySha256: sha(inventoryBytes),
    archivePins: [...top].map(([name, bytes]) => ({ name, bytes: bytes.length, sha256: sha(bytes) })),
    counts: { officialEntries: maps.length, selectedEntries: maps.filter(map => map.catalogVisibility === 'SELECTED_NATIVE_CATALOG').length,
        uniqueEditionFiles: new Set(maps.map(map => `${map.edition}:${map.source.sha256}`)).size,
        uniqueFiles: new Set(maps.map(map => map.source.sha256)).size, theaters: count('theater') }, maps, placeholders };
writeFileSync(`${output}/audit.json`, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ counts: report.counts, placeholders }));
