"""Combine unchanged native evidence with four final slope checks and one grouped review."""
import base64
import hashlib
import html
import io
import subprocess
from html.parser import HTMLParser
from pathlib import Path
import numpy as np
from PIL import Image
from newurban_batch93_io import ROOT, GUIDE, assemble, crop, native, pin, read, write

export = read(ROOT / 'export-and-preservation-v7.json')
audit = read(ROOT / 'static-audit-v4.json')
stage = read(ROOT / 'active-stage-v5.json')
assert read('.local/terrain-newurban-selection.json') == export['candidate']
assert audit['authoredDensitySlots'] == 508 and audit['originalUnreferencedCompatibilityDensitySlots'] == 40
all_reports, updated_reports, source_paths, peaks, prepared = [], [], [], {}, []
old_by_density, final_by_density = {}, {}
for density in [2, 4]:
    folder = ROOT / f'native-{density}x-v1'
    report = read(folder / 'report.json')
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['bindingStatus'] == 'PASS_34_ORIGINAL_ROAD_SOURCE_PATHS_FOUR_MAPS_NATIVE_TICKS_AND_FIXED_BUDGET'
    assert len(report['maps']) == 4 and len(report['sourcePaths']) == 34
    assert len({r['member'] for r in report['sourcePaths']}) == 34
    for case in report['maps']:
        assert case['simulation']['tick'] >= case['launch']['tick'] + 12
        assert case['simulation']['glError'] == 0 and case['simulation']['status'] == 1
        assert case['launch']['mode'] == 0 and case['launch']['options']['gameMode'] == 1
        assert case['allocation']['total'] <= case['allocation']['budget'] == (512 if density == 2 else 1280) * 1024 ** 2
        prepared.append(case['allocation']['prepared']['peakBytes'])
        if case.get('releaseBeforeLoad'):
            assert all(case['releaseBeforeLoad'][k]['disposed'] and not case['releaseBeforeLoad'][k]['worldChargeBytes']
                       for k in ['terrain', 'environment'])
    all_reports.append(pin(folder / 'report.json'))
    old_by_density[density] = folder, report
    source_paths += [dict(**r, evidence='UNCHANGED_V4_PAYLOAD_INHERITED') for r in report['sourcePaths']
                     if not r['member'].startswith('prslpe')]
    peaks[str(density)] = max(case['allocation']['total'] for case in report['maps'])
    final_folder = ROOT / f'native-safe-{density}x-v1'
    final = read(final_folder / 'report.json')
    assert final['status'] == 'PASS_SELECTED_NATIVE_CASES' and not final['errors']
    assert final['bindingStatus'] == 'PASS_SELECTED_ROADS_AND_FOUR_EXPLICIT_COMPLETE_ORIGINAL_SLOPE_FALLBACKS'
    assert final['selectedTerrainRevision'] == export['candidate']['revision']
    assert len(final['maps']) == 1 and len(final['sourcePaths']) == 6
    assert len(final['maps'][0]['originalSlopeFallback']) == 4
    assert all(not r['hasAnyHdBinding'] for r in final['maps'][0]['originalSlopeFallback'])
    case = final['maps'][0]
    assert case['simulation']['tick'] >= case['launch']['tick'] + 12 and case['simulation']['glError'] == 0
    assert case['allocation']['total'] <= case['allocation']['budget']
    prepared.append(case['allocation']['prepared']['peakBytes'])
    peaks[str(density)] = max(peaks[str(density)], case['allocation']['total'])
    assert all(not r['member'].startswith('prslpe') for r in final['sourcePaths'])
    updated_reports.append(pin(final_folder / 'report.json'))
    final_by_density[density] = final_folder, final
    if density == 4:
        for key in ['terrain', 'environment']:
            assert final['originalState'][key]['worldChargeBytes'] == 0
            for transition in ['originalRelease', 'crossTheater']:
                assert final[transition][key]['disposed'] and final[transition][key]['worldChargeBytes'] == 0
        assert final['crossTheater']['currentTerrain']['density'] == final['crossTheater']['currentEnvironment']['density'] == 4
