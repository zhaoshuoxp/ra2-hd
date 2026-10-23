"""Build an offline representative review; never register candidate resources."""
import base64
import collections
import hashlib
import html
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path('.artifacts/m1-6c')
SOURCE = ROOT / 'source-v2'
OUT = ROOT / 'review-v1'
OUT.mkdir(exist_ok=False)
ACCEPTED = Path('/Users/Aone/RA2remaster/ra2-hd/.artifacts/m1-6a/full-exports-v2')
inventory = json.loads((SOURCE / 'inventory.json').read_text())
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
report = {'status': 'REPRESENTATIVE_ART_REVIEW_PENDING', 'runtimeActivation': False,
          'samplingDensity': 4, 'registration': 'Uniform scale and translation only',
          'samples': [], 'preservedInputs': {}, 'limits': [
              'Isolated native-logical-size composites, not in-game screenshots.',
              'New complete damage, occupancy and functional cycles remain pending approval.',
              'Snow refinery shows an empty basin; storage and ore layers are deferred.',
              'Palette/lighting and gameplay reuse require actual runtime validation.']}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def row_for(identity, theater):
    return next(r for r in inventory['matrix'] if r['id'] == identity
                and r['edition'] == 'yr' and r['theater'] == theater)


def raw_for(member):
    return json.loads((SOURCE / 'members' / (member['source']['sha256'] + '.json')).read_text())


def index_canvas(raw, index):
    frame = raw['frames'][index]
    out = np.zeros(raw['canvas'][::-1], dtype=np.uint8)
    out[frame['y']:frame['y'] + frame['height'], frame['x']:frame['x'] + frame['width']] = np.array(
        frame['pixels'], dtype=np.uint8).reshape(frame['height'], frame['width'])
    return out


def decode(row, member, index):
    indices = index_canvas(raw_for(member), index)
    colors = np.array(row['palette']['colors'], dtype=np.uint8)[indices]
    return Image.fromarray(np.dstack([colors, np.uint8(indices != 0) * 255]))


def resample(image, size):
    """Linear-light premultiplied area sampling avoids transparent dark fringes."""
    pixels = np.asarray(image).astype(np.float32) / 255
    rgb = pixels[..., :3]
    linear = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
    premul = np.dstack([linear * pixels[..., 3:4], pixels[..., 3]])
    sampled = np.stack([np.asarray(Image.fromarray(premul[..., i]).resize(size, Image.Resampling.BOX))
                        for i in range(4)], axis=2)
    linear = np.divide(sampled[..., :3], sampled[..., 3:4], out=np.zeros_like(sampled[..., :3]),
                       where=sampled[..., 3:4] > 0)
    sampled[..., :3] = np.where(linear <= .0031308, linear * 12.92,
                               1.055 * np.maximum(linear, 0) ** (1 / 2.4) - .055)
    return Image.fromarray(np.uint8(np.clip(np.rint(sampled * 255), 0, 255)))


def data_url(path):
    return 'data:image/png;base64,' + base64.b64encode(path.read_bytes()).decode()


def picture(path, size, original=False):
    return (f'<img src="{data_url(path)}" width="{size[0]}" height="{size[1]}" '
            f'class="{"original" if original else "hd"}" alt="{html.escape(path.stem)}">')


def pair(original, candidate, size):
    return ('<div class="scroll"><div class="pair"><figure><figcaption>Original</figcaption>'
            + picture(original, size, True) + '</figure><figure><figcaption>HD candidate</figcaption>'
            + picture(candidate, size) + '</figure></div></div>')


specs = [
    ('NAINDP', 'TEMPERATE', 'Industrial Plant', 'NAINDP/normal-raw-v4.png'),
    ('NABNKR', 'TEMPERATE', 'Battle Bunker', 'NABNKR/normal-raw-v1.png'),
    ('NAPOWR', 'SNOW', 'Snow Power Plant', 'NAPOWR-SNOW/normal-raw-v1.png'),
    ('NAHAND', 'SNOW', 'Snow Barracks', 'NAHAND-SNOW/normal-raw-v1.png'),
    ('NAREFN', 'SNOW', 'Snow Ore Refinery', 'NAREFN-SNOW/normal-raw-v1.png')]
