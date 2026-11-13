import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

const output = path.resolve(process.argv[2]);
const revision = process.argv.find(v => v.startsWith('--revision='))?.slice(11) ?? 'r5';
assert(['r5','r6'].includes(revision));
const rigid = revision === 'r6';
const root = '.artifacts/yr-campaign', images = [];
const read = async file => JSON.parse(await fs.readFile(file));
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
async function embed(file, box) {
    const original = await fs.readFile(file);
    let bytes = original;
    if (box) {
        const png = PNG.sync.read(original), [x,y,w,h] = box;
        assert(x >= 0 && y >= 0 && x+w <= png.width && y+h <= png.height);
        const crop = new PNG({ width:w, height:h });
        PNG.bitblt(png, crop, x, y, w, h, 0, 0); bytes = PNG.sync.write(crop);
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    images.push({ file, sha256, sourceSha256:createHash('sha256').update(original).digest('hex'),
        bytes:bytes.length, crop:box ?? null, resampled:false });
    return { src:'data:image/png;base64,'+bytes.toString('base64'), name:path.basename(file) };
}
const points = [0,1,2,3,4,5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,86];
const sequences = [];
for (const density of [4,2]) {
    const directory = `${root}/castle-continuity-all87-native-${density}x-r2`;
    const report = await read(directory+'/report.json');
    assert(report.status.startsWith('PASS_')); assert.equal(report.frames.length,87);
    const frames = [];
    for (const frame of points) frames.push(await embed(`${directory}/diagnostic-native-frame-${frame}.png`));
    sequences.push({ title:`Revised collapse — ${density}X native inspection`,
        caption:'The slider includes the first six consecutive frames and later collapse stages. All 87 source slots, original shadows, fixed pivots and natural animation removal passed separately. These are frozen renderer inspections.', frames });
}
const oldFrames = [];
for (let frame = 0; frame < 6; frame++) oldFrames.push(await embed(`${root}/castle-footing-all87-native-4x-r3/diagnostic-native-frame-${frame}.png`));
sequences.push({ title:'Previous collapse — first six frames',
    caption:'Retained r3 native evidence shows the changing roof and wall shapes that caused the reported flicker.', frames:oldFrames });
const combat = await read(`${root}/castle-continuity-combat-native-4x-r1/report.json`);
assert.equal(combat.status,'PASS_NATIVE_REAL_COMBAT_CASTLE_DESTRUCTION_HD_COLLAPSE_AND_ORIGINAL_VICTORY');
const battleFiles = (await fs.readdir(`${root}/castle-continuity-combat-native-4x-r1`))
    .filter(file => /^native-combat-collapse-\d+\.png$/.test(file)).sort();
const battle = [];
for (const file of battleFiles) battle.push(await embed(`${root}/castle-continuity-combat-native-4x-r1/${file}`));
sequences.push({ title:'Actual Kirov destruction and ending — 4X',
    caption:'Ordinary attacks from the legitimate post-nuclear Soviet07 save create the collapse once and reach the original victory. Capture intervals vary; the slider is an inspection sequence.', frames:battle });
const figures = [];
async function figure(title, caption, file, crop) { figures.push({ title, caption, image:await embed(file,crop) }); }
await figure('Pause view — objectives only', 'The briefing now contains the four source mission objectives. It does not append notifications or dialogue history.',
    `${root}/pause-objectives-only-native-r1/native-pause-objectives-only.png`);
await figure('Restored Moon material and tank proportions — 4X',
    rigid ? 'Original Soviet06 tanks cross the same Moon slope. The accepted flat artwork keeps all roof, side and track proportions. The closest native projected rotation supplies the bearing. Lossless native crop.'
        : 'Original Soviet06 tanks cross a real Moon slope. The material selection exactly matches the earlier r1/r2 delivery. Tank width and height changes match the original voxel hull; the screenshot is a lossless native crop.',
    `${root}/${rigid ? 'ground-rigid-screen-native-4x-r2' : 'ground-volume-native-4x-r2'}/native-original-tanks-on-moon-ramp.png`, [950,750,430,330]);
await figure('Independent Moon slope check — 2X', rigid ? 'The independent 2X runtime keeps the same complete painted shape and corrected native screen bearing.' : 'The independent 2X runtime also retains the original relative projected hull volume.',
    `${root}/${rigid ? 'ground-rigid-screen-native-2x-r2' : 'ground-volume-native-2x-r2'}/native-original-tanks-on-moon-ramp.png`, [950,750,430,330]);
if (rigid) await figure('Slope projection follow-up',
    'Left: rejected flattened projection. Center: accepted thickness with the first bearing. Right: revised bearing with the same preserved proportions. These are native crops from the same original movement orders.',
    `${root}/feedback-20261109-diagnostics/ground-r6-direction-comparison-r2.png`);
// Display the original palette reference with index zero transparent. RGB and
// resolution remain original; no enlarged pixels are presented as new HD art.
const sourcePath = '.local/source-art/yr-campaign-v1/time-machine/original/source.json';
const source = (await read(sourcePath)).sources[0], first = source.frames[0];
const sourceDir = path.join(path.dirname(sourcePath),'native');
const png = PNG.sync.read(await fs.readFile(path.join(sourceDir,source.member+'-0.png')));
const indices = await fs.readFile(path.join(sourceDir,source.member+'-0.index'));
assert.equal(indices.length,png.width*png.height);
for (let i=0;i<indices.length;i++) if (indices[i]===0) png.data[i*4+3]=0;
const reference = path.join(path.dirname(output),'catime01-original-reference.png');
await fs.mkdir(path.dirname(output),{recursive:true}); await fs.writeFile(reference,PNG.sync.write(png));
await figure('Allied01 time machine — original source',
    'The original cgtime01.shp frame contains fixed red palette entries 106 and 107 outside ownership indices 16–31. Red strips remain red when the house color is blue. Original-resolution palette reference.',reference);
await figure('Allied01 time machine — retained HD', 'The HD asset keeps the original fixed red details. The source check does not require a recolor.',
    `${root}/time-machine01-native-states-4x-r1/diagnostic-native-frame-0.png`);
const groups = sequences.map((s,i) => `<section data-sequence="${i}"><h2>${escape(s.title)}</h2><p>${escape(s.caption)}</p><div class="controls"><button data-play>Play frames</button><input data-slider type="range" min="0" max="${s.frames.length-1}" value="0" aria-label="Animation frame"><output>1 / ${s.frames.length}</output></div><img data-image src="${s.frames[0].src}" alt="${escape(s.title)}"></section>`).join('');
const staticMarkup = figures.map(f => `<figure><h2>${escape(f.title)}</h2><img src="${f.image.src}" alt="${escape(f.title)}"><figcaption>${escape(f.caption)}</figcaption></figure>`).join('');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; script-src 'unsafe-inline'; style-src 'unsafe-inline'"><title>RA2 HD — Campaign Feedback ${revision}</title><style>:root{color-scheme:dark;font:18px/1.6 system-ui,sans-serif;background:#111820;color:#e8eff5}body{max-width:1280px;padding:28px;margin:auto}h1{font-size:36px;line-height:1.2}h2{font-size:26px;line-height:1.35}section,figure{margin:24px 0;padding:24px;background:#1c2732;border:1px solid #435467;border-radius:10px}img{display:block;max-width:100%;height:auto;margin:auto}figcaption{margin-top:14px;color:#c7d5df}.controls{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin:18px 0}button,input{font:inherit}button{padding:8px 15px;border:1px solid #7899b5;border-radius:6px;background:#30475b;color:white}input{max-width:65vw}small{color:#bacad6}@media(max-width:750px){body{padding:12px}section,figure{padding:16px}h1{font-size:30px}h2{font-size:23px}}</style><main><h1>Yuri's Revenge — Campaign Feedback ${revision}</h1><p>2026-11-09 · macOS arm64 · Current visual review pending</p><section><h2>Continue testing</h2><p>Quit the previous game, extract the ${revision} ZIP and open <strong>Red Alert 2 HD.app</strong>. Existing campaign saves and settings use the same profile. This revision updates the pause display, collapse animation and ground-vehicle slope rendering, and restores the previous Moon material.</p><p>Your acceptance of the other delivered items is recorded. The accepted statue, supported bridge, old snow and construction artwork remain in use. The fixed red on the Allied01 time machine is verified against the original palette.</p><small>The images below are embedded. The page works offline. Original source references are labeled separately from native game captures. Windows and physical 8/16 GiB validation remain unrun on this Mac.</small></section>${groups}${staticMarkup}</main><script>const sequences=${JSON.stringify(sequences).replaceAll('<','\\u003c')};document.querySelectorAll('[data-sequence]').forEach(section=>{const data=sequences[Number(section.dataset.sequence)],slider=section.querySelector('[data-slider]'),img=section.querySelector('[data-image]'),output=section.querySelector('output'),play=section.querySelector('[data-play]');let timer;const update=()=>{const n=Number(slider.value);img.src=data.frames[n].src;output.textContent=(n+1)+' / '+data.frames.length;};slider.addEventListener('input',update);play.addEventListener('click',()=>{if(timer){clearInterval(timer);timer=undefined;play.textContent='Play frames';}else{timer=setInterval(()=>{slider.value=String((Number(slider.value)+1)%data.frames.length);update();},160);play.textContent='Pause frames';}});});window.__reviewImageCount=${images.length};</script></html>\n`;
await fs.writeFile(output,html,{flag:'wx'});
await fs.writeFile(output+'.json',JSON.stringify({ status:'PASS_SELF_CONTAINED_CURRENT_FEEDBACK_REVIEW_BUILT',
    embeddedImages:images.length, sequences:sequences.length, images },null,2)+'\n');
console.log(JSON.stringify({ file:output, bytes:Buffer.byteLength(html), images:images.length }));
