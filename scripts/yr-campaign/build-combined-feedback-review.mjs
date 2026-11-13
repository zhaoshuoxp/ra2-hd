import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

const out=path.resolve(process.argv[2]), base='.artifacts/yr-campaign';
const checkpoint=JSON.parse(await fs.readFile('docs/yr-campaign-feedback-checkpoint-20261108-r3.json'));
assert.equal(checkpoint.status,'COMBINED_FEEDBACK_TECHNICALLY_QUALIFIED_USER_REVIEW_PENDING');
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), images=[];
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
async function embed(directory,file,crop){
    const source=path.join(base,directory,file), original=await fs.readFile(source);
    let bytes=original, rectangle;
    if(crop){
        const png=PNG.sync.read(original),scale=crop.relativeWidth?png.width/crop.relativeWidth:1;
        rectangle=crop.box.map(value=>Math.round(value*scale));
        const [left,top,right,bottom]=rectangle;
        assert(left>=0&&top>=0&&right<=png.width&&bottom<=png.height&&right>left&&bottom>top,source);
        const result=new PNG({width:right-left,height:bottom-top});
        PNG.bitblt(png,result,left,top,right-left,bottom-top,0,0);
        bytes=PNG.sync.write(result);
    }
    const sha256=createHash('sha256').update(bytes).digest('hex');
    images.push({source,sourceSha256:createHash('sha256').update(original).digest('hex'),sha256,bytes:bytes.length,
        crop:rectangle??null,pixelResampling:false});
    return {src:'data:image/png;base64,'+bytes.toString('base64'),name:file,source,sha256};
}
async function sequence(title,caption,directory,files,crop){
    const frames=[];for(const file of files)frames.push(await embed(directory,file,crop));
    return {title,caption,frames};
}
const waterFiles=Array.from({length:36},(_,i)=>`native-water-frame-${String(i).padStart(2,'0')}.png`);
const sequences=[
    await sequence('Water dinosaur — previous behavior','Before: the aquatic actor could enter land Idle1/Idle2 poses or choose an unrelated idle bearing. Native observation; capture intervals vary.',
        'water-dinosaur47-observe-r1',waterFiles,{box:[800,350,1650,1050]}),
    await sequence('Water dinosaur — revised behavior, 4X','After: the same aquatic actor keeps its valid water-compatible Ready/Walk rows. These are continuous native captures. Exposed silhouette still needs your visual review.',
        'water-dinosaur-idle-repair-r2',waterFiles,{box:[800,350,1650,1050]}),
    await sequence('Water dinosaur — independent 2X','The independent 2X run also excludes land idle poses. Existing dinosaur artwork, native pivots and original timing are retained.',
        'water-dinosaur-idle-repair-2x-r4',waterFiles.filter((_,i)=>i%5===0),{box:[800,350,1650,1050]}),
];
const castleFrames=[0,1,5,10,25,50,75,86];
sequences.push(await sequence('Castle collapse — registered 4X','Eight inspection points from the 87 original collapse frames. The foundation shares one world anchor. All 87 frames, original shadows and natural removal were checked separately.',
    'castle-footing-all87-native-4x-r3',castleFrames.map(i=>`diagnostic-native-frame-${i}.png`)));
sequences.push(await sequence('Castle collapse — independent 2X','The same source frames at 2X. This is renderer inspection; ordinary Kirov destruction and source victory were checked in a separate native battle.',
    'castle-footing-all87-native-2x-r3',castleFrames.map(i=>`diagnostic-native-frame-${i}.png`)));
const headings=[0,45,90,135,180,225,270,315];
sequences.push(await sequence('Yuri statue head — revised metal, 4X','All eight head bearings use the original silver face, gold rear shell and dark tubes. The accepted pedestal, native pivot, owner material and original rubble are retained.',
    'cahead-material-native-4x-r2',headings.map(i=>`native-0-${i}.png`),{relativeWidth:1501,box:[400,140,1100,900]}));
sequences.push(await sequence('Yuri statue head — previous material','Original selected head material before this revision. The generated metal detail is open for your visual review.',
    'cahead-complete-native-4x-r1',[0,90,180,270].map(i=>`native-0-${i}.png`),{relativeWidth:1501,box:[400,140,1100,900]}));
const figures=[];
async function figure(title,caption,directory,file,crop){const img=await embed(directory,file,crop);figures.push({title,caption,img});}
await figure('Lunar terrain — previous HD material','Before: broad color patches emphasized the borders between raised tiles. Original source map geometry is unchanged.',
    'ground-slope-real-4x-r1','native-original-moon-terrain.png',{box:[350,300,1900,1350]});
