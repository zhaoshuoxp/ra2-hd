"""Package current painted candidates and matched native footage for visual review."""
import argparse
import base64
import hashlib
import html
import json
import shutil
from pathlib import Path

from PIL import Image

from buildup import read, sha, write

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("authoring", type=Path)
parser.add_argument("review", type=Path)
parser.add_argument("native", type=Path)
parser.add_argument("validation", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--temporal-validation", type=Path)
parser.add_argument("--accepted-authoring", type=Path)
parser.add_argument("--cutout-audit", type=Path)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)
authoring = read(args.authoring)
remaining_review=bool(authoring.get('remainingConstructionRepair'))
cannon_review=not remaining_review and any(f.get('componentRig',{}).get('cannonFit') for f in authoring['families'])
repair_keys=set(authoring.get('remainingConstructionRepair' if remaining_review else 'terminalAlignmentRepair',{}).get('correctedKeys',[]))
validation = read(args.validation)
assert validation["status"] == "PASS_PAINTED_PIXELS_ROLES_AND_PRESERVATION"
assert validation["selectedSequences"] == len(authoring["hdRepaintProgress"]["registeredCandidateKeys"])
source_html = (args.review / "Painted-HD-Buildup-Review.html").read_text()
prefix, rest = source_html.split("const families=", 1)
payload, suffix = rest.split(";const $=", 1)
items = json.loads(payload)
records = {r["key"]: r for r in authoring["families"] if r["key"] in {i["key"] for i in items}}
accepted_keys = set()
if args.accepted_authoring:
    accepted = read(args.accepted_authoring)
    accepted_keys = set(accepted["hdRepaintProgress"]["registeredCandidateKeys"])
    for key in accepted_keys:
        assert records[key] == next(r for r in accepted["families"] if r["key"] == key)
names = {"GACSPH": "Chronosphere", "GAGAP": "Gap Generator", "GAPILL": "Pillbox", "GTGCAN": "Grand Cannon",
         "NASAM": "Patriot Missile", "ATESLA": "Prism Tower", "GAPILE": "Allied Barracks",
         "GAROBO": "Robot Control Center", "GAAIRC": "Airforce Command",
         "GATECH": "Allied Battle Lab", "GAWEAP": "Allied War Factory", "GACNST": "Allied Construction Yard",
         "GAOREP": "Ore Purifier", "GASPYSAT": "Spy Satellite Uplink",
         "GAWEAT": "Weather Control Device", "GADEPT": "Allied Service Depot",
         "GAREFN": "Allied Ore Refinery", "GAYARD": "Allied Naval Shipyard",
         "NAPOWR": "Soviet Power Plant", "NAHAND": "Soviet Barracks",
         "NAREFN": "Soviet Ore Refinery", "NARADR": "Soviet Radar Station",
         "NAWEAP": "Soviet War Factory", "NADEPT": "Soviet Service Depot",
         "NAYARD": "Soviet Naval Shipyard", "NATECH": "Soviet Battle Lab"}
groups = {}
for item in items:
    groups.setdefault(records[item["key"]]["identity"], []).append(item)
sessions = read(args.native)
assert sessions["status"] in ("PASS_FOUR_HD_SESSIONS_AND_ONE_ORIGINAL_CONTROL", "PASS_PAINTED_NATIVE_SCOPE_MATRIX")
evidence = args.output / "Evidence"
evidence.mkdir()
shutil.copy2(args.native, evidence / "native-summary.json")
shutil.copy2(args.validation, evidence / "pixel-validation.json")
if args.cutout_audit:
    cutout = read(args.cutout_audit)
    assert cutout["authoredAlphaValidated"] and cutout["authoritySha256"] == sha(args.authoring)
    shutil.copy2(args.cutout_audit, evidence / "complete-cutout-survey.json")
labels_file = args.review / "comparison-labels.json"
labels = read(labels_file) if labels_file.exists() else {"before": "R20", "candidate": "Painted HD candidate"}
if args.temporal_validation:
    temporal = read(args.temporal_validation)
    assert temporal["status"] in ("PASS_STATIC_SOURCE_TEXTURE_CONTINUITY_AND_EXACT_PRESERVATION",
                                  "PASS_PAINTED_CONTINUITY_AND_ACCEPTED_PRESERVATION",
                                  "PASS_PAINTED_CONTINUITY_AND_CONSTRUCTION_PRESERVATION")
    assert temporal["candidateAuthoringSha256"] == sha(args.authoring)
    shutil.copy2(args.temporal_validation, evidence / "temporal-validation.json")
