"""Close incremental native registration and produce an optional embedded evidence page."""
import base64
import hashlib
import html
import io
import json
import subprocess
from html.parser import HTMLParser
from pathlib import Path

from PIL import Image
from newurban_batch89_io import pin, read, write

ROOT = Path('.artifacts/m2-4/newurban-anchored-buildings-batch91-20261020')
export = read(ROOT / 'export-and-preservation-v2.json')
audit = read(ROOT / 'static-audit-v2.json')
stage = read(ROOT / 'active-stage-v1.json')
inventory = read(ROOT / 'inventory-reconciliation-v1.json')
assert read('desktop/environment-newurban-hd-contract.json')['selectedPack'] == export['candidate']
assert read('.local/environment-newurban-selection.json') == export['candidate']
assert audit['counts'] == dict(exact=354, oilShade=4, hospitalContact=2, empty=46, shadows=104, rubbleExact=12)
assert inventory['remainingAuthoredGaps'] == 219
assert inventory['remainingByKind'] == dict(tmp=198, building=17, infantry=2, overlay=2)
assert stage['preparedRegistration'] == dict(type='prepared-hd-registered', members=453, pages=1205,
    index='b729828392970f5e7a91ece16990924bd86c2daea7c76f79af2639de3ebae54b')
OUT = ROOT / 'reference-v1'
OUT.mkdir(exist_ok=False)
reports, images, cards, aliases, paths, peaks, prepared = [], [], [], [], [], {}, []
by_density = {}
for density, name in [(2, 'native-2x-v2'), (4, 'native-4x-v1')]:
    folder = ROOT / name
    file = folder / 'report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['bindingStatus'] == 'PASS_12_SOURCE_PATHS_SIX_ORIGINAL_FAMILIES_NATIVE_STATES_AND_HOSPITAL_ALIAS'
    assert report['selectedEnvironmentRevision'] == export['candidate']['revision']
    assert len(report['sourcePaths']) == 12 and report['requestedDensity'] == density
    assert {row['member'] for row in report['sourcePaths']} == {row['member'] for row in export['records']}
    paths += report['sourcePaths']
    assert len(report['maps']) == 2
    assert sum(len(case['technology']['cases']) for case in report['maps']) == 3
    for case in report['maps']:
        launch = case['launch']
        assert launch['modeType'] == 0 and launch['options']['gameMode'] == 1 and launch['options']['credits'] == 10000
        for row in launch['objects']:
            family = read('desktop/environment-newurban-hd-contract.json')['identities']['yr'][row['name']]
            assert launch['environment']['families'][family]['status'] == 'PUBLISHED_COMPLETE_FAMILY'
            assert launch['environment']['families'][family]['density'] == density
        if case.get('releaseBeforeLoad'):
            assert all(case['releaseBeforeLoad'][key]['disposed'] and not case['releaseBeforeLoad'][key]['worldChargeBytes']
                for key in ['environment', 'terrain'])
        assert len(case['normal']) == len(case['damaged']) == len(case['rubble']) == len(launch['objects'])
        for row in case['rubble']:
            capture = row['capture']
            assert capture['binding']['destroyed'] and capture['rubble']['visible'] and capture['rubble']['frame'] == 3
            assert capture['rubble']['hd'] == capture['binding']['hd']
            assert capture['tick'] >= case['tickBeforeDestruction'] + 100 and not capture['rescaled']
            assert capture['glError'] == 0
        allocation = case['allocation']
        assert allocation['total'] <= allocation['limit'] == (512 if density == 2 else 1280) * 1024 ** 2
        assert allocation['prepared']['peakBytes'] <= 128 * 1024 ** 2 and allocation['glError'] == 0
        prepared.append(allocation['prepared']['peakBytes'])
    peaks[str(density)] = max(case['allocation']['total'] for case in report['maps'])
    assert report['hospitalAlias']['name'] == 'CAHOSP' and report['hospitalAlias']['hd']
    assert all(report['aliasRelease'][key]['disposed'] and not report['aliasRelease'][key]['worldChargeBytes']
        for key in ['environment', 'terrain'])
    if density == 2:
        assert report['maps'][0]['garrison']['status'] == 'PASS_SEQUENTIAL_NATIVE_BUILDING_ACTOR_AND_ANIMATION_CASES'
        assert len(report['maps'][0]['garrison']['buildings']) == 1
    else:
        assert not report['originalFallback']['object'].get('hd')
        assert all(not report['originalFallback'][key]['worldChargeBytes'] for key in ['environment', 'terrain'])
        for key in ['originalRelease', 'crossTheater']:
            assert all(report[key][kind]['disposed'] and not report[key][kind]['worldChargeBytes']
                for kind in ['environment', 'terrain'])
        assert report['crossTheater']['currentEnvironment']['density'] == report['crossTheater']['currentTerrain']['density'] == 4
    reports.append(pin(file))
    by_density[density] = folder, report


