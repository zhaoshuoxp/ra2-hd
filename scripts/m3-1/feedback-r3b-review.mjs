import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '../..'), base = path.join(root, '.artifacts/m3-1/feedback-r3b');
const prior = path.join(root, '.artifacts/m3-1/feedback-r3');
const release = JSON.parse(await fs.readFile(path.join(base, 'runtime-final/package.json')));
const sources = [
    [base, 'native-original-final'], [base, 'native-release-cn'], [base, 'native-save-final'], [base, 'native-victory-final'],
    [prior, 'native-release-en'], [prior, 'native-release-tw'], [prior, 'native-defeat-final'],
];
const reports = await Promise.all(sources.map(async ([directory, name]) => {
    const report = JSON.parse(await fs.readFile(path.join(directory, name, 'report.json'))); assert(report.status.startsWith('PASS'), name);
    const metadata = JSON.parse(await fs.readFile(path.join(report.app ?? path.dirname(path.dirname(path.dirname(report.executable))), 'Contents/Resources/app/package.json')));
    return { directory, name, report, sourceHead: metadata.sourceHead };
}));
const images = [
    [base, 'native-release-cn', 'arrows-one-active-faction.png', 'Original hover audio for all three factions; only the hovered faction animates.'],
    [base, 'native-original-final', '05-original-faction-menu.png', 'Original-mode regression: repeated faction hovering, all source frames, edition recovery and mission return complete without a renderer exception.'],
    [base, 'native-release-cn', 'loading-zh-CN-800x600.png', '4:3 loading: the world and locator share the original centered mission plane.'],
    [base, 'native-release-cn', 'loading-zh-CN-1680x720.png', 'Ultrawide loading: the locator remains over the Atlantic United States.'],
    [base, 'native-release-cn', 'loading-complete-component.png', 'Both progress states sample the same glossy cylinder. Amber lighting preserves the original seams, curvature and highlights; the red cable remains above the silver housing.'],
    [base, 'native-victory-final', 'score-victory-800x600.png', 'The apparatus and live text are reduced together to 78%, with the baked opaque background removed.'],
    [base, 'native-victory-final', 'score-victory-1680x720.png', 'Original animated medal, typewriter text, authentic victory voice and cheer. The opening uses the safe frame selector.'],
    [prior, 'native-defeat-final', 'score-defeat-720x900.png', 'Original defeat voice completes without a victory cheer. Unchanged defeat presentation evidence.'],
    [base, 'native-save-final', '01-legacy-campaign-load-list.png', 'The authentic legacy checkpoint appears as a loadable row in an isolated test profile.'],
    [base, 'native-save-final', '02-named-campaign-save-list.png', 'Named campaign saves reuse the bugfix file-list interface and HD artwork.'],
    [base, 'native-save-final', '03-confirm-current-mission-load.png', 'Current-mission loading requires confirmation. Cancellation preserves the paused live world.'],
    [base, 'native-save-final', '04-named-save-restored-after-app-restart.png', 'A real restart restores the exact world, RNG and campaign state through the named-save UI.'],
    [base, 'native-save-final', '06-damaged-save-rejected-with-live-world-preserved.png', 'A damaged checksum is rejected before replacing the live mission.'],
    [base, 'native-release-cn', 'modified-campaign-save-rejected.png', 'Actual trainer changes prevent formal campaign saving.'],
    [prior, 'native-release-en', 'subtitle-en-US.png', 'Unchanged English media-time subtitle track.'],
    [prior, 'native-release-tw', 'subtitle-zh-TW.png', 'Unchanged Traditional Chinese media-time subtitle track.'],
];
const records = [], escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
let figures = '';
for (const [directory, name, filename, caption] of images) {
    const file = path.join(directory, name, filename), bytes = await fs.readFile(file);
    records.push({ file: path.relative(root, file), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
        sourceHead: reports.find(r => r.directory === directory && r.name === name).sourceHead });
    figures += `<figure><img loading="lazy" src="data:image/png;base64,${bytes.toString('base64')}" alt="${escape(caption)}"><figcaption>${escape(caption)}</figcaption></figure>\n`;
}
const summary = { releaseSourceHead: release.sourceHead, captures: reports.map(({ name, report, sourceHead }) => ({ name, status: report.status, sourceHead })), images: records };
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M3.1 Feedback R3b</title>
<style>body{margin:0;background:#101014;color:#eee;font:18px/1.6 system-ui,sans-serif}main{max-width:1600px;margin:auto;padding:28px}h1{font-size:32px}figure{margin:28px 0}img{display:block;width:100%;height:auto;background:#000;border:1px solid #555}figcaption{font-size:16px;color:#d3c6ad;padding:10px 0}pre{font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere;background:#202025;padding:16px}summary{cursor:pointer}</style>
<main><h1>M3.1 Feedback R3b</h1><p>The five corrections cover original faction hover sounds, registered loading geography, a smaller transparent score apparatus, named campaign save/load and consistent glossy loading metal. R3b also fixes an early animation timestamp that could select a negative Original-mode sprite frame. The score opening uses the same safe selector.</p>
<p>All screenshots below are embedded. This file needs no server or adjacent assets. R3b supersedes the retained R3 intermediate. User visual and physical-input acceptance is pending; native Windows is NOT_RUN_ON_THIS_MAC.</p>
<p>Named save tests use the authentic accepted checkpoint in independent profiles and cover restart, exact state restoration, overwrite/delete/cancel and checksum rejection. The frozen combined-source rehearsal passes both campaign and skirmish native save flows; main is unchanged.</p>
<p>Native pointer-lock acquisition is rejected by the automation host; actual DOM clicks and a separately labeled controlled locked-input handoff pass. English, Traditional Chinese and defeat captures are reused for unchanged tracks/presentation, with each source head identified below.</p>
${figures}<details><summary>Capture identity</summary><pre>${escape(JSON.stringify(summary, null, 2))}</pre></details></main></html>`;
const embedded = [...html.matchAll(/src="data:image\/png;base64,([^"]+)"/g)]; assert.equal(embedded.length, records.length);
embedded.forEach((match, index) => assert.equal(createHash('sha256').update(Buffer.from(match[1], 'base64')).digest('hex'), records[index].sha256));
assert(!/<(?:img|video)[^>]+src="(?:https?:|file:|\/)/.test(html));
const file = path.join(base, 'M3.1-Feedback-R3b-Review.html'); await fs.writeFile(file, html, { flag: 'wx' });
await fs.writeFile(path.join(base, 'review.json'), JSON.stringify({ status: 'PASS_ALL_SCREENSHOTS_EMBEDDED_BYTE_IDENTICALLY', file,
    bytes: Buffer.byteLength(html), sha256: createHash('sha256').update(html).digest('hex'), sourceHead: release.sourceHead, images: records,
    captureBuilds: summary.captures, browserPreview: 'Not attempted again after the prior file:// URL-policy rejection; static PNG/hash checks pass.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ file, images: records.length, bytes: Buffer.byteLength(html) }));
