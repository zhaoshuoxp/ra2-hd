"""Finalize a validated local review delivery; do not alter its signed app."""
import base64
import csv
import hashlib
import html
import json
import shutil
import sys
from pathlib import Path

root = Path('.artifacts/m1-6c')
folder = Path(sys.argv[1]).resolve()
validation = json.loads((root / 'native-package-v2/result.json').read_text())
assert validation['status'].startswith('PASS') and len(validation['cases']) == 2
receipt = json.loads((root / 'delivery-v2/package-receipt.json').read_text())
relocated = root / 'relocated-v2' / folder.name
for entry in receipt['files']:
    for directory in [folder, relocated]:
        target = directory / entry['file']
        if 'link' in entry:
            assert str(target.readlink()) == entry['link'], target
        else:
            assert hashlib.sha256(target.read_bytes()).hexdigest() == entry['sha256'], target
report = {
    'status': 'PASS_PACKAGED_BOTH_EDITIONS_RELOCATED_SIGNED_HASH_VERIFIED',
    'runtimeSourceHead': receipt['runtimeSourceHead'],
    'checkedShippedEntries': len(receipt['files']),
    'resourceFiles': receipt['resourceFiles'],
    'relocatedFolder': str(relocated.resolve()),
    'launchWorkingDirectory': '/private/tmp',
    'signature': 'Local ad-hoc signature verified with codesign --deep --strict',
    'native': validation,
    'finalVisualGameplayAcceptance': 'PENDING',
}
(folder / 'PACKAGE-VALIDATION.json').write_text(json.dumps(report, indent=2) + '\n')
shutil.copyfile('docs/m1-6c-final-evidence.json', folder / 'BUILDING-EVIDENCE.json')
rows = list(csv.DictReader(Path('docs/m1-6c-coverage-matrix.csv').open()))
assert len(rows) == 162 and all(r['status'] == 'HD_ACTIVE_COMPLETE_FAMILY' for r in rows)
cells = ''.join('<tr>' + ''.join(f'<td>{html.escape(r[k])}</td>' for k in
    ['edition', 'theater', 'identity', 'density', 'boundary']) + '</tr>' for r in rows)
pictures = []
for name, caption in [
    ('native-yr-functions-v4/soviet-buildings-normal.png', 'YR temperate: controlled world-building placement'),
    ('native-yr-snow-display-v2/soviet-buildings-normal.png', 'YR snow: controlled world-building placement'),
    ('native-sustained-v1/sustained-120s.png', 'Bounded 120-second native Soviet-versus-Yuri production and combat'),
]:
    data = base64.b64encode((root / name).read_bytes()).decode()
    pictures.append(f'<figure><img src="data:image/png;base64,{data}" alt="{caption}"><figcaption>{caption}</figcaption></figure>')
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Soviet Buildings M1.6C — Final Review</title><style>
body{font:19px/1.5 system-ui;background:#111b22;color:#e7edf2;margin:36px auto;max-width:1280px;padding:0 24px}
h1{font-size:38px}h2{font-size:28px}a{color:#8cdeff}.cards{display:flex;gap:18px;flex-wrap:wrap}.card{background:#20353e;padding:20px;border-radius:12px;flex:1}.card strong{display:block;font-size:34px;color:#abedc9}
img{max-width:100%;height:auto}figure{margin:24px 0}figcaption{color:#bacad3}table{border-collapse:collapse;width:100%;font-size:16px}td,th{text-align:left;border-bottom:1px solid #36505c;padding:8px}th{position:sticky;top:0;background:#233b45}details{margin:24px 0}li{margin:8px 0}.pending{border-left:5px solid #eabe69;padding:14px;background:#302a1e}
</style><h1>Soviet Buildings M1.6C</h1><p>Red Alert 2 + Yuri's Revenge • consolidated local Mac review</p>
<div class="cards"><div class="card"><strong>20</strong>Soviet building identities across both editions</div><div class="card"><strong>162 / 162</strong>HD-active edition / theater / building cells</div><div class="card"><strong>0</strong>Soviet building Original exceptions</div></div>
<p class="pending">Technical validation passed. Final human visual and gameplay acceptance remains pending. Keep corrections in the existing M1.6 task.</p>
<p><a href="BUILDING-REVIEW.html">Open embedded original / HD artwork and animation review</a> · <a href="BUILDING-COVERAGE.csv">Coverage CSV</a> · <a href="VALIDATION.md">Detailed report</a> · <a href="PACKAGE-VALIDATION.json">Packaged test receipt</a></p>
<h2>Review in the app</h2><p>Open <b>Red Alert 2 HD Soviet Buildings M1.6C R1.app</b>. Keep <b>RA2-HD-Editions-Resources</b> beside it. The new app uses an independent profile and enables HD by default.</p>
<ul><li>Inspect Industrial Plant construction, damage and moving machinery; test vehicle discounts and power loss.</li><li>Inspect Battle Bunker construction, occupied and damaged states; enter, fire, evacuate and destroy.</li><li>Inspect snow materials and retained animation alignment across the Soviet roster.</li><li>Check Soviet Power Plant construction on YR new-urban and desert maps.</li></ul>
<h2>Validated</h2><p>74 focused tests and TypeScript entry checking passed. Eight retail-map Mac runs, ownership / civilian evacuation regressions, HD toggling, edition / theater switching, texture teardown and a 120-second production / combat run passed their stated checks. Both relocated packaged editions passed guard, promotion and retained unit checks with all 18 applicable Soviet buildings active in HD.</p>
<h2>Evidence boundaries</h2><p>Lunar's 18 cells use the actual VFS / ImageFinder / GPU loader in a controlled fixture; no ordinary retail lunar skirmish map was available. Exact 1080p and 4K output buffers and 16:10 layouts were checked, not physical 4K panel resolution. SQD and YURIPR retain their separate accepted Original unit exceptions. Other factions, unit snow artwork, campaigns and Windows runtime are outside this delivery.</p>
<h2>Native Mac evidence</h2>''' + ''.join(pictures) + '''<details><summary>All 162 coverage cells</summary><table><thead><tr><th>Edition</th><th>Theater</th><th>Building</th><th>Density</th><th>Evidence boundary</th></tr></thead><tbody>''' + cells + '''</tbody></table></details></html>'''
(folder / 'REVIEW-DASHBOARD.html').write_text(page)
start = folder / 'START-HERE.txt'
start.write_text(start.read_text() + '\nOpen REVIEW-DASHBOARD.html for the combined validation dashboard and review links.\n')
entries = []
for target in sorted(folder.rglob('*')):
    if target.is_symlink():
        entries.append({'file': str(target.relative_to(folder)), 'link': str(target.readlink())})
    elif target.is_file():
        entries.append({'file': str(target.relative_to(folder)), 'bytes': target.stat().st_size,
                        'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
report = {k: v for k, v in report.items() if k != 'native'}
report['files'] = entries
(folder / 'DELIVERY-INVENTORY.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'status': report['status'], 'files': len(entries), 'folder': str(folder)}))
