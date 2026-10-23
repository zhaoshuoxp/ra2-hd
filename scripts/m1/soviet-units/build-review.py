"""One offline dashboard, with native-size previews and explicit evidence boundaries."""

import base64, json, html
from pathlib import Path

root = Path(".artifacts/m1-7")
out = root / "review-v7"
out.mkdir(exist_ok=False)
ledger = json.loads((root / "ledger.json").read_text())
exports = json.loads((root / "review-exports-v7/manifest.json").read_text())


def data(path):
    return "data:image/png;base64," + base64.b64encode(Path(path).read_bytes()).decode()


content = []
payload = {}
for group, ids in ledger["scope"].items():
    content.append(
        f'<section id="{group}"><h2>{html.escape(group.title())} — {len(ids)} identities</h2><p>Representative decision: {ledger["representativeDecisions"][group]}. Approved families continue production; only named corrections need another art decision.</p>'
    )
    for id in ids:
        f = ledger["families"][id]
        entry = exports["families"][id]
        samples = []
        for s in entry["samples"]:
            samples.append(
                {
                    "label": s["label"],
                    "original": data(s["files"]["original"]["path"]),
                    "candidate": data(s["files"]["candidate"]["path"]),
                    "detail": data(s["files"]["detail"]["path"]),
                    "width": s["nativeCanvas"][0] * s["displayScale"],
                    "height": s["nativeCanvas"][1] * s["displayScale"],
                }
            )
        payload[id] = samples
        selected = 1 if id == "HARV" else 0
        s = samples[selected]
        notes = (
            " ".join(f["candidateNotes"])
            or "Full headings, native state transitions, remap and resource lifetime remain unverified."
        )
        gates = (
            "; ".join(f["houses"])
            + ("; stolen Allied tech required" if f["stolenTech"]["allied"] else "")
            + ("; stolen Soviet tech required" if f["stolenTech"]["soviet"] else "")
        )
        choices = "".join(
            f'<option value="{i}"{ " selected" if i == selected else ""}>{html.escape(x["label"])}</option>'
            for i, x in enumerate(samples)
        )
        required = "; ".join(f["requiredStates"])
        content.append(
            f"""<article id="unit-{id}"><h3>{id} <small>{f['representation']} · {f['stem']} · {f['representativeAcceptance']}</small></h3>
<p>{html.escape(notes)}</p><p class="muted">Access: {html.escape(gates)}. Required functional checks: {html.escape(required)}.</p>
<label>Representative pose <select data-unit="{id}">{choices}</select></label>
<div class="panels"><figure><figcaption>Original · native apparent size</figcaption><div class="stage"><img id="{id}-original" width="{s['width']}" height="{s['height']}" src="{s['original']}" alt="{id} original"></div></figure><figure><figcaption>HD candidate · registered static preview</figcaption><div class="stage"><img id="{id}-candidate" width="{s['width']}" height="{s['height']}" src="{s['candidate']}" alt="{id} candidate"></div></figure></div>
<p class="muted">900-reference / 1080p apparent scale. Static CPU registration; NOT an in-game HD capture. No owner-remap or continuous-animation claim.</p>
<details><summary>Inspect authored detail and all raw poses</summary><p>Enlarged inspection only. Native pose masks were not used to clip candidate anatomy. The raw board preserves registration and matte defects.</p><img id="{id}-detail" class="detail" src="{s['detail']}" alt="{id} enlarged detail"><div class="raws"><figure><figcaption>Native reference board</figcaption><img src="{data(entry['sourceBoard'])}" alt="{id} source board"></figure><figure><figcaption>Selected authored board</figcaption><img src="{data(entry['selectedRaw'])}" alt="{id} raw candidate"></figure></div></details></article>"""
        )
    content.append("</section>")
