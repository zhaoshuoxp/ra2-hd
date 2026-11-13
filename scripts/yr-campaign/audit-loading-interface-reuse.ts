import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { Palette } from '../../src/data/Palette';
import { ShpFile } from '../../src/data/ShpFile';
import { retailMember, sha256 } from '../test-support/resources';

const output = path.resolve(process.argv[2]);
fs.mkdirSync(output, { recursive: false });
const rows = [];
const presentations = Object.fromEntries((['ra2', 'yr'] as const).map(edition => {
    const mission = edition === 'ra2' ? 'sov01t' : 'sov01umd';
    const bytes = fs.readFileSync(`.local/campaign/${edition}/${mission}/presentation.json`);
    return [edition, { ...JSON.parse(bytes.toString()), sha256: sha256(bytes) }];
}));
for (const role of ['background', 'allied', 'tutorial', 'soviet', 'title', 'progressHousing', 'progressFill']) {
    const editions = (['ra2', 'yr'] as const).map(edition => {
        const original = presentations[edition].sprites[role];
        const corrected = process.argv.includes('--correct-original-palettes') && edition === 'yr'
            ? ({ background: 'fsbkgdlg.pal', allied: 'fsalg.pal', soviet: 'fsslg.pal' } as Record<string, string>)[role] : undefined;
        const declaration = { ...original, ...(corrected ? { palette: corrected } : {}) };
        const source = retailMember(edition, declaration.image), paletteSource = retailMember(edition, declaration.palette);
        assert(presentations[edition].sources.some((row: any) => row.name === declaration.image && row.sha256 === source.sha256));
        const shp = new ShpFile(source.file), palette = new Palette(paletteSource.file);
        const frames = shp.images.map((frame, index) => {
            const image = new PNG({ width: shp.width, height: shp.height });
            for (let pixel = 0; pixel < shp.width * shp.height; pixel++) image.data[pixel * 4 + 3] = 255;
            frame.imageData.forEach((index, pixel) => {
                const color = palette.getColor(index), x = pixel % frame.width + frame.x, y = Math.floor(pixel / frame.width) + frame.y;
                image.data.set([color.r, color.g, color.b, 255], (y * shp.width + x) * 4);
            });
            const file = `${edition}-${role}-${index}.png`, bytes = PNG.sync.write(image);
            fs.writeFileSync(path.join(output, file), bytes, { flag: 'wx' });
            return { file, sha256: sha256(bytes), pixelsSha256: sha256(image.data),
                geometry: [frame.x, frame.y, frame.width, frame.height], data: image.data };
        });
        return { edition, member: declaration.image, sourceSha256: source.sha256,
            palette: declaration.palette, paletteSha256: paletteSource.sha256,
            dimensions: [shp.width, shp.height], frames };
    });
    const [parent, target] = editions;
    const sameGeometry = JSON.stringify(parent.dimensions) === JSON.stringify(target.dimensions)
        && parent.frames.length === target.frames.length;
    const comparisons = target.frames.map((frame, index) => {
        const previous = parent.frames[index];
        let changedPixels = 0;
        if (sameGeometry) for (let i = 0; i < frame.data.length; i += 4)
            if (frame.data.subarray(i, i + 4).some((channel, at) => channel !== previous.data[i + at])) changedPixels++;
        return { index, sameFrameGeometry: JSON.stringify(frame.geometry) === JSON.stringify(previous?.geometry),
            changedPixels: sameGeometry ? changedPixels : null, parentPixelsSha256: previous?.pixelsSha256,
            targetPixelsSha256: frame.pixelsSha256 };
    });
    rows.push({ role, sameGeometry, exactDecodedColorReuse: sameGeometry
        && comparisons.every(row => row.changedPixels === 0 && row.sameFrameGeometry), comparisons,
        editions: editions.map(edition => ({ ...edition, frames: edition.frames.map(({ data, ...frame }) => frame) })) });
}
const report = { schema: 'yr-loading-common-interface-decoded-source-audit-v1',
    correctedOriginalPalettes: process.argv.includes('--correct-original-palettes'),
    parentPresentationSha256: presentations.ra2.sha256, targetPresentationSha256: presentations.yr.sha256,
    rows, exactDecodedColorRoles: rows.filter(row => row.exactDecodedColorReuse).map(row => row.role),
    qualification: 'Read-only comparison of original decoded native pixels and frame geometry. Encoded-source differences do not by themselves require new artwork. Accepted HD payloads are unchanged.',
    changedResources: 0 };
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(rows.map(row => ({ role: row.role, sameGeometry: row.sameGeometry,
    exactDecodedColorReuse: row.exactDecodedColorReuse, changedPixels: row.comparisons.map(frame => frame.changedPixels) }))));
