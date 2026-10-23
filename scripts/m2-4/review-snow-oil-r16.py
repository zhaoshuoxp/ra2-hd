"""Make an offline animation-only review with exact-density phase PNGs and native clips."""
import argparse
import base64
import hashlib
import html
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2' / 'official-maps'))
from owner_review import compose_owner

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('--native', type=Path, nargs=3, required=True, metavar=('ORIGINAL', 'HD2', 'HD4'))
parser.add_argument('--corrected-pack', type=Path,
                    default=Path('.local/environment-packs/snow-environment-m2-4-oil-r16-reference-v7'))
parser.add_argument('--previous-pack', type=Path,
                    default=Path('.local/environment-packs/snow-environment-m2-4-technology-v1'))
parser.add_argument('--corrected-label', default='Corrected Snow R16')
parser.add_argument('--previous-label', default='Previous Batch26')
parser.add_argument('--title', default='M2.4 Snow Oil Animation: R16 Reference')
args = parser.parse_args()
args.output.mkdir(exist_ok=False)
media = args.output / 'media'
media.mkdir()
load = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
root = Path('.artifacts/m2-4')
native_root = root / 'snow-native-technology-batch26-v1'
sources = {s['member']: s for s in load(native_root / 'source.json')['sources']}
native_source = sources['caoild_a.shp']
palette_file = native_root / 'native' / (native_source['palette']['sha256'] + '.pal')
assert sha(palette_file) == native_source['palette']['sha256']
palette = (np.frombuffer(palette_file.read_bytes(), np.uint8).reshape(256, 3).astype(np.uint16) * 4).astype(np.uint8)
labels = ['Original Snow', args.previous_label, args.corrected_label, 'Accepted temperate R16']
packs = {
    labels[1]: args.previous_pack,
    labels[2]: args.corrected_pack,
    labels[3]: Path('.local/environment-packs/environment-m2-3-oil-paired-drive-complete-v31'),
}
images, image_uris, pins = [], {}, {}


def exported(pack, member, density):
    catalog = load(pack / 'manifest.json')
    entry = next(m for f in catalog['families'].values() for m in f['members'] if m['member'] == member)
    file = pack / entry['path']
    assert sha(file) == entry['sha256']
    metadata = load(file)
    variant = next(v for v in metadata['variants'] if v['density'] == density)
    pages, frames = {}, {}
    for page in variant['pages']:
        pair = []
        for layer in ['base', 'data']:
            p = file.parent / str(density) / page['id'] / (layer + '.png')
            assert sha(p) == page[layer + 'Sha256'] and p.stat().st_size == page[layer + 'Bytes']
            pair.append(Image.open(p).convert('RGBA'))
        pages[page['id']] = pair
    for frame in variant['frames']:
        x, y, w, h = frame['contentRect']
        base, data = pages[frame['page']]
        box = (x, y, x + w, y + h)
        frames[frame['nativeFrame']] = compose_owner(base.crop(box), data.crop(box), palette)
    pins[str(file.resolve())] = sha(file)
    return frames, metadata


def original(member, number, density):
    source = sources[member]
    frame = source['frames'][number]
    path = native_root / 'native' / frame['file']
    assert sha(path) == frame['rgbaSha256']
    sprite = Image.frombytes('RGBA', tuple(frame['size']), path.read_bytes())
    return sprite.resize(tuple(v * density for v in sprite.size), Image.Resampling.NEAREST)


for density in (2, 4):
    prepared = {}
    for label, pack in packs.items():
        prefix = 'ct' if label == labels[3] else 'ca'
        for member in ['oild.shp', 'oild_a.shp']:
            prepared[(label, member)] = exported(pack, prefix + member, density)
    for state in (0, 1):
        for phase in range(32):
            number = state * 32 + phase
            for label_index, label in enumerate(labels):
                canvas = Image.new('RGBA', (166 * density, 122 * density))
                for member, n in [('oild.shp', state), ('oild_a.shp', number)]:
                    if label == labels[0]:
                        picture = original('ca' + member, n, density)
                        origin = sources['ca' + member]['frames'][n]['origin']
                    else:
                        frames, metadata = prepared[(label, member)]
                        picture = frames[n]
                        origin = metadata['logical']['frames'][n]['trimOrigin']
                    canvas.alpha_composite(picture, tuple(v * density for v in origin))
                key = f'{density}-{state}-{phase}-{label_index}'
                file = media / (key + '.png')
                canvas.save(file)
                data = file.read_bytes()
                image_uris[key] = 'data:image/png;base64,' + base64.b64encode(data).decode()
                images.append(dict(key=key, file=str(file.resolve()), sha256=sha(file),
                                   size=list(canvas.size), hdRescaled=False, label=label))

