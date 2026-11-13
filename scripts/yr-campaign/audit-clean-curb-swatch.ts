import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Palette } from '../../src/data/Palette';
import { TmpFile } from '../../src/data/TmpFile';
import { TmpDrawable } from '../../src/engine/gfx/drawable/TmpDrawable';
import { retailMember, sha256 } from '../test-support/resources';

const [regionsFile, auditFile, output] = process.argv.slice(2);
const regions = JSON.parse(fs.readFileSync(regionsFile, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
const material = regions.members['pavefx04.ubn'].sidewalk, donor = material.donor;
assert.equal(donor.member, 'droads40.ubn'); assert.equal(donor.subTile, 1);
const original = new TmpFile(retailMember(donor.edition, donor.member, donor.sourceSha256).file);
const paletteSha256 = '1aa49468a9439a5cff3e5f66fae0678501e9dc3ef7a4d90f23127c38ad6e4676';
const palette = new Palette(retailMember(donor.edition, 'isoubn.pal', paletteSha256).file);
const bitmap = new TmpDrawable().draw(original.images[donor.subTile] as any, original.blockWidth, original.blockHeight);
const target = audit.records.find((row: any) => row.member === 'pavfxb03.ubn' && row.role === 'sidewalk');
const candidates = [[18, 10, 10, 10], [20, 10, 8, 10], [20, 8, 8, 14], [18, 8, 10, 14]].map(rect => {
    const [x, y, width, height] = rect, mean = [0, 0, 0];
    let opaque = 0, sidewalk = 0;
    for (let iy = y; iy < y + height; iy++) for (let ix = x; ix < x + width; ix++) {
        const index = bitmap.data[iy * 60 + ix], color = palette.colors[index];
        if (!index) continue;
        opaque++;
        const rgb = [color.r, color.g, color.b];
        rgb.forEach((value, channel) => mean[channel] += value / (width * height));
        if (rgb.reduce((sum, value) => sum + value, 0) > 420 && Math.max(...rgb) - Math.min(...rgb) < 60) sidewalk++;
    }
    return { rect, mean, opaqueFraction: opaque / (width * height), materialCoverage: sidewalk / (width * height),
        meanColorDifference: mean.reduce((sum, value, channel) => sum + Math.abs(value - target.best[0].targetMean[channel]), 0) / 3 };
});
fs.mkdirSync(output, { recursive: false });
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ schema: 'yr-clean-curb-source-swatch-audit-v1',
    status: 'READ_ONLY_NATIVE_MATERIAL_SWATCH_CONTROLS_HD_DENSITY_VALIDATION_PENDING',
    regionsFile, regionsSha256: sha256(fs.readFileSync(regionsFile)), donor,
    palette: { member: 'isoubn.pal', sha256: paletteSha256 },
    targetMember: 'pavfxb03.ubn', targetSourceSha256: target.targetSourceSha256,
    targetMean: target.best[0].targetMean, candidates, runtimeSelectionsChanged: 0,
    sourceRgbUsedAsOutputTexture: false }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(candidates));
