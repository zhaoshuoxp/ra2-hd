import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '../..'), evidence = path.join(root, '.artifacts/m3-2');
const out = path.resolve(process.argv[2]);
const images = [];
async function figure(file, title, qualification) {
    const bytes = await fs.readFile(path.join(evidence, file));
    images.push({ file, sha256: createHash('sha256').update(bytes).digest('hex'), title, qualification });
    return `<figure><img loading="lazy" alt="${title}" src="data:image/png;base64,${bytes.toString('base64')}"><figcaption><b>${title}</b><br>${qualification}</figcaption></figure>`;
}
const art = await Promise.all([
    figure('native-lifecycle-r4/04-second-mission-hd-loading.png', 'Soviet 02 loading page', 'Native full page. The three-photo material direction is user approved; final full-page acceptance is pending.'),
    figure('vlad-native-loaded-board.png', 'VLAD: all eight loaded headings at 4X', 'Paused diagnostic poses assembled without image rescaling. Original placement, logical geometry and pivots are retained.'),
    figure('native-art-r2-4x/empty-90-blue.png', 'VLAD: empty launchers and blue ownership', 'Explicit paused state/ownership inspection; not an original mission event.'),
    figure('native-art-r2-2x/loaded-90-red.png', 'Independent 2X VLAD export', 'Actual native 2X binding. The complete family includes loaded, empty and source-matched accepted DMISL parts.')
]);
const mission = await Promise.all([
    figure('native-catalog-r3/catalog-1280-800.png', 'Mission selection', 'Soviet 01 and 02 are directly selectable; later missions remain unavailable. Three-language/native layout checks pass.'),
    figure('native-mission-r15/original-victory-score.png', 'Authentic Soviet 02 victory', 'Original mode, ordinary assisted production/capture/combat orders and accelerated simulation. No rules, triggers, HP or result injection.'),
    figure('native-mission-r16-4x/s02_p02e-original-trigger.png', 'Original Vlad transmission at 4X', 'All three original action-100 movies decoded video/audio in the real radar. This assisted 4X run later lost its construction yard; it is not a second victory claim.'),
    figure('native-continuation-r3/03-second-mission-fresh-world-after-first-victory.png', 'First victory continues into the second mission', 'Accepted first-mission commands replay to the original victory, followed by the actual Continue button and a fresh Normal Soviet 02 world.'),
    figure('native-checkpoint-r2/03-original-mcv-progression-after-restore.png', 'Mission progression after app restart and load', 'Exact saved world/RNG/mission/teams and another 300 ticks match; original MCV ownership handoff then continues.')
]);
const specialized = await figure('native-lifecycle-r4/07-radar-restored.png', 'Radar restored after queue/skip/cancel exercise',
    'Explicit presentation-only fixture: repeated requests, queue, skip and cancellation. It does not manufacture or replace original mission triggers.');
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M3.2 local review</title>
<style>body{margin:0;background:#151311;color:#e8dfd0;font:18px/1.5 system-ui,sans-serif}main{max-width:1320px;margin:32px auto;padding:0 24px}h1{font-size:34px}h2{margin-top:40px;color:#efbb66}figure{margin:24px 0;background:#090909;border:1px solid #69442d}img{display:block;max-width:100%;height:auto;margin:auto}figcaption{padding:14px 18px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #69442d;text-align:left;padding:10px}details{margin:24px 0}summary{cursor:pointer;color:#efbb66;font-size:23px}</style>
<main><h1>M3.2 first batch — local Mac review</h1><p>RA2 Soviet 01 and 02 are playable. Later Soviet, Allied and YR missions remain unavailable. No remote publication is included.</p>
<table><tr><th>Area</th><th>Status</th></tr><tr><td>Technical evidence</td><td>Original objective-chain victory and defeat, three difficulty parameters/flags, direct launch, continuation, retry, save/restart, radar media and density comparisons are retained separately.</td></tr><tr><td>User-approved samples</td><td>VLAD material/line direction; three loading photographs.</td></tr><tr><td>Full batch visual acceptance</td><td>Pending user review. Technical tests do not replace visual acceptance.</td></tr><tr><td>Platform</td><td>Native Mac arm64. Windows: NOT_RUN_ON_THIS_MAC.</td></tr></table>
<h2>New artwork</h2>${art.join('')}<h2>Actual mission and application views</h2>${mission.join('')}<h2>Specialized presentation scenario</h2>${specialized}
<details><summary>Behavioral limits and maintenance</summary><p>Vanilla recruitment scan cadence, exact target/gathering-cell tie breaks and enemy-choice scheduling remain reconstruction limits. No unknown opcode is silently skipped. Original media is used; no external HD movie replacement is admitted. Speech resumes by restarting the current utterance; radar movies resume their saved playback time.</p><p>Formal resources: campaign/ra2/sov02t and hd-packs/campaign-sov02-vlad-vxl/loaded-empty-r3-{2,4}x. Existing accepted artwork is reused by original source, palette and geometry identity. Ordinary assisted scripts use legal game actions; posed/revealed inspection scenes are labeled above.</p></details></main></html>`);
await fs.writeFile(out.replace(/\.html$/i, '.json'), JSON.stringify({ schema: 'm3-2-self-contained-review-v1', images }, null, 2) + '\n');
console.log(JSON.stringify({ out, images: images.length }));
