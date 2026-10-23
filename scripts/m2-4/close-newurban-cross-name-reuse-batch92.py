"""Close bounded Mac evidence and create a self-contained optional reuse reference."""
import base64
import hashlib
import html
import io
import subprocess
from html.parser import HTMLParser
from pathlib import Path

from PIL import Image
from newurban_batch89_io import pin, read, write

ROOT = Path('.artifacts/m2-4/newurban-cross-name-reuse-batch92-20261020')
export = read(ROOT / 'export-and-preservation-v2.json')
audit = read(ROOT / 'static-audit-v2.json')
stage = read(ROOT / 'active-stage-v2.json')
inventory = read(ROOT / 'inventory-reconciliation-v1.json')
assert inventory['remainingAuthoredGaps'] == 214
assert read('.local/environment-newurban-selection.json') == export['candidate']
assert read('desktop/environment-newurban-hd-contract.json')['selectedPack'] == export['candidate']
assert audit['exactRegisteredAcceptedDensityPayloads'] == 84
assert stage['preparedRegistration'] == dict(type='prepared-hd-registered', members=453, pages=1205,
    index='b729828392970f5e7a91ece16990924bd86c2daea7c76f79af2639de3ebae54b')
reports, peaks, prepared, by_density = [], {}, [], {}
for density, version in [(2, 'native-2x-v2'), (4, 'native-4x-v1')]:
    folder = ROOT / version
    report = read(folder / 'report.json')
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['bindingStatus'] == 'PASS_FIVE_ORIGINAL_SOURCE_PATHS_NATIVE_OWNER_CONTACT_RUBBLE_AND_FENCE_ADJACENCY'
    assert report['selectedEnvironmentRevision'] == export['candidate']['revision']
    assert report['requestedDensity'] == density and len(report['sourcePaths']) == 5
    assert {r['member'] for r in report['sourcePaths']} == {r['member'] for r in export['records']}
    assert report['launch']['mode'] == 0 and report['launch']['options']['gameMode'] == 1
    assert report['launch']['options']['credits'] == 10000
    assert len(report['normal']) == len(report['damaged']) == len(report['rubble']) == 4
    assert report['newNativeStates']['status'] == 'PASS_SEQUENTIAL_NATIVE_BUILDING_ACTOR_AND_ANIMATION_CASES'
    assert len(report['newNativeStates']['buildings']) == 3
    for row in report['newNativeStates']['buildings']:
        assert row['occupied']['frame'] == 2 and row['occupied']['occupants'] > 0
        assert row['normal']['hd'] == row['occupied']['hd'] == row['damaged']['hd']
    for row in report['rubble']:
        capture = row['capture']
        assert capture['binding']['destroyed'] and capture['binding']['rubble']['visible']
        assert capture['binding']['rubble']['frame'] == 3 and capture['binding']['rubble']['hd']
        assert not capture['rescaled'] and capture['glError'] == 0
    assert report['newNativeWalls']['status'] == 'PASS_NATIVE_WALL_DAMAGE_REMOVAL_ADJACENT_REBINDING'
    for key in ['environment', 'terrain']:
        assert report['manhattanRelease'][key]['disposed'] and report['manhattanRelease'][key]['worldChargeBytes'] == 0
    allocations = [report['rushHourAllocation'], report['manhattanAllocation']]
    for value in allocations:
        assert value['total'] <= value['limit'] == (512 if density == 2 else 1280) * 1024 ** 2
        assert value['prepared']['peakBytes'] <= 128 * 1024 ** 2 and value['glError'] == 0
        prepared.append(value['prepared']['peakBytes'])
    peaks[str(density)] = max(v['total'] for v in allocations)
    if density == 4:
        assert len(report['original']) == 4 and all(not r['capture']['binding'].get('hd') for r in report['original'])
        for key in ['environment', 'terrain']:
            assert report['originalAllocation'][key]['worldChargeBytes'] == 0
            for transition in ['originalRelease', 'crossTheater']:
                assert report[transition][key]['disposed'] and report[transition][key]['worldChargeBytes'] == 0
    by_density[density] = folder, report
    reports.append(pin(folder / 'report.json'))

out = ROOT / 'reference-v2'
out.mkdir(exist_ok=False)
images = []


def figure(file, title, density='any'):
    with Image.open(file) as image:
        image.load()
        size = list(image.size)
    images.append(dict(**pin(file), size=size, title=title))
    encoded = base64.b64encode(file.read_bytes()).decode()
    return (f'<figure data-density="{density}"><figcaption>{html.escape(title)}</figcaption>'
        f'<img width="{size[0]}" height="{size[1]}" loading="lazy" decoding="async" '
        f'src="data:image/png;base64,{encoded}" alt="{html.escape(title)}"></figure>')