sections = []
overview = Image.new('RGB', (900, 1460), '#34483d')
draw = ImageDraw.Draw(overview)
draw.text((24, 15), 'Original / HD - native logical size', font=font, fill='white')
for i, (identity, theater, title, authored) in enumerate(specs):
    key = identity + '-' + theater
    row = row_for(identity, theater)
    original_path = OUT / (key + '-original.png')
    original = Image.open(ROOT / 'references-v1' / key / 'normal.png').convert('RGBA')
    if identity == 'NAREFN':
        # Storage-level ACTIVE entries are mutually exclusive, not stacked.
        original = Image.new('RGBA', original.size)
        for role in ['bib', 'body']:
            for member in row['members']:
                if role in member['roles']:
                    original.alpha_composite(decode(row, member, 0))
    original.save(original_path)
    source_path = ROOT / 'authoring-v1' / authored
    master = Image.open(source_path).convert('RGBA')
    crop_box = master.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    crop = master.crop(crop_box)
    bounds = original.getbbox()
    scale = min((bounds[2] - bounds[0]) / crop.width, (bounds[3] - bounds[1]) / crop.height)
    assert scale * 4 <= 1, 'Never enlarge an undersized master'
    size = tuple(round(v * scale * 4) for v in crop.size)
    offset = (round((bounds[0] + bounds[2]) * 2 - size[0] / 2), bounds[3] * 4 - size[1])
    candidate = Image.new('RGBA', tuple(v * 4 for v in original.size))
    candidate.alpha_composite(resample(crop, size), offset)
    candidate_path = OUT / (key + '-hd4.png')
    candidate.save(candidate_path)
    note = {'NAINDP': 'Normal pose. Native idle: frames 0-11; damaged idle: 13-25 in the same member.',
            'NABNKR': 'Unoccupied normal pose. Four native body slots retained; engine occupancy selects slot 2. Native muzzle sockets and rules are unchanged.',
            'NAPOWR': 'Localized snow follows the native snow sprite; the accepted dry master supplies the architecture.',
            'NAHAND': 'Snow follows the native cap, shoulder, platform and foundation coverage.',
            'NAREFN': 'Empty storage pose. One conveyor only. Ore/storage/transfer layers will be composed separately after approval.'}[identity]
    sections.append(f'<section id="{identity}"><h2>{title} · {identity}</h2><p>{note}</p>'
                    '<h3>Native logical size · 100% browser zoom</h3>'
                    + pair(original_path, candidate_path, original.size)
                    + '<details><summary>Enlarged inspection · 3×</summary>'
                    + pair(original_path, candidate_path, tuple(v * 3 for v in original.size))
                    + '</details></section>')
    record = {'id': identity, 'theater': theater, 'raw': str(source_path), 'rawSha256': sha(source_path),
              'rawSize': master.size, 'alphaCrop': crop_box, 'nativeCanvas': original.size,
              'nativeBounds': bounds, 'uniformScale': scale, 'sourceDensity': 1 / scale,
              'offset4x': offset, 'content4x': size, 'candidateSha256': sha(candidate_path),
              'originalSha256': sha(original_path), 'runtime': 'NOT_RUN', 'acceptance': 'PENDING'}
    report['samples'].append(record)
    y = 55 + i * 280
    draw.text((24, y), title + ' / ' + identity, font=font, fill='white')
    for x, image in [(65, original), (490, resample(candidate, original.size))]:
        overview.paste(image, (x, y + 34), image)
overview.save(OUT / 'native-overview.png')

# Bind an adapted member to its actual source. All occupied temperate source
# pixels match exactly at fixed canvas coordinates; variants only add rim pixels.
dry = row_for('NAPOWR', 'TEMPERATE')
variant = row_for('NAPOWR', 'NEWURBAN')
dry_member = next(m for m in dry['members'] if 'BUILDUP' in m['roles'])
member = next(m for m in variant['members'] if 'BUILDUP' in m['roles'])
dry_raw, native = raw_for(dry_member), raw_for(member)
same_hashes = [next(m for m in row_for('NAPOWR', t)['members'] if 'BUILDUP' in m['roles'])['source']['sha256']
               for t in ['NEWURBAN', 'DESERT', 'LUNAR']]
