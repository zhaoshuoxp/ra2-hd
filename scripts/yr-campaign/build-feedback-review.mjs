import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve(process.argv[2]);
const checkpoint = JSON.parse(await fs.readFile('docs/yr-campaign-feedback-checkpoint-20261108-r2.json'));
assert.equal(checkpoint.status, 'URGENT_SOVIET01_SOURCE_AND_NATIVE_CORRECTION_QUALIFIED');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const rows = [
    ['soviet-feedback-return46-4x-r2', 'native-final.png', 'Soviet01: return to the original Soviet base',
        'Original return checkpoint, unit protection and map reveal, ordinary movement and airstrike orders, then 9,600 simulation turns without a missing-cell error.'],
    ['soviet-feedback-jurassic46-2x-r1', 'native-jurassic-17.png', 'Soviet01: water dinosaur at 2X',
        'Original aquatic dinosaur uses its native Walk row while moving. Visibility and opacity stay continuous. Source troops acquire the hostile Nod dinosaurs autonomously.'],
    ['soviet-feedback-jurassic46-4x-r2', 'native-jurassic-17.png', 'Soviet01: water dinosaur at 4X',
        'Independent 4X run with the same original checkpoint and supported trainer settings. Existing accepted artwork and source movement rules are retained.'],
    ['allied-feedback-native-ui-r2', 'native-pause-objectives.png', 'Campaign pause: current mission objectives',
        'Actual Allied06 opening and pause menu, showing the localized briefing and executed source objectives.'],
    ['allied-feedback-native-ui-r2', 'native-fullscreen-skip-pointer.png', 'Fullscreen movie: usable Skip control',
        'An unchanged original clip exercises the shared player. Native mouse movement and a real click skip the movie with pointer lock released; the frozen world is unchanged. This is a UI check, not a source-trigger or victory check.'],
];
const evidence = [];
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const figures = [];
for (const [directory, name, title, caption] of rows) {
    const source = path.join('.artifacts/yr-campaign', directory);
    const report = JSON.parse(await fs.readFile(path.join(source, 'report.json')));
    assert(report.status.startsWith('PASS_'), `${directory}: ${report.status}`);
    const file = path.join(source, name), bytes = await fs.readFile(file);
    evidence.push({ file, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
        report: path.join(source, 'report.json'), status: report.status });
    figures.push(`<figure><h2>${escape(title)}</h2><img src="data:image/png;base64,${bytes.toString('base64')}" alt="${escape(title)}"><figcaption>${escape(caption)}</figcaption></figure>`);
}
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<title>RA2 HD - YR Campaign Corrections r2</title><style>
:root{color-scheme:dark;font:18px/1.6 system-ui,sans-serif;background:#11151b;color:#e8edf3}body{margin:0 auto;padding:30px;max-width:1200px}h1{font-size:34px;line-height:1.2}h2{font-size:25px}a{color:#b1d9ff}code{overflow-wrap:anywhere}section,figure{margin:24px 0;padding:24px;border:1px solid #354251;border-radius:12px;background:#19212b}img{display:block;width:100%;height:auto;background:#000}figcaption{margin-top:14px;color:#c3d0dd}li{margin:8px 0}.tag{display:inline-block;padding:4px 12px;border:1px solid #89b79c;border-radius:5px;color:#bce7cc}small{color:#b1bdca}@media(max-width:700px){body{padding:15px}section,figure{padding:15px}h1{font-size:28px}}
</style><main><h1>Yuri's Revenge Campaign Corrections r2</h1><p class="tag">Urgent Soviet01 test build · macOS arm64 · 2026-11-08</p>
<p>This build prioritizes the reported Soviet01 crash after the return time travel. The original complete campaign delivery remains available. The thirteen Allied feedback groups are still partly open.</p>
<section><h2>Corrections to test</h2><ul>
<li>Physical-cell guards prevent ground movement and projectile interception from entering a missing map cell, including the reported <code>[162,104]</code> case.</li>
<li>Squid headings follow the original clockwise sprite bearings while moving and attacking.</li>
<li>New YR missions classify GDI, Nod and Special as combat houses from their original side, allowing automatic defense against hostile dinosaurs and scenario armies.</li>
<li>The original aquatic dinosaur selects its native movement animation when its sheet has no human swimming rows.</li>
<li>Shared campaign controls show mission objectives, retain localized narration before movie boundaries, and release pointer lock for fullscreen Skip.</li></ul>
<p><strong>Crash qualification:</strong> the exact user-triggered crash has not been reproduced. The reported missing-cell exception is covered by a real position/movement regression. Native source travel and return routes pass separately with unit protection and map reveal.</p></section>
<section><h2>Continue testing</h2><p>Quit the previous game, extract the new r2 ZIP, and open its <strong>Red Alert 2 HD.app</strong>. The app uses the existing campaign profile; saves and settings are retained.</p>
<p>The movement and rendering corrections also apply when restoring earlier saves. Earlier saves keep their original interpreter and house classification. <strong>Restart Soviet01 to test the new automatic-targeting policy.</strong> New YR missions use interpreter46.</p>
<p>Allied01 Gattling hits, Allied02 tank-bunker occupation, Allied06 leaders entering Parliament, and Allied07 yard/MCV redeployment have targeted native checks. Remaining Allied material, load/performance, victory and route-specific reports continue in the feedback ledger.</p></section>
<section><h2>Validation and limits</h2><p>Host suite: ${checkpoint.host.counts.pass} passing cases; no failures, loading/process errors, skips or omitted files. Entry typechecking and targeted native Mac checks pass. The package delivery record records the signed app, ZIP verification and extracted-app controls separately.</p>
<p>User visual acceptance is pending. Windows and physical 8/16 GiB targets have not been run on this Mac. Accepted unit artwork and the selected old building snow remain in use.</p>
<small>Source: <code>${head}</code>. Every image below is an embedded, unmodified native capture. No network access is needed.</small></section>
${figures.join('\n')}</main></html>\n`;
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, html, { flag: 'wx' });
await fs.writeFile(out + '.json', JSON.stringify({ status: 'PASS_SELF_CONTAINED_NATIVE_REVIEW', sourceHead: head,
    images: evidence, bytes: Buffer.byteLength(html), sha256: createHash('sha256').update(html).digest('hex'),
    acceptance: 'USER_VISUAL_REVIEW_PENDING', networkDependencies: 0 }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ file: out, images: evidence.length, bytes: Buffer.byteLength(html) }));
