import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '../..'), base = path.join(root, '.artifacts/m3-1/feedback-r4');
const release = JSON.parse(await fs.readFile(path.join(base, 'runtime-current/package.json')));
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const reports = new Map();
for (const name of ['native-loading-current', 'native-victory-current', 'native-defeat-current']) {
    const report = JSON.parse(await fs.readFile(path.join(base, name, 'report.json')));
    assert(report.status.startsWith('PASS'), name);
    const metadata = JSON.parse(await fs.readFile(path.join(report.app, 'Contents/Resources/app/package.json')));
    assert.equal(metadata.sourceHead, release.sourceHead);
    assert.equal(hash(await fs.readFile(path.join(base, name, 'harness.mjs'))), report.harnessSha256);
    reports.set(name, report);
}
const images = [
    ['native-loading-current', 'loading-metal-0.png', 'Unlit reference: the unchanged glossy cylinder, regular seams and increasing right-hand highlights.'],
    ['native-loading-current', 'loading-metal-62.png', '62% loaded: bright yellow-orange metal with a continuous red lower edge. This prefix is pixel-identical at 100% progress.'],
    ['native-loading-current', 'loading-metal-100.png', 'Fully loaded: the original fixed cylinder highlights strengthen toward the right without saturating every segment.'],
    ['native-loading-current', 'loading-62-1280x720.png', 'The actual held mission loading page at 62%; red cables remain exposed and the map locator retains its registered coordinates.'],
    ['native-loading-current', 'loading-1680x720.png', 'Ultrawide loading at 100%, with the original metal caps and grips.'],
    ['native-victory-current', 'score-victory-800x600.png', '4:3 victory: restored native Soviet insignia and red starburst behind the smaller transparent animated apparatus.'],
    ['native-victory-current', 'score-victory-1680x720.png', 'Ultrawide victory: one centered proportional native background insignia; only the outer rays extend. The background retains Original pixel density.'],
    ['native-victory-current', 'score-victory-720x900.png', 'Tall-window victory: source medal animation and live typewriter text retain the same size.'],
    ['native-defeat-current', 'score-defeat-1280x720.png', 'Actual mission defeat: the same faction background, original Mission Failed voice, and no victory cheer.'],
];
const records = []; let figures = '';
for (const [name, filename, caption] of images) {
    const file = path.join(base, name, filename), bytes = await fs.readFile(file), png = PNG.sync.read(bytes);
    records.push({ file: path.relative(root, file), bytes: bytes.length, sha256: hash(bytes),
        dimensions: [png.width, png.height], sourceHead: release.sourceHead });
    figures += `<figure><img src="data:image/png;base64,${bytes.toString('base64')}" alt="${escape(caption)}"><figcaption>${escape(caption)}</figcaption></figure>\n`;
}
const source = JSON.parse(await fs.readFile(path.join(root, 'scripts/m3-1/score-background-r4.json')));
const summary = { sourceHead: release.sourceHead, native: [...reports].map(([name, report]) => ({ name, status: report.status })),
    pixels: reports.get('native-loading-current').pixels, background: source, images: records };
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M3.1 Feedback R4</title>
<style>body{margin:0;background:#101014;color:#eee;font:18px/1.6 system-ui,sans-serif}main{max-width:1600px;margin:auto;padding:28px}h1{font-size:32px}figure{margin:28px 0}img{display:block;width:100%;height:auto;background:#000;border:1px solid #555}figcaption{font-size:16px;color:#d3c6ad;padding:10px 0}pre{font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere;background:#202025;padding:16px}summary{cursor:pointer}</style>
<main><h1>M3.1 Feedback R4</h1><p>Loading progress now matches the original bright yellow-orange palette, removes irregular black pinholes and retains the unlit cylinder's fixed left-to-right highlight variation. Native pixel checks confirm a continuous lower edge, matching metal relief and an unchanged loaded prefix as progress advances.</p>
<p>The result page now uses the verified retail Soviet background from sscrbkmd.shp: a large dim faction insignia over dark red starburst rays. The smaller transparent apparatus, live typewriter text, original medal animation and result audio remain intact.</p>
<p><strong>Generated HD background remains blocked:</strong> the built-in image tool rejected the reference-guided request during output moderation. No new generated image exists. This delivery uses the existing Original-density background with a cropped border and responsive outer rays. It does not claim newly generated HD score art.</p>
<p>Every screenshot below is embedded. No server or adjacent file is needed. User visual and physical-input acceptance remains pending. Native Windows is NOT_RUN_ON_THIS_MAC. Earlier source packages, profiles and raw evidence are retained; main is unchanged.</p>
${figures}<details><summary>Source, pixel checks and generation record</summary><pre>${escape(JSON.stringify(summary, null, 2))}</pre></details></main></html>`;
const embedded = [...html.matchAll(/src="data:image\/png;base64,([^"]+)"/g)]; assert.equal(embedded.length, records.length);
embedded.forEach((match, index) => {
    const bytes = Buffer.from(match[1], 'base64'); assert.equal(hash(bytes), records[index].sha256); PNG.sync.read(bytes);
});
assert(!/<(?:img|video|script)[^>]+src="(?:https?:|file:|\/)/.test(html));
const file = path.join(base, 'M3.1-Feedback-R4-Review.html'); await fs.writeFile(file, html, { flag: 'wx' });
const review = { status: 'PASS_EMBEDDED_NATIVE_SCREENSHOTS_WITH_BLOCKED_HD_BACKGROUND_EXPLICIT', file, sourceHead: release.sourceHead,
    sha256: hash(html), bytes: Buffer.byteLength(html), images: records, pixelChecks: summary.pixels,
    browserPreview: 'Not retried after the prior file:// URL-policy rejection. Embedded PNG decoding and hash validation pass.' };
await fs.writeFile(path.join(base, 'review.json'), JSON.stringify(review, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ file, images: records.length, bytes: review.bytes }));
