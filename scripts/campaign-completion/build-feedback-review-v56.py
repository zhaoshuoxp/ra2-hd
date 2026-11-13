"""Build the compact, self-contained review from actual native feedback captures."""
import base64
import hashlib
import html
import json
from io import BytesIO
from pathlib import Path
import sys
from PIL import Image

root, output = map(Path, sys.argv[1:3])
figures = [('Original failure',
  'Actual shipped V55 opening: two live HD NASAM assemblies remain at identity world transforms and submit '
  'no color draw. This retained failure precedes camera tours.',
  'baseline-all11-4x-wide/attempt-0-sustained-real-time.png'),
 ('Repaired original openings',
  'Repaired Allied11 player base, 4X. All three original NASAM assemblies have correct transforms and actual '
  'color draw callbacks. The low blue pillboxes are original map objects.',
  'fixed-all11-4x-return/attempt-0-base-paused.png'),
 ('Repaired original openings',
  'Independent 2X original Allied11 opening after offscreen return. Native logical positions and accepted '
  'artwork remain unchanged.',
  'fixed-all11-2x-return-r2/attempt-0-return-paused.png'),
 ('Previously reported maps',
  'Original Hawaii opening, 2X, with complete original AA assemblies after normal view return.',
  'fixed-hawaii-2x/attempt-0-return-paused.png'),
 ('Previously reported maps',
  'Original finale Flak at 4X. All sixteen source batteries pass position/state checks; this camera view is '
  'disclosed diagnostic reveal.',
  'fixed-all12-4x/first-view-paused-NAFLAK-2510.png'),
 ('Previously reported maps',
  'Normally paid finale Patriot at 4X after sustained play and camera return. Source mission and production '
  'rules are retained.',
  'fixed-all12-4x/sustained-return-NASAM-4162.png'),
 ('Save and fallback',
  'A real named save created in the old application with missing NASAM assemblies restores in the fixed '
  'runtime. World/RNG/variables/teams/queues continue exactly for 180 turns.',
  'old-save-to-fixed-development/actual-old-save-restored-with-complete-turrets.png'),
 ('Save and fallback',
  'Complete Original-quality fallback in the original Allied11 base. No HD/native material mixture is '
  'introduced.',
  'fixed-original-fallback/attempt-0-base-paused.png')]
rows = []
for section, caption, relative in figures:
    data = (root / relative).read_bytes()
    original = Image.open(BytesIO(data)).convert('RGBA')
    encoded = BytesIO()
    original.save(encoded, format='WEBP', lossless=True, method=6)
    compressed = encoded.getvalue()
    assert Image.open(BytesIO(compressed)).convert('RGBA').tobytes() == original.tobytes()
    rows.append(dict(section=section, caption=caption, source=relative, sha256=hashlib.sha256(data).hexdigest(),
                     encoding='lossless-webp-exact-rgba', image='data:image/webp;base64,' + base64.b64encode(compressed).decode()))
summary = json.loads((root / 'host-final-r1/summary.json').read_text())
assert summary['acceptance'] == 'HOST_TESTS_PASS_NATIVE_RUNTIME_NOT_RUN'
assert not summary['omitted'] and all(summary['counts'][key] == 0 for key in
    ['failedCases', 'loadErrors', 'skipped', 'processErrors'])
sections = []
for section in dict.fromkeys(row['section'] for row in rows):
    cards = ''.join('<figure><button class="image-button" onclick="showImage(this)"><img loading="lazy" src="' + row['image']
                    + '" alt="' + html.escape(row['caption'], quote=True) + '"></button><figcaption>' + html.escape(row['caption'])
                    + '</figcaption></figure>' for row in rows if row['section'] == section)
    sections.append('<section><h2>' + html.escape(section) + '</h2><div class="grid">' + cards + '</div></section>')
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Red Alert 2 HD 0.3 — V56 consolidated feedback review</title><style>
*{box-sizing:border-box}body{margin:0;background:#151b21;color:#e5ecf3;font:19px/1.55 system-ui,sans-serif}main{max-width:1640px;margin:auto;padding:34px}h1{font-size:34px;margin:0 0 16px}h2{font-size:27px;margin:36px 0 15px}p{max-width:1280px}.note{border-left:4px solid #6dc7ff;padding:14px 20px;background:#202a34}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}figure{margin:0;background:#202932;border:1px solid #3a4755;border-radius:8px;overflow:hidden}img{display:block;width:100%;height:auto}figcaption{padding:15px 18px;font-size:18px}footer{margin:35px 0 12px;color:#adb8c4;font-size:17px}@media(max-width:1000px){.grid{grid-template-columns:1fr}main{padding:20px}}
.image-button{display:block;border:0;padding:0;width:100%;background:transparent;cursor:zoom-in}dialog{max-width:96vw;max-height:94vh;padding:0;background:#12181e;color:white;border:1px solid #8096aa}dialog::backdrop{background:#000c}dialog>button{position:sticky;top:0;left:0;padding:10px 22px;font-size:19px;z-index:1}dialog .image-scroll{overflow:auto;max-height:85vh;max-width:94vw}dialog img{width:auto;max-width:none}
</style><dialog id="zoom"><button onclick="this.parentElement.close()">Close full-size image</button><div class="image-scroll"><img alt="Full-size native capture"></div></dialog><script>function showImage(button){const dialog=document.querySelector('#zoom');dialog.querySelector('img').src=button.querySelector('img').src;dialog.showModal();}</script><main><h1>Red Alert 2 HD 0.3 — V56 consolidated feedback review</h1>
<p class="note">This review covers the reopened intermittent missing AA assemblies. Actual original mission captures, a retained old-application failure and exact old-save restoration are shown together. Click an image for its full native size. Technical checks and user acceptance remain separate.</p>
<p>HD assemblies can arrive after a static building has completed its matrix traversal. The old code left new meshes at the world origin while their native turrets were hidden. The shared constructor now marks each new local transform for the normal next world pass. Culling, per-frame performance policy, simulation, memory budgets and all accepted bitmap resources are retained.</p>
<p>HOST_SUMMARY. Two regressions reject the old code and pass for all six turret contracts/eight headings after repair. Native checks verify actual world transforms and real color draws across cold/repeated openings, 2X/4X, camera return, original Hawaii/finale AA and old-application named-save restart. Original mission actors, source rules, money, health, goals and RNG are unedited; camera/reveal assistance is explicitly disclosed.</p>
SECTIONS
<footer>The original 26-map inventory and 24/24 story HD loading pages remain unchanged. Prior original-executable qualifications remain. Native Windows and physical 8/16GiB target machines are untested. No full mission victory is claimed from these rendering checks. Previous deliveries and actual saves/settings are preserved; local delivery only.</footer></main></html>'''
page = page.replace('HOST_SUMMARY', str(summary['counts']['pass']) + ' host cases pass with zero failures, loading errors, process errors, omissions or skips')
page = page.replace('SECTIONS', ''.join(sections))
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(page)
receipt = dict(status='SELF_CONTAINED_CONSOLIDATED_REVIEW_READY_USER_ACCEPTANCE_PENDING', file=str(output.resolve()),
               sha256=hashlib.sha256(output.read_bytes()).hexdigest(), figures=[{key: value for key, value in row.items() if key != 'image'} for row in rows])
output.with_suffix('.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(file=str(output), figures=len(rows), bytes=output.stat().st_size)))