def figure(file, title, density='any', view='new'):
    with Image.open(file) as image:
        image.load()
        size = list(image.size)
    images.append(dict(**pin(file), size=size, density=density, view=view, role='ACTUAL_MAC_UNSCALED_FRAMEBUFFER_CROP'))
    encoded = base64.b64encode(file.read_bytes()).decode()
    return (f'<figure data-density="{density}" data-view="{view}"><figcaption>{html.escape(title)}</figcaption>'
        f'<img width="{size[0]}" height="{size[1]}" loading="lazy" decoding="async" '
        f'src="data:image/png;base64,{encoded}" alt="{html.escape(title)}"></figure>')


for name in ['CANWY24', 'CATEXS06', 'CATEXS07', 'CAOILD', 'CAAIRP', 'CATHOSP']:
    pictures = []
    for density, (folder, report) in by_density.items():
        case, = [case for case in report['maps'] if any(row['name'] == name for row in case['normal'])]
        for state in ['normal', 'rubble']:
            row, = [row for row in case[state] if row['name'] == name]
            pictures.append(figure(folder / row['capture']['file'],
                f'{name} / {case["mapId"]} / {state} / actual Mac {density}X', density))
    cards.append(f'<article><h2>{name}</h2><div class="pair">{"".join(pictures)}</div></article>')
for density, (folder, report) in by_density.items():
    aliases.append(figure(folder / report['hospitalAliasCapture']['file'],
        f'CAHOSP alias / original Turfwar placement / actual Mac {density}X', density))
    if density == 4:
        aliases.append(figure(folder / report['originalCapture']['file'],
            'CAHOSP / same original Turfwar placement / actual Original', density, 'original'))
decision = read(ROOT / 'accepted-art-reuse-decision-v1.json')
stats = ''.join(f'<tr><td>{html.escape(row["member"])}</td><td>{row["slot"]}</td>'
    f'<td>{row["nativeLuminanceCorrelation"]:.4f}</td><td>{row["nativeColorRegistrationRmse"]:.2f}</td>'
    f'<td>{row["differingOriginalAlphaPixels"]}</td></tr>' for row in decision['materialChecks'])
