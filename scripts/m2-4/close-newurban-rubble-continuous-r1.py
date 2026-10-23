"""Close focused correction evidence and decode every image in the selected offline review."""
import base64
import hashlib
import io
import json
import subprocess
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

from PIL import Image

ROOT = Path('.artifacts/m2-4/newurban-rubble-continuous-r1-20261020')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)


def write(file, value):
    with file.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


export = read(ROOT / 'export-and-preservation-v2.json')
selected = read(Path('.local/environment-newurban-selection.json'))
assert selected == read(Path('desktop/environment-newurban-hd-contract.json'))['selectedPack'] == export['candidate']
assert selected['sha256'] == '205787d70680772f64a0fcadd6d359e16f5935b803c0ae15b424731e4397c2cb'
stage = read(ROOT / 'active-stage-v1.json')
assert stage['runtimeSourceHead'] == 'f635a6a053c5022f8e7f1225eef9b484cc5f0552'
assert stage['preparedRegistration'] == dict(type='prepared-hd-registered', members=453, pages=1205,
    index='b729828392970f5e7a91ece16990924bd86c2daea7c76f79af2639de3ebae54b')
audit = read(ROOT / 'static-audit-v2.json')
assert audit['exactAcceptedBodyDensityFrames'] == 120 and len(audit['checks']) == 40
assert audit['exactInheritedPayloadFiles'] == 895 and audit['unchangedOtherFamilies'] == 116
pack = Path('.local/environment-packs') / selected['revision']
assert sha(pack / 'manifest.json') == selected['sha256']
manifest = read(pack / 'manifest.json')
entries = {entry['member']: entry for family in manifest['families'].values() for entry in family['members']}
reports, world, prepared = [], {}, []
for density in [2, 4]:
    file = ROOT / f'native-{density}x-v1/report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['bindingStatus'] == 'PASS_ALL_20_ORIGINAL_SOURCE_RUBBLE_PATHS_NATIVE_TICKS_AND_DENSITY_BINDINGS'
    assert report['selectedEnvironmentRevision'] == selected['revision']
    assert len(report['correctedRubble']) == 20
    assert {row['name'] for row in report['correctedRubble'] if row['alreadyDestroyed']} == {'CANEWY10', 'CANEWY11'}
    for row in report['correctedRubble']:
        entry = entries[row['member']]
        expected = f'environment-aggregate/{entry["sha256"]}/{row["sourceSha256"]}/NEWURBAN/tiles/{density}'
        assert row['metadataSha256'] == entry['sha256']
        assert row['original']['hd'] == row['capture']['rubble']['hd'] == expected
        capture = row['capture']
        assert capture['destroyed'] and capture['rubble']['visible'] and capture['rubble']['frame'] == 3
        assert capture['rescaled'] is False and capture['glError'] == 0
        assert capture['tick'] > row['tickBefore'] + 8
    allocation = report['combinedWorldAllocation']
    assert allocation['total'] <= allocation['limit'] == (512 if density == 2 else 1280) * 1024 ** 2
    assert report['graphics']['prepared']['peakBytes'] <= 128 * 1024 ** 2 and report['graphics']['glError'] == 0
    world[str(density)] = allocation['total']
    prepared.append(report['graphics']['prepared']['peakBytes'])
    reports.append(pin(file))
    if density == 4:
        for key in ['environment', 'terrain']:
            assert report['release'][key]['disposed'] and report['release'][key]['worldChargeBytes'] == 0
            assert report['crossTheater'][key]['disposed'] and report['crossTheater'][key]['worldChargeBytes'] == 0
        assert report['release']['currentEnvironment']['worldChargeBytes'] == 0
        assert all(not row['rubble'].get('hd') for row in report['originalFallback'])
        assert report['crossTheater']['currentEnvironment']['density'] == 4
        assert report['crossTheater']['currentTerrain']['density'] == 4
        assert report['crossTheater']['glError'] == 0
    file = ROOT / f'native-settled-{density}x-v1/report.json'
    settled = read(file)
    assert settled['status'] == 'PASS_SELECTED_NATIVE_CASES' and not settled['errors']
    assert len(settled['correctedRubble']) == 6 and settled['settledAt']['activeNativeExplosionEffects'] == []
    assert settled['settledAt']['tick'] >= settled['tickBeforeDestruction'] + 100
    for row in settled['correctedRubble']:
        assert row['capture']['activeNativeExplosionEffects'] == [] and row['capture']['glError'] == 0
        assert row['capture']['rescaled'] is False and row['capture']['source'][2:] == [960, 720]
        assert row['capture']['rubble']['hd'] == row['original']['hd']
    reports.append(pin(file))

metadata_file = ROOT / 'review-v2/review-metadata-v1.json'
metadata = read(metadata_file)
html_file = Path(metadata['html']['file'])
assert pin(html_file) == metadata['html']


