import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolveMember } from '../../../src/offline/retail';
import { IniFile } from '../../../src/data/IniFile';
import { ShpFile } from '../../../src/data/ShpFile';
import { Palette } from '../../../src/data/Palette';
import { editionRetailTree } from '../../../src/offline/editionRetail';
import { GAME_EDITIONS } from '../../../src/editions/GameEdition';

const out = process.argv[2] ?? '.artifacts/lunar-infantry/source-v1';
if (existsSync(out)) throw Error('Use a fresh output directory');
mkdirSync(out, { recursive: true });
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const top = new Map(GAME_EDITIONS.yr.archives.map(n => [n,
    readFileSync(`.local/assets/${GAME_EDITIONS.ra2.archives.includes(n as any) ? 'ra2' : 'yr'}/${n}`)]));
const tree = editionRetailTree(top, 'yr');
const get = (n: string) => resolveMember(tree, n);
const rules = new IniFile(get('rulesmd.ini').file.readAsString());
const art = new IniFile(get('artmd.ini').file.readAsString());
const plain = (s: any) => s ? Object.fromEntries(s.entries) : null;
const r = rules.getSection('LUNR')!;
const a = art.getSection(r.getString('Image') || 'LUNR')!;
const names = [(r.getString('Image') || 'LUNR').toLowerCase() + '.shp',
    a.getString('Cameo').toLowerCase() + '.shp', a.getString('AltCameo').toLowerCase() + '.shp'];
const members = names.map(member => {
    const file = get(member), shp = new ShpFile(file.file);
    const palette = new Palette(get(member.includes('ico') || member.includes('uico') ? 'cameo.pal' : 'unittem.pal').file)
        .colors.map(c => [c.r, c.g, c.b]);
    const meta = { member, archive: file.source, sha256: hash(file.file.getBytes()),
        canvas: [shp.width, shp.height], totalFrames: shp.numImages };
    const frames = shp.images.map((f, frame) => ({ frame, x: f.x, y: f.y,
        width: f.width, height: f.height, empty: !f.imageData.some(Boolean),
        sha256: hash(f.imageData), pixels: Array.from(f.imageData) }));
    writeFileSync(`${out}/${member}.json`, JSON.stringify({ ...meta, palette, frames }));
    return meta;
});
const inventory = { identity: 'LUNR', edition: 'yr', rules: plain(r), art: plain(a),
    sequences: plain(art.getSection(a.getString('Sequence'))), members,
    weapons: ['Primary', 'Secondary', 'ElitePrimary', 'EliteSecondary'].flatMap(slot =>
        r.getString(slot) ? [{ slot, name: r.getString(slot), rules: plain(rules.getSection(r.getString(slot))) }] : []),
    sourceAuthenticity: 'LOCAL_RETAIL_ARCHIVES', eligibilityUnchanged: true };
writeFileSync(`${out}/inventory.json`, JSON.stringify(inventory, null, 2) + '\n');
console.log(JSON.stringify(inventory, null, 2));