cards = []
for name in ['CAPARS05', 'CAMIAM07', 'CAMSC10', 'CARUS11']:
    pictures = []
    for density, (folder, report) in by_density.items():
        for state in ['normal', 'rubble']:
            row, = [r for r in report[state] if r['name'] == name]
            pictures.append(figure(folder / row['capture']['file'], f'{name} / actual Mac {density}X / {state}', density))
    folder, report = by_density[4]
    original, = [r for r in report['original'] if r['name'] == name]
    pictures.append(figure(folder / original['capture']['file'], f'{name} / same original placement / Original'))
    if name != 'CARUS11':
        for density, (folder, report) in by_density.items():
            row, = [r for r in report['newNativeStates']['buildings'] if r['normal']['name'] == name]
            pictures.append(figure(folder / row['occupiedCapture']['file'], f'{name} / actual Mac {density}X / native garrison', density))
    cards.append(f'<details><summary>{name}: accepted architecture, target source registration</summary><div class="pair">{"".join(pictures)}</div></details>')
warm = [figure(ROOT / 'original-comparison-cnpars05.shp-3.png', 'CAPARS05 rubble: original Urban and NewUrban material evidence'),
        figure(ROOT / 'cnpars05.shp-3-4x-adapted.png', 'CAPARS05: accepted HD structure with continuous warm material adaptation', 4)]
folder, report = by_density[4]
warm.append(figure(folder / 'CAPARS05-rubble-native.png', 'CAPARS05 warm rubble: actual Mac 4X display', 4))
walls = []
for density, (folder, report) in by_density.items():
    walls.append(figure(folder / report['newNativeWalls']['beforeCapture']['file'],
        f'CAFNCP: original Manhattan fence / actual Mac {density}X', density))
