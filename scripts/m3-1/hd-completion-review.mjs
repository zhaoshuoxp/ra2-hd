import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '../..'), base = path.resolve(process.argv[2]);
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const opening = await read(path.join(base, 'opening-native-v3/report.json'));
const coverage = await Promise.all([2, 4].map(density => read(path.join(base, `coverage-${density}x-v1/report.json`))));
const poses = await read(path.join(base, 'poses-native-v1/report.json'));
assert(opening.status.startsWith('PASS_') && poses.status.startsWith('PASS_'));
assert(coverage.every(row => row.status === 'PASS_NATIVE_GPU_HD_CLOSURE_ALL_29_AUDITED_GAP_IDENTITIES'));
const compact = process.argv.includes('--compact');
const output = path.join(base, compact ? 'compact-review' : 'final-review'); await fs.mkdir(output, { recursive: false });
const images = [];
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
async function figure(file, caption, extra = '') {
    const bytes = await fs.readFile(file), png = PNG.sync.read(bytes);
    images.push({ file: path.relative(root, file), bytes: bytes.length, sha256: hash(bytes), dimensions: [png.width, png.height], caption });
    return `<figure ${extra}><img loading="lazy" src="data:image/png;base64,${bytes.toString('base64')}" alt="${escape(caption)}"><figcaption>${escape(caption)}</figcaption></figure>`;
}
let normal = '';
for (const density of compact ? [4] : [1, 2, 4]) {
    normal += `<details ${density === 4 ? 'open' : ''}><summary>${density === 1 ? 'Original' : density + 'X'}: original scripted opening</summary>`;
    for (const [name, caption] of [
        ['original-us-flag', 'Original US flag before the Soviet team enters the memorial.'],
        ['original-scripted-soviet-flag', 'The original Soviet paradrop team has naturally garrisoned the memorial; CAWA19_AG displays the red flag.'],
        ['native-paradrop-plane', 'The original mission creates this transport aircraft. TUG and PDPLANE retain the artwork permitted by the user.'],
    ]) normal += await figure(path.join(base, `opening-native-v3/${density}x-${name}.png`), `${density === 1 ? 'Original' : density + 'X'}: ${caption}`);
    normal += '</details>';
}
let world = '';
for (const density of [4, 2]) {
    world += `<details ${density === 4 ? 'open' : ''}><summary>${density}X map coverage: paused diagnostic reveal</summary>`;
    for (const [name, caption] of [
        ['cawa2a', 'Pentagon composition with newly authored CAWA2A/CAWA2B and retained CAWA2C/CAWA2D.'],
        ['bridgeb1', 'The actual URBAN wooden bridge overlay uses its source-specific HD family.'],
        ['cruise', 'Native cruise ships and tugboats use complete eight-heading families.'],
        ['camov01', 'Neutral urban buildings now admit their existing source/palette-matched artwork in RA2.'],
        ['civ1', 'Original civilian identities use exact accepted artwork, with no recoloring or regenerated donor pixels.'],
    ]) {
        if (compact && density === 2 && !['cawa2a', 'bridgeb1'].includes(name)) continue;
        world += await figure(path.join(base, `coverage-${density}x-v1/${name}.png`), `${density}X: ${caption}`);
    }
    world += '</details>';
}
let states = '<details><summary>Renderer-only state and heading diagnostics</summary><p>These poses do not change building health, ownership or simulation state. The world hash is identical before and after all poses.</p>';
for (const name of compact ? ['cawa2a'] : ['cawa2a', 'cawa2b']) for (const frame of compact ? [2, 3] : [0, 1, 2, 3]) {
    states += await figure(path.join(base, `poses-native-v1/${name}-frame-${frame}.png`),
        `4X renderer-only ${name.toUpperCase()} frame ${frame}: ${['normal', 'damaged', 'occupied', 'rubble'][frame]}.`);
}
for (const name of compact ? [] : ['cruise', 'tug', 'pdplane']) states += await figure(path.join(base, `poses-native-v1/${name}-heading-90.png`),
    `4X renderer-only ${name.toUpperCase()} heading 90. All eight headings were checked; this is one representative pose.`);
