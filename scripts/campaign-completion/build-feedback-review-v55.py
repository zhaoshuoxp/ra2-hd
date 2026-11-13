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
figures = [
    ('Allied10 original bases', 'Upper source base after original deployment, paid construction and factory production.', 'base-normal-complete-sites-r1/actual-BadGuy1-paid-base.png'),
    ('Allied10 original bases', 'Middle source base after legal foundation clearance, deployment and real paid production.', 'base-normal-complete-sites-r1/actual-BadGuy2-paid-base.png'),
    ('Allied10 original bases', 'Lower source base after legal foundation clearance, deployment and real paid production.', 'base-normal-complete-sites-r1/actual-BadGuy3-paid-base.png'),
    ('Allied11 original encounter', 'Actual original squid and civilian ship. The rocking pivot remains on the native hull edge; source attack cadence and simulation are retained.', 'squid-fixed-original-2x-r1/actual-CRUISE-bounded-rocking.png'),
    ('Allied12 original and paid defenses', 'First paused view of original finale Flak, 4X. Actual Ready construction state now shows the complete turret immediately.', 'aa-fixed-4x-r2/first-view-paused-NAFLAK-2510.png'),
    ('Allied12 original and paid defenses', 'Normally paid Patriot after sustained play and camera return, 4X.', 'aa-fixed-4x-r2/sustained-return-NASAM-4162.png'),
    ('Allied12 original and paid defenses', 'Normally built Patriot restored after a named save and full application restart. Turret is visible immediately while paused; no diagnostic reveal is used in this save test.', 'save-completed-aa-r1/actual-restored-paused-patriot.png'),
    ('Allied12 original and paid defenses', 'Original-quality fallback: source finale Flak is complete in the first paused view.', 'aa-fixed-original-r1/first-view-paused-NAFLAK-2510.png'),
    ('Labeled shared skirmish checks', 'Specialized original-rule skirmish fixture: DEST receives an ordinary squid attack with its pivot clipped to the hull. Background bot updates are disabled. This is not campaign story evidence.', 'squid-fixed-skirmish-4x-r3/actual-DEST-bounded-rocking.png'),
    ('Labeled shared skirmish checks', 'The same labeled fixture checks AEGIS through the shared rocking path. Geometry and accepted artwork are retained.', 'squid-fixed-skirmish-4x-r3/actual-AEGIS-bounded-rocking.png'),
]
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
summary = json.loads((root / 'host-final-r2/summary.json').read_text())
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
<title>Red Alert 2 HD 0.3 — V55 consolidated feedback review</title><style>
*{box-sizing:border-box}body{margin:0;background:#151b21;color:#e5ecf3;font:19px/1.55 system-ui,sans-serif}main{max-width:1640px;margin:auto;padding:34px}h1{font-size:34px;margin:0 0 16px}h2{font-size:27px;margin:36px 0 15px}p{max-width:1280px}.note{border-left:4px solid #6dc7ff;padding:14px 20px;background:#202a34}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}figure{margin:0;background:#202932;border:1px solid #3a4755;border-radius:8px;overflow:hidden}img{display:block;width:100%;height:auto}figcaption{padding:15px 18px;font-size:18px}footer{margin:35px 0 12px;color:#adb8c4;font-size:17px}@media(max-width:1000px){.grid{grid-template-columns:1fr}main{padding:20px}}
.image-button{display:block;border:0;padding:0;width:100%;background:transparent;cursor:zoom-in}dialog{max-width:96vw;max-height:94vh;padding:0;background:#12181e;color:white;border:1px solid #8096aa}dialog::backdrop{background:#000c}dialog>button{position:sticky;top:0;left:0;padding:10px 22px;font-size:19px;z-index:1}dialog .image-scroll{overflow:auto;max-height:85vh;max-width:94vw}dialog img{width:auto;max-width:none}
</style><dialog id="zoom"><button onclick="this.parentElement.close()">Close full-size image</button><div class="image-scroll"><img alt="Full-size native capture"></div></dialog><script>function showImage(button){const dialog=document.querySelector('#zoom');dialog.querySelector('img').src=button.querySelector('img').src;dialog.showModal();}</script><main><h1>Red Alert 2 HD 0.3 — V55 consolidated feedback review</h1>
<p class="note">This review covers all three reported issues together. Technical validation and user acceptance remain separate. Click any image for its full native size. No new artwork or resource selection is introduced.</p>
<p>Allied10 now clears occupied construction-yard and ready paid-building foundations, and consistently applies each source house's shared AI team limit. All three lanes deploy, build and produce under Easy, Normal and Hard. Start Allied10 again from selection to use the new version; existing saves retain their recorded deterministic behavior.</p>
<p>The squid issue used a distant, unclipped rocking pivot in the shared ship renderer. The corrected pivot remains on the native hull edge in the original encounter and labeled skirmish checks. Completed defenses now end an obsolete renderer buildup state even while paused, preserving real construction and selling animations.</p>
<p>HOST_SUMMARY. Both an active MCV-clearance save and a normally completed Patriot pass full process restart and exact 180-turn world/RNG/team/queue continuation. Actual source-base screenshots use a diagnostic reveal only after deployment/production assertions. Original enemy AA views also disclose diagnostic camera/reveal. Script assistance uses ordinary orders and bounded normal-turn advancement; the original squid encounter uses real-time playback. No source map, trigger, actor, health, funds, RNG or rule is edited for these original mission checks.</p>
SECTIONS
<footer>Original inventory remains 26 playable maps and 24/24 story HD loading pages. Prior pristine-executable and patched-source qualifications remain. Native Windows and physical 8/16GiB target machines are untested. This follow-up does not claim full victories at every difficulty. Existing art, actual saves/settings and earlier deliveries are preserved. Local delivery only; no push, release or upload.</footer></main></html>'''
page = page.replace('HOST_SUMMARY', str(summary['counts']['pass']) + ' host cases pass with zero failures, loading errors, process errors, omissions or skips')
page = page.replace('SECTIONS', ''.join(sections))
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(page)
receipt = dict(status='SELF_CONTAINED_CONSOLIDATED_REVIEW_READY_USER_ACCEPTANCE_PENDING', file=str(output.resolve()),
               sha256=hashlib.sha256(output.read_bytes()).hexdigest(), figures=[{key: value for key, value in row.items() if key != 'image'} for row in rows])
output.with_suffix('.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(file=str(output), figures=len(rows), bytes=output.stat().st_size)))
