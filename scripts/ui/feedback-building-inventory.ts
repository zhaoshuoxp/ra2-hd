import fs from 'node:fs';
import path from 'node:path';
import { retailMember, retailIni } from '../test-support/resources';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
const out = path.resolve(process.argv[2]);
fs.mkdirSync(out, { recursive: false });
const catalog = JSON.parse(fs.readFileSync('desktop/allied-building-coverage.json', 'utf8'));
const palette = Palette.fromVirtualFile(retailMember('yr', 'unittem.pal').file);
const art = retailIni('yr', 'art');
const rows: any[] = [];
for (const family of ['GAWEAP', 'GACNST', 'GAREFN']) {
    const record = catalog[family.toLowerCase() + '-temperate'];
    const file = '.local/' + record.familyPath;
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    const members = manifest.members.filter((member: any) => !member.member.includes('mk.'));
    const row: any = { family, art: Object.fromEntries(art.getSection(family)!.entries), members: [] };
    for (const member of members) {
        const shp = new ShpFile(retailMember('yr', member.member).file);
        const root = `.local/hd-packs/${member.packId}/${member.revision}`;
        const hd = JSON.parse(fs.readFileSync(root + '/manifest.json', 'utf8'));
        row.members.push({ ...member, root, hd, canvas: [shp.width, shp.height], native: [0, 1].filter(i => i < shp.numImages).map(index => {
            const frame = shp.getImage(index);
            return { index, x: frame.x, y: frame.y, width: frame.width, height: frame.height, pixels: [...frame.imageData] };
        }), art: Object.fromEntries(art.getSection(record.members.find((m: any) => m.member === member.member)?.artName ?? family)?.entries ?? []) });
    }
    rows.push(row);
}
fs.writeFileSync(path.join(out, 'inventory.json'), JSON.stringify({ palette: palette.colors.map(c => [c.r, c.g, c.b]), rows }));
console.log(rows.map(row => ({ family: row.family, art: row.art, members: row.members.map((m: any) => ({ name: m.member, art: m.art })) })));
