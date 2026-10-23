import fs from 'node:fs';
import path from 'node:path';
import { retailMember } from '../test-support/resources';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
const targets = new Set(['ggweap_b.shp', 'ggcnst_a.shp', 'ggrefnl1.shp', 'ggrefnl2.shp', 'ggrefnl3.shp',
    'gaweap_b.shp', 'gacnst_a.shp', 'garefnl1.shp', 'garefnl2.shp', 'garefnl3.shp']);
const catalog = JSON.parse(fs.readFileSync('desktop/allied-building-coverage.json', 'utf8'));
const records = [];
for (const [key, family] of Object.entries(catalog) as [string, any][]) {
    if (!['GAWEAP', 'GACNST', 'GAREFN'].includes(family.family)) continue;
    const manifest = JSON.parse(fs.readFileSync('.local/' + family.familyPath, 'utf8'));
    const palette = Palette.fromVirtualFile(retailMember('yr', family.theater === 'SNOW' ? 'unitsno.pal' : 'unittem.pal').file);
    for (const member of manifest.members) {
        if (!targets.has(member.member)) continue;
        const root = `.local/hd-packs/${member.packId}/${member.revision}`;
        const hd = JSON.parse(fs.readFileSync(root + '/manifest.json', 'utf8'));
        const shp = new ShpFile(retailMember('yr', member.member).file);
        const frames = hd.logical.frames.map((meta: any) => {
            const frame = shp.getImage(meta.nativeFrame);
            return { x: frame.x, y: frame.y, width: frame.width, height: frame.height, pixels: [...frame.imageData] };
        });
        records.push({ key, family: family.family, member, root, hd, frames, palette: palette.colors.map(c => [c.r, c.g, c.b]) });
    }
}
fs.writeFileSync(path.resolve(process.argv[2]), JSON.stringify(records));
console.log(records.map(record => record.key + '/' + record.member.member));
