"""Self-contained native-versus-HD review with exported sizes and rank variants."""
import base64
import html
import io
import json
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[3]
ART=ROOT/'.artifacts/shared-cameos'
report=json.loads((ART/'production-v1/export-report.json').read_text())
pack=ROOT/'.local/ui-packs'/report['selection']['revision']
manifest=json.loads((pack/'manifest.json').read_text())
names={'bfrticon':'Battle Fortress','bnkricon':'Battle Bunker','brisicon':'Boris','gdgiicon':'Guardian GI',
       'indpicon':'Industrial Plant','rbccicon':'Robot Control Center','roboicon':'Robot Tank',
       'schpicon':'Siege Chopper','spypicon':'Spy Plane power'}
def img(path,label,width=None):
    data=base64.b64encode(Path(path).read_bytes()).decode()
    return f'<img alt="{html.escape(label)}" '+(f'width="{width}" ' if width else '')+f'src="data:image/png;base64,{data}">'
parts=['''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shared RA2 / YR cameo omissions</title><style>
body{font:18px/1.5 system-ui;max-width:1320px;margin:auto;padding:30px;background:#17202a;color:#e5edf5}h1{font-size:34px}h2{font-size:27px}h3{font-size:22px}section{border:1px solid #526171;padding:18px;margin:18px 0}.row{display:flex;align-items:flex-start;gap:20px;flex-wrap:wrap}figure{margin:0}img{display:block;max-width:100%;height:auto}figcaption{margin-top:6px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #526171;padding:10px;text-align:left}summary{cursor:pointer}small{font-size:16px}
</style><h1>Shared RA2 / Yuri's Revenge cameo omissions</h1><p>Both editions were audited against native rules, all Allied/Soviet multiplayer houses and the selected HD catalog. RA2 has no missing normal build-menu HD entries. Yuri's Revenge was missing nine canonical pictures and four veteran aliases. Both editions also declared an absent Harrier veteran source, which previously resolved to a placeholder.</p><p>The additive catalog keeps all 474 accepted entries and now contains 488. Nine new pictures have independent 120 by 96 and 240 by 192 exports. Five veteran identities reuse their normal HD base plus the existing shared rank overlay. UI stays 60 by 48 logical units and fixed 4X, independent of world density; the 16 MiB limit is unchanged. New appearance awaits user review.</p>''']
for name,title in names.items():
    parts.append('<section><h2>'+html.escape(title)+' <small>'+name+'.shp</small></h2><div class="row">')
    for path,label,width in [(ART/f'references-v1/{name}.png','Native source (pixel enlargement)',240),
        (ART/f'production-v1/4x/{name}.png','HD 4X: 240 x 192',240),
        (ART/f'production-v1/2x/{name}.png','HD 2X export: 120 x 96',120),
        (ART/f'production-v1/4x/{name}.png','Logical icon size: 60 x 48',60)]:
        parts.append('<figure>'+img(path,label,width)+'<figcaption>'+label+'</figcaption></figure>')
    parts.append('</div><details><summary>Authored master</summary>'+img(ART/f'production-v1/masters/{name}.png',title,1000)+'</details></section>')
parts.append('<h2>Veteran aliases</h2><div class="row">')
overlay=Image.open(pack/next(a['file'] for a in manifest['assets'] if a['id']=='cameo-rank')).convert('RGBA')
review=ART/'review-v1';review.mkdir()
for alias in report['aliases']:
    entry=next(a for a in manifest['assets'] if a['id']==alias['alias'])
    image=Image.open(pack/entry['file']).convert('RGBA');image.alpha_composite(overlay)
    target=review/(alias['alias']+'.png');image.save(target)
    parts.append('<figure>'+img(target,alias['alias'],240)+'<figcaption>'+alias['alias']+'</figcaption></figure>')
parts.append('''</div><h2>Audit boundaries</h2><p>RA2: 87 eligible production rules and 117 distinct relevant normal/veteran/power references. YR: 92 eligible shared-faction production rules and 127 relevant references. Country specialties and stolen technology are included in the source audit. Nonbuildable scenery, aircraft launched by other units, campaign-only objects, unused declarations and placeholders are recorded separately and are not invented build-menu content.</p><p>The missing falcuico.shp declaration now uses the existing falcicon.shp native frame as its Original fallback and the accepted HD base plus rank overlay in HD mode. Native engineer veteran art is unused because engineers are not trainable; other missing native campaign/placeholder declarations remain outside the build-menu correction.</p><p>Runtime evidence is recorded separately in docs/shared-cameos-coverage.json. Source checks do not substitute for actual sidebar bindings, nor does a technical pass imply user appearance acceptance. Existing R8 corrections are user accepted and preserved.</p></html>''')
(review/'Shared-Cameos-Review.html').write_text(''.join(parts))
print('PASS_OFFLINE_REVIEW_CREATED',len(names),len(report['aliases']))