write(evidence / "review-selection.json", {"scope": "CURRENT_PAINTED_CANDIDATES_FOR_USER_REVIEW",
    "artworkAcceptance": "PENDING", "sequences": list(records.values()),
    "acceptedUnchangedKeys": sorted(accepted_keys), "newVisualReviewKeys": sorted(repair_keys or (set(records)-accepted_keys)),
    "unchangedControlKeys": sorted(set(records)-repair_keys) if repair_keys else [],
    "unfinishedSequences": len(authoring["hdRepaintProgress"]["pendingKeys"]),
    "windowsRuntime": "NOT_RUN", "deferredWork": ["MCV deployment simulation", "Windows performance"]})
media = []


def copy_media(source, target, mime):
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    assert sha(source) == sha(target)
    media.append({"file": target.relative_to(args.output).as_posix(), "sha256": sha(target),
                  "bytes": target.stat().st_size, "mime": mime})
    return f"data:{mime};base64," + base64.b64encode(target.read_bytes()).decode()


videos = []
for n, entry in enumerate(sessions["sessions"]):
    report_file = Path(entry["report"])
    assert sha(report_file) == entry["sha256"]
    report = read(report_file)
    assert report["status"] == "PASS_SELECTED_NATIVE_CASES"
    scope = entry["scope"]
    assert report["scope"] == scope
    original = scope["original"]
    owner = scope.get("ownerColorId", 1)
    color_name = {0: "Gold", 1: "Red", 2: "Blue", 3: "Green"}.get(owner, f"Player {owner}")
    label = (f"Original control / {report['edition'].upper()} / {scope['theater'].title()} / HD off" if original
             else f"{report['edition'].upper()} / {scope['theater'].title()} / {scope['density']}X / {color_name} player")
    report_target = evidence / f"native-{n:02}.json"
    shutil.copy2(report_file, report_target)
    assert sha(report_file) == sha(report_target)
    for identity, case in report["cases"].items():
        family_identity = "GAAIRC" if identity == "AMRADR" else identity
        matches = [key for key, record in records.items()
                   if record['identity'] == family_identity and record['theater'] == scope['theater']
                   and (not record.get('editions') or report['edition'] in record['editions'])]
        assert len(matches) == 1, (family_identity, scope, matches)
        key = matches[0]
        assert case["expectedMemberSha256"] == records[key]["newMember"]["sha256"]
        assert case["frames"] == records[key]["frames"]
        folder = args.output / "Recordings" / identity / (
            f"original-control-{scope['theater'].lower()}" if original
            else f"{scope['theater'].lower()}-{scope['density']}x-{color_name.lower()}")
        provenance_label=(" / fresh V10 cannon" if identity=='GTGCAN' else " / accepted V9 recording") if cannon_review else (" / retained accepted recording" if key in accepted_keys else " / fresh remaining-art recording" if key in repair_keys else " / retained pending recording") if remaining_review else ""
        row = {"label": label + (" / AMRADR alias" if identity == "AMRADR" else "") + provenance_label, "key": key,
               "density": scope["density"], "original": original, "identity": family_identity,
               "nativeIdentity": identity}
        for role in ("build", "sale"):
            row[role] = copy_media(Path(case[role + "Clip"]), folder / (role + ".webm"), "video/webm")
        row["sheet"] = (copy_media(Path(case["nativeSheet"]), folder / "all-gpu-phases.png", "image/png")
                        if not original else "")
        row["ready"] = copy_media(Path(case["readyScreenshot"]), folder / "ready-state.png", "image/png") if case.get("readyScreenshot") else ""
        row["transition"] = copy_media(Path(case["terminalTransition"]), folder / "terminal-to-idle.png", "image/png") if case.get("terminalTransition") else ""
        row["rawReport"] = report_target.relative_to(args.output).as_posix()
        videos.append(row)

native_coverage = {}
for key, record in records.items():
    runs = [v for v in videos if v["key"] == key]
    densities = sorted({v["density"] for v in runs if not v["original"]})
    assert densities == [2, 4], f"Incomplete native density coverage: {key}"
    original_control = any(v["original"] for v in runs)
    assert record["theater"] != "TEMPERATE" or original_control, f"Missing Original control: {key}"
    native_coverage[key] = {"densities": densities, "originalControl": original_control,
                            "nativeIdentities": sorted({v["nativeIdentity"] for v in runs})}

