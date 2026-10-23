import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { IniFile } from '../../src/data/IniFile';
import { CsfFile } from '../../src/data/CsfFile';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import catalog from '../../src/offline/officialSkirmishCatalog.json';

const output = process.argv[2] ?? '.artifacts/m2-4/retail-presentation-v1';
mkdirSync(output, { recursive: true });
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const names = ['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'];
const top = new Map(names.map(name => [name,
    readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const records = [];
for (const edition of ['ra2', 'yr'] as const) {
    const tree = editionRetailTree(top, edition);
    const pktName = edition === 'yr' ? 'missionsmd.pkt' : 'missions.pkt';
    const resolved = resolveMember(tree, pktName), bytes = resolved.file.getBytes();
    const pkt = new IniFile(VirtualFile.fromBytes(bytes, pktName));
    const rows = [...pkt.getSection('MultiMaps')!.entries.values()].map((raw, index) => {
        const sectionName = String(Array.isArray(raw) ? raw[0] : raw);
        const section = pkt.getSection(sectionName)!;
        const filename = section.getString('File') || `${sectionName}.map`;
        const modes = section.getArray('GameMode');
        const excluded = modes.some(mode => /cooperative|campaign/i.test(mode));
        const pinned = catalog.maps.find(entry => entry.edition === edition && entry.selected
            && entry.source.member.toLowerCase() === filename.toLowerCase());
        if (!excluded && !pinned) throw Error(`Catalog map is not pinned: ${edition}/${filename}`);
        return { order: index, filename, uiName: section.getString('Description'), originalModes: modes,
            status: excluded ? 'EXCLUDED_COOPERATIVE_OR_CAMPAIGN' : 'VISIBLE_ORIGINAL_CATALOG',
            mapId: pinned?.mapId, source: pinned?.source };
    });
    const extra = catalog.maps.filter(entry => entry.edition === edition && !rows.some(row => row.mapId === entry.mapId));
    const csfs = [];
    for (const owner of tree) for (const name of ['ra2.csf', 'ra2md.csf', 'general.csf']) {
        if (!owner.mix.containsFile(name)) continue;
        const file = owner.mix.openFile(name), data = file.getBytes();
        const csf = new CsfFile(VirtualFile.fromBytes(data, name));
        const saved = `${edition}-${csfs.length}.json`;
        writeFileSync(`${output}/${saved}`, JSON.stringify(csf.data, null, 2) + '\n');
        csfs.push({ name, archive: owner.path, sha256: hash(data), bytes: data.length,
            locale: csf.getIsoLocale(), keys: Object.keys(csf.data).length, saved });
    }
    const rules = new IniFile(resolveMember(tree, edition === 'yr' ? 'rulesmd.ini' : 'rules.ini').file);
    const installedName = edition === 'yr' ? 'ra2md.csf' : 'ra2.csf';
    const installed = new CsfFile(VirtualFile.fromBytes(readFileSync(
        `/Users/Aone/RA2remaster/Resource/Command and Conquer Red Alert II/Resources/Translations/zh-Hans/${installedName}`), installedName));
    writeFileSync(`${output}/install-${edition}-zh-CN.json`, JSON.stringify(installed.data, null, 2) + '\n');
    writeFileSync(`${output}/${edition}-rules-names.json`, JSON.stringify(Object.fromEntries(
        [...rules.sections.values()].filter(section => section.getString('UIName') && section.getString('Name'))
            .map(section => [section.getString('UIName').toLowerCase(), section.getString('Name')])), null, 2) + '\n');
    records.push({ edition, catalog: { name: pktName, archive: resolved.source, sha256: hash(bytes) },
        rows, hiddenArchiveEntries: extra, csfs });
}
const support = new CsfFile(VirtualFile.fromBytes(readFileSync('.local/upstream-support/general.csf'), 'general.csf'));
writeFileSync(`${output}/support.json`, JSON.stringify(support.data, null, 2) + '\n');
writeFileSync(`${output}/audit.json`, JSON.stringify({ records, support: { locale: support.getIsoLocale(),
    keys: Object.keys(support.data).length }, policy: 'Original edition catalog order; archive extras retained but hidden; no source mutations.' }, null, 2) + '\n');
console.log(JSON.stringify(records.map(record => ({ edition: record.edition,
    visible: record.rows.filter(row => row.status === 'VISIBLE_ORIGINAL_CATALOG').length,
    excluded: record.rows.filter(row => row.status !== 'VISIBLE_ORIGINAL_CATALOG').length,
    hidden: record.hiddenArchiveEntries.length, csfs: record.csfs })), null, 2));
console.log('Support:', support.getIsoLocale(), Object.keys(support.data).length);
