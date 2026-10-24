"""Create an embedded visual review from unchanged native camera captures."""
import base64
import hashlib
import html
import json
import sys
from pathlib import Path

from PIL import Image

root = Path(sys.argv[1])
records = []


def image(file, label, crop=None):
    source = root / file
    if crop:
        target = root / (source.parent.name + '-' + source.stem + '-review.png')
        with Image.open(source) as bitmap:
            bitmap.crop(crop).save(target)
    else:
        target = source
    data = target.read_bytes()
    records.append(dict(file=str(target), source=str(source), crop=crop,
        sha256=hashlib.sha256(data).hexdigest(), label=label))
    encoded = base64.b64encode(data).decode()
    return f'<figure><figcaption>{html.escape(label)}</figcaption><img src="data:image/png;base64,{encoded}" alt="{html.escape(label)}"></figure>'


def pair(title, before, after, crop):
    return f'<section><h2>{title}</h2><div class="pair">' + image(before, 'Before', crop) + image(after, 'After', crop) + '</div></section>'


sections = [
    pair('Alamo: intersection and crosswalks, 4X', 'before-alamo-4x/proad03.urb.png',
        'after-alamo-4x/proad03.urb.png', (375, 395, 790, 675)),
    pair('Alamo: parking pavement and bay markings, 4X', 'before-alamo-4x/rough03.urb.png',
        'after-alamo-4x/rough03.urb.png', (400, 480, 1070, 870)),
    pair('Austin: shared NewUrban parking, 4X', 'before-austin-4x/rough06.ubn.png',
        'after-austin-4x/rough06.ubn.png', (300, 280, 1080, 870)),
]
sections.append('<section><h2>Complete source members</h2><p>Whole-member paint is authored before splitting into the original terrain slots.</p><div class="pair">' +
    image('urban-road-markings-v5/proad14.urb-before.png', 'Urban bend: before') +
    image('urban-road-markings-v5/proad14.urb-after.png', 'Urban bend: after') + '</div></section>')
sections.append('<section><h2>Additional native controls</h2><div class="pair">' +
    image('after-ra2-alamo-2x-r2/proad03.urb.png', 'RA2 Alamo, 2X') +
    image('after-rush-hour-4x/rough06.ubn.png', 'YR Rush Hour, 4X') +
    image('after-small-town-4x/proadc13.tem.png', 'Temperate crossing, 4X') +
    image('after-sahara-4x/proadc13.des.png', 'Desert crossing, 4X') + '</div></section>')
with Image.open(root / 'ui-pressure-alamo-4x/result-pressure.png') as bitmap:
    width, height = bitmap.size
    banner_crop = tuple(round(value) for value in (width * .32, height * .43, width * .68, height * .565))
sections.append('<section><h2>Earlier UI repairs retained</h2><p>The native fallback clock remains 50% transparent. The result picture remains visible at the UI memory limit and releases on exit.</p><div class="pair">' +
    image('ui-pressure-alamo-4x/clock-shaded.png', 'Native fallback clock under pressure') +
    image('ui-pressure-alamo-4x/result-pressure.png', 'Result background under pressure', banner_crop) + '</div></section>')
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Road markings and parking repair</title><style>
body{margin:0;background:#151b22;color:#edf1f5;font:20px/1.5 -apple-system,BlinkMacSystemFont,Arial,sans-serif}
main{max-width:1400px;margin:auto;padding:32px}h1{font-size:38px;line-height:1.2}h2{font-size:28px}
p{max-width:1040px;color:#c1cbd5}section{margin:40px 0;padding-top:14px;border-top:1px solid #3b4652}
.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}figure{margin:0;background:#202831;border-radius:8px;overflow:hidden}
figcaption{padding:12px 16px;font-size:22px;font-weight:600}img{display:block;max-width:100%;height:auto;margin:auto}
.status{display:inline-block;padding:6px 12px;border-radius:6px;background:#244938;color:#d8ffea}
@media(max-width:850px){main{padding:18px}.pair{grid-template-columns:1fr}h1{font-size:32px}}
</style><main><h1>Road markings and parking repair</h1><span class="status">Native Mac checks passed · Visual review pending</span>
<p>Sharper crosswalks, intersection guides, selected city lanes and slopes, plus parking pavement matched to accepted road asphalt. The repair covers 36 complete source members reused by their maps.</p>
<p>Before and after use the same original camera positions and resolution. These controlled captures reveal the map and stop AI; they do not represent a natural long match. Snow cover, damaged road ends, sand overlays and non-urban fields are preserved. Windows execution remains unverified.</p>
'''
file = root / 'Road Repair Review.html'
file.write_text(page + ''.join(sections) + '</main></html>')
(root / 'review-images.json').write_text(json.dumps(dict(file=str(file), images=records,
    sha256=hashlib.sha256(file.read_bytes()).hexdigest()), indent=2) + '\n')
print(json.dumps(dict(file=str(file), images=len(records), bytes=file.stat().st_size)))
