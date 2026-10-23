"""Create the compact final offline review without reopening accepted artwork."""
import base64
import html
import json
import sys
from pathlib import Path
from PIL import Image

root = Path('.artifacts/m2-4/newurban-final-actors-batch98-20261021')
destination = Path(sys.argv[1])
reports = [json.loads(Path(file).read_text()) for file in sys.argv[2:]]
assert len(reports) == 2 and all(r['status'] == 'PASS_SELECTED_NATIVE_CASES' for r in reports)
scope = json.loads((root / 'all-theater-reconciliation-v2.json').read_text())
maps = json.loads((root / 'final-mode-adaptation-v1.json').read_text())['maps']
counts = scope['counts']
display_proof = json.loads(Path('.artifacts/m2-4/final-relocated-default-profile-v1/report.json').read_text())
assert display_proof['status'].startswith('PASS_RELOCATED_APP')
display = display_proof['display']
esc = lambda value: html.escape(str(value))
theaters = ''.join(f"<tr><td>{r['theater']}</td><td>{r['directoryEntries']}</td><td>{r['resources']}</td>"
    f"<td>{r['remainingAuthoredGaps']}</td><td>{r['blockedOriginalMaps']}</td></tr>"
    for r in scope['theaters'] if r['directoryEntries'])
map_rows = ''.join(f"<tr><td>{esc(m['mapId'])}</td><td>{m['theater']}</td>"
    f"<td>{esc(', '.join(m['originalModes']))}</td><td>{m['maxSlots']}</td>"
    f"<td>{'Yes' if m['menuSelectable'] else 'No'}</td><td>{esc(m['nativeStatus'])}</td>"
    f"<td><code>{esc(m['source']['sha256'])}</code></td></tr>" for m in maps)
cards = []
for report in reports:
    for item in report['cases']:
        image = Path(item['image'])
        with Image.open(image) as capture:
            assert capture.size == (display['width'] * display['dpr'], display['height'] * display['dpr'])
        encoded = base64.b64encode(image.read_bytes()).decode()
        density = 'Original' if item['density'] == 1 else f"{item['density']}X"
        title = f"{report['edition'].upper()} / {item['map']} / {density}"
        peak = item['initial']['total'] / 1048576
        cards.append(f'<details><summary>{esc(title)} — {peak:.1f} MiB; native ticks '
            f"{item['initial']['tick']}–{item['final']['tick']}</summary>"
            '<p>Actual packaged-app screenshot at native game display scale. Use the control above for capture pixels.</p>'
            f'<div class="native"><img data-game-width="{display["width"]}" style="width:{display["width"]}px;height:auto" '
            f'alt="{esc(title)}" loading="lazy" src="data:image/png;base64,{encoded}"></div></details>')
