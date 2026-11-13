import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '../..'), base = path.join(root, '.artifacts/m3-1/feedback-r3');
const read = async file => JSON.parse(await fs.readFile(path.join(base, file)));
const release = await read('runtime-r5/package.json');
const cases = ['native-release-cn', 'native-release-en', 'native-release-tw', 'native-save-final', 'native-victory-final', 'native-defeat-final'];
const reports = await Promise.all(cases.map(async directory => {
    const report = await read(directory + '/report.json'); assert(report.status.startsWith('PASS'), directory);
    const metadata = JSON.parse(await fs.readFile(path.join(report.app, 'Contents/Resources/app/package.json')));
    return { directory, report, sourceHead: metadata.sourceHead };
}));
assert.equal(execFileSync('git', ['diff', '--name-only', '86df6369340b90407462724d1c9d602fde8286d7', release.sourceHead,
    '--', 'src', 'desktop', 'public'], { cwd: root, encoding: 'utf8' }).trim(), 'src/gui/campaign/CampaignChrome.tsx');
const images = [
    ['native-release-cn', 'arrows-one-active-faction.png', 'Original faction hover audio plays for Allies, Boot Camp and Soviets. Only the currently hovered faction animates.'],
    ['native-release-cn', 'loading-zh-CN-800x600.png', '4:3 loading page. The world map and retail locator share the original mission coordinate plane.'],
    ['native-release-cn', 'loading-zh-CN-1680x720.png', 'Ultrawide loading page. The locator remains over the Atlantic United States as the viewport changes.'],
    ['native-release-cn', 'loading-complete-component.png', 'The amber-lit and unlit areas use the exact same cylinder texture, seams, curvature and highlights. The red cable remains visible above the silver housing.'],
    ['native-victory-final', 'score-victory-800x600.png', 'The original apparatus and live text are reduced together to 78%. The baked opaque plate is removed.'],
    ['native-victory-final', 'score-victory-1680x720.png', 'Original animated medal and typewriter text on the wide backdrop. Actual source-triggered victory, accomplishment voice and cheer are verified.'],
    ['native-defeat-final', 'score-defeat-720x900.png', 'Original failure path and completed Mission Failed voice. There is no victory cheer.'],
    ['native-save-final', '01-legacy-campaign-load-list.png', 'Legacy manual saves appear as a loadable row. This test uses the authentic accepted checkpoint in an isolated profile.'],
    ['native-save-final', '02-named-campaign-save-list.png', 'Named campaign saves reuse the bugfix file-list UI and HD Soviet artwork.'],
    ['native-save-final', '03-confirm-current-mission-load.png', 'Loading during an active mission requires confirmation; cancellation preserves the live world.'],
    ['native-save-final', '04-named-save-restored-after-app-restart.png', 'A real application restart restores the exact tick, world, RNG and campaign state through the named-save UI.'],
    ['native-save-final', '06-damaged-save-rejected-with-live-world-preserved.png', 'A damaged checksum is rejected before replacing the live mission.'],
    ['native-release-cn', 'modified-campaign-save-rejected.png', 'A mission modified by actual trainer clicks cannot create a formal campaign save.'],
    ['native-release-en', 'subtitle-en-US.png', 'English cinematic subtitles remain synchronized to the original media time.'],
    ['native-release-tw', 'subtitle-zh-TW.png', 'Traditional Chinese cinematic subtitles follow the selected language.'],
];
const records = [], escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
let figures = '';
for (const [directory, filename, caption] of images) {
    const bytes = await fs.readFile(path.join(base, directory, filename));
    const record = { file: directory + '/' + filename, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
        sourceHead: reports.find(row => row.directory === directory).sourceHead };
    records.push(record);
    figures += `<figure><img loading="lazy" src="data:image/png;base64,${bytes.toString('base64')}" alt="${escape(caption)}"><figcaption>${escape(caption)}</figcaption></figure>\n`;
}
const preparation = await read('integration/preparation.json');
const summary = { releaseSourceHead: release.sourceHead, captures: reports.map(({ directory, report, sourceHead }) => ({
    directory, status: report.status, sourceHead, pointerLock: report.pointerLock, fixture: report.fixture })),
    reuse: 'Score and save captures use 86df6369. The only later runtime change bounds the loading-material filter; all score, save and simulation sources are identical. Final f203ec2e captures verify that filter, localized media, actual trainer changes and formal save rejection.',
    integration: { status: preparation.status, resolvedHead: preparation.resolvedHead, canonicalMainChanged: false }, images: records };
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M3.1 Feedback R3</title>
<style>body{margin:0;background:#101014;color:#eee;font:18px/1.6 system-ui,sans-serif}main{max-width:1600px;margin:auto;padding:28px}h1{font-size:32px}figure{margin:28px 0}img{display:block;width:100%;height:auto;background:#000;border:1px solid #555}figcaption{font-size:16px;color:#d3c6ad;padding:10px 0}pre{font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere;background:#202025;padding:16px}summary{cursor:pointer}</style>
<main><h1>M3.1 Feedback R3</h1><p>All screenshots are embedded below. This file works by itself without a server or adjacent image files. The five corrections cover original faction hover sounds, loading-map registration, a smaller transparent score apparatus, named campaign save/load and consistent glossy loading metal.</p>
<p>The real campaign save/load tests include a complete application restart, overwrite/delete confirmations, cancellation, corrupt-save rejection and preservation of the legacy manual slot. The independent merge rehearsal passes both campaign and skirmish native save flows; canonical main is unchanged.</p>
<p>User visual and physical-input acceptance is pending. Native Windows: NOT_RUN_ON_THIS_MAC. The automation host rejects native pointer-lock acquisition; actual DOM clicks pass, and the locked-input handoff is a separately labeled controlled-state fixture.</p>
${figures}<details><summary>Capture identity and verification scope</summary><pre>${escape(JSON.stringify(summary, null, 2))}</pre></details></main></html>`;
const file = path.join(base, 'M3.1-Feedback-R3-Review.html');
const embedded = [...html.matchAll(/src="data:image\/png;base64,([^"]+)"/g)]; assert.equal(embedded.length, records.length);
embedded.forEach((match, index) => assert.equal(createHash('sha256').update(Buffer.from(match[1], 'base64')).digest('hex'), records[index].sha256));
assert(!/<(?:img|video)[^>]+src="(?:https?:|file:|\/)/.test(html));
await fs.writeFile(file, html, { flag: 'wx' });
await fs.writeFile(path.join(base, 'review.json'), JSON.stringify({ status: 'PASS_ALL_SCREENSHOTS_EMBEDDED_BYTE_IDENTICALLY', file,
    bytes: Buffer.byteLength(html), sha256: createHash('sha256').update(html).digest('hex'), sourceHead: release.sourceHead, images: records, captureBuilds: summary.captures }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ file, images: records.length, bytes: Buffer.byteLength(html) }));
