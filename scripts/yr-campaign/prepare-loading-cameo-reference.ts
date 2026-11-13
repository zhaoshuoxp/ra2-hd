import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
import { retailMember, sha256 } from '../test-support/resources';

const output = path.resolve(process.argv[2]);
fs.mkdirSync(output, { recursive: false });
const selection = JSON.parse(fs.readFileSync('.local/ui-selection.json', 'utf8'));
const manifestFile = `.local/ui-packs/${selection.revision}/manifest.json`;
const manifestBytes = fs.readFileSync(manifestFile);
assert.equal(sha256(manifestBytes), selection.sha256);
const manifest = JSON.parse(manifestBytes.toString());
const paletteSource = retailMember('yr', 'cameo.pal'), palette = new Palette(paletteSource.file);
const rows = [];
for (const asset of manifest.assets) {
    if (asset.logicalWidth !== 60 || asset.logicalHeight !== 48 || !asset.id.endsWith('.shp') || asset.overlay) continue;
    const source = retailMember('yr', asset.id), shp = new ShpFile(source.file), frame = shp.getImage(0);
    assert.deepEqual([shp.width, shp.height], [60, 48]);
    const png = new PNG({ width: 60, height: 48 });
    for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
        const color = palette.getColor(frame.imageData[y * frame.width + x]);
        png.data.set([color.r, color.g, color.b, 255], ((y + frame.y) * 60 + x + frame.x) * 4);
    }
    const original = asset.id.slice(0, -4) + '-original.png', bytes = PNG.sync.write(png);
    fs.writeFileSync(path.join(output, original), bytes, { flag: 'wx' });
    rows.push({ id: asset.id, original, originalPngSha256: sha256(bytes),
        source: { sha256: source.sha256, archive: source.source }, accepted: asset });
}
fs.writeFileSync(path.join(output, 'source.json'), JSON.stringify({
    schema: 'yr-loading-accepted-cameo-reference-v1', selection,
    palette: { member: 'cameo.pal', sha256: paletteSource.sha256, archive: paletteSource.source }, rows,
    scope: 'Original reference comparison only. Accepted cameo artwork and all unit resources are unchanged.',
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ originalCameos: rows.length, changedResources: 0 }));
