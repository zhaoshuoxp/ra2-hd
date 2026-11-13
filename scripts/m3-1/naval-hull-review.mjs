import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const base = path.resolve(process.argv[2]), output = path.join(base, 'review');
await fs.mkdir(output, { recursive: false });
const read = async file => JSON.parse(await fs.readFile(path.join(base, file)));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const sources = [], section = [];
async function figure(relative, caption) {
    const bytes = await fs.readFile(path.join(base, relative));
    sources.push({ file: relative, bytes: bytes.length, sha256: sha(bytes) });
    return `<figure><img src="data:image/png;base64,${bytes.toString('base64')}" alt="${escape(caption)}"><figcaption>${escape(caption)}</figcaption></figure>`;
}
const before = await read('baseline-4x/report.json'), two = await read('native-2x/report.json'), four = await read('native-4x/report.json');
const original = await read('native-original/report.json'), opening = await read('opening-native/report.json');
for (const report of [before, original, two, four, opening]) assert(report.status.startsWith('PASS_'));
section.push('<h2>Waterline clipping before and after</h2><p>The former named military-ship list omitted civilian hulls. Surface-depth recovery now applies to all non-airborne VXL actors, retaining projected registration, native pitch/sinking, clipping, shadows and ordinary depth tests. Ship artwork is unchanged.</p>');
for (const name of ['CRUISE', 'TUG']) {
    const oldView = before.units.find(u => u.name === name).views.find(v => v.heading === 0);
    const newView = four.units.find(u => u.name === name).views.find(v => v.heading === 0);
    assert.equal(newView.missingPixels, 0);
    section.push(`<h3>${name}</h3><div class="pair">${await figure('baseline-4x/' + oldView.images.context,
        `R7: ${Math.round(oldView.missingFraction * 100)}% of the isolated hull pixels were clipped by water.`)}${await figure('native-4x/' + newView.images.context,
        'R8 4X: complete hull; zero hull pixels lost to the water clipping plane.')}</div>`);
}
section.push('<h2>Original, 2X and 4X at the same logical size</h2><div class="triple">');
for (const [folder, label] of [['native-original', 'Original reference'], ['native-2x', 'R8 2X'], ['native-4x', 'R8 4X']])
    section.push(await figure(`${folder}/cruise-45-context.png`, label + ': paused renderer heading 45.'));
section.push('</div><h2>All six original civilian boats</h2><p>The six placed boats are also inspected at their original positions and native bearings before the separate heading fixtures. No actor is added or moved.</p><div class="pair">');
for (const placement of four.initialPlacements.filter(p => p.id === 1821 || p.id === 1873))
    section.push(await figure('native-4x/' + placement.screenshot, `R8 4X native scene, ${placement.name} at [${placement.tile.join(', ')}].`));
section.push('</div><h2>Scripted Soviet national flag</h2><p>The original Soviet paradrop team naturally garrisons the memorial. Its HD garrison flag now includes the gold hammer/sickle and outlined star. Only generated insignia in slots 32–47 is inserted. All alpha, cloth/pole registration, non-garrison slots, existing data, body and original timing are preserved. Original mode retains retail artwork.</p><div class="pair">');
for (const density of [2, 4]) section.push(await figure(`opening-native/${density}x-soviet-insignia-33.png`,
    `${density}X actual native rendering, original-team occupation followed by a separately labeled paused slot-33 inspection.`));
section.push('</div><details><summary>All 15 active garrison animation slots, native 4X</summary><div class="frames">');
for (let frame = 33; frame <= 47; frame++) section.push(await figure(`opening-native/4x-soviet-insignia-${frame}.png`, 'Native slot ' + frame));
section.push('</div></details>');
const rows = [
    ['Ship waterline', '32 HD headings (2 boats × 8 headings × 2 densities), no lost hull pixels; 16 Original reference views.'],
    ['Original placements', 'All six boats in Original, 2X and 4X; original world positions retained.'],
    ['Flag resources', 'All 48 slots at both densities retain alpha and geometry. Slots 0–31 and all existing PNG/data files remain exact.'],
    ['Opening', 'Original, 2X and 4X naturally garrison the memorial; matched world/RNG/mission state at tick 3600.'],
    ['Limits', 'Native technical validation is separate from user visual acceptance. The paused view fixtures are not mission completion evidence.'],
];
const file = path.join(output, 'M3.1-Naval-Hull-R8-Review.html');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>M3.1 R8 — civilian hulls and Soviet flag</title><style>body{margin:0;background:#14191d;color:#e9edf0;font:17px/1.5 system-ui,sans-serif}main{max-width:1440px;margin:auto;padding:28px}h1{font-size:30px}h2{margin-top:36px;font-size:25px}h3{font-size:20px}p{max-width:1100px}.pair,.triple,.frames{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.triple{grid-template-columns:repeat(3,minmax(0,1fr))}.frames{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}figure{margin:0;padding:10px;background:#20282e;border:1px solid #45525c}img{display:block;max-width:100%;height:auto;margin:auto}figcaption{padding:10px 0 2px;font-size:15px}table{border-collapse:collapse;width:100%;margin-top:28px}th,td{padding:12px;border:1px solid #45525c;text-align:left;vertical-align:top}th{width:180px}summary{padding:16px;cursor:pointer}@media(max-width:800px){.pair,.triple{grid-template-columns:1fr}main{padding:16px}}</style><main><h1>M3.1 R8: civilian hulls and Soviet flag</h1><p>Offline review. Every image is embedded as unchanged native PNG bytes; no server, external fonts or network resources are required. This review covers the two user-reported corrections. The prior R7 package and evidence remain retained.</p>${section.join('')}<table>${rows.map(([label, text]) => `<tr><th>${escape(label)}</th><td>${escape(text)}</td></tr>`).join('')}</table></main></html>`;
await fs.writeFile(file, html);
assert(!/<(?:script|link|iframe)\b|https?:\/\//i.test(html));
const embedded = [...html.matchAll(/src="data:image\/png;base64,([^"]+)"/g)];
assert.equal(embedded.length, sources.length);
for (let i = 0; i < embedded.length; i++) assert.equal(sha(Buffer.from(embedded[i][1], 'base64')), sources[i].sha256);
const receipt = { status: 'PASS_SELF_CONTAINED_UNCHANGED_NATIVE_PNG_REVIEW', file, bytes: Buffer.byteLength(html),
    sha256: sha(Buffer.from(html)), embeddedImages: sources.length, sources };
await fs.writeFile(path.join(output, 'review.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ status: receipt.status, file, bytes: receipt.bytes, images: sources.length }));