native_section = '''<section><h2>Recorded game motion</h2><p>The frame comparison uses red reference paint. These recordings also show other native player colors. Recorded in controlled Mac test matches; Windows and natural-match acceptance remain open.</p>
<select id="recorded-run"></select><p id="recorded-label"></p>
<div class="views"><figure><figcaption>Actual construction</figcaption><video id="native-build" controls muted playsinline preload="metadata" style="width:100%"></video></figure><figure><figcaption>Actual sale</figcaption><video id="native-sale" controls muted playsinline preload="metadata" style="width:100%"></video></figure></div>
<details><summary>Completed building after construction</summary><img id="native-ready" style="width:100%;max-width:1600px"></details>
<details id="transition-details"><summary>Same-tile terminal (left) and retained idle (right)</summary><img id="native-transition" style="width:100%;max-width:1600px"></details>
<details id="gpu-details"><summary>All native GPU phases: HD row, then Original row</summary><img id="native-sheet" style="width:100%;max-width:1600px"></details></section>'''
native_hook = '''<script>const recordings=__NATIVE_RECORDINGS_PAYLOAD__;
recordings.forEach((r,i)=>$('recorded-run').add(new Option(r.label,i)));
function showRecording(){const r=recordings[+$('recorded-run').value];$('recorded-label').textContent=r.label;for(const kind of ['build','sale']){const v=$('native-'+kind);v.pause();v.src=r[kind];v.load()}$('gpu-details').style.display=r.original?'none':'';$('native-sheet').src=r.sheet;$('native-ready').src=r.ready;$('transition-details').style.display=r.transition?'block':'none';$('native-transition').src=r.transition;}
$('recorded-run').onchange=showRecording;const frameRender=render;let recordingSelection='';render=function(){frameRender();const selection=selected.key+'/'+$('density').value;if(selection===recordingSelection)return;recordingSelection=selection;const match=recordings.findIndex(r=>!r.original&&r.key===selected.key&&String(r.density)===$('density').value);if(match>=0&&$('recorded-run').value!==String(match)){$('recorded-run').value=String(match);showRecording()}};$('density').onchange=render;showRecording();render();</script>'''
cards, pages = [], []
for identity, sequence_items in groups.items():
    name = names.get(identity, identity)
    page_name = f"{identity}-Buildup-Review.html"
    page = prefix + "const families=" + json.dumps(sequence_items, separators=(",", ":")) + ";const $=" + suffix
    group_videos = [v for v in videos if v["identity"] == identity]
    notice = ("Complete painted frames plus matched native construction/sale recordings. Human visual acceptance is pending."
              if group_videos else "Complete painted-frame preview only. Native game recordings have not been captured for this candidate; visual acceptance and native validation remain pending.")
    accepted_items = [i["key"] for i in sequence_items if i["key"] in accepted_keys]
    pending_items = [i["key"] for i in sequence_items if i["key"] not in accepted_keys]
    acceptance = "PENDING"
    if args.cutout_audit:
        notice = "Updated construction cutouts: authored object coverage is restored and background transfer is removed. Inspect all phases on dark, light and checkerboard backgrounds. Visual acceptance of the repaired contours is pending."
    if any(records[i['key']].get('componentRig') for i in sequence_items):
        notice = "Fixed foundations and corrected moving parts: inspect base stability, complete parts, construction order and the completed building transition. All new artwork remains pending visual acceptance."
    elif any(r.get('componentRig') for r in records.values()):
        notice = "Unchanged construction controls, byte-identical to V5; included for comparison."
        acceptance = "UNCHANGED_CONTROL"
    if not remaining_review and authoring.get('upperRegistrationRepair'):
        updated = set(authoring['upperRegistrationRepair']['correctedKeys'])
        if any(i['key'] in updated for i in sequence_items):
            notice = "Upper attachment registration update. V6 foundations and ground markings are preserved exactly. Inspect supports, roof seams, moving parts and the completed building transition. Visual acceptance is pending."
        else:
            notice = "Unchanged V6 construction control. Complete frames and fresh game recordings are included for comparison."
            acceptance = "UNCHANGED_CONTROL"
    if not remaining_review and authoring.get('rigidAnatomyRepair'):
        updated = set(authoring['rigidAnatomyRepair']['correctedKeys'])
        if any(i['key'] in updated for i in sequence_items):
            notice = "Rigid anatomy and complete-part repair. Inspect tower axes, complete cannon bearing, prism deployment, round airforce contacts and chronosphere curvature. Ground artwork remains exact V7 except the reopened Grand Cannon foundation. Visual acceptance is pending."
        else:
            notice = "Unchanged V7 artwork control. Complete frame controls and fresh native construction/sale recordings are included."
            acceptance = "UNCHANGED_CONTROL"
    if not remaining_review and authoring.get('terminalAlignmentRepair'):
        updated = set(authoring['terminalAlignmentRepair']['correctedKeys'])
        if any(i['key'] in updated for i in sequence_items):
            notice = "V9 terminal alignment repair: inspect the robot's unmirrored right satellite, exact airforce contact proportions and the cannon terminal/idle alignment. Retained completed HD parts supply the terminal geometry. Same-tile terminal/idle pairs accompany the new footage. Visual acceptance is pending."
        else:
            notice = "Unchanged V8 artwork control. Frame controls and fresh native recordings are included for comparison."
            acceptance = "UNCHANGED_CONTROL"
    if group_videos and accepted_items:
        accepted_version='Prior reviews' if remaining_review else 'V9' if cannon_review else 'V2'
        notice = accepted_version + " accepted artwork preserved: " + ", ".join(accepted_items) + ". "
        notice += ("New sequences await visual acceptance: " + ", ".join(pending_items) + ". " if pending_items
                   else "All artwork on this page is accepted and unchanged. ")
        notice += "Complete frame controls and retained accepted recordings are available below."
        acceptance = "PARTIALLY_ACCEPTED_NEW_SEQUENCE_PENDING" if pending_items else f"ACCEPTED_{accepted_version}_UNCHANGED"
        if remaining_review and not pending_items:
            page = page.replace(f'<figcaption>{labels["before"]}</figcaption>',
                                '<figcaption>Earlier comparison (retained)</figcaption>', 1)
            page = page.replace(f'<figcaption>{labels["candidate"]}</figcaption>',
                                '<figcaption>Accepted HD artwork</figcaption>', 1)
    if remaining_review and any(i['key'] in repair_keys for i in sequence_items):
        notice=f'New construction artwork: inspect Original-guided anatomy and order, complete components and holes, fixed ground, mechanical attachments, and the initial-idle transition. New sequences await visual acceptance; all {authoring.get('reviewScopeOnly',{}).get('acceptedRecordsPreserved',len(accepted_keys))} previously accepted sequences are preserved.'
    if cannon_review and identity=='GTGCAN':
        notice="V10 cannon rebuild: one bearing, receiver scale and elevation pivot throughout construction. Inspect body/platform fit, deployed feet, emerging armor and the terminal transition. Fresh Mac construction and sale clips are included. Visual acceptance is pending."
    header = f'<p><a href="Open-Review.html">Back to review index</a></p><h1>{name}: construction artwork</h1><p class="status">{notice}</p>'
    page = page.replace("<h1>Painted HD construction review</h1>", header, 1)
    page = page.replace("<title>Painted HD construction review</title>", f"<title>{name} construction review</title>", 1)
    page = page.replace("Complete-sequence visual acceptance remains pending.", "Compare geometry, part order, HD material, owner paint and the final transition. Playback steps uniformly through phases; recorded footage preserves actual game motion.", 1)
    if group_videos:
        page = page.replace("<script>const families=", native_section + "<script>const families=", 1)
        page = page.replace("</html>", native_hook.replace("__NATIVE_RECORDINGS_PAYLOAD__", json.dumps(group_videos, separators=(",", ":")), 1) + "</html>", 1)
    (args.output / page_name).write_text(page)
    pages.append({"file": page_name, "identity": identity, "sequences": [i["key"] for i in sequence_items],
                  "nativeRecordings": bool(group_videos), "recordedRuns": len(group_videos), "artworkAcceptance": acceptance})
    preview_cards = []
    for item in sequence_items:
        key = item["key"]
        source = args.review / (key + "-complete.webp")
        assert Image.open(source).n_frames == item["frames"]
        uri = copy_media(source, args.output / "Animations" / source.name, "image/webp")
        preview_cards.append(f'<figure><figcaption>{html.escape(key)} / every phase</figcaption><img class="preview" src="{uri}" alt="Original, previous candidate and current HD animation"></figure>')
        for phase in range(item["frames"]):
            source = args.review / f"{key}-{phase:02}.png"
            target = args.output / "Frames" / key / f"{phase:02}.png"
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            assert sha(source) == sha(target)
    cards.append(f'<article><h2>{name}</h2><p>{notice}</p><p><a class="open" href="{page_name}">Open frames{", game videos and GPU comparisons" if group_videos else " and animation controls"}</a></p>' + "".join(preview_cards) + "</article>")
index = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HD construction artwork acceptance</title>
<style>body{font:20px system-ui;line-height:1.5;background:#18231e;color:#eee;margin:28px}h1{font-size:36px}h2{font-size:30px}a{color:#b4e9ce}.open{display:inline-block;padding:10px 16px;background:#304b3e;border-radius:6px;font-size:22px}article{margin:32px 0;padding:20px;border:1px solid #536b5d}figure{margin:20px 0}.preview{width:100%;max-width:1600px}figcaption{font-size:23px;margin:10px 0}p{max-width:1200px}</style>
<h1>HD construction artwork acceptance</h1><p>2026-10-12 / __BUILDING_COUNT__ buildings / __SEQUENCE_COUNT__ complete sequences / independent 2X and 4X frame controls / __CLIP_COUNT__ actual Mac recordings.</p>
<p>Open any building below. Left: Original; middle: __BEFORE_LABEL__; right: __CANDIDATE_LABEL__. Use Previous, Next and the phase slider for inspection. Animation previews step uniformly through phases and hold the final frame; they are not recordings. Each building page states its actual recording coverage.</p>
<p>New artwork acceptance is pending. The previously accepted V2 artwork is preserved. The full building task remains in progress: __PENDING_COUNT__ reopened sequences are still unpainted. This folder is a current review checkpoint, not the completed Windows artwork handoff.</p>
__REVIEW_CARDS__<p>Standalone media are also in Animations, Frames and Recordings. All page images and videos are embedded; no server, project checkout or internet connection is needed.</p></html>'''
if args.cutout_audit:
    index = index.replace("The previously accepted V2 artwork is preserved.",
        "All 18 painted construction cutouts are reopened for review; material style and finished artwork are retained. The 108-sequence / 4,890-density-frame cutout survey is included in Evidence.")
if any(r.get('componentRig') for r in records.values()):
    index = index.replace("All 18 painted construction cutouts are reopened for review; material style and finished artwork are retained.",
        "Seven identities / 14 sequences receive component corrections; four unchanged sequences are comparison controls. Finished artwork is retained.")
if not remaining_review and authoring.get('upperRegistrationRepair'):
    count = len(authoring['upperRegistrationRepair']['correctedKeys'])
    index = index.replace("Seven identities / 14 sequences receive component corrections; four unchanged sequences are comparison controls. Finished artwork is retained.",
        f"Upper attachment registration is corrected in {count} sequences; {len(items)-count} unchanged sequences remain comparison controls. V6 foundations and ground markings are preserved exactly. Finished artwork is retained.")
    index = index.replace("2026-10-12 /", "2026-10-13 /")
if not remaining_review and authoring.get('rigidAnatomyRepair'):
    count = len(authoring['rigidAnatomyRepair']['correctedKeys'])
    index = index.replace("Seven identities / 14 sequences receive component corrections; four unchanged sequences are comparison controls. Finished artwork is retained.",
        f"Five identities / {count} theater sequences have rigid anatomy and complete-part repairs; {len(items)-count} unchanged sequences remain comparison controls. V7 ground artwork is retained except the completed Grand Cannon foundation. Finished artwork is retained.")
    index = index.replace("2026-10-12 /", "2026-10-13 /")
if not remaining_review and authoring.get('terminalAlignmentRepair'):
    count = len(authoring['terminalAlignmentRepair']['correctedKeys'])
    index = index.replace("Seven identities / 14 sequences receive component corrections; four unchanged sequences are comparison controls. Finished artwork is retained.",
        f"Three identities / {count} theater sequences receive terminal alignment repairs; {len(items)-count} unchanged V8 sequences are controls. Robot and airforce ground nodes remain exact V8; the cannon platform matches its correct completed registration. Finished HD artwork is retained.")
    index = index.replace("2026-10-12 /", "2026-10-13 /")
if cannon_review:
    index=index.replace("New artwork acceptance is pending. The previously accepted V2 artwork is preserved.",
        "Only Grand Cannon acceptance is pending. The other sixteen reviewed V9 theater sequences are accepted and preserved exactly.")
    index=index.replace(f"Three identities / {count} theater sequences receive terminal alignment repairs; {len(items)-count} unchanged V8 sequences are controls. Robot and airforce ground nodes remain exact V8; the cannon platform matches its correct completed registration. Finished HD artwork is retained.",
        "Grand Cannon is rebuilt in both theaters. The other sixteen V9 sequences and their accepted recordings remain unchanged; only cannon footage is freshly recorded. Finished HD artwork is retained.")
if remaining_review:
    review_scope = authoring.get('reviewScopeOnly', {})
    review_date = review_scope.get('reviewDate', '2026-10-13')
    index=index.replace("2026-10-12 /", review_date + " /")
    accepted_count = review_scope.get('acceptedRecordsPreserved', len(accepted_keys))
    preserved_notice = (f"All {accepted_count} previously accepted sequences are preserved in their prior reviews. "
        f"This folder contains the {len(items)} new sequences and their fresh game recordings."
        if review_scope else f"All {accepted_count} accepted sequences are preserved exactly, with their native recordings identified as retained evidence.")
    index=index.replace("New artwork acceptance is pending. The previously accepted V2 artwork is preserved.",
        "New construction artwork is pending visual acceptance. " + preserved_notice)
(args.output / "Open-Review.html").write_text(index.replace("__REVIEW_CARDS__", "".join(cards), 1)
    .replace("__CLIP_COUNT__", str(len(videos) * 2), 1).replace("__BEFORE_LABEL__", html.escape(labels["before"]), 1)
    .replace("__CANDIDATE_LABEL__", html.escape(labels["candidate"]), 1)
    .replace("__BUILDING_COUNT__", str(len(groups)), 1).replace("__SEQUENCE_COUNT__", str(len(items)), 1)
    .replace("__PENDING_COUNT__", str(len(authoring["hdRepaintProgress"]["pendingKeys"])), 1))
(args.output / "README.txt").write_text("Open Open-Review.html in a browser, then choose a building. All images and available game recordings are embedded.\n\n" +
    f"Compare Original, {labels['before']} and {labels['candidate']}. Each page identifies its exact recorded runs; standalone clips are in Recordings.\n\n" +
    "Check stationary base/rims/panels during playback, construction anatomy/order, moving parts, owner color, snow placement and the final-to-idle transition. Preview timing is illustrative; native footage retains actual recorded game motion.\n\nHuman artwork acceptance is pending. Full production is unfinished. Windows, physical-input and natural-match acceptance are not claimed. This review folder is not the final Windows return.\n")
write(args.output / "review-contents.json", {"status": "CURRENT_CANDIDATES_READY_FOR_USER_VISUAL_REVIEW",
    "pages": pages, "selectedSequences": len(items), "densitySelections": len(items) * 2,
    "checkedDensityFrames": validation["checkedDensityFrames"], "nativeRecordings": len(videos) * 2,
    "readyScreenshots": sum(bool(v.get("ready")) for v in videos),
    "terminalComparisons": sum(bool(v.get("transition")) for v in videos),
    "media": media, "nativeCoverage": native_coverage, "acceptedUnchangedKeys": sorted(accepted_keys),
    "newVisualReviewKeys": sorted(repair_keys or (set(records)-accepted_keys)),
    "unchangedControlKeys": sorted(set(records)-repair_keys) if repair_keys else [],
    "artworkAcceptance": "PENDING", "windowsRuntime": "NOT_RUN"})
inventory = [{"file": file.relative_to(args.output).as_posix(), "bytes": file.stat().st_size, "sha256": sha(file)}
             for file in sorted(args.output.rglob("*")) if file.is_file()]
write(args.output / "file-manifest.json", {"schema": "review-file-manifest-v1", "files": inventory})
print(len(pages), "pages", len(items), "sequences", len(videos) * 2, "native clips", sum(r["bytes"] for r in inventory), "bytes")