class Parser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images, self.scripts, self.controls, self.in_script = [], [], [], False

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == 'img':
            assert attrs['src'].startswith('data:image/png;base64,')
            self.images.append(attrs)
        if tag == 'script':
            assert not attrs.get('src')
            self.in_script = True
        if tag == 'link':
            assert not attrs.get('href')
        if 'data-control' in attrs:
            self.controls.append(attrs['data-control'])

    def handle_endtag(self, tag):
        if tag == 'script':
            self.in_script = False

    def handle_data(self, data):
        if self.in_script:
            self.scripts.append(data)


parser = Parser()
parser.feed(html_file.read_text())
assert len(parser.images) == len(metadata['images']) == 127
assert parser.controls == ['density', 'view', 'fit']
expected = {row['sha256']: row for row in metadata['images']}
decoded = []
for attrs in parser.images:
    data = base64.b64decode(attrs['src'].split(',', 1)[1], validate=True)
    digest = hashlib.sha256(data).hexdigest()
    row = expected[digest]
    assert sha(Path(row['file'])) == digest
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        assert list(image.size) == row['size'] == [int(attrs['width']), int(attrs['height'])]
    decoded.append(digest)
assert Counter(decoded) == Counter(row['sha256'] for row in metadata['images'])
script = ROOT / 'review-inline-script-v1.js'
with script.open('x') as stream:
    stream.write('\n'.join(parser.scripts))
subprocess.run(['node', '--check', str(script)], check=True)
qa = dict(status='PASS_ALL_SELECTED_REVIEW_OFFLINE_PNG_HASHES_DIMENSIONS_AND_SCRIPT_SYNTAX',
    html=pin(html_file), metadata=pin(metadata_file), decodedPngs=127, controls=parser.controls,
    visualInspection='All corrected atlas subjects and actual Mac settled material captures inspected separately from user acceptance.',
    browserInteractive='NOT_RUN_LOCAL_PROTOCOL_RESTRICTION_RETAINED', windows='NOT_RUN')
write(ROOT / 'source-static-qa-v1.json', qa)
closure = dict(status='PASS_40_CORRECTED_NATIVE_DENSITY_PATHS_AND_12_SETTLED_MATERIAL_CAPTURES_VISUAL_PENDING',
    runtimeSourceCommit=stage['runtimeSourceHead'], candidate=selected, stage=pin(ROOT / 'active-stage-v1.json'),
    staticAudit=pin(ROOT / 'static-audit-v2.json'), newBuiltinCalls=11, selectedMothers=10,
    correctedStudies=19, correctedFamilies=20, correctedDensityFrames=40,
    exactAcceptedBodyDensityFrames=120, exactInheritedPayloadFiles=895, unchangedOtherFamilies=116,
    originalNativeShadowSlots=80, nativeReports=reports, worldPeakBytes=world,
    preparedPeakBytes=max(prepared), review=pin(html_file), reviewQa=pin(ROOT / 'source-static-qa-v1.json'),
    lifecycle=dict(OriginalFallback=True, exitAndReentry=True, oldEnvironmentChargeBytes=0, oldTerrainChargeBytes=0,
        crossEnvironment='NEWURBAN manhatta.map to DESERT saharami.map', nextDensity=4),
    sourceVisualCoverage='Newly drawn rubble alpha only within exact original logical frames; original coarse pixel cutouts are intentionally superseded. Original native simulation/picking/shadow source data and all other states remain exact.',
    reusedEvidence=[dict(file='.artifacts/m2-4/newurban-buildings-batch87-20261020/coverage-and-native-closure-v1.json',
        reason='Unchanged accepted normal/damaged/occupied/evacuation states, eight-map source reconciliation and four complete reuses. Previous nineteen-study artwork is rejected.'),
        dict(file='.artifacts/m2-4/desert-final-buildings-batch86-20261020/loader-tests-v1.log',
            reason='Eight complete-family loader tests / 136 assertions; no loader, fallback or shared runtime source changed.')],
    retainedAttempts=[pin(ROOT / 'probe-v1/registration-v1.json'), pin(ROOT / 'visual-source-qa-attempt-v1.json'),
        pin(ROOT / 'visual-native-capture-attempt-v1.json')],
    newCoverageAdded=0, remainingCoverage=dict(NEWURBANAuthoredGaps=286, NEWURBANConditionalGroups=22,
        DESERTAuthoredGaps=0, DESERTConditionalGroups=22),
    visualAcceptance='PENDING_ALL_19_CORRECTED_RUBBLE_STUDIES', unchangedArtwork='ACCEPTED',
    perBatchMacPackage='NOT_CREATED_USER_REQUEST_HTML_ONLY', windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False)
write(ROOT / 'coverage-and-native-closure-v1.json', closure)
print(json.dumps(dict(status=closure['status'], embeddedPngs=127, worldPeakBytes=world,
    preparedPeakBytes=max(prepared))))
