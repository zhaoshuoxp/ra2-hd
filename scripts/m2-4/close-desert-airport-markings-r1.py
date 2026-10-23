"""Close focused Mac evidence and independently verify all embedded review images."""
import base64
import hashlib
import io
import json
import subprocess
from html.parser import HTMLParser
from pathlib import Path

from PIL import Image

ROOT = Path('.artifacts/m2-4/desert-airport-markings-r1-20261020')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)


def write(path, value):
    with path.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


selected = read(Path('.local/environment-desert-selection.json'))
current = read(Path('desktop/environment-desert-hd-contract.json'))
assert selected == current['selectedPack'] == read(ROOT / 'selection-v1.json')['candidate']
stage = read(ROOT / 'active-stage-v1.json')
assert stage['runtimeSourceHead'] == '243512c2e2f20c41a9d5ba5ddbaa6b7fc3a0a5b1'
assert stage['preparedRegistration']['index'] == 'b729828392970f5e7a91ece16990924bd86c2daea7c76f79af2639de3ebae54b'
assert stage['preparedRegistration']['members'] == 453 and stage['preparedRegistration']['pages'] == 1205
assert read(ROOT / 'independent-scope-verification-v1.json')['totalChangedPixels'] == 4618
assert read(ROOT / 'verification-v2.json')['status'] == 'PASS'
assert read(ROOT / 'assembly-v1.json')['status'] == 'PASS_COMPLETE_COLOR_ONLY_REPLACEMENT_AND_INHERITED_BYTES'
pack_root = Path('.local/environment-packs') / selected['revision']
assert sha(pack_root / 'manifest.json') == selected['sha256']
entries = read(pack_root / 'manifest.json')['families']['desert-caairp']['members']
body, = [e for e in entries if e['member'] == 'cdairp.shp']
reports, cases, peaks = [], [], {}
for density in [2, 4]:
    file = ROOT / f'native-{density}x-v{3 if density == 2 else 1}/report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['selectedMap'] == 'saharami.map' and report['theater'] == 'DESERT'
    assert report['selectedEnvironmentRevision'] == selected['revision']
    assert report['terrain']['density'] == report['environment']['density'] == density
    published = report['environment']['families']['desert-caairp']
    assert published['status'] == 'PUBLISHED_COMPLETE_FAMILY' and not published['attempts']
    technology = report['newNativeTechnology']
    assert technology['status'] == 'PASS_ORIGINAL_PLACEMENTS_NATIVE_CAPTURE_REPAIR_AND_OWNED_ANIMATION'
    row, = technology['cases']
    assert row['original']['tile'] == [67, 88] and row['name'] == 'CAAIRP'
    assert row['captureEngineerConsumed'] and row['repairEngineerConsumed']
    assert row['captured']['ownedByPlayer'] and row['damaged']['frame'] == 1
    assert row['repaired']['frame'] == 0 and row['repaired']['health'] == 100
    for state in ['neutral', 'captured', 'damaged', 'repaired']:
        assert body['sha256'] in row[state]['hd']
        assert all(e['sha256'] in row[state]['hd'] for e in entries)
    world = report['combinedWorldAllocation']
    assert world['total'] <= world['limit'] == (512 if density == 2 else 1280) * 1024 ** 2
    assert report['graphics']['glError'] == 0
    assert report['graphics']['prepared']['peakBytes'] <= 128 * 1024 ** 2
    peaks[str(density)] = world['total']
    cases.append(dict(density=density, map='yr:saharami.map', originalObjectId=row['original']['id'],
        originalTile=row['original']['tile'], nativeBodyFrames=[0, 1, 0], completeFamilyIdentity=row['captured']['hd'],
        nativeCapture=True, nativeEngineerRepair=True, preparedPeakBytes=report['graphics']['prepared']['peakBytes']))
    reports.append(pin(file))
    if density == 4:
        assert all(report['release'][key]['disposed'] and report['release'][key]['worldChargeBytes'] == 0
                   for key in ['environment', 'terrain'])
        assert report['release']['currentEnvironment']['worldChargeBytes'] == 0
        assert report['crossTheater']['environment']['disposed'] and report['crossTheater']['terrain']['disposed']
        assert report['crossTheater']['currentEnvironment']['density'] == 4
        assert report['crossTheater']['currentTerrain']['density'] == 4
        lifecycle = dict(OriginalFallback=True, oldEnvironmentChargeBytes=0, oldTerrainChargeBytes=0,
            exitAndReentry=True, crossEnvironment='DESERT saharami.map to NEWURBAN fight.map', newEnvironmentDensity=4)