await figure('Lunar terrain — revised 4X','After: one authored regolith material continues across the source tile contacts. Original height and facet shading remain visible. Visual acceptance is pending.',
    'lunar-contact-native-4x-r4','native-original-moon-terrain.png',{box:[350,300,1900,1350]});
await figure('Lunar terrain — independent 2X','The same selected material at 2X. Tanks use rigid HD surfaces while crossing the original ramp.',
    'lunar-contact-native-2x-r4','native-original-tanks-on-moon-ramp.png',{box:[350,300,1900,1350]});
for(const [density,directory]of[[2,'soviet02-building-state-2x-r2'],[4,'soviet02-building-state-4x-r2']]){
    const report=JSON.parse(await fs.readFile(path.join(base,directory,'report.json')));
    const row=report.inspection.find(row=>row.actor.name==='CALAB'&&row.state===1);
    await figure(`Damaged Einstein laboratory — ${density}X`,'Live stripes now follow the owning house. The original damaged state painted these stripes fixed red. Accepted snow paint and construction art remain unchanged.',directory,row.file,
        {box:[350,300,1900,1450]});
}
await figure('Bridge approach — previous HD material','Before: the road on the bridge approach used an older asphalt material. Original post-timer battle snapshot.',
    'allied06-bridge-feedback45-post-timer-4x-r2','native-bridge-0-1430.png',{box:[250,450,1950,1500]});
for(const density of[2,4])await figure(`Bridge and approach — revised ${density}X`,'Current road material and matching approach tone, with original lane marks, railings, damage slots and geometry retained. Fresh source opening; units differ from the earlier battle snapshot.',
    `allied06-bridge-approach-r9-${density}x-r1`,'native-bridge-0-1430.png',{box:[250,450,1950,1500]});
await figure('Wider loading objectives','All 14 missions were checked in three languages and two window sizes. Text flows around the original locator artwork.',
    'loading-briefing-flow-r3','native-loading-all02umd-zh-CN.png');
await figure('Allied05 — original victory and score','The revised sale lifecycle removes stranded garrison residents. This supported trainer battle cleared both original enemy houses and reached the ordinary source victory and score.',
    'allied05-robot-feedback48-r2','native-original-result-score.png');