assert len(set(same_hashes)) == 1
frames, mapping, pairs = [], [], collections.Counter()
for n in range(26):
    a, b = index_canvas(dry_raw, n), index_canvas(native, n)
    assert np.array_equal(a[a != 0], b[a != 0]), 'Changed occupied source pixels require separate artwork'
    differences = a != b
    pairs.update(zip(a[differences].tolist(), b[differences].tolist()))
    f, g = dry_raw['frames'][n], native['frames'][n]
    assert g['x'] <= f['x'] and g['y'] <= f['y']
    assert g['x'] + g['width'] >= f['x'] + f['width'] and g['y'] + g['height'] >= f['y'] + f['height']
    accepted_path = ACCEPTED / f'ntpowrmk-{n:02}-4x.png'
    report['preservedInputs'][str(accepted_path)] = sha(accepted_path)
    source_hd = Image.open(accepted_path).convert('RGBA')
    canvas = Image.new('RGBA', (840, 560))
    canvas.alpha_composite(source_hd, (f['x'] * 4, f['y'] * 4))
    trim = canvas.crop((g['x'] * 4, g['y'] * 4, (g['x'] + g['width']) * 4, (g['y'] + g['height']) * 4))
    exported = Image.new('RGBA', ((g['width'] + g['width'] % 2) * 4, (g['height'] + g['height'] % 2) * 4))
    exported.alpha_composite(trim)
    exported.save(OUT / f'nnpowrmk-{n:02}-4x.png')
    reconstructed = Image.new('RGBA', canvas.size)
    reconstructed.alpha_composite(exported, (g['x'] * 4, g['y'] * 4))
    assert np.array_equal(np.asarray(canvas), np.asarray(reconstructed)), 'Native trim lost authored pixels'
    # Render both candidates with the exact new source shadow, independently
    # from object artwork. This does not modify runtime shadow resources.
    shadow = index_canvas(native, n + 26)
    shadow_rgba = np.zeros((140, 210, 4), dtype=np.uint8)
    shadow_rgba[..., 3] = np.uint8(shadow != 0) * 96
    original = Image.fromarray(shadow_rgba)
    original.alpha_composite(decode(variant, member, n))
    hd = Image.fromarray(shadow_rgba).resize((840, 560), Image.Resampling.NEAREST)
    hd.alpha_composite(canvas)
    op, hp = OUT / f'build-original-{n:02}.png', OUT / f'build-hd-{n:02}.png'
    original.save(op)
    hd.save(hp)
    frames.append({'original': data_url(op), 'hd': data_url(hp)})
    mapping.append({'nativeFrame': n, 'nativeTrim': [g[k] for k in ['x', 'y', 'width', 'height']],
                    'aggregateFrame': member['aggregateOffset'] + n, 'addedRimPixels': int(differences.sum()),
                    'originalOccupiedPixelsMatch': True, 'authoredCanvasPixelsMatch': True,
                    'shadowNativeFrame': n + 26, 'baseSha256': sha(OUT / f'nnpowrmk-{n:02}-4x.png')})
report['powerVariant'] = {'source': member['source'], 'sharedTheaters': ['NEWURBAN', 'DESERT', 'LUNAR'],
                          'sharedSourceHashes': same_hashes, 'frames': mapping,
                          'sourcePixelDifferences': [{'from': a, 'to': b, 'count': c} for (a, b), c in pairs.items()],
                          'operation': 'Fixed accepted HD canvas; exact variant crop/padding; native variant shadow',
                          'nativeRim': '1545 blue index-11 and 3 index-198 extra retail rim pixels are not enlarged as HD artwork.',
                          'runtime': 'NOT_RUN', 'registration': 'NOT_ENABLED'}