page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M2.4 NewUrban Reuse / Batch 92</title><style>*{{box-sizing:border-box}}body{{margin:0;background:#101820;color:#e6edf3;font:18px/1.5 system-ui}}header,main{{max-width:1700px;margin:auto;padding:24px}}header{{position:sticky;top:0;background:#101820f5;z-index:1}}h1{{font-size:30px;margin:0}}h2,summary{{font-size:24px}}summary{{cursor:pointer;padding:14px}}details{{margin:24px 0}}button{{font:inherit;background:#243341;color:white;border:1px solid #647786;border-radius:7px;padding:7px 14px;margin:3px;cursor:pointer}}button[aria-pressed=true]{{background:#167154}}figure{{margin:0;padding:12px;background:#18232d;border-radius:8px;max-width:100%;overflow:auto}}figcaption{{margin-bottom:12px}}img{{display:block;max-width:none}}.pair{{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}}[hidden]{{display:none!important}}body[data-fit=on] img{{max-width:100%;height:auto}}</style>
<header><h1>NewUrban accepted-art reuse / Batch 92</h1><p>Five complete families; 84 exact registered accepted density payloads and 12 bounded native/material adapters. No new mother images. Accepted architecture, shadows and unchanged states need no repeat review.</p><div id="density"><button data-value="2">2X</button><button data-value="4">4X</button><button data-value="all">All</button></div><div id="fit"><button data-value="off">Actual pixels</button><button data-value="on">Fit</button></div></header>
<main><h2>Changed material and native context</h2><p>CAPARS05 retains its original warmer NewUrban rubble color through one smooth RGB transform of accepted HD material. The structure, contour and independent HD detail remain intact. The source-pixel color comparison is evidence, not a newly authored asset.</p><div class="pair">{''.join(warm)}</div>
<p>Actual Mac images copy the framebuffer without resizing. Asset inspection is explicitly labeled. Reveal, stopped AI and separate legal garrison fixtures are controlled checks. Background terrain includes the still-uncovered source groups; this page does not claim full NewUrban coverage.</p>{''.join(cards)}
<details><summary>CAFNCP: reused complete prison fence</summary><p>All 32 source states and both densities retain accepted artwork. The first isolated post only needs target trim registration. Native damage, removal and surviving neighbour connection frames pass.</p><div class="pair">{''.join(walls)}</div></details>
<p>The first hotel export was correctly rejected as a complete family because one 2X and twelve 4X owner samples escaped visible coverage. The corrected candidate clears only those invalid data samples; RGB/alpha are unchanged. The failed candidate/report remain retained. All 203 prior families and 48 original shadow slots remain exact.</p><p>Mac 2X/4X native states, Original fallback, restart and cross-theater release pass. World peaks: 334,395,196 bytes at 2X and 1,273,614,620 bytes at 4X. Prepared CPU peak: 108,112,788 bytes. Budgets remain unchanged. Windows NOT_RUN. Main integration NOT_PERFORMED. No per-batch game copy. NewUrban retains 214 authored groups and 22 conditional groups; M2.4 remains incomplete.</p></main>
<script>const state={{density:'4',fit:'off'}};function update(){{document.body.dataset.fit=state.fit;document.querySelectorAll('figure').forEach(f=>f.hidden=!(f.dataset.density==='any'||state.density==='all'||f.dataset.density===state.density));for(const key of ['density','fit'])document.querySelectorAll('#'+key+' button').forEach(b=>b.setAttribute('aria-pressed',String(state[key]===b.dataset.value)));}}for(const key of ['density','fit'])document.querySelectorAll('#'+key+' button').forEach(b=>b.onclick=()=>{{state[key]=b.dataset.value;update();}});update();</script></html>'''
file = out / 'M2.4-NewUrban-Cross-Name-Reuse-Batch92-Embedded.html'
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
assert len(parser.images) == len(images)
by_title = {item['title']: item for item in images}
assert len(by_title) == len(images)
for item in parser.images:
    expected = by_title[item['alt']]
    raw = base64.b64decode(item['src'].split(',', 1)[1], validate=True)
    assert hashlib.sha256(raw).hexdigest() == expected['sha256']
    with Image.open(io.BytesIO(raw)) as image:
        image.load()
        assert list(image.size) == expected['size']
script_file = out / 'embedded-controls.js'
with script_file.open('x') as stream:
    stream.write('\n'.join(parser.scripts))
subprocess.run(['node', '--check', str(script_file)], check=True)
metadata = dict(status='PASS_EMBEDDED_IMAGES_AND_SCRIPT_SYNTAX_ACTUAL_MAC_REFERENCE', html=pin(file), images=images,
    nativeReports=reports, browserInteractive='NOT_RUN_LOCAL_PROTOCOL_RESTRICTION_RETAINED',
    artwork='INHERITED_ACCEPTED_STRUCTURE_WITH_CHANGED_MATERIAL_CONTEXT_PENDING_USER_REVIEW', windows='NOT_RUN', m24Complete=False)
write(out / 'review-metadata-v1.json', metadata)
write(ROOT / 'coverage-and-native-closure-v1.json', dict(
    status='PASS_FIVE_COMPLETE_FAMILIES_TEN_NATIVE_SOURCE_DENSITY_PATHS_AND_TARGET_SEMANTICS',
    candidate=export['candidate'], runtimeSourceCommit=stage['runtimeSourceHead'],
    completeFamilies=5, sourceMembers=5, sourceDensitySlots=96, exactRegisteredAcceptedDensityPayloads=84,
    boundedAdaptedDensityPayloads=12, originalShadowSlots=48, inheritedPriorFamilies=203,
    selectedNewMothers=0, staticAudit=pin(ROOT / 'static-audit-v2.json'), nativeReports=reports,
    sourcePaths=[r for _, report in by_density.values() for r in report['sourcePaths']],
    resourceContext=pin(ROOT / 'registered-native-analysis-v1.json'), ownerCorrection=pin(ROOT / 'owner-coverage-failure-correction-v1.json'),
    inventory=pin(ROOT / 'inventory-reconciliation-v1.json'), worldPeakBytes=peaks, preparedPeakBytes=max(prepared),
    preparedRegistration=stage['preparedRegistration'], reference=pin(file), reviewMetadata=pin(out / 'review-metadata-v1.json'),
    tests=dict(passCount=10, assertions=95, log=pin(ROOT / 'targeted-tests-v1.log')),
    typecheck=pin(ROOT / 'typecheck-v1.log'), isolatedBuild=pin(ROOT / 'active-stage-v2.json'),
    changedVisualStatus='PENDING_USER_MATERIAL_AND_CONTEXT_REVIEW', inheritedArtwork='ACCEPTED',
    remainingAuthoredNewUrbanGroups=214, remainingByKind=inventory['remainingByKind'],
    conditionalNewUrbanGroups=22, windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False))
print(dict(status='PASS_BATCH92_TECHNICAL_CLOSURE_AND_EMBEDDED_REFERENCE', images=len(images), peaks=peaks, html=pin(file)))