assert len(source_paths) == 60 and max(prepared) <= 128 * 1024 ** 2
old_candidate = read(ROOT / 'export-and-preservation-v4.json')['candidate']
old_manifest = read(Path('.local/terrain-packs') / old_candidate['revision'] / 'manifest.json')
manifest = read(Path('.local/terrain-packs') / export['candidate']['revision'] / 'manifest.json')
assert len(manifest['groups']) == 47
for group in manifest['groups']:
    old_group, = [g for g in old_manifest['groups'] if g['id'] == group['id']]
    assert group == old_group
assert manifest['deferredSources']['countedAsAuthored'] is False
inventory = read(ROOT / 'inventory-reconciliation-v3.json')
assert inventory['remainingAuthoredGaps'] == 184

out = ROOT / 'review-v1'
out.mkdir(exist_ok=False)
images = []


def figure(file, title, density='any', view='hd'):
    with Image.open(file) as image:
        image.load()
        size = list(image.size)
    images.append(dict(**pin(file), size=size, title=title))
    encoded = base64.b64encode(file.read_bytes()).decode()
    return (f'<figure data-density="{density}" data-view="{view}"><figcaption>{html.escape(title)}</figcaption>'
        f'<img width="{size[0]}" height="{size[1]}" loading="lazy" decoding="async" '
        f'src="data:image/png;base64,{encoded}" alt="{html.escape(title)}"></figure>')


def capture_for(report, name, map_index=0):
    row, = [r for r in report['maps'][map_index]['captures'] if r['member'] == name]
    return row


native_cards = []
for name in ['proad01.ubn', 'proad10.ubn', 'proad14.ubn', 'proad18.ubn']:
    pictures = []
    for density, (folder, report) in final_by_density.items():
        row = capture_for(report, name)
        pictures.append(figure(folder / row['file'], f'Downtown / {name} / actual Mac {density}X', density))
    folder, report = final_by_density[4]
    original, = [r for r in report['originalCaptures'] if r['member'] == name]
    pictures.append(figure(folder / original['file'], f'Downtown / {name} / same camera / Original', 'any', 'original'))
    native_cards.append(f'<details open><summary>{name}: native road contact</summary><div class="pair">{"".join(pictures)}</div></details>')
for index, name in [(1, 'proad17.ubn'), (2, 'proad12.ubn'), (3, 'proad19.ubn')]:
    pictures = []
    for density, (folder, report) in old_by_density.items():
        row = capture_for(report, name, index)
        pictures.append(figure(folder / row['file'], f'{report["maps"][index]["mapId"]} / {name} / actual Mac {density}X / exact inherited payload', density))
    native_cards.append(f'<details><summary>{name}: unchanged accepted source context</summary><div class="pair">{"".join(pictures)}</div></details>')

asset_cards = []
sources = {s['member']: s for s in read(ROOT / 'source.json')['sources']}
for record in export['records']:
    source = sources[record['member']]
    pictures = []
    for density in [2, 4]:
        picture, _ = assemble([(f, crop(export['candidate'], source['member'], f['subTile'], density))
                              for f in source['images'] if f['nativeOffset'] > 0], density)
        background = Image.new('RGBA', picture.size, '#101820')
        background.alpha_composite(picture)
        file = out / f'{source["member"]}-{density}x-resource.png'
        background.convert('RGB').save(file)
        pictures.append(figure(file, f'{source["member"]} / complete active resource / {density}X / bitmap assembly, not gameplay', density))
    asset_cards.append(f'<details><summary>{source["member"]}</summary><div class="pair">{"".join(pictures)}</div></details>')

batch92 = Path('.artifacts/m2-4/newurban-cross-name-reuse-batch92-20261020')
warm = [figure(batch92 / 'cnpars05.shp-3-4x-adapted.png', 'Batch 92 / CAPARS05 / accepted structure with original NewUrban warm material', 4),
        figure(batch92 / 'native-4x-v1/CAPARS05-rubble-native.png', 'Batch 92 / CAPARS05 warm rubble / actual Mac 4X', 4),
        figure(batch92 / 'native-4x-v1/CAMIAM07-occupied-native-detail.png', 'Batch 92 / CAMIAM07 / native garrison and target owner region', 4)]
