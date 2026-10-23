"""Close actual source bindings, stock pickups, release and embedded image identity."""
import base64
import hashlib
import io
import subprocess
from html.parser import HTMLParser
from pathlib import Path

from PIL import Image
from newurban_batch89_io import pin, read, sha, write

ROOT = Path('.artifacts/m2-4/newurban-rock-crates-batch90-20261020')
export = read(ROOT / 'export-and-preservation-v1.json')
audit = read(ROOT / 'static-audit-v1.json')
stage = read(ROOT / 'active-stage-v1.json')
reconciled = read(ROOT / 'inventory-reconciliation-v1.json')
assert (audit['completeFamilies'], audit['newDensityFrames'], audit['originalShadowSlots']) == (10, 20, 10)
assert read('.local/environment-newurban-selection.json') == export['candidate']
assert read('desktop/environment-newurban-hd-contract.json')['selectedPack'] == export['candidate']
assert reconciled['remainingAuthoredGaps'] == 225
assert reconciled['remainingByKind'] == dict(tmp=198, building=23, infantry=2, overlay=2)
assert stage['preparedRegistration'] == dict(type='prepared-hd-registered', members=453, pages=1205,
    index='b729828392970f5e7a91ece16990924bd86c2daea7c76f79af2639de3ebae54b')
pack = Path('.local/environment-packs') / export['candidate']['revision']
assert sha(pack / 'manifest.json') == export['candidate']['sha256']
manifest = read(pack / 'manifest.json')
sources = {s['member']: s for s in read(ROOT / 'source.json')['sources']}
records = {r['member']: r for r in export['records']}
reports, paths, world, prepared = [], [], {}, []
for density, name in [(2, 'native-2x-v3'), (4, 'native-4x-v1')]:
    folder = ROOT / name
    file = folder / 'report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['bindingStatus'] == 'PASS_ALL_TEN_ORIGINAL_MEMBER_PATHS_EIGHT_PLACED_ROCKS_AND_STOCK_CRATE_PICKUPS'
    assert report['selectedEnvironmentRevision'] == export['candidate']['revision']
    assert report['requestedDensity'] == density
    assert report['launch']['modeType'] == 0
    options = report['launch']['options']
    assert options['gameMode'] == 1 and options['credits'] == 10000 and options['cratesAppear']
    assert report['tickAfterPickups'] > report['launch']['tick'] + 8
    expected, members = {}, set()
    for row in report['sourcePaths']:
        member = row['member']
        record, source = records[member], sources[member]
        entry, = manifest['families'][record['family']]['members']
        assert member not in members and entry['member'] == member
        members.add(member)
        binding = f'{entry["sha256"]}/{source["sha256"]}/NEWURBAN/tiles/{density}'
        assert row['metadataSha256'] == entry['sha256'] and row['sourceSha256'] == source['sha256']
        assert row['expected'] == binding and row['mapId'] == 'yr:rushhr.map'
        family = report['launch']['environment']['families'][record['family']]
        assert family['status'] == 'PUBLISHED_COMPLETE_FAMILY' and family['density'] == density
        assert not family['attempts']
        expected[record['identity']] = binding
        paths.append(row)
    assert members == set(sources)
    evidence = report['newNativeOverlayObjects']
    assert evidence['status'] == 'PASS_ALL_8_ORIGINAL_ROCKS_AND_NATIVE_LAND_WATER_CRATE_PICKUP'
    assert len(evidence['rocks']) == 8 and len(evidence['crates']) == 2
    for row in evidence['rocks']:
        assert row['sample']['hd'] == expected[row['name']] and row['sample']['frame'] == 0
        assert not row['capture']['rescaled']
    for row in evidence['crates']:
        before, after = row['before'], row['after']
        assert before['hd'] == expected[row['name']] and before['frame'] == 0
        assert before['visible'] and before['colorBufferVersion'] > 0 and before['trackedPowerup'] == 3
        assert not after['spawned'] and not after['batchedEntryPresent'] and 'trackedPowerup' not in after
        assert after['cratesPickedUp'] == before['cratesPickedUp'] + 1 and after['credits'] > before['credits']
        assert not row['beforeCapture']['rescaled'] and not row['afterCapture']['rescaled']
        if row['name'] == 'WCRATE':
            assert len(row['legalApproach']) == 2 and before['collector']['tile'] == row['legalApproach'][-1]
    allocation = report['allocation']
    assert allocation['total'] <= allocation['limit'] == (512 if density == 2 else 1280) * 1024 ** 2
    assert allocation['glError'] == 0 and allocation['prepared']['peakBytes'] <= 128 * 1024 ** 2
    world[str(density)] = allocation['total']
    prepared.append(allocation['prepared']['peakBytes'])
    if density == 4:
        for key in ['originalRelease', 'crossTheater']:
            assert all(report[key][kind]['disposed'] and report[key][kind]['worldChargeBytes'] == 0
                for kind in ['environment', 'terrain'])
        original = report['originalFallback']
        assert original['environment']['worldChargeBytes'] == original['terrain']['worldChargeBytes'] == 0
        assert len(original['rocks']) >= 8 and all(not row.get('hd') for row in original['rocks'])
        assert report['crossTheater']['currentEnvironment']['density'] == 4
        assert report['crossTheater']['currentTerrain']['density'] == 4 and report['crossTheater']['glError'] == 0
    reports.append(pin(file))


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
            assert not attrs.get('href')
        if 'data-control' in attrs:
            self.controls.append(attrs['data-control'])

    def handle_endtag(self, tag):
        if tag == 'script':
            self.in_script = False

    def handle_data(self, data):
        if self.in_script:
            self.scripts.append(data)


