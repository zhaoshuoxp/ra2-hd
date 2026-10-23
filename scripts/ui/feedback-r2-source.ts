import fs from 'node:fs';
import { retailMember } from '../test-support/resources';
import { ShpFile } from '../../src/data/ShpFile';

const catalog = JSON.parse(fs.readFileSync('desktop/allied-building-coverage.json', 'utf8'));
const records: any[] = [];
for (const [key, selected] of Object.entries(catalog) as [string, any][]) {
    if (!['GAWEAP', 'GAREFN'].includes(selected.family)) continue;
    const family = JSON.parse(fs.readFileSync('.local/' + selected.familyPath, 'utf8'));
    const members = selected.family === 'GAWEAP'
        ? family.members.filter((m: any) => /^(gg|ga)weap(?:_[23])?\.shp$/.test(m.member))
        : family.members.filter((m: any) => /^(gg|ga)refn\.shp$/.test(m.member));
    for (const member of members) {
        const root = `.local/hd-packs/${member.packId}/${member.revision}`;
        const hd = JSON.parse(fs.readFileSync(root + '/manifest.json', 'utf8'));
        const source = new ShpFile(retailMember('yr', member.member).file);
        const frames = [0, 1].map(index => {
            const frame = source.getImage(index);
            return { x: frame.x, y: frame.y, width: frame.width, height: frame.height, pixels: [...frame.imageData] };
        });
        records.push({ key, family: selected.family, member, root, hd, frames });
    }
}
fs.writeFileSync(process.argv[2], JSON.stringify(records));
console.log(JSON.stringify(records.map(row => ({ family: row.key, member: row.member.member }))));
