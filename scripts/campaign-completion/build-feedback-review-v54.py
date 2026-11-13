"""Build a self-contained review of actual mission and labeled compatibility captures."""
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
    ('Original missions', 'Allied09 original SEAL paradrop, including water below the parachute.', 'all09-paradrop-current-r1/native-tick-300.png'),
    ('Original missions', 'Actual naval C4 fuse/retreat restored after a complete application restart.', 'c4-active-save-r1/native-restored-after-restart.png'),
    ('Original missions', 'Allied03 source-hostile unarmed civilians receive actual passive player fire.', 'civilian-unarmed-current-r1/native-passive-hostile-civilian-fire.png'),
    ('Original missions', 'Allied11 original squid demonstration, complete native shaking pose.', 'squid-complete-visual-r4/native-original-squid-complete-shake.png'),
    ('Original missions', 'Allied11 actual Action117 paused transmission. World and infantry animation frames stay still; playback ends naturally.', 'story-pause-current-r1/native-original-paused-transmission.png'),
    ('Original missions', 'Finale opening attack hold, named save and complete application restart.', 'finale-grace-save-r1/native-restored-after-restart.png'),
    ('Road contacts', 'Actual Allied04 narrow slope and adjoining roads, 2X. Diagnostic reveal and frozen camera; original placement/geometry.', 'roads-all04-current-2x/drslpe06-urb-57-125.png'),
    ('Road contacts', 'Actual Allied08 narrow slope and bend contacts, 4X. Diagnostic reveal and frozen camera; original placement/geometry.', 'roads-all08-current-4x/drslpe06-urb-87-104.png'),
    ('Reported AA maps', 'Hawaii Allied07 original Patriot, 2X. Diagnostic camera/reveal, original placement.', 'aa-hawaii-2x-r2/NASAM-initial.png'),
    ('Reported AA maps', 'Hawaii Patriot after explicit renderer resource disposal/replacement; source world unchanged.', 'aa-hawaii-2x-r2/NASAM-after-resource-replacement.png'),
    ('Reported AA maps', 'Finale Allied12 original Snow Flak, 4X, after the original ordinary-command opening. Diagnostic camera/reveal.', 'aa-finale-4x-r2/NAFLAK-initial.png'),
    ('Reported AA maps', 'Finale Snow Flak after explicit renderer resource disposal/replacement; source world unchanged.', 'aa-finale-4x-r2/NAFLAK-after-resource-replacement.png'),
    ('Labeled compatibility scenes', 'Standalone scene derived before world creation: native SEAL replaces the one Tanya placement to exercise all four original DRED targets. This is not original mission or victory evidence.', 'seal-naval-fixture-r2/native-source-demolition-route.png'),
    ('Labeled compatibility scenes', 'Standalone original-rule combat fixture: both commandos retreat from factory demolition; occupied neutral protection, explicit attack and damage retaliation execute normally. This is not campaign story evidence.', 'neutral-demolition-fixture-r1/specialized-neutral-explicit-attack-and-retaliation.png'),
]
rows = []
for section, caption, relative in figures:
    file = root / relative
    data = file.read_bytes()
    original = Image.open(BytesIO(data)).convert('RGBA')
    encoded = BytesIO()
    original.save(encoded, format='WEBP', lossless=True, method=6)
    compressed = encoded.getvalue()
    assert Image.open(BytesIO(compressed)).convert('RGBA').tobytes() == original.tobytes()
    rows.append(dict(section=section, caption=caption, source=relative, sha256=hashlib.sha256(data).hexdigest(),
                     encoding='lossless-webp-exact-rgba', image='data:image/webp;base64,' + base64.b64encode(compressed).decode()))
