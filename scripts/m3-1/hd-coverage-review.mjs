import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '../..'), base = path.resolve(process.argv[2]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const coverageFile = path.join(base, 'coverage.json'), coverage = await read(coverageFile);
const directory = path.join(base, 'native-complete'), nativeFile = path.join(directory, 'report.json'), native = await read(nativeFile);
assert.equal(coverage.status, 'AUDIT_COMPLETE_REMAINING_HD_GAPS_CONFIRMED');
assert.equal(hash(await fs.readFile(nativeFile)), coverage.native.proof.sha256);
assert.equal(hash(await fs.readFile(path.join(directory, 'harness.mjs'))), native.harnessSha256);
assert.deepEqual(native.errors, []); assert.deepEqual(native.failedResources, []);
const captures = [
    ['cawa2a.png', 'Pentagon complex: CAWA2A/B use Original. C/D are separate HD objects.'],
    ['cawa2c.png', 'Pentagon C: an existing HD reference within the same complex.'],
    ['cawash19.png', 'The opening memorial and animated flag already bind their campaign-specific HD family.'],
    ['camov01.png', 'The drive-in screen and concession stand use Original; the civilian cars around them bind HD.'],
    ['canewy21.png', 'Warehouse B uses Original despite existing source-matched HD assets in the YR-only URBAN registration.'],
    ['cruise.png', 'Cruise ships and tug boats use Original.'],
    ['tug.png', 'Tug-boat placement reference; no current HD voxel family is registered.'],
    ['civ1.png', 'CIV1 uses Original. Source-matched 2X/4X pages exist in NEWURBAN but are not routed into this RA2 URBAN map.'],
    ['civ2.png', 'CIV2 uses Original. Existing URBAN HD pages are registered only for YR.'],
    ['civ3.png', 'CIV3 uses Original. Source/palette-matched TEMPERATE HD pages are not routed into URBAN.'],
];
const images = []; let figures = '';
for (const [name, caption] of captures) {
    assert(native.screenshots.includes(name));
    const file = path.join(directory, name), bytes = await fs.readFile(file), png = PNG.sync.read(bytes);
    const item = { file: path.relative(root, file), bytes: bytes.length, sha256: hash(bytes), dimensions: [png.width, png.height] };
    images.push(item);
    figures += `<figure><img loading="lazy" src="data:image/png;base64,${bytes.toString('base64')}" alt="${escape(caption)}"><figcaption>${escape(caption)}</figcaption></figure>\n`;
}
const gaps = coverage.rows.filter(row => row.status.startsWith('ORIGINAL') || row.status.startsWith('PARTIAL'));
const summaryRows = Object.entries(coverage.summary).filter(([, row]) => row.placements).map(([kind, row]) =>
    `<tr><td>${escape(kind)}</td><td>${row.placements}</td><td>${row.hdTypes}</td><td>${row.originalTypes}</td><td>${row.originalPlacements}</td></tr>`).join('');
const gapRows = gaps.map(row => `<tr><td>${escape(row.name)}</td><td>${escape(row.label)}</td><td>${escape(row.kind)}</td><td>${row.placed || (row.kind === 'overlay' ? row.observed + ' overlay' : 'declared')}</td><td>${escape(row.compatibleCandidate ?? 'No source-compatible current family')}</td><td>${escape(row.issue)}</td></tr>`).join('');
const scope = { runtimeSourceHead: coverage.runtimeSourceHead, originalMap: coverage.originalMap, nativeReportSha256: hash(await fs.readFile(nativeFile)),
    inspectedIdentities: native.rows.length, diagnosticReveal: native.world.diagnostic, inspectionModified: native.world.inspectionModified,
    openingAircraft: coverage.openingAircraft, excluded: coverage.excluded, limitations: coverage.limitations };
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M3.1 HD coverage audit</title>
<style>body{margin:0;background:#11151a;color:#e9edf2;font:18px/1.6 system-ui,sans-serif}main{max-width:1800px;margin:auto;padding:24px}h1{font-size:34px}h2{font-size:26px;margin-top:32px}strong{color:#ffcd75}figure{margin:28px 0}img{display:block;width:100%;height:auto;background:#000}figcaption{font-size:16px;padding-top:8px;color:#d4c3a2}.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:9px;text-align:left;border-bottom:1px solid #3c424a}th{color:#ffcd75;white-space:nowrap}pre{font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere;background:#20252c;padding:16px}summary{cursor:pointer}</style>
<main><h1>Soviet 01: remaining HD coverage</h1><p>R6 is user accepted. This audit uses the actual extracted R6 Mac app at 4X and leaves its runtime, resources and Desktop ZIP unchanged.</p>
<p><strong>${coverage.originalPlacedTypes} initial placed types / ${coverage.originalPlacedObjects} objects still use Original.</strong> Four additional task-force civilian types, one wooden bridge overlay and the implicit cargo plane bring the total to <strong>${gaps.length} gap identities</strong>. Dynamic declarations are not all claimed spawned. Of these gaps, ${coverage.sourceMatchedReuseCandidates.length} have source-matched 2X/4X reuse candidates; ${coverage.missingCurrentFamily.length} have no source-compatible family in the installed catalogs.</p>
<div class="scroll"><table><thead><tr><th>Placed category</th><th>Visible objects</th><th>HD types</th><th>Original types</th><th>Original objects</th></tr></thead><tbody>${summaryRows}</tbody></table></div>
<p>The complete source inventory includes 161 structures (36 intentionally invisible lights), 78 vehicles/ships, 60 infantry, 746 scenery placements and all 29 task-force definitions. Inspection also resolves native overlays, implicit aircraft and separately labeled production candidates. Batched trees, walls and ore are checked through their actual GPU material bindings. Terrain publishes at 4X without fallback groups.</p>
<h2>Remaining gaps</h2><div class="scroll"><table><thead><tr><th>Identity</th><th>Retail label</th><th>Kind</th><th>Placed / scope</th><th>Reuse candidate</th><th>Current cause</th></tr></thead><tbody>${gapRows}</tbody></table></div>
<p>Most URBAN reuse candidates have only YR registration. CIVBBP is registered for RA2 but omitted by the initial environment-demand scan. CIV1/CIV3 can reuse other-theater candidates with identical source and unit-palette hashes. The wooden bridge assets from other theaters have different source/palette hashes and are excluded from reuse.</p>
<p>Every candidate member, logical frame roster, source palette, 2X/4X manifest and page hash was checked. Reuse still requires complete admission/loading and native state/visual validation. This audit does not accept new art or fixes. It does not exhaustively cover weapon effects, particles, rubble transitions, UI or movies.</p>
<h2>Native placement references</h2><p>These are unchanged native screenshots. The game is paused with an isolated diagnostic reveal; this is inspection evidence, not a new battle-completion claim. Some frames show nearby HD objects as references alongside the named Original object.</p>
${figures}<details><summary>Source identity and audit scope</summary><pre>${escape(JSON.stringify(scope, null, 2))}</pre></details></main></html>`;
const embedded = [...html.matchAll(/src="data:image\/png;base64,([^"]+)"/g)]; assert.equal(embedded.length, images.length);
embedded.forEach((match, index) => {
    const bytes = Buffer.from(match[1], 'base64'), png = PNG.sync.read(bytes);
    assert.equal(hash(bytes), images[index].sha256); assert.deepEqual([png.width, png.height], images[index].dimensions);
});
assert(!/<(?:img|video|script)[^>]+src="(?:https?:|file:|\/)/.test(html));
const file = path.join(base, 'M3.1-HD-Coverage-Audit.html'); await fs.writeFile(file, html, { flag: 'wx' });
const review = { status: 'PASS_EMBEDDED_NATIVE_HD_COVERAGE_AUDIT_WITH_EXPLICIT_GAPS', file, bytes: Buffer.byteLength(html), sha256: hash(html),
    runtimeSourceHead: coverage.runtimeSourceHead, coverageSha256: hash(await fs.readFile(coverageFile)), images,
    browserPreview: 'Not retried after the earlier file URL-policy rejection. Embedded PNG decoding and hash validation pass.' };
await fs.writeFile(path.join(base, 'review.json'), JSON.stringify(review, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ file, images: images.length, bytes: review.bytes, sha256: review.sha256 }));
