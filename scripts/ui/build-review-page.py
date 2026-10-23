"""Consolidated review with native captures and a resumable source-backed completeness matrix."""
from pathlib import Path
from PIL import Image
import json, html, shutil
root=Path('.artifacts/menu-ui'); out=root/'review-v1';out.mkdir(exist_ok=True)
run=root/'runtime-v2'; inv=json.loads((root/'inventory-v1/inventory.json').read_text())
manifest=json.loads(Path('.local/ui-packs/direction-v1/manifest.json').read_text())
selected={a['id'] for a in manifest['assets']}
for a in manifest['assets']:
    shutil.copyfile(Path('.local/ui-packs/direction-v1')/a['file'],out/a['file'])
for p in run.glob('*.png'): shutil.copyfile(p,out/p.name)
# Retain both source identity and actual per-object inclusion; no substring faction guesses.
rows=[]
for r in inv['roster']:
    if r['inclusion']!='BUILD_MENU_CANDIDATE': continue
    row=dict(r)
    row['normalStatus']='DIRECTION_CANDIDATE' if r['cameo'] in selected else 'NOT_AUTHORED'
    row['alternateStatus']='SAME_AS_NORMAL' if r['alternate']==r['cameo'] else 'NOT_AUTHORED'
    rows.append(row)
(out/'completeness.json').write_text(json.dumps(rows,indent=2)+'\n')
remaining=sorted({name for r in rows for name in [r['cameo'],r['alternate']] if name not in selected})
(root/'remaining-cameos.json').write_text(json.dumps(dict(status='DIRECTION_REVIEW_PENDING',remaining=remaining),indent=2)+'\n')
styles='''body{background:#111820;color:#e4e9ef;font:18px/1.5 system-ui;margin:24px}h1{font-size:30px}h2{font-size:25px}a{color:#b6d5ff}button,select{font:inherit;padding:8px 14px}main{max-width:1800px;margin:auto}.notice{padding:16px;border:1px solid #9b7840;background:#30291c}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}.panel{overflow:auto;background:#080c10;padding:10px}.panel img{max-width:100%;height:auto}.native .panel img{max-width:none}figcaption{font-size:16px}.cameos{display:flex;flex-wrap:wrap;gap:18px}.cameo{width:270px;border:1px solid #506070;padding:12px}.actual{width:76.8px;height:57.6px;object-fit:contain}.large{width:256px;height:192px;object-fit:contain;display:block;margin-top:12px}table{border-collapse:collapse;width:100%;font-size:15px}td,th{border:1px solid #455363;padding:6px;text-align:left}code{word-break:break-word}.scroll{max-height:600px;overflow:auto}.controls{display:flex;gap:18px;flex-wrap:wrap}.control{width:146px;height:42px;font:16px system-ui;color:#e9e4d4;border:1px solid #717b84;border-radius:2px;background:linear-gradient(#39424b,#1e252c 52%,#171c22);box-shadow:inset 0 1px #a0a7ab66,inset 0 -2px #05070a}.control:hover:enabled{border-color:#dbb65a;background:linear-gradient(#55513d,#302c22)}.control:active:enabled{box-shadow:inset 0 2px 5px #000;background:#181e23}.control:disabled{color:#a8a8a8;border-color:#51565b;background:linear-gradient(#2a2e32,#202327)}.control:focus-visible{outline:2px solid #ffe48a;outline-offset:-4px}@media(max-width:900px){.pair{grid-template-columns:1fr}}'''
parts=[f'<!doctype html><meta charset="utf-8"><title>RA2 HD Menu and UI Direction Review</title><style>{styles}</style><main>',
'<h1>Menu, UI and cameo direction review — revision 1</h1>',
'<p class="notice"><b>DIRECTION_REVIEW_PENDING · PARTIAL_BATCH_DELIVERED</b><br>Review candidates: 12 normal cameos, one decorative background reused in menu/loading, scalable control states. Accepted shell/sidebar panels remain Original. This is not full UI HD completion. Art promotion and physical input acceptance remain pending.</p>',
'<p>Native macOS Electron captures use CDP viewport/density emulation. 1080p and 4K retain the same 1600×900 logical view. No physical 4K panel or Windows execution is claimed. The mixed cameo HUD is an explicitly staged native-widget fixture; world units and gameplay rules are unchanged.</p>',
'<button onclick="document.body.classList.toggle(\'native\')">Toggle native screenshot pixels / fit</button>']
for title,stem in [('Main menu','menu'),('Loading screen','loading'),('Gameplay','game'),('Native sidebar with mixed representative cameos','sidebar-fixture')]:
    parts.append(f'<h2>{title}</h2><div class="pair">')
    for size in ['1080p','4k']:
        p=out/f'{stem}-{size}.png'
        if p.exists():
            im=Image.open(p);parts.append(f'<figure class="panel"><img src="{p.name}"><figcaption>{size} · {im.width}×{im.height} source pixels</figcaption></figure>')
    parts.append('</div>')
