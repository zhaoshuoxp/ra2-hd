"""Build standalone, image-embedded review pages from immutable exports and native evidence."""
from pathlib import Path
from PIL import Image
import base64, html, io, json, sys

root = Path(__file__).resolve().parents[2]
art = root / '.artifacts/menu-ui'
revision = sys.argv[1] if len(sys.argv) > 1 else 'original-screens-v4'
runtime = art / (sys.argv[2] if len(sys.argv) > 2 else 'runtime-screens-v7')
out = art / (sys.argv[3] if len(sys.argv) > 3 else 'review-original-v3')
out.mkdir(parents=True, exist_ok=True)
pack = root / '.local/ui-packs' / revision
manifest = json.loads((pack / 'manifest.json').read_text())
assets = {a['id']: a for a in manifest['assets']}
sources = json.loads((art / 'ui-originals/inventory.json').read_text())
sources += json.loads((art / 'ui-originals/inventory-yuri.json').read_text())
by_key = {a['key']: a for a in sources}

def uri(source):
    if isinstance(source, Image.Image):
        buf = io.BytesIO(); source.save(buf, format='PNG'); data = buf.getvalue()
    else:
        data = Path(source).read_bytes()
    return 'data:image/png;base64,' + base64.b64encode(data).decode()

def picture(source, label, width=None, cls=''):
    style = f' style="width:calc({width}px * var(--scale))"' if width else ''
    return f'<figure class="{cls}"><figcaption>{html.escape(label)}</figcaption><img alt="{html.escape(label)}" src="{uri(source)}"{style}></figure>'

def original(key, frame=0):
    a = by_key[key]
    return Image.open(art / 'ui-originals' / a['framesData'][frame]['file'].replace('.rgba', '.png')).convert('RGBA')

def restored(key, frame=0):
    a, entry = assets[key], by_key[key]
    w, h = entry['width'] * 4, entry['height'] * 4
    return Image.open(pack / a['file']).convert('RGBA').crop((frame*w, 0, (frame+1)*w, h))

def sidebar(side, hd):
    # A labeled assembly preview uses the existing 900-high HUD coordinates.
    result = Image.new('RGBA', (672, 3600), (0, 0, 0, 255))
    def place(name, x, y, frame=0):
        key = side + '-' + name
        if hd and key in assets:
            image = restored(key, frame)
        elif hd and name == 'radar':
            image = Image.open(pack / assets[side+'-radar-base']['file']).convert('RGBA')
        else:
            image = original(key, frame)
            image = image.resize((image.width*4, image.height*4), Image.Resampling.NEAREST)
        result.alpha_composite(image, (x*4, y*4))
    for name, y in [('credits',0), ('top',16), ('radar',48), ('side1',158)]: place(name,0,y)
    for row in range(12):
        place('side2b',0,227+50*row); place('side2',0,227+50*row)
    place('side3',0,827); place('addon',0,853)
    soviet = side != 'allied'
    for name,x in [('diplobtn',14 if soviet else 12),('optbtn',86 if soviet else 84)]: place(name,x,21 if soviet else 20)
    for name,x in [('repair',34 if soviet else 20),('sell',86 if soviet else 84)]: place(name,x,165 if soviet else 166)
    for tab in range(4): place('tab0'+str(tab),(20 if soviet else 26)+tab*(32 if soviet else 29),197,1 if tab==0 else 0)
    place('r-up',38,834,2); place('r-dn',84,834,2)
    return result

style = '''<style>
:root{color-scheme:dark;--scale:1.2}*{box-sizing:border-box}body{margin:0 auto;padding:28px;max-width:1600px;background:#171a20;color:#eceef4;font:18px/1.5 system-ui}
h1{font-size:32px}h2{font-size:26px;margin-top:36px}a{color:#a6cbff}nav{position:sticky;top:0;padding:12px;background:#242832;z-index:10;display:flex;gap:16px;flex-wrap:wrap;align-items:center}
button,select,input{font:inherit}button,select{padding:6px 12px}section{padding:18px 0;border-bottom:1px solid #454b59}.pair{display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start}
figure{margin:12px 0;max-width:100%}figcaption{margin-bottom:8px;color:#c6cbd7;font-size:16px}img{display:block;height:auto;max-width:100%;background:#080a0e}.states{overflow:auto}.states img{max-width:none}
.screens img{cursor:zoom-in;max-width:100%;width:100%}.screens img.full{max-width:none;width:auto;cursor:zoom-out}.screens figure{overflow:auto}summary{cursor:pointer;padding:12px;background:#252b36}
table{border-collapse:collapse;width:100%;font-size:16px}td,th{padding:10px;border:1px solid #454b59;text-align:left}code{font-size:15px}.note{padding:16px;background:#292f3b;border-left:4px solid #a9caff}
</style>'''
script = '''<script>document.querySelector('#size')?.addEventListener('change',e=>document.documentElement.style.setProperty('--scale',e.target.value));document.querySelectorAll('.screens img').forEach(i=>i.onclick=()=>i.classList.toggle('full'));document.querySelectorAll('[data-radar-slider]').forEach(s=>s.oninput=()=>{const box=s.closest('section');box.querySelector('output').textContent=s.value;box.querySelectorAll('[data-radar-frame]').forEach(f=>f.hidden=f.dataset.radarFrame!==s.value)});</script>'''