states += '</details><details><summary>Explicit reinforcement civilian factory fixtures</summary><p>These four actors are injected only in this isolated diagnostic profile to verify the real renderable factory and GPU material. They are not claimed as naturally triggered reinforcement footage.</p>';
for (const name of compact ? ['civbbp'] : ['civbbp', 'civsf', 'civsfm', 'civstm']) states += await figure(path.join(base, `poses-native-v1/fixture-${name}.png`), `4X explicit ${name.toUpperCase()} factory/material fixture.`);
states += '</details>';
const closure = coverage[1].hdClosure.map(row => `<tr><td>${row.name}</td><td>${row.futureOnly ? 'Initial demand + explicit fixture / real plane arrival' : row.instances.length + ' native instance(s)'}</td><td>2X / 4X</td></tr>`).join('');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M3.1 HD Completion R7</title><style>body{margin:0;background:#101318;color:#e5e8ed;font:18px/1.55 system-ui,sans-serif}main{max-width:1680px;margin:auto;padding:28px}h1{font-size:32px}h2{font-size:25px;margin-top:38px}p{max-width:1100px}details{border:1px solid #3b4655;padding:16px;margin:18px 0}summary{cursor:pointer;font-size:21px;color:#f4cd78}figure{margin:22px 0}img{display:block;max-width:100%;height:auto;background:#080a0e}figcaption{padding:10px 0;color:#b9c4d1;font-size:17px}table{border-collapse:collapse;width:100%;max-width:1200px}td,th{text-align:left;border:1px solid #3b4655;padding:8px 12px}code{font-size:16px;overflow-wrap:anywhere}.pass{color:#92d5ae}</style><main>
<h1>M3.1 HD Completion R7</h1><p class="pass">Native Mac technical checks pass. User visual and physical-input acceptance is pending.</p>
<p>Runtime <code>${opening.sourceHead}</code>. All 29 audited gaps are connected: 23 source/palette-matched accepted reuse identities and six complete new families. Buildings, wooden bridge and cruise ship materials were redrawn to remove low-resolution grain, blocky patches and jagged edges while retaining original design, colors and style. TUG and PDPLANE artwork is retained with the user's permission.</p>
<p>Every image below is embedded in this file. It needs no server, account or adjacent image directory. The native screenshots are unchanged PNGs; captions distinguish normal opening footage, diagnostic reveal, posed artwork and injected fixtures.</p>
<h2>Original opening flag change</h2><p>Retail art declares <code>ActiveAnimGarrisoned=CAWA19_AG</code>. The original Soviet paradrop team occupies the memorial, switching to native frames 33–47. Original, 2X and 4X all observe occupancy by tick 630 and produce world hash <code>${opening.cases[0].control.hash}</code> with identical RNG and mission state at tick 3600. No actors, orders, triggers, health, ownership or garrison state are injected in this opening check.</p>${normal}
<h2>Map coverage</h2><p>Both densities inspect 133 identities and confirm HD publication for all 29 corrected identities before audit-only extra production prewarming. Existing instances use actual object or batch/GPU materials. Fixed world budgets remain 512 MiB at 2X and 1,280 MiB at 4X, identical to R6.</p>${world}
<h2>State coverage</h2><p>Two buildings retain all four original states; the URBAN wooden bridge retains all 18 body frames and native shadow tails. Three VXL families retain all eight headings, source geometry, pivots and ownership controls. Independent 2X/4X exports, source hashes and all 34 new PNG pages pass. Native diagnostics check eight building states, 24 vehicle headings and four separately labeled future civilian fixtures.</p>${states}
<h2>Corrected identities</h2><table><thead><tr><th>Identity</th><th>Native evidence</th><th>Density</th></tr></thead><tbody>${closure}</tbody></table>
<h2>Persistent art requirement and validation</h2><p>The workspace parent <code>AGENTS.md</code>, versioned <code>docs/hd-art-standard.md</code> and the user's requested cross-conversation memory note carry the same standard for future tasks. Rejected masters and early observer attempts remain preserved. The first opening observers required corrections for the runtime house display name and the existing 2X budget; the final three-density matrix passes without a product-code change.</p>
<p>84 focused cases / 1,198 assertions and entry typecheck pass. Full missions, save formats, original media, accepted roads and R6 presentation retain their prior matched evidence. Native Windows is <code>NOT_RUN_ON_THIS_MAC</code>. The browser previously rejected file navigation under its URL policy, so this review is checked through PNG decoding, exact embedded-byte hashes and static HTML inspection.</p></main></html>`;
const file = path.join(output, 'M3.1-HD-Completion-R7-Review.html'); await fs.writeFile(file, html, { flag: 'wx' });
const embedded = [...html.matchAll(/src="data:image\/png;base64,([A-Za-z0-9+/=]+)"/g)].map(match => Buffer.from(match[1], 'base64'));
assert.equal(embedded.length, images.length);
embedded.forEach((bytes, i) => { assert.equal(hash(bytes), images[i].sha256); PNG.sync.read(bytes); });
assert(!/https?:\/\/|<script|<link |src="(?!data:)/.test(html));
const receipt = { status: 'PASS_SELF_CONTAINED_EMBEDDED_NATIVE_PNG_REVIEW', file, bytes: Buffer.byteLength(html), sha256: hash(html),
    sourceHead: opening.sourceHead, images, normalOpeningImages: compact ? 3 : 9, compact, diagnosticAndFixtureDisclosure: true, browserPreview: 'NOT_RETRIED_AFTER_PRIOR_FILE_URL_POLICY_REJECTION' };
await fs.writeFile(path.join(output, 'review.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: receipt.status, file, bytes: receipt.bytes, images: images.length }));
