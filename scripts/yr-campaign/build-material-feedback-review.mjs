import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';

const out = path.resolve(process.argv[2]);
const base = path.resolve('.artifacts/yr-campaign'), images = [], comparisons = [];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const escape = value => String(value).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
async function embed(directory, name, box, referenceWidth) {
    const source = path.join(base, directory, name), original = await fs.readFile(source);
    const png = PNG.sync.read(original), scale = referenceWidth ? png.width / referenceWidth : 1;
    const [left, top, right, bottom] = box.map(value => Math.round(value * scale));
    assert(left >= 0 && top >= 0 && right <= png.width && bottom <= png.height, source);
    const crop = new PNG({ width: right - left, height: bottom - top });
    PNG.bitblt(png, crop, left, top, crop.width, crop.height, 0, 0);
    const bytes = PNG.sync.write(crop);
    images.push({ source, sourceSha256: sha(original), sha256: sha(bytes), bytes: bytes.length,
        crop: [left, top, right, bottom], width: crop.width, height: crop.height, pixelResampling: false });
    return { src: 'data:image/png;base64,' + bytes.toString('base64'), width: crop.width, height: crop.height };
}
for (const density of [4, 2]) {
    for (const [frame, state] of [[0, 'intact'], [1, 'damaged'], [3, 'rubble']]) {
        const box = frame === 3 ? [180, 35, 930, 550] : [400, 140, 1100, 900];
        const referenceWidth = frame === 3 ? 1088 : 1501;
        const before = await embed(`cahead-material-native-${density}x-r2`, `native-${frame}-225.png`, box, referenceWidth);
        const after = await embed(`statue-owner-material-r4-native-${density}x-r1`, `native-${frame}-225.png`, box, referenceWidth);
        assert.deepEqual([before.width, before.height], [after.width, after.height]);
        comparisons.push({ title: `Yuri monument — ${density}X ${state}`, before, after,
            caption: 'Same original placement, native camera and body state. New architectural casting, existing course joints and satin brass. Original owner contours, palette shades and owner paint are preserved exactly. The complete eight-heading head and original separate shadows are retained.' });
    }
}
for (const density of [4, 2]) {
    const before = await embed(`allied06-bridge-approach-r9-${density}x-r1`, 'native-bridge-0-1433.png', [350, 650, 1800, 1320]);
    const after = await embed(`bridge-deck-material-r11-native-${density}x-r1`, 'native-bridge-0-1433.png', [350, 650, 1800, 1320]);
    comparisons.push({ title: `Pier-supported bridge — ${density}X`, before, after,
        caption: 'Allied06 original road, supported deck and bridge joins in one native crop. The revised deck reuses an independently resolved asphalt plane, matched to the selected road color and detail strength. Lane paint, concrete, railings, native geometry, depth and alpha remain unchanged.' });
}
const frames = [];
for (let angle = 0; angle < 360; angle += 45)
    frames.push(await embed('statue-owner-material-r4-native-4x-r1', `native-0-${angle}.png`, [400, 140, 1100, 900], 1501));