page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M2.4 Accepted-art Reuse / Batch 91</title><style>*{{box-sizing:border-box}}body{{margin:0;background:#101820;color:#e6edf3;font:18px/1.5 system-ui}}header,main{{max-width:1660px;margin:auto;padding:24px}}header{{position:sticky;top:0;background:#101820f5;z-index:1}}h1{{font-size:30px;margin:0 0 8px}}h2{{font-size:25px}}button{{font:inherit;background:#243341;color:white;border:1px solid #647786;border-radius:7px;padding:7px 14px;margin:3px;cursor:pointer}}button[aria-pressed=true]{{background:#167154}}.controls{{display:flex;flex-wrap:wrap;gap:14px}}figure{{margin:0;padding:12px;background:#18232d;border-radius:8px;max-width:100%;overflow:auto}}figcaption{{font-size:18px;margin-bottom:12px}}img{{display:block;max-width:none}}.pair{{display:flex;flex-wrap:wrap;align-items:flex-start;gap:16px;margin-bottom:28px}}article{{margin:30px 0;content-visibility:auto;contain-intrinsic-size:auto 800px}}[hidden]{{display:none!important}}body[data-fit=on] figure img{{max-width:100%;height:auto}}table{{border-collapse:collapse;font-size:18px}}td,th{{text-align:left;border:1px solid #647786;padding:9px 12px}}summary{{font-size:22px;cursor:pointer}}details{{margin:30px 0}}</style>
<header><h1>Accepted-art reuse / Batch 91</h1><p>Six complete NewUrban families reuse accepted bodies, rubble and complete linked animations. No new artwork decision is requested. This optional page records target-source registration and actual native states.</p><div class="controls"><div data-control="density">Density: <button data-value="2">2X</button><button data-value="4">4X</button><button data-value="all">All</button></div><div data-control="view">View: <button data-value="all">HD / Original</button><button data-value="new">HD only</button></div><div data-control="fit">Scale: <button data-value="off">Actual pixels</button><button data-value="on">Fit</button></div></div></header>
<main><p>All images below copy the actual Mac framebuffer without resizing. Resource density does not change camera scale. Normal and native rubble states retain original map placements. Reveal, stopped AI, legal engineers and one representative garrison are controlled validation fixtures.</p>{''.join(cards)}
<details><summary>Hospital alias and same-position Original fallback</summary><p>CATHOSP and CAHOSP retain their original rule identities while sharing the proven source family. Turfwar provides the separate CAHOSP placement. The 4X HD and Original captures use the same original location.</p><div class="pair">{''.join(aliases)}</div></details>
<details><summary>Why reuse is valid</summary><p>Source canvas dimensions include transparent margins. Native anchor normalization proves three building bodies and the airport body have the same rendered original pixels and owner regions. Exact original index equality is sufficient for reuse, but not necessary. The rubble variants differ mostly through palette quantization; their original luminance structure and silhouettes remain compatible with the accepted authored material. The six accepted rubble RGBA/data payloads are reused directly, with no color fit, blur, interpolation or original raster grain copied into new detail.</p><table><thead><tr><th>Source</th><th>Slot</th><th>Luminance correlation</th><th>Color RMSE / 255</th><th>Raster alpha delta</th></tr></thead><tbody>{stats}</tbody></table><p>Hospital rubble has 27 changed original alpha cells in 26 one/two-pixel components. Its accepted continuous contour is retained at the authoritative target trim origin. No gameplay geometry is changed. The hospital normal adapter preserves 313 original index-12 contact cells; the oil adapter changes only the source-pinned single owner-shade cell in its two damaged slots. No whole-building redraw is required.</p></details>
<p>All 360 density slots are verified: 354 exact accepted RGBA/auxiliary pairs, four oil shade adapters and two hospital contact adapters. All 46 native empty density slots, 104 original shadow slots and 197 prior families remain intact. All four newly generated mothers and the first seven-study export remain unselected. Mac 2X/4X registration, normal/damaged/rubble states, native capture/repair, representative garrison, Original fallback and cross-theater release pass. Artwork acceptance is inherited; no repeat art review is requested. Windows NOT_RUN. No per-batch game or resource copy. NewUrban retains 219 authored gaps and 22 conditional groups; M2.4 is incomplete.</p></main>
<script>const state={{density:'2',view:'all',fit:'off'}};function update(){{document.body.dataset.fit=state.fit;document.querySelectorAll('figure').forEach(f=>{{f.hidden=!['density','view'].every(k=>f.dataset[k]==='any'||state[k]==='all'||f.dataset[k]===state[k]);}});document.querySelectorAll('[data-control]').forEach(group=>group.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(state[group.dataset.control]===button.dataset.value))));}}document.querySelectorAll('[data-control] button').forEach(button=>button.addEventListener('click',()=>{{state[button.parentElement.dataset.control]=button.dataset.value;update();}}));update();</script></html>'''
file = OUT / 'M2.4-NewUrban-Accepted-Reuse-Batch91-Embedded.html'
file.write_text(page)
metadata = dict(status='PASS_SIX_COMPLETE_ACCEPTED_ART_FAMILIES_NATIVE_MAPPING_NO_NEW_ART_REVIEW',
    html=pin(file), images=images, nativeReports=reports, stage=pin(ROOT / 'active-stage-v1.json'),
    candidate=export['candidate'], artworkAcceptance='INHERITED_ACCEPTED', selectedNewMothers=0,
    sourceRegistrationReview='INTERNAL_ACTUAL_MAC_PASS', repeatUserArtworkReview='NOT_REQUESTED',
    browserInteractive='NOT_RUN_LOCAL_PROTOCOL_RESTRICTION_RETAINED', windows='NOT_RUN', m24Complete=False)
write(OUT / 'review-metadata-v1.json', metadata)


class Parser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images, self.scripts, self.in_script = [], [], False

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        if tag == 'img':
            assert data['src'].startswith('data:image/png;base64,')
            self.images.append(data)
        if tag == 'script':
            assert not data.get('src')
            self.in_script = True

    def handle_endtag(self, tag):
        if tag == 'script':
            self.in_script = False

    def handle_data(self, data):
        if self.in_script:
            self.scripts.append(data)


parser = Parser()
parser.feed(page)
assert len(parser.images) == len(images) == 27
for embedded, declared in zip(parser.images, images, strict=True):
    raw = base64.b64decode(embedded['src'].split(',', 1)[1], validate=True)
    assert hashlib.sha256(raw).hexdigest() == declared['sha256']
    with Image.open(io.BytesIO(raw)) as image:
        image.load()
        assert list(image.size) == declared['size'] == [int(embedded['width']), int(embedded['height'])]
js = ROOT / 'reference-controls-v1.js'
with js.open('x') as stream:
    stream.write('\n'.join(parser.scripts))
subprocess.run(['node', '--check', str(js)], check=True, capture_output=True)
write(ROOT / 'coverage-and-native-closure-v1.json', dict(
    status='PASS_SIX_COMPLETE_ACCEPTED_ART_FAMILIES_24_NATIVE_MEMBER_DENSITY_PATHS',
    runtimeSourceCommit=stage['runtimeSourceHead'], candidate=export['candidate'],
    stage=pin(ROOT / 'active-stage-v1.json'), staticAudit=pin(ROOT / 'static-audit-v2.json'),
    inventoryReconciliation=pin(ROOT / 'inventory-reconciliation-v1.json'),
    newCompleteFamilies=6, sourceMembers=12, nativeIdentities=7, sourceDensitySlots=360,
    exactAcceptedRgbaAuxiliaryPairs=354, oilShadeDensityAdapters=4, hospitalContactDensityAdapters=2,
    nativeEmptyDensitySlots=46, separateOriginalShadowSlots=104, exactAcceptedRubbleDensityFrames=12,
    newArtStudies=0, selectedNewMothers=0, retainedUnusedMothers=4, inheritedPriorFamilies=197,
    sourcePaths=paths, nativeReports=reports, worldPeakBytes=peaks, preparedPeakBytes=max(prepared),
    worldBudgetsMiB={'2X': 512, '4X': 1280}, preparedBudgetMiB=128, uiBudgetMiB=16,
    originalFallback='PASS', crossTheaterReleaseAndReentry='PASS_DESERT_4X',
    reuseDecision=pin(ROOT / 'accepted-art-reuse-decision-v1.json'),
    retainedFixtureFailure=pin(ROOT / 'native-map-fixture-correction-v1.json'),
    reference=pin(file), referenceMetadata=pin(OUT / 'review-metadata-v1.json'), embeddedPngs=27,
    offlineSourceQa='PASS_ALL_EMBEDDED_PNG_HASHES_DIMENSIONS_AND_SCRIPT_SYNTAX',
    browserInteractive='NOT_RUN_LOCAL_PROTOCOL_RESTRICTION_RETAINED',
    artworkAcceptance='INHERITED_ACCEPTED', nativeSemanticAdapters='TECHNICAL_PASS',
    repeatUserArtworkReview='NOT_REQUESTED', windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False,
    remainingAuthoredNewUrbanGaps=219, remainingNewUrbanByKind=inventory['remainingByKind'],
    conditionalNewUrbanGroups=22, perBatchGamePackage='NOT_CREATED_USER_REQUEST_HTML_ONLY'))
print(dict(status='PASS_ACCEPTED_REUSE_TECHNICAL_CLOSURE', sourcePaths=len(paths), worldPeakBytes=peaks,
    preparedPeakBytes=max(prepared), embeddedPngs=27, html=pin(file), remaining=219))