const facts=[
    ['Opening combat and automatic fire','Gattling defenses hit the original aircraft. Combat houses, player tanks and occupied civilian buildings acquire enemies automatically. Tank-bunker occupation and Parliament leaders pass native checks.'],
    ['Allied05 victory','The original house fire sale left 66 orphaned garrison residents. Buildings now release their residents before disposal. Legitimate transport and garrison residents still count toward victory.'],
    ['Performance and HD stability',`Actual large-force 4X battle under bounded QA load: median ${checkpoint.realTimeAllied05.medianMs.toFixed(1)} ms, 95th percentile ${checkpoint.realTimeAllied05.p95Ms.toFixed(1)} ms. All surviving camera targets remained HD. Resource caps are unchanged.`],
    ['Tanya and original mission tasks','Native mouse targeting destroys an outer Flak ship with real Sapper C4. The Soviet03 story handoff keeps at most one live Tanya. Packing the Allied07 Soviet yard into an MCV preserves the critical base.'],
    ['Movies, speech and loading','All 119 original Soviet triggered speech references have captions in all three languages. Mission-ending narration drains naturally. The public Next transition paints black without visible text. Fullscreen Skip has a usable pointer.'],
    ['Boris and trainer protection','Boris aircraft fly out beyond the ingress edge after attacking. Dog protection survives repeated bites and a full named-save restart, and can be removed normally.'],
    ['Original source findings','Soviet01 units spawn full and then take real cannon damage. The time machine contains intentional fixed red trim. Soviet05 has no required statue-destruction objective. Hard additionally checks the named enemy land units; this condition excludes buildings.'],
    ['Retesting boundaries','The reported Allied04 helicopter-over-pyramid rescue and exact Allied06 stalled bridge route were not reproduced. Original rescue conditions are retained. Nineteen source actors crossed the bridge during the fresh-logic observation, with no player attack orders.'],
];
const sequenceMarkup=sequences.map((s,i)=>`<section class="sequence" data-sequence="${i}"><h2>${escape(s.title)}</h2><p>${escape(s.caption)}</p><div class="controls"><button type="button" data-play>Play frames</button><label>Frame <input type="range" min="0" max="${s.frames.length-1}" value="0" data-slider></label><output>1 / ${s.frames.length}</output></div><img src="${s.frames[0].src}" alt="${escape(s.title)}" data-image><small>Frame stepping is a review aid; it does not represent the original animation clock.</small></section>`).join('\n');
const figureMarkup=figures.map(f=>`<figure><h2>${escape(f.title)}</h2><img src="${f.img.src}" alt="${escape(f.title)}" loading="lazy"><figcaption>${escape(f.caption)}</figcaption></figure>`).join('\n');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>RA2 HD — YR Combined Feedback r3</title><style>:root{color-scheme:dark;font:18px/1.6 system-ui,sans-serif;background:#10151d;color:#e5ecf4}body{max-width:1360px;margin:auto;padding:28px}h1{font-size:36px;line-height:1.2}h2{font-size:26px;line-height:1.35}section,figure{margin:24px 0;padding:24px;border:1px solid #3a4859;border-radius:12px;background:#19222e}img{display:block;max-width:100%;height:auto;margin:auto}figcaption,small{display:block;color:#bdccdb;margin-top:12px}.sequence img{max-height:760px;object-fit:contain}.controls{display:flex;align-items:center;flex-wrap:wrap;gap:16px;margin:14px 0}button,input{font:inherit}button{padding:8px 16px;background:#293b50;color:#eff7ff;border:1px solid #7792ad;border-radius:6px}input[type=range]{width:260px;max-width:65vw}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;padding:14px;border-bottom:1px solid #3a4859}th{width:25%}.tag{display:inline-block;border:1px solid #7cae96;border-radius:6px;padding:6px 12px;color:#c5efd8}code{overflow-wrap:anywhere}@media(max-width:750px){body{padding:12px}section,figure{padding:16px}h1{font-size:30px}h2{font-size:23px}th,td{display:block;width:auto;padding:10px}th{border:0;padding-bottom:0}}</style>
<main><h1>Yuri's Revenge — Combined Feedback r3</h1><p class="tag">macOS arm64 · 2026-11-08 · Visual review pending</p><p>This revision combines the remaining Allied corrections with the Soviet test feedback. The screenshots below are embedded native captures or lossless crops; no pixels were resampled for this page.</p>
<section><h2>Continue testing</h2><p>Quit the previous game, extract the r3 ZIP and open <strong>Red Alert 2 HD.app</strong>. Your existing campaign saves and settings remain in their current profile. Start a mission again to apply the new task logic; existing saves retain their recorded rules.</p><p>The selected old snow, construction animations and accepted unit artwork remain in use. The prior V56, YR r1 and YR r2 deliveries are retained.</p></section>
<section><h2>What changed</h2><table><tbody>${facts.map(([title,body])=>`<tr><th>${escape(title)}</th><td>${escape(body)}</td></tr>`).join('')}</tbody></table></section>
<section><h2>Validation</h2><p>${checkpoint.host.counts.pass} full host tests passed across ${checkpoint.host.executions} executions, with zero failures, loading errors, skipped tests or omitted files. Follow-up bridge material checks, native source cases, both HD densities, named restart controls and the 84-case loading-text layout pass.</p><p>Visual acceptance remains yours. The full unmodified campaign goal qualification is the retained source45 baseline; the new logic has targeted and supported-play regressions. Windows, physical 8/16 GiB targets and arbitrary external workloads have not been qualified on this Mac.</p><small>Source commit: <code>${head}</code>. ${images.length} embedded native images. The page works offline.</small></section>
${sequenceMarkup}${figureMarkup}</main><script>const sequences=${JSON.stringify(sequences).replaceAll('<','\\u003c')};document.querySelectorAll('[data-sequence]').forEach(section=>{const data=sequences[Number(section.dataset.sequence)],slider=section.querySelector('[data-slider]'),img=section.querySelector('[data-image]'),output=section.querySelector('output'),play=section.querySelector('[data-play]');let timer;const update=()=>{const n=Number(slider.value);img.src=data.frames[n].src;output.textContent=(n+1)+' / '+data.frames.length;};slider.addEventListener('input',update);play.addEventListener('click',()=>{if(timer){clearInterval(timer);timer=undefined;play.textContent='Play frames';}else{timer=setInterval(()=>{slider.value=String((Number(slider.value)+1)%data.frames.length);update();},250);play.textContent='Pause frames';}});});window.__reviewImageCount=${images.length};</script></html>\n`;
await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,html,{flag:'wx'});
const receipt={status:'PASS_SELF_CONTAINED_COMBINED_NATIVE_REVIEW_BUILT',sourceHead:head,images,embeddedImages:images.length,
    bytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex'),networkDependencies:0,
    pixelResampling:false,userVisualAcceptance:'PENDING'};
await fs.writeFile(out+'.json',JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({file:out,images:images.length,bytes:receipt.bytes}));