const sequences = [{ title: 'Complete original head rotation with revised body — 4X', frames }];
const prompts = [];
const authoring = '.local/source-art/yr-campaign-v1/task-buildings/newurban-caeast02/masters-r2';
for (const name of ['intact', 'damaged', 'rubble']) {
    const file = path.join(authoring, name + '-prompt.txt'), bytes = await fs.readFile(file);
    prompts.push({ file, sha256: sha(bytes), text: bytes.toString('utf8') });
}
const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const markup = comparisons.map((c, i) => `<section data-comparison="${i}"><h2>${escape(c.title)}</h2><p>${escape(c.caption)}</p>
<div class="controls"><label>Old / new split <input type="range" data-split min="0" max="100" value="50"></label><button type="button" data-pixels>Actual pixels</button><output data-split-label>50% old / 50% new</output></div>
<div class="pane"><div class="stack" style="--width:${c.before.width}px;--ratio:${c.before.width}/${c.before.height}">
<img src="${c.before.src}" width="${c.before.width}" height="${c.before.height}" alt="Previous r3: ${escape(c.title)}">
<img class="after" src="${c.after.src}" width="${c.after.width}" height="${c.after.height}" alt="Revised r4: ${escape(c.title)}">
<div class="divider"></div><span class="old-label">Previous r3</span><span class="new-label">Revised r4</span></div></div></section>`).join('\n');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'"><title>RA2 HD — Statue and Bridge Material Review r4</title><style>
*{box-sizing:border-box}body{margin:0;background:#161c23;color:#edf2f6;font:18px/1.6 system-ui,sans-serif}main{max-width:1520px;margin:auto;padding:32px}h1{font-size:38px;line-height:1.2}h2{font-size:27px;line-height:1.3}p{max-width:1080px}section{margin:32px 0;padding:24px;background:#202a35;border-radius:12px}button,input{font:inherit}button{background:#34495e;color:white;border:1px solid #71849a;border-radius:5px;padding:7px 14px;cursor:pointer}input[type=range]{width:190px;vertical-align:middle}.controls{display:flex;align-items:center;flex-wrap:wrap;gap:18px;margin:18px 0}.pane{max-width:100%;max-height:84vh;overflow:auto;background:#10151a}.stack{position:relative;width:min(100%,var(--width));aspect-ratio:var(--ratio);--split:50%}.stack img{display:block;width:100%;height:auto}.stack .after{position:absolute;inset:0;clip-path:inset(0 0 0 var(--split))}.divider{position:absolute;inset:0 auto 0 var(--split);width:2px;background:#ffd66a}.old-label,.new-label{position:absolute;top:8px;padding:2px 8px;background:#111d}.old-label{left:8px}.new-label{right:8px}.actual .stack{width:var(--width)}.sequence img{display:block;width:min(100%,700px);height:auto}.tag{color:#9ecfda}small{color:#c4d0df}details{margin:24px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:15px/1.5 ui-monospace,monospace;padding:18px;background:#10151a}code{overflow-wrap:anywhere}@media(max-width:800px){main{padding:16px}section{padding:16px}h1{font-size:31px}h2{font-size:24px}}
</style></head><body><main><h1>Statue and bridge material review — r4</h1><p class="tag">macOS arm64 · 2026-11-08 · Visual acceptance pending</p>
<p>This material revision addresses the Soviet05 Yuri monument and the independent terrain road surface over bridge piers. Drag a split to compare the previous delivered r3 with the new r4. Each pair uses exact native PNG crops. Actual pixels enables a scrollable view without display scaling.</p>
<p>The statue body now has architectural casting detail, readable existing horizontal courses, reduced broad glossy highlights and satin brass in all original body states. The bridge deck uses the same road color and comparable material detail at the original joins. Old Snow artwork, accepted unit artwork and all original maps remain retained.</p>
<p>Targeted source and native checks qualify registration, original geometry, separate shadows, complete body/head states and independent 2X/4X output. Mission logic is inherited from delivered r3. User visual acceptance, the two previously unreproduced Allied routes and Windows remain separate.</p>
${markup}<section class="sequence" data-sequence="0"><h2>${escape(sequences[0].title)}</h2><div class="controls"><button type="button" data-play>Play frames</button><label>Frame <input type="range" data-slider min="0" max="7" value="0"></label><output>1 / 8</output></div><img data-image src="${frames[0].src}" alt="Eight original head bearings with the revised statue body"><small>Frozen renderer bearings. Playback is a review aid and does not represent the original animation clock.</small></section>
<details><summary>Artwork provenance and final prompt set</summary><p>The three revised statue body masters were produced with the built-in image_gen.imagegen tool. Native registration exports independent 2X and 4X resources. Source file: <code>${authoring}/generation.json</code>.</p>${prompts.map(p => `<h3>${escape(p.file)}</h3><pre>${escape(p.text)}</pre>`).join('')}</details>
<small>${images.length} embedded native images. No external image or network dependency. Source checkpoint: <code>${sourceHead}</code>.</small></main><script>
const sequences=${JSON.stringify(sequences).replaceAll('<', '\\u003c')};
document.querySelectorAll('[data-comparison]').forEach(section=>{const slider=section.querySelector('[data-split]'),stack=section.querySelector('.stack'),label=section.querySelector('[data-split-label]'),button=section.querySelector('[data-pixels]');slider.addEventListener('input',()=>{stack.style.setProperty('--split',slider.value+'%');label.textContent=slider.value+'% old / '+(100-Number(slider.value))+'% new';});button.addEventListener('click',()=>{const actual=section.classList.toggle('actual');button.textContent=actual?'Fit to page':'Actual pixels';});});
document.querySelectorAll('[data-sequence]').forEach(section=>{const data=sequences[Number(section.dataset.sequence)],slider=section.querySelector('[data-slider]'),img=section.querySelector('[data-image]'),output=section.querySelector('output'),play=section.querySelector('[data-play]');let timer;const update=()=>{const n=Number(slider.value);img.src=data.frames[n].src;output.textContent=(n+1)+' / '+data.frames.length;};slider.addEventListener('input',update);play.addEventListener('click',()=>{if(timer){clearInterval(timer);timer=undefined;play.textContent='Play frames';}else{timer=setInterval(()=>{slider.value=String((Number(slider.value)+1)%data.frames.length);update();},250);play.textContent='Pause frames';}});});window.__reviewImageCount=${images.length};
</script></body></html>\n`;
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, html, { flag: 'wx' });
const receipt = { status: 'PASS_SELF_CONTAINED_MATERIAL_COMPARISON_REVIEW_BUILT', sourceHead,
    images, comparisons: comparisons.length, embeddedImages: images.length, prompts: prompts.map(({ text, ...p }) => p),
    imageGeneration: 'BUILT_IN_IMAGE_GEN', pixelResampling: false, externalDependencies: 0,
    file: out, sha256: sha(Buffer.from(html)), bytes: Buffer.byteLength(html), userVisualAcceptance: 'PENDING' };
await fs.writeFile(out + '.json', JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ file: out, images: images.length, bytes: receipt.bytes }));