metadata_file = ROOT / 'review-v1/review-metadata-v1.json'
metadata = read(metadata_file)
html_file = Path(metadata['html']['file'])
assert sha(html_file) == metadata['html']['sha256']
expected = metadata['images']


class ReviewParser(HTMLParser):
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
            assert not attrs.get('href'), 'The review must remain offline and self-contained'
        if 'data-control' in attrs:
            self.controls.append(attrs['data-control'])

    def handle_endtag(self, tag):
        if tag == 'script':
            self.in_script = False

    def handle_data(self, data):
        if self.in_script:
            self.scripts.append(data)


parser = ReviewParser()
parser.feed(html_file.read_text())
assert len(parser.images) == len(expected) == 48
assert parser.controls == ['density', 'view', 'color']
for attrs, item in zip(parser.images, expected):
    data = base64.b64decode(attrs['src'].split(',', 1)[1], validate=True)
    assert hashlib.sha256(data).hexdigest() == item['sha256'] == sha(Path(item['file']))
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        assert list(image.size) == item['size'] == [int(attrs['width']), int(attrs['height'])]
script = ROOT / 'review-inline-script-v1.js'
script.write_text('\n'.join(parser.scripts))
subprocess.run(['node', '--check', str(script)], check=True)
qa = dict(status='PASS_ALL_OFFLINE_EMBEDDED_PNG_HASHES_DIMENSIONS_AND_SCRIPT_SYNTAX', html=pin(html_file),
    metadata=pin(metadata_file), decodedPngs=48, controls=parser.controls,
    browserInteractive='NOT_RUN_LOCAL_PROTOCOL_RESTRICTION_RETAINED', windows='NOT_RUN')
write(ROOT / 'source-static-qa-v1.json', qa)
closure = dict(status='PASS_FOCUSED_MAC_AIRPORT_MARKING_CORRECTION_VISUAL_PENDING',
    runtimeSourceCommit=stage['runtimeSourceHead'], candidate=selected, stage=pin(ROOT / 'active-stage-v1.json'),
    genericVerification=pin(ROOT / 'verification-v2.json'), scopeVerification=pin(ROOT / 'independent-scope-verification-v1.json'),
    nativeReports=reports, cases=cases, lifecycle=lifecycle, worldPeakBytes=peaks,
    preparedPeakBytes=max(case['preparedPeakBytes'] for case in cases),
    review=pin(html_file), reviewQa=pin(ROOT / 'source-static-qa-v1.json'),
    reusedEvidence=[dict(file='.artifacts/m2-4/desert-final-buildings-batch86-20261020/coverage-and-native-closure-v1.json',
        reason='All unchanged family/state, rules, original placement, radar/flag cycles and three-map coverage evidence. Source, geometry, data, animation and other payload pixels remain exact.'),
        dict(file='.artifacts/m2-4/desert-final-buildings-batch86-20261020/loader-tests-v1.log',
        reason='Eight complete-family loader tests / 136 assertions. No loader, source contract semantics or fallback logic changed.')],
    failedAttempts=pin(ROOT / 'native-attempts-v1.json'),
    remainingCoverage=dict(DESERTAuthoredGaps=0, NEWURBANAuthoredGaps=310,
        DESERTConditionalGroups=22, NEWURBANConditionalGroups=22),
    visualAcceptance='PENDING_NORMAL_AND_DAMAGED_TOWER_NUMERALS_ONLY', unchangedArtwork='ACCEPTED',
    mainIntegration='NOT_PERFORMED', perBatchGamePackage='NOT_CREATED_USER_REQUEST_HTML_ONLY',
    windows='NOT_RUN', m24Complete=False)
write(ROOT / 'technical-closure-v1.json', closure)
print(json.dumps(dict(status=closure['status'], images=48, worldPeakBytes=peaks,
    preparedPeakBytes=closure['preparedPeakBytes'])))