parts+=['<h2>Scalable controls</h2><p>146×42 logical main-menu hit rectangle; 1px bevel, 6px horizontal text inset, 2px inset focus ring. Hover, hold, Tab and Space exercise shared deterministic states. No per-state raster generation.</p><div class="controls"><button class="control">Normal / hover</button><button class="control">Press and hold</button><button class="control" disabled>Unavailable</button><button class="control">Keyboard focus</button></div>',
'<h2>Cameo direction at actual sidebar size</h2><p>Top image: 76.8×57.6 CSS pixels, matching a 64×48 logical cameo at 1080p with the accepted 900-high presentation. Lower image: separate 4× inspection crop. Chinese names stay live in the actual application. The generated tank silhouettes and the building interpretation require explicit visual review.</p><div class="cameos">']
for a in manifest['assets']:
    if not a['id'].endswith('.shp'):continue
    original=root/'inventory-v1'/f"{a['id'][:-4]}.png"
    if original.exists():shutil.copyfile(original,out/('original-'+a['file']))
    parts.append(f'<div class="cameo"><b>{html.escape(a["id"])}</b><p><img class="actual" src="{a["file"]}">')
    if original.exists():parts.append(f' <img class="actual" src="original-{a["file"]}" title="Original">')
    parts.append(f'</p><img class="large" src="{a["file"]}"><small>Candidate, not accepted</small></div>')
parts.append('</div><h2>Per-object completeness</h2><p>All vanilla build-menu candidates, including country prerequisites and veteran variants. Shared icons are counted once in production. A world-unit master does not imply a completed cameo.</p><div class="scroll"><table><tr><th>Object</th><th>Kind</th><th>Normal</th><th>Alternate</th><th>Prerequisites / house restrictions</th></tr>')
for r in rows:
    parts.append('<tr>'+''.join(f'<td>{html.escape(str(v))}</td>' for v in [r['id'],r['kind'],r['cameo']+' / '+r['normalStatus'],r['alternate']+' / '+r['alternateStatus'],', '.join(r['prerequisites']+r['requiredHouses'])])+'</tr>')
parts.append('</table></div><h2>Screen checklist</h2><table><tr><th>Screen / group</th><th>Artwork / live implementation</th><th>Direction status</th></tr>')
screens=[('Home','New static decorative candidate only when no menu video source; original animation retained; six native buttons','Candidate'),('Skirmish','Original preview/maps, live localized text and native widgets','Inventoried; raster work pending'),('Options / dialogs / pause / exit','Shared deterministic bevels; native fonts, hit rectangles and existing settings','Control direction candidate; panels pending'),('Loading','Candidate background uses cover crop; original live progress and 800×600 safe content layout','Candidate'),('HUD sidebar panels/tabs/radar','Original Allied/Soviet frames and native frame timing','Inventoried; authoring pending'),('HUD cameos','12 normal RGBA candidates; live localized name, clock, queue and disabled state','Direction pending; all alternate art pending'),('Credits / text / geometry','Existing output-density glyph path and scalable primitives','Preserve / technical regression'),('Shared cursors / range targeting','Accepted R4 art, native hotspots and targeting geometry','Preservation baseline'),('Yuri expansion','Separate archive-backed dormant source inventory; no runtime route or faction unlock','Source audited; dormant, not authored'),('Future optional toolbar','Type-only overlay contract, no allocation or viewport reservation','No visible UI or trainer behavior')]
for row in screens:parts.append('<tr>'+''.join(f'<td>{html.escape(v)}</td>' for v in row)+'</tr>')
parts.append('</table><p>Full source identities and remaining names: <a href="inventory.json">asset inventory</a> · <a href="completeness.json">per-object checklist</a> · <a href="yuri-dormant.json">dormant expansion audit</a> · <a href="validation.json">runtime evidence</a></p></main>')
(out/'review.html').write_text(''.join(parts))
shutil.copyfile(root/'inventory-v1/inventory.json',out/'inventory.json')
shutil.copyfile(root/'yuri-dormant-v1/inventory.json',out/'yuri-dormant.json')
if (run/'result.json').exists():shutil.copyfile(run/'result.json',out/'validation.json')
print('Review:',out/'review.html','Remaining unique cameo references:',len(remaining))
