"""Compare independently exported densities without conflating density and zoom."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('root', type=Path)
args = parser.parse_args()
variants = {}
for density in (2, 4, 10):
    report = json.loads((args.root / f'{density}x/review-export.json').read_text())
    validation = json.loads((args.root / f'{density}x/validation.json').read_text())
    assert report['density'] == density and not report['activationAllowed']
    assert validation['status'] == 'PASS_STRUCTURAL_ONLY'
    variants[str(density)] = report
assert len({v['artSha256'] for v in variants.values()}) == 1
assert all([f['nativeFrame'] for f in v['frames']] == [0, 8, 164, 2, 11, 167] for v in variants.values())
page = '''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conscript - resolution review</title><style>
:root{color-scheme:dark;font:18px/1.5 system-ui;background:#171e24;color:#edf2f5}
body{max-width:1440px;margin:32px auto;padding:0 24px}h1{font-size:32px;margin:0}h2{font-size:20px;margin:0}
p{max-width:1050px;color:#bfcdd5}.toolbar{display:flex;flex-wrap:wrap;gap:18px;align-items:end;padding:20px;background:#252f37;border-radius:12px}
label{display:grid;gap:6px;font-size:16px}select{font:inherit;padding:9px;border:1px solid #63737e;border-radius:6px;background:#182229}
#status{min-height:1.5em;font-size:16px}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,370px),1fr));gap:20px}
article{padding:18px;background:#232d35;border-radius:12px;overflow:auto}.tag{color:#aec1cd;font-size:14px;margin:4px 0 14px}
.pair{display:flex;gap:12px;justify-content:center}.panel{flex:none;text-align:center}.stage{position:relative;overflow:hidden;background:repeating-conic-gradient(#65716e 0% 25%,#76827f 0% 50%) 0/16px 16px}
.stage img{position:absolute;image-rendering:auto;max-width:none}.caption{font-size:15px;margin:8px 0;color:#d0dbe0}
#compare{display:flex;gap:20px;flex-wrap:wrap;background:#232d35;padding:20px;border-radius:12px}
#compare .stage{margin:auto}a{color:#a4d9ff}details{margin:20px 0}summary{cursor:pointer}footer{margin:24px 0;color:#b8c4cc;font-size:16px}
</style><h1>Conscript / resolution review</h1>
<p>The same approved artwork, exported directly at three resolutions. Start with Source detail to inspect the retained detail;
compare 2x and 4x at the same display size. Increasing display zoom alone adds no detail.</p>
<div class="toolbar"><label>Image resolution<select id="density"><option value="2">2x export</option><option value="4">4x export</option><option value="10" selected>Source detail (10x sampling)</option></select></label>
<label>Display zoom<select id="zoom"><option value="1">Native size</option><option value="4" selected>4x larger</option><option value="8">8x larger</option></select></label>
<label>Background<select id="background"><option value="checker">Checkerboard</option><option value="#35413a">Dark green</option><option value="#d1d8de">Light gray</option><option value="#7c367e">Purple</option></select></label>
<label>Display filter<select id="filter"><option value="auto">Smooth</option><option value="pixelated">Pixel inspection</option></select></label></div>
<p id="status" aria-live="polite"></p><main class="gallery" id="gallery"></main>
<details open><summary>Compare resolution at the same size - standing / 000</summary><div id="compare"></div></details>
<footer>Six review frames only. Source detail is a review reference, not a supported game-pack density.
The game camera, unit size and renderer are unchanged. Complete-member activation and full-art acceptance still apply.</footer>
<script>
const variants=VARIANTS;
const controls=Object.fromEntries(['density','zoom','background','filter'].map(id=>[id,document.getElementById(id)]));
function sprite(item,density,blue,zoom){
  const panel=document.createElement('div');panel.className='panel';
  const stage=document.createElement('div');stage.className='stage';stage.style.width=40*zoom+'px';stage.style.height=40*zoom+'px';
  if(controls.background.value!=='checker')stage.style.background=controls.background.value;
  const img=document.createElement('img');img.alt=`Frame ${item.nativeFrame}, ${blue?'blue':'red'}, ${density}x export`;
  img.src=`${density}x/`+(blue?`frame-${String(item.nativeFrame).padStart(3,'0')}-${density}x-blue-preview.png`:item.files.base.file);
  img.style.width=item.size[0]/density*zoom+'px';img.style.height=item.size[1]/density*zoom+'px';
  img.style.left=(item.trimOrigin[0]-18)*zoom+'px';img.style.top=(item.trimOrigin[1]-18)*zoom+'px';
  img.style.imageRendering=controls.filter.value;stage.append(img);panel.append(stage);return panel;
}
function render(){
  const density=Number(controls.density.value),zoom=Number(controls.zoom.value),gallery=document.getElementById('gallery');
  gallery.replaceChildren();
  for(const item of variants[density].frames){
    const article=document.createElement('article'),title=document.createElement('h2'),tag=document.createElement('div'),pair=document.createElement('div');
    title.textContent=`${item.nativeFrame>=164?'FIRE':item.nativeFrame>=8?'WALK':'STAND'} / ${String(item.nativeFrame).padStart(3,'0')}`;
    tag.className='tag';tag.textContent=`${item.size.join(' x ')} image pixels · ${density===10?'source-detail reference':density+'x export'}`;pair.className='pair';
    for(const blue of [false,true]){const panel=sprite(item,density,blue,zoom),caption=document.createElement('div');caption.className='caption';caption.textContent=blue?'Blue preview':'Authored colors';panel.append(caption);pair.append(panel)}
    article.append(title,tag,pair);gallery.append(article);
  }
  const physicalDemand=zoom*window.devicePixelRatio;
  document.getElementById('status').textContent=`${density}x image resolution · ${zoom}x display zoom · screen scale ${window.devicePixelRatio}x. `+
    (density>=physicalDemand?'Enough image samples for this display size.':'Enlarged beyond available image samples; select Source detail or reduce display zoom.');
  const compare=document.getElementById('compare');compare.replaceChildren();
  for(const d of [2,4,10]){const panel=sprite(variants[d].frames[0],d,false,zoom),caption=document.createElement('div');caption.className='caption';caption.textContent=d===10?'Source detail':`${d}x export`;panel.append(caption);compare.append(panel)}
}
for(const el of Object.values(controls))el.addEventListener('change',render);
window.addEventListener('resize',render);render();
</script></html>'''
(args.root / 'review.html').write_text(page.replace('VARIANTS', json.dumps(variants)))
print(args.root / 'review.html')
