import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { Palette } from '../../src/data/Palette';
import { ShpFile } from '../../src/data/ShpFile';
import { retailMember, sha256 } from '../test-support/resources';

const [inventoryFile, output, ...missions] = process.argv.slice(2);
assert(inventoryFile && output && missions.length);
const inventory = JSON.parse(fs.readFileSync(inventoryFile, 'utf8'));
const records = missions.map(mission => {
    const row = inventory.rows.find(row => row.mission === mission); assert(row, mission);
    const image = retailMember('ra2', row.source.member, row.source.sha256);
    const palette = retailMember('ra2', row.source.palette, row.source.paletteSha256);
    const colors = new Palette(palette.file), shp = new ShpFile(image.file), frame = shp.getImage(0);
    const file = path.resolve(path.dirname(inventoryFile), row.full), bytes = fs.readFileSync(file);
    const png = PNG.sync.read(bytes); assert.deepEqual([png.width, png.height], [shp.width, shp.height]);
    let checked = 0;
    for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
        const color = colors.getColor(frame.imageData[y * frame.width + x]);
        const offset = ((y + frame.y) * png.width + x + frame.x) * 4;
        assert.equal(png.data[offset], color.r); assert.equal(png.data[offset + 1], color.g);
        assert.equal(png.data[offset + 2], color.b); assert.equal(png.data[offset + 3], 255); checked++;
    }
    assert.equal(checked, 416000);
    return { mission, source: row.source, original: file, originalPngSha256: sha256(bytes), checkedPixels: checked,
        status: 'PASS_ALL_ARCHIVED_SOURCE_RGB_PIXELS' };
});
fs.writeFileSync(output, JSON.stringify({ schema: 'original-loading-pixel-verification-v1', records,
    scope: 'Unmodified archive source/palette identity and all original RGB pixels only; no HD or visual acceptance.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ missions: records.length, pixels: records.reduce((sum, row) => sum + row.checkedPixels, 0) }));
