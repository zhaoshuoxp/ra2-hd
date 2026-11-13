import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '../..'), batch = process.env.M31_REVIEW_BATCH ?? 'feedback-r2';
const label = process.env.M31_REVIEW_LABEL ?? 'R2', base = path.join(root, '.artifacts/m3-1', batch);
const directories = process.argv.slice(2);
assert.equal(directories.length, 5, 'Provide the passing Chinese, English, Traditional, victory and defeat evidence directories');
const reports = await Promise.all(directories.map(async directory => {
    const report = JSON.parse(await fs.readFile(path.resolve(base, directory, 'report.json')));
    assert(report.status.startsWith('PASS_'), directory); assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    return report;
}));
const images = [
    [directories[0], 'selection-1680x720.png', 'Faction selection at 21:9: newly generated frameless background fills the panel; accepted insignias keep their proportions.'],
    [directories[0], 'selection-720x900.png', 'Faction selection: portrait viewport.'],
    [directories[0], 'arrows-one-active-faction.png', 'Native HD arrow facets; only the faction under the pointer animates after clicking an unavailable faction.'],
    [directories[0], 'loading-zh-CN-1680x720.png', 'Real mission loading at 21:9. Loading is held and set to 62% to inspect the complete component.'],
    [directories[0], 'loading-zh-CN-720x900.png', 'Real mission loading in portrait. A generated wide background replaces the inset outer frame; mission content keeps its proportions.'],
    [directories[0], 'loading-complete-component.png', 'Complete native loading component, including both silver ornaments, ribbed grips, empty socket and separate luminous fill.'],
    [directories[0], 'subtitle-zh-CN.png', 'Simplified Chinese caption rendered as live native text over the original movie.'],
    [directories[1], 'subtitle-en-US.png', 'English caption follows the language selected through Settings.'],
    [directories[2], 'subtitle-zh-TW.png', 'Traditional Chinese caption follows the language selected through Settings.'],
    [directories[0], 'game-information-upper-right.png', 'Mission progress and speech match the native upper-left message font, player color and UI scale, aligned to the upper-right map edges.'],
    [directories[0], 'trainer-clickable-modified-campaign.png', 'Real trainer click adds 10,000 local credits, marks the campaign modified and rejects formal checkpoint capture. No mouse event reaches the world canvas.'],
    [directories[3], 'score-victory-1680x720.png', 'Genuine source-triggered victory after assisted replay of the accepted native-input journal. Original medal and text animation remain; campaign accomplishment voice and cheer ended normally.'],
    [directories[4], 'score-defeat-720x900.png', 'Genuine original defeat condition after ordinary assisted commands. Mission failed voice ended; there is no victory cheer.'],
];
const records = [];
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
async function embedded(file) {
    const bytes = await fs.readFile(file), sha256 = createHash('sha256').update(bytes).digest('hex');
    records.push({ path: path.relative(root, file), bytes: bytes.length, sha256 });
    return `data:image/png;base64,${bytes.toString('base64')}`;
}
const original = await embedded(path.join(root, '.artifacts/m3-1/interface-hd/source/progressHousing-0.png'));
let figures = '';
for (const [directory, file, caption] of images) figures += `<figure><img loading="lazy" src="${await embedded(path.resolve(base, directory, file))}" alt="${escape(caption)}"><figcaption>${escape(caption)}</figcaption></figure>\n`;
const metadata = JSON.parse(await fs.readFile(path.join(base, process.env.M31_REVIEW_RUNTIME ?? 'runtime-release', 'package.json')));
const captureBuilds = await Promise.all(reports.map(async report => ({ app: report.app,
    sourceHead: JSON.parse(await fs.readFile(path.join(report.app, 'Contents/Resources/app/package.json'))).sourceHead })));
const summary = { releaseSourceHead: metadata.sourceHead, captureBuilds,
    statuses: reports.map(({ status, requestedLanguage, pointerLock, lockedInputFixture, mode }) => ({ status, requestedLanguage, pointerLock, lockedInputFixture, mode })), images: records };
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M3.1 Feedback ${label} - Embedded Native Review</title><style>
body{margin:0;background:#101014;color:#eee;font:18px/1.6 system-ui,sans-serif}main{max-width:1600px;margin:auto;padding:28px}h1{font-size:32px}h2{font-size:25px}figure{margin:28px 0}img{display:block;width:100%;height:auto;background:#000;border:1px solid #555}figcaption{font-size:16px;color:#d3c6ad;padding:10px 0}pre{font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere;background:#202025;padding:16px}.reference{image-rendering:pixelated}summary{cursor:pointer}
</style><main><h1>M3.1 Feedback ${label}</h1><p>Actual packaged Mac captures are embedded below. Generated wide background plates replace the former nested frames. Existing insignias, mission content and animated medal retain their aspect ratios. This file can be copied alone; it needs no server or adjacent assets. The evidence section identifies each capture build separately from release source <code>${metadata.sourceHead}</code>. User visual and physical-input acceptance remains pending. Native Windows: NOT_RUN_ON_THIS_MAC.</p>
<p>Native DOM trainer clicks are verified. The automation host rejects native pointer lock; the locked-input handoff is a separately labeled controlled state fixture. Physical lock acquisition and mouse feel remain manual checks.</p>
<p>Subtitles use the locally supplied original Chinese timing/text. Traditional uses ICU conversion; English is a translation of that track and is not presented as a verbatim audio transcription. Only prepared Mission 01 media are included.</p>
<h2>Original complete housing reference</h2><img class="reference" src="${original}" alt="Original complete progress housing"><p>The reconstructed native component below includes the silver end caps and black grips as well as the orange progress fill. The source and generated master are preserved separately.</p>
${figures}<details><summary>Evidence identity and limits</summary><pre>${escape(JSON.stringify(summary, null, 2))}</pre></details></main></html>`;
const file = path.join(base, `M3.1-Feedback-${label}-Review.html`); await fs.writeFile(file, html, { flag: 'wx' });
const source = await fs.readFile(file, 'utf8'), embeddedImages = [...source.matchAll(/src="data:image\/png;base64,([^"]+)"/g)];
assert.equal(embeddedImages.length, records.length);
embeddedImages.forEach((match, index) => assert.equal(createHash('sha256').update(Buffer.from(match[1], 'base64')).digest('hex'), records[index].sha256));
assert(!/<(?:img|video)[^>]+src="(?:https?:|file:|\/)/.test(source));
await fs.writeFile(path.join(base, 'review.json'), JSON.stringify({ status: 'PASS_ALL_NATIVE_SCREENSHOTS_EMBEDDED_BYTE_IDENTICALLY',
    file, bytes: Buffer.byteLength(html), sha256: createHash('sha256').update(html).digest('hex'), sourceHead: metadata.sourceHead, images: records }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ file, images: records.length, bytes: Buffer.byteLength(html) }));
