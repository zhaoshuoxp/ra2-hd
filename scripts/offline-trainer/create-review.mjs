import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(process.argv[2]);
const read = async file => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
const matrixDir = process.argv[3] ?? 'matrix';
const receipt = await read('final-receipt.json'), matrix = await read(`${matrixDir}/matrix.json`);
assert.equal(receipt.status, 'IMPLEMENTED_TECHNICAL_PASS_USER_REVIEW_PENDING');
assert.equal(matrix.status, 'PASS_10_CASES');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const results = [];
for (const row of matrix.cases) results.push({ ...row, result: await read(`${matrixDir}/${row.name}/result.json`) });
const figures = [];
for (const [file, caption] of [
    ['ra2-allied-temperate/trainer-toolbar.png', 'RA2 Allied: selection retained while opening target controls'],
    ['ra2-allied-temperate/trainer-paused-options.png', 'Paused Options: queued actions wait for a resumed tick'],
    ['ra2-allied-temperate/trainer-main-options.png', 'Main menu Options: shared master, edition-scoped configuration'],
    ['ra2-soviet-temperate/trainer-fullscreen.png', 'RA2 Soviet: compact toolbar in native macOS fullscreen'],
    ['yr-yuri-temperate/trainer-features.png', 'YR Yuri: native gameplay with existing HD / Original assets'],
    ['yr-yuri-snow/trainer-toolbar.png', 'YR Yuri snow: bounded UI, selection and effects smoke coverage'],
]) {
    const bytes = await fs.readFile(path.join(root, matrixDir, file));
    figures.push(`<figure><img loading="lazy" src="data:image/png;base64,${bytes.toString('base64')}" alt="${escape(caption)}"><figcaption>${escape(caption)}</figcaption></figure>`);
}
const checklist = [
    'Launch the review app with its companion resource folder. Choose RA2, then YR; the master starts OFF in each untouched profile.',
    'Enable Offline trainer in Options. Confirm the bar does not obstruct credits, minimap, sidebar or bottom game controls.',
    'Use mouse controls to set/add money and a minimum, change supply, heal/protect/unprotect, clear protection and explicitly capture a target. Check labels and selection retention.',
    'Try building/unit acceleration, technology and distance placement. Check progress clocks, blocked exits and normal payment.',
    'Ready owned powers and use normal targeting. Verify active effects, power locks and repeated charging feel correct.',
    'Test Ctrl+Shift shortcuts and remapping without a numeric keypad. Confirm text entry, IME, repeated keys and app switching never issue unintended actions.',
    'Pause, queue a command, then resume; repeat with OFF/reset before resuming. Confirm cursor recovery and no stray game orders.',
    'Restart or switch RA2 -> YR -> RA2. Only preferences should persist; no effects, targets or queued actions should carry over.',
    'Compare windowed/fullscreen and 1080p/1440p/4K output. Check native-size readability, audio and physical mouse comfort.',
    'Approve the combined functional/UI result or report corrections in the same execution task. Automated PASS is not human acceptance.',
];
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RA2 HD — Offline trainer review</title>
<style>body{font:18px/1.55 system-ui,sans-serif;color:#e5e7dc;background:#141d18;margin:0}main{max-width:1120px;margin:auto;padding:32px}h1{font-size:36px}h2{font-size:26px;margin-top:36px}a{color:#dfc881}code,pre{font-family:ui-monospace,monospace}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;background:#0b110e;padding:16px}table{border-collapse:collapse;width:100%;font-size:16px}th,td{border:1px solid #56614c;padding:9px;text-align:left}th{background:#334132}.status{padding:14px;border:1px solid #ad9656;color:#f2df97}figure{margin:24px 0}img{width:100%;border:1px solid #56614c}figcaption{color:#b8c1ac;font-size:16px}label{display:block;padding:10px 0}input{width:18px;height:18px;margin-right:10px}summary{cursor:pointer;padding:12px;background:#29332a}details{margin:12px 0}.muted{color:#c1c7ba}</style>
<main><h1>Offline built-in trainer · Task F</h1><p class="status">IMPLEMENTED_TECHNICAL_PASS_USER_REVIEW_PENDING</p>
<p>Native RA2 / Yuri’s Revenge trainer on the accepted integrated foundation. Only Task F was implemented. No A–E work, new artwork, external trainer executable, networking or campaign changes are included.</p>
<h2>Launch and scope</h2><p>Open <code>${escape(receipt.app)}</code>. Keep its resource folder beside the application. The isolated review profile is created inside the package folder. Use Options → Offline trainer; the default is OFF in each edition.</p>
<p>OFF/reset removes sustained effects and pending actions. Completed money, healing, captures, construction and explored terrain remain. Modified matches cannot save replays; ordinary unmodified recording remains available. Production durations use 15 simulation ticks per second, so game speed changes elapsed wall time.</p>
<h2>Verified matrix</h2><p>Five temperate combinations receive full feature, queue, ownership, repeated-power and input checks. Five snow combinations receive bounded UI, selection and effects smoke checks. Native scripted fixtures and automated UI events are not physical user testing.</p>
<table><tr><th>Edition / faction</th><th>Theater</th><th>Scope</th><th>Result</th></tr>${matrix.cases.map(row => `<tr><td>${escape(row.edition.toUpperCase()+' / '+row.faction)}</td><td>${row.snow?'Snow':'Temperate'}</td><td>${row.snow?'UI / selection / effects smoke':'Full semantics + input'}</td><td>${escape(row.status)}</td></tr>`).join('')}</table>
<h2>Review images</h2>${figures.join('')}
<h2>Manual acceptance checklist</h2><p class="muted">Windows: NOT RUN. Physical mouse/keyboard/IME/panel/speaker checks: UNVERIFIED. Review the combined result once; no per-button approval is required.</p>${checklist.map(item => `<label><input type="checkbox">${escape(item)}</label>`).join('')}
<h2>Identity and evidence</h2><details><summary>Final build, resources and regression receipt</summary><pre>${escape(JSON.stringify(receipt,null,2))}</pre></details>${results.map(row=>`<details><summary>${escape(row.name)} — detailed observed results</summary><pre>${escape(JSON.stringify({trainer:row.result.trainer,lifecycle:row.result.trainerLifecycle,errors:row.result.errors},null,2))}</pre></details>`).join('')}
<p>This file is self-contained: all images and results are embedded. No local server or network connection is required.</p></main></html>`;
await fs.writeFile(path.join(root, 'offline-trainer-review.html'), html);
console.log(path.join(root, 'offline-trainer-review.html'));