construction = '''<section id="construction"><h2>Power Plant · NEWURBAN construction</h2>
<p>26 native frames. Accepted rigid-part artwork is unchanged on its fixed canvas. This variant has different trims and shadows. NEWURBAN, DESERT and LUNAR share the same source bytes; one adaptation can serve all three after full validation.</p>
<p><button id="play">Play</button> <button id="step">Next frame</button> <label>Frame <input id="frame" type="range" min="0" max="25" value="0"></label> <output id="frameLabel">0 / 25</output> <label><input id="reverse" type="checkbox"> Reverse / sale</label></p>
<div class="scroll"><div class="pair"><figure><figcaption>Original · native size</figcaption><img id="buildOriginal" class="original" width="210" height="140"></figure><figure><figcaption>HD · native size</figcaption><img id="buildHd" width="210" height="140"></figure></div></div>
<details><summary>Enlarged motion · 3×</summary><div class="scroll"><div class="pair"><img id="buildOriginalLarge" class="original" width="630" height="420"><img id="buildHdLarge" width="630" height="420"></div></div></details>
<p>Playback defaults to the native 7.22 frames/second before match-speed normalization. These are isolated decoded-source comparisons; actual game activation and gameplay tests follow the art decision.</p></section>'''
document = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M1.6 Soviet Buildings - Combined Representative Review</title><style>
body{font:18px/1.55 system-ui,sans-serif;color:#edf1ed;background:#17221c;margin:28px auto;padding:0 24px;max-width:1200px}h1{font-size:32px}h2{font-size:26px}h3{font-size:20px}section{border-top:1px solid #526658;margin:30px 0;padding-top:16px}.notice{background:#304538;padding:18px}.scroll{overflow-x:auto;max-width:100%}.pair{display:flex;gap:28px;width:max-content;padding:12px;background:#34483d}figure{margin:0;flex:none}figcaption{margin-bottom:8px}img{display:block;max-width:none}.original{image-rendering:pixelated}summary,button{cursor:pointer}summary{margin:14px 0}button,input{font:inherit}button{padding:6px 14px}a{color:#a8dcc3}table{border-collapse:collapse}td,th{text-align:left;padding:9px 14px;border-bottom:1px solid #526658}
</style><h1>Soviet Buildings - Combined Representative Review</h1>
<p class="notice"><strong>Representative art decision pending.</strong> Five material samples and one construction variant. Accepted M1.6/M1.7 resources remain intact; no candidate is enabled in ordinary gameplay.</p>
<p>Review at 100% browser zoom. Each first pair uses the original logical SHP canvas; HD sampling adds detail without increasing display size. Enlarged views are optional. All images and animation frames are embedded and work offline.</p>
<p>Decision scope: Industrial Plant, Battle Bunker, snow coverage/materials on Power Plant, Barracks and Refinery, and the adapted Power Plant build sequence. These are isolated sprites, not new game captures. Full-family production and game validation follow approval.</p>
''' + ''.join(sections) + construction + '''
<section><h2>Coverage and pending work</h2><table><tr><th>Scope</th><th>Current evidence</th></tr>
<tr><td>RA2 / YR original-rule roster</td><td>18 per edition, 20 union identities, 162 applicable edition/theater rows audited</td></tr>
<tr><td>NAINDP / NABNKR</td><td>Representative normal material only; damage, occupancy, full construction and functional cycles pending</td></tr>
<tr><td>Snow</td><td>Three representative materials; other distinct snow families await this art decision</td></tr>
<tr><td>NAYARD / TESLA snow reuse</td><td>All SHP member hashes match accepted art. Used palette differences remain at indices 1 / 254; runtime palette and lighting confirmation pending</td></tr>
<tr><td>New Mac app / full gameplay / 256 MiB budget</td><td>Pending full-family production and integration; no completion claim</td></tr></table>
<p>Earlier NAINDP drafts are retained: excess central housings/slats were corrected, then the silhouette proportions were refined. The initial source-audit failure and the stacked refinery reference are retained separately; neither is final evidence.</p>
<p>Approve the direction or identify corrections by building name. Continue this same M1.6 task for changes. Representative approval is separate from final visual/gameplay acceptance.</p></section>
<script>const frames=FRAMES;let index=0,timer=null;const slider=document.getElementById('frame');
function show(){for(const id of ['buildOriginal','buildOriginalLarge'])document.getElementById(id).src=frames[index].original;for(const id of ['buildHd','buildHdLarge'])document.getElementById(id).src=frames[index].hd;slider.value=index;document.getElementById('frameLabel').value=index+' / 25';}
function advance(){index=(index+(document.getElementById('reverse').checked?25:1))%26;show();}
document.getElementById('step').onclick=advance;slider.oninput=()=>{index=Number(slider.value);show();};
document.getElementById('play').onclick=function(){if(timer){clearInterval(timer);timer=null;this.textContent='Play';}else{timer=setInterval(advance,3600/26);this.textContent='Pause';}};show();</script></html>'''.replace('FRAMES', json.dumps(frames))
(OUT / 'Soviet-Buildings-Representative-Review.html').write_text(document)
report['reviewSha256'] = hashlib.sha256(document.encode()).hexdigest()
(OUT / 'review-receipt.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'status': report['status'], 'samples': len(report['samples']), 'buildFrames': len(mapping),
                  'review': str(OUT / 'Soviet-Buildings-Representative-Review.html')}))