metadata_file = ROOT / 'review-v2/review-metadata-v1.json'
metadata = read(metadata_file)
html = Path(metadata['html']['file'])
assert pin(html) == metadata['html']
parser = ReviewParser()
parser.feed(html.read_text())
assert len(parser.images) == len(metadata['images']) == 65
assert parser.controls == ['density', 'view', 'fit']
for attrs, declared in zip(parser.images, metadata['images'], strict=True):
    raw = base64.b64decode(attrs['src'].split(',', 1)[1], validate=True)
    assert hashlib.sha256(raw).hexdigest() == declared['sha256']
    with Image.open(io.BytesIO(raw)) as image:
        image.load()
        assert list(image.size) == declared['size'] == [int(attrs['width']), int(attrs['height'])]
js = ROOT / 'review-controls-v1.js'
with js.open('x') as stream:
    stream.write('\n'.join(parser.scripts))
subprocess.run(['node', '--check', str(js)], check=True, capture_output=True)
write(ROOT / 'source-static-qa-v1.json', dict(
    status='PASS_ALL_65_EMBEDDED_PNG_IDENTITIES_DIMENSIONS_AND_OFFLINE_CONTROLS_SYNTAX',
    review=pin(html), metadata=pin(metadata_file), embeddedPngs=65, controls=parser.controls,
    javascript=pin(js), browserInteractive='NOT_RUN_LOCAL_PROTOCOL_RESTRICTION_RETAINED'))
write(ROOT / 'coverage-and-native-closure-v1.json', dict(
    status='PASS_TEN_COMPLETE_FAMILIES_20_NATIVE_MEMBER_DENSITY_PATHS_VISUAL_PENDING',
    runtimeSourceCommit=stage['runtimeSourceHead'], candidate=export['candidate'], stage=pin(ROOT / 'active-stage-v1.json'),
    staticAudit=pin(ROOT / 'static-audit-v1.json'), inventoryReconciliation=pin(ROOT / 'inventory-reconciliation-v1.json'),
    newCompleteFamilies=10, sourceMembers=10, newArtStudies=10, builtinCalls=5, selectedMothers=5,
    newBodyDensityFrames=20, originalNativeShadowSlots=10, unchangedPriorFamilies=187,
    inheritedPayloadFiles=len(export['preservedPayloadHashes']), minimumMotherDensity=audit['minimumMotherDensity'],
    sourcePaths=paths, nativeReports=reports, worldPeakBytes=world, preparedPeakBytes=max(prepared),
    worldBudgetsMiB={'2X': 512, '4X': 1280}, preparedBudgetMiB=128, uiBudgetMiB=16,
    originalFallback='PASS', crossTheaterReleaseAndReentry='PASS_DESERT_4X',
    review=pin(html), staticReviewQa=pin(ROOT / 'source-static-qa-v1.json'),
    retainedAttempts=[pin(ROOT / 'native-harness-correction-v1.json'), pin(ROOT / 'native-water-fixture-correction-v1.json'),
        pin(ROOT / 'review-manifest-order-correction-v1.json')],
    sourceDedupe='All ten original sources occur on one unchanged Rush Hour map. Other placements with identical source SHA, palette, member and loader share these paths. Both stock crate pickups are observed once per density; no full accepted actor matrix repeated.',
    acceptedPrior=pin(Path('.artifacts/m2-4/newurban-linked-buildings-batch89-20261020/user-acceptance-20261020.json')),
    userVisualAcceptance='PENDING_TEN_NEW_ROCK_AND_CRATE_STUDIES', windows='NOT_RUN',
    mainIntegration='NOT_PERFORMED', m24Complete=False, remainingAuthoredNewUrbanGaps=225,
    remainingNewUrbanByKind=reconciled['remainingByKind'], conditionalNewUrbanGroups=22,
    perBatchGamePackage='NOT_CREATED_USER_REQUEST_HTML_ONLY'))
print(dict(status='PASS_TECHNICAL_CLOSURE_VISUAL_PENDING', paths=len(paths), world=world,
    prepared=max(prepared), embeddedImages=65, remaining=225))
