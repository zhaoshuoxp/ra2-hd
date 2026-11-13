import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..'), base = path.join(root, '.artifacts/m3-1/feedback-r6');
const arrows = path.resolve(process.argv[2]), runtime = path.resolve(process.argv[3] ?? path.join(base, 'runtime'));
const loading = path.resolve(process.argv[4] ?? path.join(base, 'native-loading'));
const output = path.resolve(process.argv[5] ?? base);
if (output !== base) await fs.mkdir(output, { recursive: false });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const source = JSON.parse(await fs.readFile(path.join(runtime, 'package.json'))).sourceHead;
const reports = [];
for (const directory of [loading, arrows]) {
    const bytes = await fs.readFile(path.join(directory, 'report.json')), report = JSON.parse(bytes);
    assert(report.status.startsWith('PASS'));
    const differences = execFileSync('git', ['diff', '--name-only', report.sourceHead, source, '--', 'src', 'public', 'desktop'],
        { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    if (directory === loading) assert.deepEqual(differences, []);
    else assert(differences.every(file => file === 'src/gui/campaign/CampaignBackdrop.tsx'));
    assert.equal(hash(await fs.readFile(path.join(directory, 'harness.mjs'))), report.harnessSha256);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    reports.push({ directory: path.relative(root, directory), sha256: hash(bytes), changedRuntimePathsSinceCapture: differences, report });
}
const captures = [
    [loading, 'loading-62-1280x720.png', 'Native 16:9 loading at 62%: one proportional world and the original Washington locator.'],
    [loading, 'loading-800x600.png', 'Native 4:3 loading: the same geography and locator registration.'],
    [loading, 'loading-1680x720.png', 'Native ultrawide loading: empty ocean/grid extends without repeated Alaska.'],
    [loading, 'loading-720x900.png', 'Native portrait loading: geography retains the same scale on both axes.'],
    [loading, 'loading-2560x720.png', 'Native 32:9 loading: one world; the sheet seam containing wrapped Alaska is excluded.'],
    [arrows, 'bridge-4x-arrow-top.png', 'HD: the original green capture hint is visible above the actual broken bridge.'],
    [arrows, 'bridge-4x-isolated-reference.png', 'Reference only: other world meshes are briefly hidden to measure the native arrow silhouette at the same held render pose.'],
    [arrows, 'bridge-1x-arrow-top.png', 'Original: the same top-layer hint clears the bridge geometry.'],
    [arrows, 'bridge-4x-engineer-repaired.png', 'Bounded replay: the original engineer repairs the bridge after the visibility check.'],
];
let figures = ''; const images = [];
for (const [directory, name, caption] of captures) {
    const file = path.join(directory, name), bytes = await fs.readFile(file), png = PNG.sync.read(bytes);
    const captureSource = reports.find(row => row.directory === path.relative(root, directory)).report.sourceHead;
    images.push({ file: path.relative(root, file), bytes: bytes.length, sha256: hash(bytes), dimensions: [png.width, png.height], sourceHead: captureSource });
    figures += `<figure><img src="data:image/png;base64,${bytes.toString('base64')}" alt="${escape(caption)}"><figcaption>${escape(caption)}</figcaption></figure>\n`;
}
const summary = { sourceHead: source, reports };
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M3.1 Feedback R6</title>
<style>body{margin:0;background:#101014;color:#eee;font:18px/1.6 system-ui,sans-serif}main{max-width:1800px;margin:auto;padding:24px}h1{font-size:32px}figure{margin:28px 0}img{display:block;width:100%;height:auto;background:#000}figcaption{font-size:16px;color:#d3c6ad;padding:10px 0}pre{font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere;background:#202025;padding:16px}summary{cursor:pointer}</style>
<main><h1>M3.1 Feedback R6</h1><p>Loading now draws one world with equal horizontal and vertical scale. Extra viewport space extends only empty ocean/grid, and the far-right sheet seam containing repeated Alaska is cropped. Washington remains aligned with the original mission locator. All five aspect ratios below come from the signed native app.</p>
<p>The original green arrow is authored Layer=Top. Scripted animation rendering now honors that source layer, retaining its position, source frames and timing while clearing world depth. The native comparison holds one naturally triggered arrow's render pose briefly and hides only other world meshes for a silhouette reference; the game remains unchanged. Original and HD both restore the authentic checkpoint exactly and match the accepted bridge-stage world hash. Ordinary recorded orders then produce the original engineer repair.</p>
<p>R5 yellow loading metal, three difficulties, named/legacy saves and completion records are preserved. The final loading captures use runtime ${source.slice(0, 8)}. Bridge captures reuse source ${reports[1].report.sourceHead.slice(0, 8)}: only background grid rendering changed afterward; the arrow handler, gameplay, save code and resources are identical. No repeat of unchanged battles is claimed. Earlier observer attempts are retained: two missed the short-lived arrow, and a depth-toggle comparison did not reproduce occlusion at that pose. The final check measures complete silhouette coverage over the actual bridge against an isolated render reference. User visual/physical acceptance is pending; native Windows is NOT_RUN_ON_THIS_MAC. Existing score-background limitations remain as recorded in R4/R5.</p>
${figures}<details><summary>Native checks and source identity</summary><pre>${escape(JSON.stringify(summary, null, 2))}</pre></details></main></html>`;
const embedded = [...html.matchAll(/src="data:image\/png;base64,([^"]+)"/g)]; assert.equal(embedded.length, images.length);
embedded.forEach((match, index) => { const bytes = Buffer.from(match[1], 'base64'); assert.equal(hash(bytes), images[index].sha256); PNG.sync.read(bytes); });
assert(!/<(?:img|video|script)[^>]+src="(?:https?:|file:|\/)/.test(html));
const file = path.join(output, 'M3.1-Feedback-R6-Review.html'); await fs.writeFile(file, html, { flag: 'wx' });
const review = { status: 'PASS_EMBEDDED_NATIVE_MAP_AND_TOP_LAYER_ARROW_SCREENSHOTS', file, sourceHead: source,
    sha256: hash(html), bytes: Buffer.byteLength(html), images, native: reports.map(({ directory, sha256, report }) => ({ directory, sha256, status: report.status })),
    browserPreview: 'Not retried after the prior file:// URL-policy rejection. Embedded PNG decoding and hash validation pass.' };
await fs.writeFile(path.join(output, 'review.json'), JSON.stringify(review, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ file, images: images.length, bytes: review.bytes }));