def page(title, body):
    return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+title+'</title>'+style+'<body><h1>'+title+'</h1>'+body+script+'</body></html>'

nav = '<nav><a href="review.html">Artwork and states</a><a href="screens.html">Native screens and aspect ratios</a><a href="radar.html">All radar frames</a><label>Output scale <select id="size"><option value="1.2">1080p / 1.2x</option><option value="2.4">4K / 2.4x</option><option value="4">Export pixels / 4x</option></select></label></nav>'
body = nav + '<p class="note">New menu/loading/control artwork: ART_REVIEW_PENDING. Twelve sidebar cameos: USER_ACCEPTED, unchanged. Images are embedded in this HTML; no adjacent PNG files are required. Output-size labels assume 100% browser zoom.</p>'
body += '<h2>Original menu design</h2><p>The original animated movie, red contour map and mechanical button motion are retained. Enabled buttons use the original red/orange/yellow palette; disabled buttons remain unlit. The movie is a conservative 3x resample of the original frames.</p>'
body += picture(runtime/'menu-1080p.png','Native macOS review: original movie and red menu buttons',cls='screens')
for f in range(5):
    a=Image.open(pack/'menu-button-states.png').crop(((f%4)*624,(f//4)*168,(f%4+1)*624,(f//4+1)*168))
    body += '<div class="pair">'+picture(original('menu-sdbtnanm',f),f'Original button state {f}',156)+picture(a,f'Candidate state {f}',156)+'</div>'
body += '<h2>Loading: nine original specialty units</h2><p>Only the original 186 x 150 unit region is restored. Country maps, flags, source composition, live text and progress remain in their original roles. The empty center corridor expands for wide screens; the unit, map and flag are never stretched.</p>'
for country in ['ustates','france','germany','ukingdom','russia','cuba','libya','iraq','korea']:
    body += '<section><h3>'+country+'</h3><div class="pair">'+picture(art/'original-screens/units'/f'{country}.png','Original unit region',186)+picture(pack/f'loading-unit-{country}.png','Faithful HD candidate',186)+'</div></section>'
body += '<h2>Soviet source material and corrected alignment</h2><p>The original skin uses brass trim, silver plates and red symbols. The old mixed blue-button screenshot resolved Allied controls inside a Soviet layout. These current native captures use the correct Soviet archive in both modes.</p><div class="pair">'
for filename, label in [('sidebar-original-fixture.png','Original Soviet retail skin'),('sidebar-fixture-4k.png','Corrected HD Soviet skin')]:
    image = Image.open(runtime / filename)
    scale = image.height / 900
    image = image.crop((round(image.width - 168*scale), 0, image.width, round(290*scale)))
    body += picture(image,label,168)
body += '</div>'
body += '<h2>Faction sidebars</h2><p>Assembly previews below use original HUD coordinates. Live credits, names, minimap, queues and game content are omitted here and remain dynamic in the game. Yuri uses the verified original Soviet shared skin plus its separate purple radar emblem; Yuri is an asset preview only, because no playable Yuri HUD route exists in this engine.</p>'
for side in ['allied','soviet','yuri']:
    body += '<section><h3>'+side.title()+(' — dormant assets' if side=='yuri' else '')+'</h3><div class="pair">'+picture(sidebar(side,False),'Original assembly',168)+picture(sidebar(side,True),'Candidate assembly',168)+'</div>'
    body += '<details><summary>All authored control and panel states</summary>'
    for key,a in assets.items():
        if not key.startswith(side+'-') or key not in by_key: continue
        e=by_key[key]; strip=Image.new('RGBA',(e['width']*e['frames'],e['height']))
        for f in range(e['frames']): strip.paste(original(key,f),(f*e['width'],0))
        body += '<div class="states"><h4>'+key+'</h4>'+picture(strip,'Original: all source frames',strip.width)+picture(pack/a['file'],'Candidate: matching complete state group',a['logicalWidth'])+'</div>'
    body += '</details></section>'
radars = nav
radars += '<h2>Complete radar transitions: all three factions</h2><p>Each original 33-frame sequence uses one restored emblem and original darkening and flash maps, composited at 4x. Scan bands, white flashes and noise keep their source content. These are native renderer texture captures, including a detached Yuri fixture; the frame slider is for inspection, while the game retains original animation timing.</p>'
for side in ['allied','soviet','yuri']:
    radars += f'<section><h3>{side.title()}</h3><label>Frame <output>0</output> / 32 <input data-radar-slider type="range" min="0" max="32" value="0"></label>'
    for frame in range(33):
        radars += f'<div data-radar-frame="{frame}"'+(' hidden' if frame else '')+'><div class="pair">'
        radars += picture(original(side+'-radar',frame),f'Original frame {frame}',168)
        radars += picture(runtime/f'{side}-radar-{frame}.png',f'HD renderer frame {frame}',168)+'</div></div>'
    radars += '</section>'
(out/'radar.html').write_text(page('Complete radar animation frame review',radars))
body += '<h2>Complete radar transitions</h2><p><a href="radar.html">Inspect all 99 original and HD radar frames</a>. Original flash, scanning, noise and timing are retained, while the restored emblem stays high-resolution throughout the transition.</p>'
body += '<h2>Coverage and remaining work</h2><p>PARTIAL_BATCH_DELIVERED. This review does not claim the entire interface is HD.</p>'
body += '<table><tr><th>Group</th><th>Current state</th><th>Remaining</th></tr>'
for group,status,remaining in [
 ('Sidebar cameos','12 representative exports accepted, 240 x 192','104 additional unique build-menu references; alternate/superweapon completion'),
 ('Loading','9 unit regions restored; wide layout implemented','Visual approval; remaining background pixels retain original detail'),
 ('Allied and Soviet UI','21 complete control/panel families and one radar base each','Command-bar glyphs, final visual approval'),
 ('Yuri UI','21 shared families and independent radar base prepared','Dormant only; command glyphs and expansion cameos remain Original'),
 ('Home menu','Original movie with 3x resampling; 17 restored mechanical button states','Other frame/monitor art remains Original; direction approval'),
 ('Dialogs, flags and small raster widgets','Source and density inventory complete','Raster restoration remains pending'),
 ('Text, progress and flat-color indicators','Live rendering and original geometry preserved','Final human readability review'),
 ('Platforms','macOS Electron checks; emulated Retina and MacBook-shaped viewports','Physical MacBook panel/input UNVERIFIED; Windows NOT RUN')]:
    body += '<tr>'+''.join('<td>'+html.escape(v)+'</td>' for v in [group,status,remaining])+'</tr>'
body += '</table><p>Exact source identities and remaining raster families: <a href="completeness.json">completeness.json</a>. Accepted world artwork, geometry, targeting cursors and the single HD setting remain preserved.</p>'
(out/'review.html').write_text(page('Original-style UI and loading review',body))

screens=nav+'<p class="note">Actual macOS Electron captures. CDP supplies the viewport sizes and densities; these are not physical-panel certification. Click an image to inspect its exported pixels. Country loading screens are explicitly staged native-component fixtures.</p>'
for name in ['menu-1080p','menu-4k','menu-original','sidebar-fixture-1080p','sidebar-fixture-4k','sidebar-original-fixture','allied-second-match','options','skirmish-5']:
    screens += picture(runtime/(name+'.png'),name,cls='screens')
for country in ['ustates','france','germany','ukingdom','russia','cuba','libya','iraq','korea']:
    screens += picture(runtime/f'country-{country}-4k.png',country+' loading — native component at 4K',cls='screens')
for size in ['1920x1200','1512x982','1728x1117','1280x832','1440x932']:
    screens += '<section><h2>'+size+'</h2>'+picture(runtime/f'menu-aspect-{size}.png','Menu viewport '+size,cls='screens')+picture(runtime/f'loading-aspect-{size}.png','Loading viewport '+size+' at DPR 2',cls='screens')+'</section>'
(out/'screens.html').write_text(page('Native screen and aspect-ratio evidence',screens))

inventory = json.loads((art/'inventory-complete.json').read_text())
usage = {e['member']:e for e in inventory['ui']}
rows=[]
for e in sources:
    key=e['key']; entry=assets.get(key) or assets.get(key+'-base')
    if key=='menu-sdbtnanm': entry=assets['menu-button-states']
    base=usage.get(e['member'],{})
    rows.append(dict(e,classification='animated raster' if e['frames']>1 else 'raster',
        screenUsage=base.get('screenUsage','dormant Yuri sidebar'),references=base.get('references',[]),
        route=entry['id'] if entry else None,hdSize=[entry['width'],entry['height']] if entry else None,
        status=('DORMANT_' if key.startswith('yuri-') else '')+('ART_REVIEW_PENDING' if entry else 'ORIGINAL_RETAINED'),
        densityStatus='4X_AUTHORED' if entry else 'FLAT_COLOR_NATIVE' if key.endswith('-powerp') else 'RESTORATION_PENDING',
        fallback='Complete Original state family; unchanged geometry and interaction'))
receipt=dict(status='PARTIAL_BATCH_DELIVERED',revision=revision,acceptedCameos=12,loadingUnits=9,
    runtime=str(runtime.relative_to(root)),rasterFamilies=rows,
    remainingCameos=json.loads((art/'review-v4/remaining-cameos.json').read_text()),
    platforms={'macOS':'See native runtime receipt','Windows':'NOT RUN','physicalMacBookPanel':'UNVERIFIED'})
(out/'completeness.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({name:(out/name).stat().st_size for name in ['review.html','screens.html','radar.html','completeness.json']}))
