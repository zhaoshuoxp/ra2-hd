import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
import { retailMember, sha256 } from '../test-support/resources';

const output = path.resolve(process.argv[2]);
fs.mkdirSync(output, { recursive: false });
const current = JSON.parse(fs.readFileSync('docs/yr-campaign-current.json', 'utf8'));
const rows = [];
for (const row of current.missions) {
    const stem = row.mission.slice(0, -4), directory = `.local/campaign/yr/${stem}`;
    const presentationFile = path.join(directory, 'presentation.json');
    const bytes = fs.readFileSync(presentationFile), presentation = JSON.parse(bytes.toString());
    const spec = presentation.sprites.mission;
    const source = retailMember('yr', spec.image), paletteSource = retailMember('yr', spec.palette);
    assert(presentation.sources.some((item: any) => item.name === spec.image && item.sha256 === source.sha256));
    assert(presentation.sources.some((item: any) => item.name === spec.palette && item.sha256 === paletteSource.sha256));
    const shp = new ShpFile(source.file), palette = new Palette(paletteSource.file), frame = shp.getImage(0);
    assert.deepEqual([shp.width, shp.height, shp.numImages], [800, 520, 1]);
    const png = new PNG({ width: shp.width, height: shp.height });
    for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
        const color = palette.getColor(frame.imageData[y * frame.width + x]);
        png.data.set([color.r, color.g, color.b, 255], ((y + frame.y) * shp.width + x + frame.x) * 4);
    }
    const file = stem + '-original.png', encoded = PNG.sync.write(png);
    fs.writeFileSync(path.join(output, file), encoded, { flag: 'wx' });
    rows.push({ mission: row.mission, faction: row.faction, sourceMapSha256: row.sourceSha256,
        presentationSha256: sha256(bytes), original: file, originalPngSha256: sha256(encoded),
        source: { member: spec.image, sha256: source.sha256, archive: source.source,
            palette: spec.palette, paletteSha256: paletteSource.sha256, paletteArchive: paletteSource.source },
        existingHdInterface: fs.existsSync(path.join(directory, 'interface-hd.json')) });
}
assert.equal(rows.length, 14);
fs.writeFileSync(path.join(output, 'source.json'), JSON.stringify({
    schema: 'yr-original-campaign-loading-source-v1', rows,
    scope: 'Exact original loading planes for source layout and accepted-art reuse auditing. No art is selected or changed.',
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ missions: rows.length, missingHdInterfaces: rows.filter(row => !row.existingHdInterface).length }));
