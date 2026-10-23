import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { retailMember } from '../test-support/resources';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
import { sampleNativeUi } from '../../src/gui/NativeUiImage';
import { PointerType } from '../../src/engine/type/PointerType';

const out = path.resolve(process.argv[2]);
fs.mkdirSync(out, { recursive: false });
const report: any = { status: 'RUNNING', editions: [], samples: [] };
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const bounds = (rgba: Uint8Array | Uint8ClampedArray, width: number, height: number) => {
    let x0 = width, y0 = height, x1 = 0, y1 = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (rgba[(y * width + x) * 4 + 3] > 16) {
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
    }
    return [x0, y0, x1, y1];
};
for (const edition of ['ra2', 'yr'] as const) {
    const source = retailMember(edition, edition === 'yr' ? 'mouse.sha' : 'mouse.shp'), pal = retailMember(edition, 'mousepal.pal');
    const shp = new ShpFile(source.file), palette = Palette.fromVirtualFile(pal.file);
    const row = { edition, frames: shp.numImages, sourceSha256: source.sha256, paletteSha256: pal.sha256, checkedFrames: 0 };
    report.editions.push(row);
    for (let frame = 0; frame < shp.numImages; frame++) {
        const image = shp.getImage(frame), rgba = new Uint8Array(shp.width * shp.height * 4);
        for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
            const index = image.imageData[y * image.width + x];
            if (!index) continue;
            const color = palette.getColor(index), p = ((y + image.y) * shp.width + x + image.x) * 4;
            rgba.set([color.r, color.g, color.b, 255], p);
        }
        const hd = sampleNativeUi(rgba, shp.width, shp.height);
        assert.equal(hd.length, rgba.length * 16);
        const originalBounds = bounds(rgba, shp.width, shp.height);
        const hdBounds = bounds(hd, shp.width * 4, shp.height * 4).map(v => v / 4);
        if (originalBounds[0] !== shp.width) for (let i = 0; i < 4; i++) assert(Math.abs(originalBounds[i] - hdBounds[i]) <= 1);
        row.checkedFrames++;
        if (['Default','Select','Move','NoMove','Attack','AttackRange','Deploy','NoDeploy','Sell','Repair','Chronosphere','Nuke','PsychicDominator'].some(name => PointerType[name as keyof typeof PointerType] === frame)) {
            const name = `${edition}-${frame}`;
            fs.writeFileSync(path.join(out, name + '-native.rgba'), rgba);
            fs.writeFileSync(path.join(out, name + '-hd.rgba'), hd);
            report.samples.push({ name, frame, family: PointerType[frame], width: shp.width, height: shp.height,
                sourceRgbaSha256: hash(rgba), hdRgbaSha256: hash(hd), originalBounds, hdBounds });
        }
    }
}
assert.equal(report.editions.reduce((sum: number, row: any) => sum + row.checkedFrames, 0), 967);
report.status = 'PASS_ALL_967_RETAIL_CURSOR_FRAMES_WITH_NATIVE_CANVASES_AND_BOUNDS';
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, editions: report.editions }));
