"""Static native-size artwork review; all images embedded, no script required."""
import base64
import json
import sys
from pathlib import Path
from PIL import Image, ImageChops

root=Path(sys.argv[1] if len(sys.argv)>1 else '.artifacts/m1-3a/review-v2')
report=json.loads((root/'export.json').read_text())
refs=Path('.artifacts/m1-3a/references-v1')
art=Path('.artifacts/m1-3a/authoring-v1')
checks=[]
for pose in report['poses']:
    for preset in ['4k','1080p']:
        name=pose['name'];heading=pose['bodyHeading']
        original=Image.open(refs/f'{preset}-{heading}-original.png').convert('RGBA')
        background=Image.open(refs/f'{preset}-{heading}-shadowBackground.png').convert('RGBA')
        layer=Image.open(art/f'{name}-{preset}-tank-layer.png').convert('RGBA')
        restored=Image.alpha_composite(background,layer)
        delta=ImageChops.difference(original,restored).convert('RGB')
        checks.append({'pose':name,'preset':preset,'originalLayerReconstructionExact':delta.getbbox() is None})
        assert delta.getbbox() is None, 'Original cutout does not reconstruct the untouched scene'
    source=Image.open(pose['source']).convert('RGBA')
    # Inspect real soft alpha on contrasting backgrounds without altering the exported art.
    image=Image.open(root/f'{pose["name"]}-4x.png')
    board=Image.new('RGBA',(512,192),'#f0f0f0');board.paste(Image.new('RGBA',(256,192),'#182027'),(256,0))
    board.alpha_composite(image,(0,0));board.alpha_composite(image,(256,0))
    board.convert('RGB').save(root/f'{pose["name"]}-alpha-inspection.png')


def img(file,cls='',width=None,height=None):
    data=base64.b64encode(Path(file).read_bytes()).decode()
    size=f' width="{width}" height="{height}"' if width else ''
    return f'<img class="{cls}"{size} alt="{Path(file).stem}" src="data:image/png;base64,{data}">'


page=['''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M1.3a Rhino artwork review</title><style>
body{font:18px/1.5 system-ui,sans-serif;background:#182027;color:#edf0f2;margin:24px}main{max-width:1100px;margin:auto}
h1{font-size:30px}h2{font-size:25px}h3{font-size:21px}a{color:#9ed2ff}code{overflow-wrap:anywhere}.notice{color:#f8d684}
.scroll{max-width:100%;overflow:auto}.pair{display:flex;gap:16px;width:736px}.pair figure{margin:0;width:360px;flex:none}
.pair figcaption{height:76px}.native{width:360px;height:260px;display:block}.toggle label{display:inline-block;background:#334552;padding:8px;cursor:pointer}
.toggle{margin:20px 0}.stack{width:360px;height:260px}.b{display:none}.toggle input:last-of-type:checked~.scroll .a{display:none}
.toggle input:last-of-type:checked~.scroll .b{display:block}summary{cursor:pointer}table{border-collapse:collapse}td,th{padding:8px;border:1px solid #58616a}
</style><main><h1>Rhino artwork: material-realism revision</h1>
<p><strong>ARTWORK_REVIEW_PENDING / RUNTIME_TRANSFER_UNVERIFIED</strong></p>
<p>The original Rhino remains active. The current review target is the primary pose's realism revision, generated after the user found the earlier art too anime-like and model-like. No new runtime vehicle is installed.</p>
<p class="notice"><strong>2D ART COMPOSITE — NOT IN-ENGINE HD</strong>. Candidate panels are static artwork composites over matching original scene layers. They reuse the original ground shadow only as a comparison aid, not as proof of runtime shadow compatibility.</p>
<p>At 100% browser zoom, each panel stays <strong>360 × 260 CSS pixels</strong>, matching the original game crop. The tank is about 52.5 × 35.5 CSS pixels. Narrow windows scroll instead of scaling. Original: actual game capture. Candidate: a static composite at the same density, with original terrain and ground shadow.</p>''']


def pair(name,preset,title):
    a=root/f'{name}-{preset}-original.png';b=root/f'{name}-{preset}-candidate.png';key=f'{name}-{preset}'
    return (f'<h3>{title}</h3><div class="scroll"><div class="pair"><figure><figcaption>A · Original Rhino</figcaption>{img(a,"native")}</figure>'
            f'<figure><figcaption>R · Artwork target<br><small class="notice">2D ART COMPOSITE — NOT IN-ENGINE HD</small></figcaption>{img(b,"native")}</figure></div></div>'
            f'<p><a href="{name}-{preset}-pair.png">Direct PNG pair</a> · Panels above retain native CSS size.</p>'
            f'<div class="toggle"><input id="{key}-A" name="{key}" type="radio" checked><label for="{key}-A">Original at same location</label>'
            f'<input id="{key}-B" name="{key}" type="radio"><label for="{key}-B">2D ART COMPOSITE — NOT IN-ENGINE HD</label>'
            f'<div class="scroll"><div class="stack">{img(a,"native a")}{img(b,"native b")}</div></div></div>')