clips, clip_html, reports = [], [], []
for directory, label, density in zip(args.native, ['Original', 'Corrected 2X', 'Corrected 4X'], [0, 2, 4]):
    file = directory / 'report.json'
    report = load(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['selectedMap'] == 'mp12s4.map' and report['edition'] == 'ra2'
    if density:
        assert report['environment']['density'] == density
        assert report['selectedEnvironmentRevision'] == packs[labels[2]].name
        assert report['combinedWorldAllocation']['total'] <= report['combinedWorldAllocation']['limit']
        assert report['graphics']['glError'] == 0
    else:
        assert report['fallback']['terrain']['worldChargeBytes'] == report['fallback']['environment']['worldChargeBytes'] == 0
    assert len(report['oilClips']) == 2
    reports.append(dict(file=str(file.resolve()), sha256=sha(file)))
    for clip in report['oilClips']:
        path = Path(clip['file']).resolve()
        data = path.read_bytes()
        normal = 'normal' in path.name
        assert clip['activeFrames'] == list(range(32)) if normal else clip['activeFrames'] == list(range(33, 64))
        assert clip['timing'] == 'UNCHANGED_NATIVE_GAME_TICKS'
        uri = 'data:video/webm;base64,' + base64.b64encode(data).decode()
        name = f'{label} / {"normal" if normal else "damaged"}'
        clip_html.append(f'<figure><figcaption>{html.escape(name)}</figcaption><div class="pan">'
                         f'<video controls muted loop preload="metadata" width="720" height="640" src="{uri}"></video></div></figure>')
        clips.append(dict(file=str(path), sha256=sha(path), label=name, size=[720, 640], rescaled=False,
                          activeFrames=clip['activeFrames']))

manifest = dict(schema='m2-4-snow-oil-r16-animation-review-v1', status='MAC_TECHNICAL_PASS_OIL_VISUAL_REVIEW_PENDING',
    images=images, clips=clips, reports=reports, metadataPins=pins,
    candidate={'revision':packs[labels[2]].name, 'sha256':sha(packs[labels[2]] / 'manifest.json')},
    scope='Oil animation only. Accepted other technology art is not reopened.',
    staticPolicy='Exact atlas/source composition at matching native phase and independent density. Original native pixels use nearest enlargement for comparison only. Original shadows and flag are excluded equally from these diagnostic composites; live clips contain actual game layers.',
    playbackPolicy='Phase controls illustrate source frame order; native clips prove original timing. Damaged frame32 is the initial pose; native damaged playback loops33–63.',
    Windows='NOT_RUN', fullSnowCoverage=False, m24Complete=False)
manifest_file = args.output / 'review-manifest.json'
manifest_file.write_text(json.dumps(manifest, indent=2) + '\n')
data_manifest = 'data:application/json;base64,' + base64.b64encode(manifest_file.read_bytes()).decode()
panels = ''.join(f'<figure><figcaption>{html.escape(label)}</figcaption><div class="pan"><img id="phase-{i}" '
                 f'src="{image_uris[f"2-0-0-{i}"]}" width="332" height="244" alt="{html.escape(label)}"></div></figure>'
                 for i, label in enumerate(labels))
content = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__</title><style>
body{margin:26px;background:#171c24;color:#eef2f8;font:20px/1.5 system-ui}h1{font-size:34px}h2{font-size:28px}
p{max-width:1250px}a{color:#a5c8ff}.panels{display:flex;flex-wrap:wrap;gap:18px}figure{margin:16px 0;min-width:0}
figcaption{font-size:22px;margin:8px 0}.pan{overflow:auto;background:#111820;border:1px solid #58677d;max-height:82vh}
img,video{display:block;width:auto;height:auto;max-width:none}.controls{display:flex;flex-wrap:wrap;gap:18px;align-items:center}
select,button{font:20px system-ui;padding:7px}input[type=range]{width:380px}#phase-status{font-size:22px}
</style><h1>__TITLE__</h1>
<p>Mac technical checks passed; oil animation visual acceptance is pending. Only CAOILD animation changed. Hospital, airfield,
outpost, oil body/flag and all other accepted families remain exact. Complete Snow and M2.4 coverage remain pending; Windows not run.</p>
<p>Inspect both paired counterweights and rods, constant shafts and sizes, far-side occlusion, one coherent walking beam,
stationary exposed material and Snow variant registration. Inspect the cap, left ladder and fixed wall as one continuous
cylinder at every phase. Matched Snow fixed-wall material corrects their join; the accepted complete R16 mechanical cycle,
verified Snow source, original shadows, geometry and native animation timing are retained.</p>
<h2>Same-phase source and HD comparison</h2>
<p>All 512 PNGs are embedded with exact hashes. Default display preserves 1:1 image pixels. Original nearest pixels are
comparison references, not new HD art. These diagnostic atlas compositions exclude shadow/flag equally; live clips below
show the actual game. The phase slider demonstrates frame order; inspect native recordings for timing.</p>
<div class="controls"><label>Density <select id="density"><option value="2">2X</option><option value="4">4X</option></select></label>
<label>State <select id="state"><option value="0">Normal</option><option value="1">Damaged</option></select></label>
<button id="previous">Previous</button><input id="phase" type="range" min="0" max="31" value="0">
<button id="next">Next</button><button id="play">Play phases</button><span id="phase-status"></span></div>
<p>Damaged phase 0 is original frame32 (initial pose); the native damaged loop advances frames33–63.</p>
<div class="panels">__PANELS__</div><h2>Live native Original / corrected 2X / corrected 4X</h2>
<p>Six native framebuffer crop recordings use the unchanged official map mp12s4.map, legal engineer capture, native damage
and original game ticks. All 32 intact phases and 31 damaged-loop phases are observed. Clips preserve 720 × 640 captured
pixels without resizing. Previous accepted body/flag/other-family state suites are reused.</p><div class="panels">__CLIPS__</div>
<p><a href="__MANIFEST__" download="review-manifest.json">Exact hashes and provenance</a></p>
<script>const phaseImages=__IMAGES__;const labels=__LABELS__;let timer;
const update=()=>{const d=Number(document.querySelector('#density').value),s=Number(document.querySelector('#state').value),
p=Number(document.querySelector('#phase').value);labels.forEach((label,i)=>{const image=document.querySelector('#phase-'+i);
image.src=phaseImages[d+'-'+s+'-'+p+'-'+i];image.width=166*d;image.height=122*d;});
document.querySelector('#phase-status').textContent='Phase '+p+' / native frame '+(s*32+p);};
['density','state','phase'].forEach(id=>document.querySelector('#'+id).addEventListener('input',update));
document.querySelector('#previous').onclick=()=>{const p=document.querySelector('#phase');p.value=(Number(p.value)+31)%32;update();};
document.querySelector('#next').onclick=()=>{const p=document.querySelector('#phase');p.value=(Number(p.value)+1)%32;update();};
document.querySelector('#play').onclick=()=>{if(timer){clearInterval(timer);timer=undefined;}else{timer=setInterval(()=>document.querySelector('#next').click(),125);}document.querySelector('#play').textContent=timer?'Pause phases':'Play phases';};update();</script></html>
'''
content = content.replace('__TITLE__', html.escape(args.title)).replace('__PANELS__', panels).replace('__CLIPS__', ''.join(clip_html))
content = content.replace('__MANIFEST__', data_manifest).replace('__IMAGES__', json.dumps(image_uris)).replace('__LABELS__', json.dumps(labels))
output = args.output / 'index-embedded.html'
with output.open('x') as stream:
    stream.write(content)
receipt = dict(schema='m2-4-animation-embedded-review-v1', status='PASS_512_EMBEDDED_PHASE_PNGS_AND_6_NATIVE_CLIPS',
    output=str(output.resolve()), outputSha256=sha(output), outputBytes=output.stat().st_size,
    manifest=str(manifest_file.resolve()), manifestSha256=sha(manifest_file), imageCount=512, clipCount=6,
    visual='OIL_ANIMATION_ONLY_PENDING_USER_REVIEW', Windows='NOT_RUN')
with output.with_suffix('.json').open('x') as stream:
    json.dump(receipt, stream, indent=2)
    stream.write('\n')
print(json.dumps(receipt))
