import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '../..'), base = path.join(root, '.artifacts/m3-1/feedback-r5');
const mission = path.resolve(process.argv[2]), loading = path.join(base, 'native-loading');
const release = JSON.parse(await fs.readFile(path.join(base, 'runtime-current/package.json')));
const reuse = JSON.parse(await fs.readFile(path.join(base, 'final-source-reuse.json')));
const returns = path.join(base, 'native-return-current');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const reports = [];
const inherited = [];
for (const directory of [loading, mission, returns]) {
    const report = JSON.parse(await fs.readFile(path.join(directory, 'report.json')));
    if (directory === mission) {
        assert.equal(report.status, 'FAIL'); assert(report.error.includes("'1' !== '0'"));
        assert.deepEqual(report.cases.filter(row => row.victory).map(row => row.difficulty), ['easy', 'normal', 'hard']);
        assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    } else assert(report.status.startsWith('PASS'), directory);
    const metadata = JSON.parse(await fs.readFile(path.join(report.app, 'Contents/Resources/app/package.json')));
    assert.equal(metadata.sourceHead, directory === returns ? release.sourceHead : reuse.outcomeSourceHead);
    assert.equal(hash(await fs.readFile(path.join(directory, 'harness.mjs'))), report.harnessSha256);
    reports.push({ directory: path.relative(root, directory), status: report.status, sourceHead: metadata.sourceHead, report });
}
for (let proof = reports[1].report.inheritedProof; proof;) {
    const bytes = await fs.readFile(path.join(proof.directory, 'report.json'));
    assert.equal(hash(bytes), proof.reportSha256);
    const previous = JSON.parse(bytes);
    assert.equal(previous.app, reports[1].report.app);
    assert.equal(hash(await fs.readFile(path.join(proof.directory, 'harness.mjs'))), proof.harnessSha256);
    inherited.push(proof); proof = previous.inheritedProof;
}
const images = [
    [loading, 'loading-metal-0.png', 'Unlit glossy cylinder: fixed original material, seams and directional highlights.'],
    [loading, 'loading-metal-62.png', 'Updated loaded prefix: more yellow and less orange, with the same metal relief and a continuous lower edge.'],
    [loading, 'loading-metal-100.png', 'Full loading: the right-hand highlights strengthen at fixed positions as in the empty track.'],
    [loading, 'loading-62-1280x720.png', 'Native mission loading at 62%; original caps, grips, exposed cables and registered map locator.'],
    ...['easy', 'normal', 'hard'].flatMap(difficulty => [
        [mission, `faction-${difficulty}.png`, `Actual faction selection with ${difficulty} selected on the original difficulty slider.`],
        [mission, `save-${difficulty}.png`, `Actual named ${difficulty} save: the list identifies its difficulty and retains other slots.`],
        [mission, `score-${difficulty}.png`, `Original objective victory on ${difficulty}; the result uses its source par time.`],
    ]),
    [mission, 'restored-easy-after-app-restart.png', 'Easy save restored after a fresh application restart from the default Normal menu; exact world, RNG and mission state verified.'],
    ...['easy', 'hard', 'normal'].map(difficulty => [returns, `returned-R5-${difficulty}.png`, `Final runtime: loading a ${difficulty} save from another selected difficulty and aborting returns to the correct ${difficulty} slider position.`]),
];
let figures = ''; const records = [];
for (const [directory, name, caption] of images) {
    const file = path.join(directory, name), bytes = await fs.readFile(file), png = PNG.sync.read(bytes);
    const sourceHead = directory === returns ? release.sourceHead : reuse.outcomeSourceHead;
    records.push({ file: path.relative(root, file), bytes: bytes.length, sha256: hash(bytes), dimensions: [png.width, png.height], sourceHead });
    for (const proof of inherited) {
        const original = path.join(proof.directory, name), originalBytes = await fs.readFile(original).catch(() => undefined);
        if (originalBytes && hash(originalBytes) === hash(bytes)) records.at(-1).inheritedCapture = path.relative(root, original);
    }
    figures += `<figure><img src="data:image/png;base64,${bytes.toString('base64')}" alt="${escape(caption)}"><figcaption>${escape(caption)}</figcaption></figure>\n`;
}
const difficulty = JSON.parse(await fs.readFile(path.join(root, 'scripts/m3-1/difficulty-r5.json')));
const color = JSON.parse(await fs.readFile(path.join(base, 'loading-color.json')));
const summary = { sourceHead: release.sourceHead, native: reports.map(({ directory, status }) => ({ directory, status })),
    pixels: reports[0].report.pixels, color, difficulty, sourceReuse: reuse, inheritedProofChain: inherited, images: records };
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M3.1 Feedback R5</title>
<style>body{margin:0;background:#101014;color:#eee;font:18px/1.6 system-ui,sans-serif}main{max-width:1600px;margin:auto;padding:28px}h1{font-size:32px}figure{margin:28px 0}img{display:block;width:100%;height:auto;background:#000;border:1px solid #555}figcaption{font-size:16px;color:#d3c6ad;padding:10px 0}table{border-collapse:collapse;width:100%}td,th{padding:10px;border:1px solid #555;text-align:left}pre{font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere;background:#202025;padding:16px}summary{cursor:pointer}</style>
<main><h1>M3.1 Feedback R5</h1><p>The loading cylinder now shifts toward the original yellow palette while preserving shared metal texture, fixed highlights and the clean lower edge.</p>
<p>All three campaign difficulties launch, save, restore and complete the original Soviet 01 objective. Original rules apply opposing player/computer handicaps; source trigger flags and AI team choices add mission-specific differences. No map, rule, script or source-media file was edited.</p>
<table><thead><tr><th>Difficulty</th><th>Player armor / firing interval</th><th>Four extra GI reinforcements and AI start</th><th>Original par time</th></tr></thead><tbody>
<tr><td>Easy</td><td>1.2 / 0.8</td><td>Disabled by original flags</td><td>25:00</td></tr>
<tr><td>Normal</td><td>1.0 / 1.0</td><td>Available through original trigger flow</td><td>15:00</td></tr>
<tr><td>Hard</td><td>0.8 / 1.2</td><td>Available through original trigger flow</td><td>06:00</td></tr></tbody></table>
<p>The original map overrides global TeamDelays with 1000/750/500 (Hard/Normal/Easy); that ordering is retained. Armor divides received damage, while the firing interval multiplies weapon ROF. AI uses the opposite handicap section. Reverse-engineered scenario fields support the selection logic; exact native-Windows binary parity is not certified.</p>
<p>Native testing uses real menu/save clicks and legal serialized gameplay orders with accelerated simulation turns. Easy/Normal victories and all three fresh-start/save checks are retained from matching-runtime runs. Hard continues its authentic named save through actual UI in a cloned isolated profile, with replacement engineers and infantry paid for normally. The proof chain identifies reused captures. This is assisted validation, separate from physical-input full completion. The frozen Normal checkpoint restores exactly, application restart retains all three slots, and completion records coexist.</p>
<p>The final restart check exposed an abort-menu selection bug after the three authentic victories had passed. Final runtime ${escape(release.sourceHead.slice(0, 8))} repairs that route and passes separate exact restores/returns for Easy, Normal, Hard and the late Hard checkpoint. Gameplay, data, campaign art and save trees are byte-identical to outcome source ${escape(reuse.outcomeSourceHead.slice(0, 8))}; only the quit route differs. The raw failed final assertion remains retained and is listed in the evidence.</p>
<p>Every screenshot is embedded. User visual and physical-input acceptance remains pending. Native Windows is NOT_RUN_ON_THIS_MAC. The existing score background remains Original-density because the earlier HD image-generation request was rejected; no new generation is claimed here. Canonical main and earlier packages/profiles remain preserved.</p>
${figures}<details><summary>Source, original difficulty records and native pixel checks</summary><pre>${escape(JSON.stringify(summary, null, 2))}</pre></details></main></html>`;
const embedded = [...html.matchAll(/src="data:image\/png;base64,([^"]+)"/g)]; assert.equal(embedded.length, records.length);
embedded.forEach((match, index) => { const bytes = Buffer.from(match[1], 'base64'); assert.equal(hash(bytes), records[index].sha256); PNG.sync.read(bytes); });
assert(!/<(?:img|video|script)[^>]+src="(?:https?:|file:|\/)/.test(html));
const file = path.join(base, 'M3.1-Feedback-R5-Review.html'); await fs.writeFile(file, html, { flag: 'wx' });
const review = { status: 'PASS_EMBEDDED_NATIVE_THREE_DIFFICULTIES_AND_LOADING_SCREENSHOTS', file, sourceHead: release.sourceHead,
    sha256: hash(html), bytes: Buffer.byteLength(html), images: records, native: summary.native, pixelChecks: summary.pixels,
    browserPreview: 'Not retried after the prior file:// URL-policy rejection. Embedded PNG decoding and hash validation pass.' };
await fs.writeFile(path.join(base, 'review.json'), JSON.stringify(review, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ file, images: records.length, bytes: review.bytes }));