summary_file = root / 'host-final-r1/summary.json'
summary = json.loads(summary_file.read_text())
assert summary['acceptance'] == 'HOST_TESTS_PASS_NATIVE_RUNTIME_NOT_RUN'
assert summary['counts']['failedCases'] == summary['counts']['loadErrors'] == summary['counts']['skipped'] == 0
sections = []
for section in dict.fromkeys(row['section'] for row in rows):
    cards = ''.join('<figure><button class="image-button" onclick="showImage(this)"><img loading="lazy" src="' + row['image']
                    + '" alt="' + html.escape(row['caption'], quote=True) + '"></button><figcaption>' + html.escape(row['caption'])
                    + '</figcaption></figure>' for row in rows if row['section'] == section)
    sections.append('<section><h2>' + html.escape(section) + '</h2><div class="grid">' + cards + '</div></section>')
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Red Alert 2 HD 0.3 — V54 consolidated feedback review</title><style>
*{box-sizing:border-box}body{margin:0;background:#151b21;color:#e5ecf3;font:19px/1.55 system-ui,sans-serif}main{max-width:1640px;margin:auto;padding:34px}h1{font-size:34px;margin:0 0 16px}h2{font-size:27px;margin:36px 0 15px}p{max-width:1280px}.note{border-left:4px solid #6dc7ff;padding:14px 20px;background:#202a34}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}figure{margin:0;background:#202932;border:1px solid #3a4755;border-radius:8px;overflow:hidden}img{display:block;width:100%;height:auto}figcaption{padding:15px 18px;font-size:18px}a{color:#9bd6ff}footer{margin:35px 0 12px;color:#adb8c4;font-size:17px}@media(max-width:1000px){.grid{grid-template-columns:1fr}main{padding:20px}}
.image-button{display:block;border:0;padding:0;width:100%;background:transparent;cursor:zoom-in}dialog{max-width:96vw;max-height:94vh;padding:0;background:#12181e;color:white;border:1px solid #8096aa}dialog::backdrop{background:#000c}dialog>button{position:sticky;top:0;left:0;padding:10px 22px;font-size:19px;z-index:1}dialog .image-scroll{overflow:auto;max-height:85vh;max-width:94vw}dialog img{width:auto;max-width:none}
</style><dialog id="zoom"><button onclick="this.parentElement.close()">Close full-size image</button><div class="image-scroll"><img alt="Full-size native capture"></div></dialog><script>function showImage(button){const dialog=document.querySelector('#zoom');dialog.querySelector('img').src=button.querySelector('img').src;dialog.showModal();}</script><main><h1>Red Alert 2 HD 0.3 — V54 consolidated feedback review</h1>
<p class="note">Technical checks and user visual acceptance are separate. This page contains actual mission captures and explicitly labeled compatibility scenes. Source maps, accepted unit/building artwork and user saves/settings are preserved. Click any image for its full native size.</p>
<p>Original RA2 inventory remains 26 playable maps and 24/24 story HD loading pages. This batch corrects shared demolition, paradrop, animation pause, occupied-neutral targeting, AI activation, opening attack timing, AA resource lifetime and Urban road contacts. The first ready finale attack waits 90/60/30 simulation seconds in Easy/Normal/Hard; original selection, production, defense and later cadence remain active.</p>
<p>HOST_SUMMARY. Native Mac checks cover real source events, paid production, both commandos, three opening difficulties, exact named-save app restarts and RA2/YR skirmish regressions. Earlier complete mission-goal evidence is retained; this batch does not claim new complete victories on every difficulty. Native Windows and physical 8/16GiB configurations remain untested.</p>
SECTIONS
<footer>Original semantic qualifications from the prior handoff remain: patched local retail source, pristine AI/RNG/particle/transport parity, specific unreachable particle/media and archive-absent art references. New visual changes await consolidated user review. No GitHub push, release or upload.</footer></main></html>'''
page = page.replace('HOST_SUMMARY', str(summary['counts']['pass']) + ' host cases pass, with zero failures, loading errors, process errors, omissions or skips')
page = page.replace('SECTIONS', ''.join(sections))
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(page)
receipt = dict(status='SELF_CONTAINED_CONSOLIDATED_REVIEW_READY_USER_ACCEPTANCE_PENDING', file=str(output.resolve()),
               sha256=hashlib.sha256(output.read_bytes()).hexdigest(), figures=[{key: value for key, value in row.items() if key != 'image'} for row in rows])
output.with_suffix('.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(file=str(output), figures=len(rows), bytes=output.stat().st_size)))