document = f'''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>M2.4 accepted theaters and final Mac delivery</title>
<style>
body{{font:18px/1.55 system-ui,sans-serif;background:#111922;color:#edf2f6;margin:32px auto;padding:0 24px;max-width:1440px}}
h1{{font-size:34px}}h2{{font-size:26px}}a{{color:#99d4ff}}code{{font-size:14px;overflow-wrap:anywhere}}
.state{{border-left:5px solid #7aca9b;padding:12px 20px;background:#1a2b2b}}
.pending{{border-left-color:#edbd68;background:#302b20}}table{{border-collapse:collapse;width:100%;margin:18px 0}}
th,td{{text-align:left;border-bottom:1px solid #415060;padding:10px;vertical-align:top}}
th{{background:#23303f}}details{{margin:16px 0;padding:12px;background:#1c2835;border-radius:8px}}
summary{{font-weight:650;cursor:pointer}}.native,.wide{{overflow:auto}}.native img{{display:block;max-width:none}}
.small{{font-size:16px;color:#c0ccd7}}li{{margin:8px 0}}
</style>
<h1>M2.4 — accepted theaters and independent Mac delivery</h1>
<p class="state">All newly authored artwork through Batch 98 is user accepted. The independent Mac arm64 app passes the final representative loads at 2X and 4X across all five theaters, Original fallback, resource release and re-entry.</p>
<p class="state pending">M2.4 remains incomplete: four original-data entries cannot run without valid original source data or an explicit scope decision. They remain counted and diagnosed below.</p>
<p>Frozen packaged source: <code>{esc(reports[0]['runtimeSourceCommit'])}</code>. Accepted UI R6, construction art and returned Windows repairs remain preserved. Native Windows is not tested on this Mac.</p>
<p><a href="Final-Actors-Embedded.html">Accepted Batch 98: all 450 new actor poses, native clips and Original/HD lamp controls</a> · <a href="resource-handoff-v1.json">Full artwork/source hash ledger</a> · <a href="final-mode-adaptation-v1.csv">All map mode adaptations (CSV)</a></p>
<h2>Scope and coverage</h2>
<p>{counts['catalogDeclarations']} catalog declarations; {counts['inventoriedEntries']} inventory entries; {counts['officialScopeEntries']} official edition/source entries; {counts['independentSourceFiles']} independent files; {counts['overlappingOriginalModeLabels']} overlapping original mode labels.</p>
<p>{counts['actualSelectableEntries']} entries are selectable, including three diagnosed missing-terrain variants. {counts['acceptedNativeEntries']} entries have accepted native load evidence; the fourth blocked entry has no valid starts. Zero remaining authored source gaps. The 145 accepted faction-source groups are credited explicitly. No official Lunar skirmish map exists in this import.</p>
<table><thead><tr><th>Theater</th><th>Map entries</th><th>Source groups</th><th>Art gaps</th><th>Original blockers</th></tr></thead><tbody>{theaters}</tbody></table>
<h2>Unified skirmish</h2>
<p>One existing skirmish entry controls credits, technology, construction, teams, alliances, victory and player choices. Original mode labels are retained as provenance. Map dimensions, actual starts, terrain, resources, objects, normal mechanisms and original archives remain intact. Cooperative/campaign content stays excluded. The approved seven starting-unit flags use standard INI values.</p>
<h2>Original-data blockers retained</h2>
<ul><li>RA2/YR <code>mp04t8.map@beaac8d3ffd2</code> and YR <code>xmp04t8.map@f11a0e453c44</code>: original tile 22 at (77,161) requires absent <code>hyte01.tem</code> from the Obsolete Height Pieces set. Native missing-TMP failures are retained.</li>
<li>YR <code>id-5b521907.map@26a65602d7a0</code>: zero valid original starts; only non-start waypoints 699/700 exist. No spawn was fabricated.</li></ul>
<h2>Reported blue-purple light</h2>
<p>The exact original Manhattan map supplies cool ambient RGB 0.85/0.90/1.00 and three blue INBLULMP objects. Original/2X/4X GPU coefficients match; temporarily hiding these lamps removes the cast. The accepted tint reader and lamp shader are unchanged. The embedded actor review shows the matched controls; this scene does not require a renderer fix.</p>
<h2>Final copied-package checks</h2>
<p>These compact checks verify packaging and shared loading changes. Previously accepted state, animation, bridge, seam and visual evidence is reused. World budgets remain 512 MiB (2X) / 1280 MiB (4X); prepared CPU remains 128 MiB. The complete active resource graph is independently copied. No new artwork approval is requested.</p>
<p>Capture: {display['width']} × {display['height']} game display points at {display['dpr']}× device pixel ratio.
<button id="scale" onclick="const raw=this.dataset.raw!=='1';this.dataset.raw=raw?'1':'0';document.querySelectorAll('.native img').forEach(i=>i.style.width=(raw?Number(i.dataset.gameWidth)*{display['dpr']}:i.dataset.gameWidth)+'px');this.textContent=raw?'Use native game display scale':'Inspect capture pixels';">Inspect capture pixels</button></p>
{''.join(cards)}
<details><summary>All {len(maps)} official edition/source entries and original mode provenance</summary><div class="wide"><table><thead><tr><th>Original identity</th><th>Theater</th><th>Original labels</th><th>Starts</th><th>Selectable</th><th>Native result</th><th>Source SHA-256</th></tr></thead><tbody>{map_rows}</tbody></table></div></details>
<p class="small">This is a local ad-hoc signed Mac review, not a published release. Keep the app and both sibling resource directories together. The final delivery receipt identifies source, resources and the private profile. Continue remaining M2.4 corrections in the current execution conversation.</p></html>'''
destination.parent.mkdir(parents=True, exist_ok=True)
with destination.open('x') as stream:
    stream.write(document)
print(json.dumps(dict(file=str(destination), embeddedImages=len(cards), maps=len(maps),
    status='BUILT_FINAL_ACCEPTED_SCOPE_AND_NATIVE_PACKAGE_REVIEW')))