rows = "".join(
    f'<tr><td><a href="#unit-{id}">{id}</a></td><td>{ledger["families"][id]["representation"]}</td><td>{len(exports["families"][id]["samples"])}</td><td>{ledger["families"][id]["representativeAcceptance"]}</td><td>NOT RUN</td><td>Original</td></tr>'
    for ids in ledger["scope"].values()
    for id in ids
)
page = (
    """<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M1.7 Soviet unit representative review</title>
<style>html{scroll-behavior:smooth}body{font:18px/1.5 system-ui,sans-serif;background:#171d22;color:#edf1ed;margin:0}main{max-width:1100px;margin:auto;padding:28px}h1{font-size:32px}h2{font-size:28px;margin-top:44px}h3{font-size:25px}small,.muted{font-size:16px;color:#bac5c9}a{color:#91caf5}nav{position:sticky;top:0;background:#171d22;padding:14px 0;z-index:2}nav a{margin-right:24px}article{border-top:1px solid #53636a;margin:30px 0;padding-top:12px}select,button{font:inherit;padding:6px;background:#303d45;color:white}.panels,.raws{display:flex;gap:18px;overflow:auto}figure{margin:0;flex-shrink:0}figcaption{font-size:16px;margin:10px 0}.stage{width:360px;height:300px;display:flex;align-items:center;justify-content:center;background:#48584e}.stage img{object-fit:contain;max-width:none}.raws img{width:480px;height:auto;background:#48584e}.detail{max-width:600px;max-height:480px;object-fit:contain;background:#48584e;margin:16px 0}summary{cursor:pointer}table{border-collapse:collapse;font-size:16px}td,th{text-align:left;padding:8px 16px;border-bottom:1px solid #4a565c}.notice{padding:16px;background:#273741;border-left:5px solid #c9a264}section,article{scroll-margin-top:70px}</style>
<main><h1>M1.7 — Soviet unit representative review</h1><p class="notice"><strong>22 REPRESENTATIVES ACCEPTED · 2 CORRECTIONS PENDING</strong> · 24 new rules identities · 108 representative positions · 0 complete new runtime packs.<br>YURIPR levitation is accepted. HARV: restored user-selected board; upper-right hopper matches the lower-right design and tipped state at its own heading. APOC: moderately lighter gunmetal armor, retaining the 6% visual enlargement. Accepted Conscript, Rhino and all 22 approved representative artworks are preserved.</p>
<nav><a href="#infantry">Infantry (10)</a><a href="#ground">Ground (8)</a><a href="#air-naval">Air / naval (6)</a><a href="#coverage">Coverage</a></nav>
<p>Use 100% browser zoom for the fixed-size comparisons. Original SHP canvases use 1080/900 = 1.2 CSS pixels per logical pixel; VXL controls are direct 1080p crops. High output changes sampling only. Enlarged detail is supplementary. Native geometry, rules and input coordinates are unchanged.</p>
<p>Only HARV and APOC need correction review. Full production for the other 22 identities is authorized. Final complete-family visual/gameplay acceptance remains separate.</p>
<p class="notice">Shadows affect grounding and are required for final validation. This art page does not yet reproduce the complete runtime shadow passes. YURIPR now retains its original visible-frame ground patch and body-to-ground gap; other native shadows must be restored during integration. No shadow pass is claimed here.</p>
<p>Bindings: baseline faab3b9f75b0eb627e600c5c18a4cc42e86567ea; isolated m1-7-soviet-units. Uncommitted building corrections are not included. Original VXL captures are controlled paused fixtures, not naturally built units. Missile children and SQDG are inventoried but not authored. No new unit is active in ordinary matches.</p>
<label>Preview background <select id="background"><option value="#48584e">Field green</option><option value="#e7e4db">Light</option><option value="#171d22">Dark</option></select></label>
"""
    + "".join(content)
    + f"""<section id="coverage"><h2>Coverage and remaining work</h2><table><thead><tr><th>Identity</th><th>Route</th><th>Review poses</th><th>Art decision</th><th>HD gameplay</th><th>Active</th></tr></thead><tbody>{rows}</tbody></table><p>Retained Original: generic explosions, native shadows, beams, wakes, parachutes, sounds, cameos and support aircraft. The complete ledger records individual member hashes, prerequisites, sequences, children, exclusions and functional tests.</p><p>Memory policy: inherited cap 256 MiB. The historical combined building/accepted-unit baseline used 246.53 MiB. New unit loading must be demand-bounded and measured; no cap increase or all-4x preload is authorized by this preview. New runtime texture allocation is zero.</p><p>Next: package decisions, complete native artwork, rules-aware independent family binding, measured loading, native state tests, current combined Mac review app and versioned external resources. Remain in this same task for corrections and acceptance.</p></section></main>"""
)
page += (
    "<script>const samples="
    + json.dumps(payload, separators=(",", ":"))
    + """;document.querySelectorAll('select[data-unit]').forEach(sel=>sel.addEventListener('change',()=>{const id=sel.dataset.unit,s=samples[id][Number(sel.value)];for(const role of ['original','candidate','detail']){const img=document.getElementById(id+'-'+role);img.src=s[role];if(role!=='detail'){img.width=s.width;img.height=s.height;}}}));document.getElementById('background').addEventListener('change',e=>document.querySelectorAll('.stage').forEach(s=>s.style.background=e.target.value));</script></html>"""
)
(out / "review.html").write_text(page)
print("Dashboard:", out / "review.html", "bytes", len(page.encode()))
