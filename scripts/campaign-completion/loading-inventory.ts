import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { IniFile } from '../../src/data/IniFile';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
import { readCampaignCatalog } from '../../src/data/campaign/CampaignCatalog';
import { retailMember, sha256 } from '../test-support/resources';

const output = path.resolve(process.argv[2] ?? '../project-history/ra2-campaign-completion-20261026/Art/OriginalLoading');
await mkdir(output, { recursive: true });
const catalog = readCampaignCatalog('ra2', retailMember('ra2', 'mapsel.ini').file.readAsString());
const missionIni = new IniFile(retailMember('ra2', 'mission.ini').file.readAsString());
const rects = [[257, 379, 77, 63], [350, 379, 78, 63], [446, 379, 79, 63], [542, 266, 238, 242]];
const rows: any[] = [];
for (const entry of catalog) {
    const image = missionIni.getSection(entry.filename)!.getString('LS800BkgdName').toLowerCase();
    const source = retailMember('ra2', image), paletteSource = retailMember('ra2', entry.faction === 'soviet' ? 'ldscrns.pal' : 'ldscrna.pal');
    const shp = new ShpFile(source.file), palette = new Palette(paletteSource.file), frame = shp.getImage(0);
    if (shp.width !== 800 || shp.height !== 520) throw new Error(`Unexpected original loading plane: ${entry.filename}`);
    const png = new PNG({ width: shp.width, height: shp.height });
    for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
        const color = palette.getColor(frame.imageData[y * frame.width + x]);
        png.data.set([color.r, color.g, color.b, 255], ((y + frame.y) * shp.width + x + frame.x) * 4);
    }
    const mission = entry.filename.slice(0, -4), full = `${mission}-original.png`;
    await writeFile(path.join(output, full), PNG.sync.write(png));
    const photos = [];
    for (const [index, [x, y, width, height]] of rects.entries()) {
        const crop = new PNG({ width, height }); PNG.bitblt(png, crop, x, y, width, height, 0, 0);
        const filename = `${mission}-photo-${index}.png`;
        await writeFile(path.join(output, filename), PNG.sync.write(crop));
        photos.push({ index, rect: [x, y, width, height], filename, rgbaSha256: sha256(crop.data) });
    }
    rows.push({ mission: entry.filename, faction: entry.faction, source: { member: image, sha256: source.sha256,
        archive: source.source, palette: paletteSource.file.filename, paletteSha256: paletteSource.sha256 }, full, photos });
}
const identities = [...new Set(rows.flatMap(row => row.photos.map((photo: any) => photo.rgbaSha256)))].map(hash => ({ rgbaSha256: hash,
    references: rows.flatMap(row => row.photos.filter((photo: any) => photo.rgbaSha256 === hash)
        .map((photo: any) => ({ mission: row.mission, index: photo.index }))) }));
await writeFile(path.join(output, 'inventory.json'), JSON.stringify({ qualification: 'Original archived source crops; exact RGBA identity establishes only a reuse candidate, not HD or visual acceptance',
    rects, rows, identities }, null, 2) + '\n');
console.log(JSON.stringify({ missions: rows.length, uniqueCrops: identities.length, soviet03: rows.find(row => row.mission === 'sov03u.map').photos
    .map((photo: any) => ({ index: photo.index, identical: identities.find(identity => identity.rgbaSha256 === photo.rgbaSha256)!.references })) }));