page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M2.4 Reuse and Road Context / Batches 92–93</title><style>*{{box-sizing:border-box}}body{{margin:0;background:#101820;color:#e6edf3;font:19px/1.5 system-ui}}header,main{{max-width:1740px;margin:auto;padding:24px}}header{{position:sticky;top:0;background:#101820f5;z-index:1}}h1{{font-size:31px;margin:0}}h2,summary{{font-size:24px}}summary{{cursor:pointer;padding:14px}}details{{margin:24px 0}}button{{font:inherit;background:#243341;color:white;border:1px solid #647786;border-radius:7px;padding:7px 14px;margin:3px;cursor:pointer}}button[aria-pressed=true]{{background:#167154}}figure{{margin:0;padding:12px;background:#18232d;border-radius:8px;max-width:100%;overflow:auto}}figcaption{{margin-bottom:12px}}img{{display:block;max-width:none}}.pair{{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}}[hidden]{{display:none!important}}body[data-fit=on] img{{max-width:100%;height:auto}}</style>
<header><h1>Accepted-art reuse / Batches 92–93</h1><p>Five building/fence families and 30 additional road members reuse accepted material. Review only the changed NewUrban road contacts/color and the warm rubble/owner context below. Previously accepted architecture, animation and the four bridge-contact straight variants need no repeat review. The four prslpe01–04 slope sources remain Original and are excluded from this approval scope.</p><div id="density"><button data-value="2">2X</button><button data-value="4">4X</button><button data-value="all">Compare all</button></div><div id="view"><button data-value="all">HD / Original</button><button data-value="hd">HD only</button></div><div id="fit"><button data-value="off">Actual pixels</button><button data-value="on">Fit</button></div></header>
<main><h2>Native display: slopes, curves and road contacts</h2><p>These are unscaled Mac framebuffer captures from unchanged official maps. Original uses the same camera tiles. Ordinary straight-road visual variants may differ; the observed source names and hashes are recorded. Controlled reveal/stopped AI and native simulation advancement are disclosed. Remaining uncovered background groups are intentionally visible as Original.</p>{''.join(native_cards)}
<h2>Batch 92: changed material and owner context</h2><p>Only CAPARS05 rubble warmth and the target owner/contact registration need this combined context check. All architecture, rubble geometry and linked animations come from accepted resources; no new mother image is selected.</p><div class="pair">{''.join(warm)}</div>
<details><summary>All 30 complete reused road members</summary><p>These bitmap assemblies inspect active source members at resource density. Tile-height placement belongs to the actual native scenes above. Forty unreferenced zero-pointer compatibility density slots remain in the contract and are excluded from authored counts and these visual assemblies.</p>{''.join(asset_cards)}</details>
<details><summary>Technical scope and retained attempts</summary><p>Four original maps cover all 30 selected road source paths at both densities. Thirty source payloads are unchanged from the complete first native matrix. Four unresolved slope sources have verified complete Original fallback and remain missing authored resources. Matching rectangle metadata did not make the direct Desert R2 bitmap projection reusable; that intermediate remains retained and unselected. Neither attempted slope correction is selected. All four source files remain rendered through Original, with their map placements, parameters and mechanisms retained. No original RGB is enlarged into HD detail. All 22 earlier terrain groups, four accepted bridge-contact sources and all native geometry/depth/rules remain exact.</p><p>Technical checks pass for the thirty selected road sources and explicit Original fallback. Four slope HD projections remain unresolved; M2.4 has not completed this category. This page awaits grouped visual review of the other resources. Validated matrix upper bounds: {peaks['2']:,} / {peaks['4']:,} bytes at 2X/4X. Prepared peak: {max(prepared):,} bytes. Fixed budgets are unchanged. Windows NOT_RUN. Main integration NOT_PERFORMED. No per-batch game copy. NewUrban retains 184 authored groups (168 TMP, 13 buildings, two infantry, one overlay) and 22 conditional groups. M2.4 remains incomplete.</p></details></main>
<script>const state={{density:'4',view:'all',fit:'off'}};function update(){{document.body.dataset.fit=state.fit;document.querySelectorAll('figure').forEach(f=>f.hidden=!['density','view'].every(k=>f.dataset[k]==='any'||state[k]==='all'||f.dataset[k]===state[k]));for(const key of ['density','view','fit'])document.querySelectorAll('#'+key+' button').forEach(b=>b.setAttribute('aria-pressed',String(state[key]===b.dataset.value)));}}for(const key of ['density','view','fit'])document.querySelectorAll('#'+key+' button').forEach(b=>b.onclick=()=>{{state[key]=b.dataset.value;update();}});update();</script></html>'''
file = out / 'M2.4-NewUrban-Reuse-Roads-Batches92-93-Embedded.html'
with file.open('x') as stream:
    stream.write(page)


class Parser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images, self.scripts, self.in_script = [], [], False

    def handle_starttag(self, tag, attrs):
        value = dict(attrs)
        if tag == 'img':
            assert value['src'].startswith('data:image/png;base64,')
            self.images.append(value)
        if tag == 'script':
            assert not value.get('src')
            self.in_script = True

    def handle_endtag(self, tag):
        if tag == 'script':
            self.in_script = False

    def handle_data(self, value):
        if self.in_script:
            self.scripts.append(value)


parser = Parser()
parser.feed(page)
by_title = {i['title']: i for i in images}
assert len(parser.images) == len(images) == len(by_title)
for item in parser.images:
    declared = by_title[item['alt']]
    raw = base64.b64decode(item['src'].split(',', 1)[1], validate=True)
    assert hashlib.sha256(raw).hexdigest() == declared['sha256']
    with Image.open(io.BytesIO(raw)) as image:
        image.load()
        assert list(image.size) == declared['size']
script_file = out / 'embedded-controls.js'
with script_file.open('x') as stream:
    stream.write('\n'.join(parser.scripts))
subprocess.run(['node', '--check', str(script_file)], check=True)
write(out / 'review-metadata-v1.json', dict(status='PASS_ALL_EMBEDDED_PNG_HASHES_DIMENSIONS_AND_SCRIPT_SYNTAX',
    html=pin(file), images=images, inheritedNativeReports=all_reports, finalFallbackReports=updated_reports,
    candidate=export['candidate'], runtimeSourceCommit=stage['runtimeSourceHead'],
    browserInteractive='NOT_RUN_RETAINED_LOCAL_PROTOCOL_RESTRICTION', visual='PENDING_GROUPED_USER_REVIEW',
    windows='NOT_RUN', m24Complete=False))
write(ROOT / 'coverage-and-native-closure-v1.json', dict(
    status='PASS_30_ROAD_SOURCES_60_DENSITY_PATHS_AND_FOUR_EXPLICIT_ORIGINAL_SLOPE_GAPS',
    candidate=export['candidate'], runtimeSourceCommit=stage['runtimeSourceHead'],
    initialRuntimeSourceCommit=read(ROOT / 'active-stage-v1.json')['runtimeSourceHead'],
    inheritedNativeReports=all_reports, finalFallbackReports=updated_reports, sourcePaths=source_paths,
    sourceDensitySlots=548, authoredDensitySlots=508, originalUnreferencedCompatibilityDensitySlots=40,
    newCompleteLoadFamilies=25, newMembers=30, totalRoadMembersIncludingAcceptedCore=34,
    priorTerrainGroupsExact=22, priorBridgeContactCoreExact=4, unchangedNewSources=30, finalChangedSources=0, deferredOriginalSlopes=4,
    staticAudit=pin(ROOT / 'static-audit-v4.json'), sourceCorrection=pin(ROOT / 'explicit-slope-original-fallback-v1.json'),
    inventory=pin(ROOT / 'inventory-reconciliation-v3.json'), worldPeakUpperBoundBytes=peaks, preparedPeakBytes=max(prepared),
    preparedRegistration=stage['preparedRegistration'], finalStage=pin(ROOT / 'active-stage-v5.json'),
    tests=dict(initialPass=62, initialAssertions=1490, finalOriginalFallbackPass=2, finalOriginalFallbackAssertions=14,
        logs=[pin(ROOT / name) for name in ['targeted-road-tests-v2.log', 'targeted-road-cohort-tests-v2.log', 'deferred-slope-tests-v1.log']]),
    typecheck=pin(ROOT / 'typecheck-v1.log'), review=pin(file), reviewMetadata=pin(out / 'review-metadata-v1.json'),
    pendingGroupedBatch92=pin(batch92 / 'coverage-and-native-closure-v1.json'),
    remainingAuthoredNewUrbanGroups=184, remainingByKind=dict(tmp=168, building=13, infantry=2, overlay=1),
    conditionalNewUrbanGroups=22, selectedNewMothers=0, visual='PENDING_GROUPED_USER_REVIEW',
    windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False))
print(dict(status='PASS_GROUPED_REUSE_AND_ROAD_CLOSURE', images=len(images), peaks=peaks, html=pin(file)))
