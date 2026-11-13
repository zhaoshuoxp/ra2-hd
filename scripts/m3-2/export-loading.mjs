import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { vectorPaths } from '../art/palette-contours.mjs';

const root = path.resolve(import.meta.dirname, '../..'), work = path.join(root, '.artifacts/m3-2/loading');
const output = path.join(root, '.local/campaign/ra2/sov02t'), shared = path.join(root, '.local/campaign/ra2/sov01t');
const art = path.resolve(root, '../project-history/m3-2-first-batch-20261025/Art');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = async file => JSON.parse(await fs.readFile(file));
const source = PNG.sync.read(await fs.readFile(path.join(work, 'original-sov02t-loading.png')));
const sharedSvg = await fs.readFile(path.join(shared, 'interface-loading-vector.svg'), 'utf8');
const emblem = sharedSvg.match(/<image\b[^>]*\/>/g).at(-1);
if (!emblem || !emblem.includes('data:image/png;base64,')) throw Error('Accepted Soviet emblem is unavailable');
const focus = new PNG({ width: 284, height: 282 });
PNG.bitblt(source, focus, 348, 57, focus.width, focus.height, 0, 0);
// The indexed source contains sampled edge shades and dithering. Reconstruct
// its flat cartographic inks before tracing continuous country/state contours.
// No raster enlargement, blur or sharpening supplies the final map geometry.
for (let i = 0; i < focus.data.length; i += 4) {
    const [r, g, b] = focus.data.subarray(i, i + 3);
    const color = Math.max(r, g, b) < 40 ? [0, 0, 0]
        : b > r * 1.25 && b > g * 1.25 ? [0, 0, 252]
        : r > g * 1.5 && r > b * 1.5 ? [252, 0, 0]
        : g > r * 1.1 && g > b * 1.1 ? [4, 128, 0]
        : Math.max(r, g, b) > 160 ? [184, 204, 216] : [0, 0, 0];
    focus.data.set(color, i);
}
const contours = vectorPaths(focus, (x, y) => x < 3 || y < 3 || x >= 281 || y >= 279,
    { tolerance: 1.15, cornerRadius: .9, minimumArea: 4 });
const sharedHd = await read(path.join(shared, 'interface-hd.json'));
const manifest = await read(path.join(output, 'manifest.json'));
const sharedManifest = await read(path.join(shared, 'manifest.json'));
const files = [];
const rects = [[257, 379, 77, 63], [350, 379, 78, 63], [446, 379, 79, 63], [542, 266, 238, 242]];
execFileSync('python3', ['-c', `
from PIL import Image
from pathlib import Path
from scipy import ndimage
import numpy as np, json
work,art=Path(${JSON.stringify(work)}),Path(${JSON.stringify(art)})
strip=Image.open(art/'loading-three-photos-sample-r1.png').convert('RGB')
mask=np.max(np.array(strip),axis=2)>25
labels,_=ndimage.label(mask)
boxes=[]
for label,slices in enumerate(ndimage.find_objects(labels),1):
 if slices and np.count_nonzero(labels[slices]==label)>100000:
  ys,xs=slices;boxes.append([xs.start,ys.start,xs.stop,ys.stop])
boxes.sort();assert len(boxes)==3,boxes
photos=[strip.crop(box) for box in boxes]+[Image.open(art/'loading-tactical-r2.png')]
rects=${JSON.stringify(rects)}
for density in [2,4]:
 for index,(photo,rect) in enumerate(zip(photos,rects)):
  size=(rect[2]*density,rect[3]*density)
  assert photo.width>=size[0] and photo.height>=size[1],('Insufficient authored detail',index,size,photo.size)
  photo.resize(size,Image.Resampling.LANCZOS).save(work/f'photo-{index}-{density}x.png')
(work/'crop-receipt.json').write_text(json.dumps({'stripBounds':boxes,'rects':rects},indent=2)+'\\n')
`]);
for (const density of [2, 4]) {
    const photos = await Promise.all(rects.map(async ([x, y, width, height], index) =>
        `<image x="${x}" y="${y}" width="${width}" height="${height}" ${index === 3 ? 'clip-path="url(#tactical-photo)" ' : ''}`
        + `href="data:image/png;base64,${(await fs.readFile(path.join(work, `photo-${index}-${density}x.png`))).toString('base64')}"/>`));
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" ' + `width="${800 * density}" height="${520 * density}" viewBox="0 0 800 520">`
        + '<defs><clipPath id="tactical-photo"><path d="M637 266H780V508H542V342H637Z"/></clipPath></defs>'
        + '<path d="M634 174H716V266M234 414H542" fill="none" stroke="#ff4900" stroke-width="14"/>'
        + `<g transform="translate(348 57)"><rect width="284" height="282" fill="#000"/>`
        + contours.map(p => `<path fill="${p.fill}" fill-rule="evenodd" d="${p.d}"/>`).join('') + '</g>'
        + photos.join('') + '<rect x="347" y="54" width="287" height="286" fill="none" stroke="#ff5900" stroke-width="4"/>'
        + '<path d="M347 54L247 144V177L347 340M247 144H281V177H247" fill="none" stroke="#ff5900" stroke-width="1.7"/>'
        + emblem + '</svg>';
    const name = `interface-loading-${density}x.svg`, bytes = Buffer.from(svg);
    await fs.writeFile(path.join(output, name), bytes);
    files.push({ name, bytes: bytes.length, sha256: sha(bytes), route: '/local-campaign/ra2/sov02t/' + name });
}
const presentation = await fs.readFile(path.join(output, 'presentation.json'));
const bundle = { ...sharedHd, revision: 'm3-2-soviet02-loading-r1', mission: 'sov02t.map', originalPresentationSha256: sha(presentation),
    loading: { file: 'interface-loading-2x.svg', width: 1600, height: 1040, logical: [800, 520], foreground: true,
        variants: files.map((file, index) => ({ file: file.name, density: index ? 4 : 2 })), originalPhotoRects: rects,
        method: 'Original focus geography reconstructed as continuous vector contours; approved repainted photo direction; accepted shared emblem, chrome and world backdrop',
        masters: await Promise.all(['loading-three-photos-sample-r1.png', 'loading-tactical-r2.png'].map(async name => ({ name, sha256: sha(await fs.readFile(path.join(art, name))) }))) },
    policy: 'Existing 2X active UI surface and 16 MiB budget; independent 4X export retained. Shared accepted resources remain unchanged.' };
const bytes = Buffer.from(JSON.stringify(bundle) + '\n'), name = 'interface-hd.json';
await fs.writeFile(path.join(output, name), bytes);
files.push({ name, bytes: bytes.length, sha256: sha(bytes), route: '/local-campaign/ra2/sov02t/' + name },
    sharedManifest.files.find(file => file.name === sharedHd.selection.file));
manifest.files = [...manifest.files.filter(file => !files.some(next => next.name === file.name)), ...files];
await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await fs.writeFile(path.join(root, 'docs/m3-2-loading-resources.json'), JSON.stringify({ mission: manifest.mission,
    acceptance: 'PHOTO_DIRECTION_ACCEPTED_FULL_LOADING_REVIEW_PENDING', source: 'ls800s02.shp + ldscrns.pal',
    files, masters: bundle.loading.masters, crop: await read(path.join(work, 'crop-receipt.json')) }, null, 2) + '\n');
console.log(JSON.stringify({ files: files.map(file => file.name), focusPaths: contours.length }));