page.append('<h2>Current primary pose: body 0° / turret and barrel 0°</h2>')
page.append(pair('primary','4k','Primary condition: matched 4K density'))
page.append(pair('primary','1080p','Smaller repeat: matched 1080p density'))
page.append('''<h2>Observed limits</h2><p>The new material pass reduces the smooth plastic appearance and adds darker joints and rougher steel/paint response. It also adds mottled wear that may be excessive. Much of that surface variation disappears at native size; do not infer a large gameplay improvement from the raw generated image.</p>
<p>The original is still the authoritative identity. Hatch shape/height, wheel visibility, surface details and the distribution of turret mass differ. Uniform registration preserves scale without warping, but does not prove equivalent silhouette or visual mass. The current result can still read as a model. There is no claimed visual PASS.</p>
<h2>Supplement: 4× logical-size detail</h2><p>Original left; current target right. Enlarged inspection only. The target is 2D artwork, not in-engine HD.</p>''')
page.append('<div class="scroll">'+img(root/'primary-detail-4css.png',width=512,height=192)+'</div>')
page.append('<details><summary>Transparency inspection at 4× logical size</summary><p>Same art on light and dark. Alpha values 1–7 were cleared; all remaining soft coverage is preserved. No original alpha mask, warping, repainting or geometry correction was applied.</p><div class="scroll">'+img(root/'primary-alpha-inspection.png',width=512,height=192)+'</div></details>')
page.append('<details><summary>Raw generated realism artwork — enlarged source, not gameplay size</summary><div class="scroll">'+img(Path(report['poses'][0]['source']),width=724,height=543)+'</div></details>')
page.append('<details><summary>Earlier complementary pose — prior style, NOT updated to the realism revision</summary><p>Body 180° / turret and barrel 180°. This was generated within the original three-call budget, before the user requested more realism. It is retained as evidence and is not a coherent second view of the current realism target. Its barrel extends farther in front of the hull than the original; hatch/deck and red-panel interpretation also disagree between views.</p>')
page.append(pair('complementary','4k','Earlier complementary artwork at matched 4K density'))
page.append(pair('complementary','1080p','Earlier complementary artwork at matched 1080p density'))
page.append('</details><h2>Sampling and provenance</h2><div class="scroll"><table><tr><th>Pose</th><th>Raw source</th><th>Clean occupied source</th><th>Source samples / CSS pixel</th><th>Review-only exports</th></tr>')
for p in report['poses']:
    page.append(f'<tr><td>{p["name"]}</td><td>{p["rawSize"]}</td><td>{p["trimSize"]}</td><td>{p["sourceSamplesPerCssPixel"]:.2f}</td><td>2x 128×96; 4x 256×192; CSS canvas 64×48</td></tr>')
page.append('</table></div><p>Each export is directly sampled from its selected generated source using one uniform scale and translation, with premultiplied-alpha Lanczos downsampling. No upsampling is needed. The 4K composite uses the 2x raster (2 physical pixels per CSS pixel); 4x artwork density is a separate review export. Capture density is not an asset/model-detail label.</p>')
page.append(f'<p>Current target SHA-256: <code>{report["poses"][0]["sourceSha256"]}</code></p>')
page.append('<p><a href="../authoring-v2/prompt-primary-realism-v1.txt">Exact realism prompt</a> · <a href="../authoring-v2/generation-request.json">Reference roles and generation provenance</a> · <a href="export.json">Export/registration metadata</a></p>')
page.append('<h2>Visual decision</h2><p>Does this specific primary realism direction provide a worthwhile improvement at original gameplay size? Feedback remains open; no answer is preselected. Any accepted image would still be an art target with runtime transfer unverified. No additional headings, gameplay override or Phase B work is started.</p></main></html>')
document=''.join(page)
(root/'review.html').write_text(document)
(root/'review-validation.json').write_text(json.dumps({'status':'PASS_STATIC_EXPORT_CHECKS_ONLY','checks':checks,'imageCount':document.count('<img ')},indent=2)+'\n')
print(json.dumps({'review':str(root/'review.html'),'imageCount':document.count('<img '),'checks':checks}))
