"""Close actual source paths, native states, release and all embedded review images."""
import base64
import hashlib
import io
import subprocess
from html.parser import HTMLParser
from pathlib import Path

from PIL import Image

from newurban_batch89_io import ROOT, pin, read, sha, write

export = read(ROOT / 'export-and-preservation-v2.json')
audit = read(ROOT / 'static-audit-v2.json')
stage = read(ROOT / 'active-stage-v2.json')
reconciled = read(ROOT / 'inventory-reconciliation-v1.json')
assert audit['counts'] == dict(exact=222, semantic=4, authored=24, empty=32, shadows=93)
assert read('.local/environment-newurban-selection.json') == export['candidate']
assert read('desktop/environment-newurban-hd-contract.json')['selectedPack'] == export['candidate']
assert reconciled['remainingAuthoredGaps'] == 235
assert reconciled['remainingByKind'] == dict(tmp=198, building=23, infantry=2, overlay=12)
assert stage['preparedRegistration'] == dict(type='prepared-hd-registered', members=453, pages=1205,
    index='b729828392970f5e7a91ece16990924bd86c2daea7c76f79af2639de3ebae54b')
pack = Path('.local/environment-packs') / export['candidate']['revision']
assert sha(pack / 'manifest.json') == export['candidate']['sha256']
manifest = read(pack / 'manifest.json')
sources = {s['member']: s for s in read(ROOT / 'source.json')['sources']}
records = {r['member']: r for r in export['records']}
reports, paths, world, prepared = [], [], {}, []
for density, folder_name in [(2, 'native-2x-v2'), (4, 'native-4x-v1')]:
    folder = ROOT / folder_name
    file = folder / 'report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['bindingStatus'] == 'PASS_ALL_12_ORIGINAL_SOURCE_PATHS_NATIVE_STATES_TICKS_AND_DENSITY'
    assert report['selectedEnvironmentRevision'] == export['candidate']['revision']
    assert report['requestedDensity'] == density and len(report['maps']) == 3
    members = set()
    for case in report['maps']:
        assert case['launch']['modeType'] == 0 and case['launch']['options']['gameMode'] == 1
        assert case['launch']['options']['credits'] == 10000
        if case.get('releaseBeforeLoad'):
            assert all(case['releaseBeforeLoad'][key]['disposed']
                and case['releaseBeforeLoad'][key]['worldChargeBytes'] == 0 for key in ['environment', 'terrain'])
        for row in case['sources']:
            entries = {e['member']: e for e in manifest['families'][row['family']]['members']}
            ordered = [entries[name] for name in row['original']['sourceMembers'] if name in entries]
            assert {e['member'] for e in ordered} == set(entries)
            expected = 'environment-aggregate/' + '|'.join(
                f'{e["sha256"]}/{sources[e["member"]]["sha256"]}/NEWURBAN/tiles/{density}' for e in ordered)
            assert row['original']['hd'] == row['expected'] == expected
            assert row['metadataSha256'] == entries[row['member']]['sha256']
            capture = row['capture']
            assert capture['destroyed'] and capture['rubble']['visible'] and capture['rubble']['frame'] == 3
            assert capture['rubble']['hd'] == expected and capture['tick'] >= case['tickBeforeDestruction'] + 100
            assert capture['glError'] == 0 and capture['activeNativeExplosionEffects'] == [] and not capture['rescaled']
            for name in entries:
                assert name not in members
                members.add(name)
                paths.append(dict(density=density, member=name, sourceSha256=sources[name]['sha256'],
                    mapId=case['mapId'], originalObjectId=row['original']['id'], metadataSha256=entries[name]['sha256']))
        assert len(case['normal']) == len(case['damaged']) == len(case['sources'])
        for row in case['damaged']:
            assert row['binding']['destroyed'] or row['binding']['health'] <= 50 and row['binding']['frame'] == 1
            if row['name'].startswith('CASTL05'):
                assert not row.get('canOccupy')
        for label in ['normal', 'damaged']:
            for row in case[label]:
                if row['name'] in ['CAMACH', 'CALA10']:
                    assert row['linkedAdvance']['tick'] > row['tick']
                    assert row['linkedAdvance']['hd'] == row['binding']['hd']
        if case['mapId'] == 'yr:rushhr.map':
            for label in ['normalStadium', 'damagedStadium']:
                capture = case[label]
                assert len(capture['sections']) == 8 and capture['originalMapPositionsUnchanged']
                assert not capture['rescaled'] and capture['glError'] == 0
        allocation = case['allocation']
        assert allocation['total'] <= allocation['limit'] == (512 if density == 2 else 1280) * 1024 ** 2
        assert allocation['prepared']['peakBytes'] <= 128 * 1024 ** 2
        prepared.append(allocation['prepared']['peakBytes'])
    assert members == set(sources)
    world[str(density)] = max(case['allocation']['total'] for case in report['maps'])
    if density == 4:
        for key in ['originalRelease', 'originalStadiumRelease', 'crossTheater']:
            assert all(report[key][kind]['disposed'] and report[key][kind]['worldChargeBytes'] == 0
                for kind in ['environment', 'terrain'])
        assert report['originalFallback']['environment']['worldChargeBytes'] == 0
        assert all(not row.get('hd') for row in report['originalFallback']['objects'])
        for label in ['originalNormal', 'originalDamaged']:
            assert len(report['originalStadium'][label]) == 8
            assert all(not row['binding'].get('hd') for row in report['originalStadium'][label])
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


metadata_file = ROOT / 'review-v1/review-metadata-v1.json'
metadata = read(metadata_file)
html = Path(metadata['html']['file'])
assert pin(html) == metadata['html']
parser = ReviewParser()
parser.feed(html.read_text())
assert len(parser.images) == len(metadata['images']) == 73
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
write(ROOT / 'source-static-qa-v1.json', dict(status='PASS_ALL_73_EMBEDDED_PNG_IDENTITIES_DIMENSIONS_AND_OFFLINE_CONTROLS_SYNTAX',
    review=pin(html), metadata=pin(metadata_file), embeddedPngs=73, controls=parser.controls,
    javascript=pin(js), browserInteractive='NOT_RUN_LOCAL_PROTOCOL_RESTRICTION_RETAINED'))
write(ROOT / 'coverage-and-native-closure-v1.json', dict(
    status='PASS_TWELVE_COMPLETE_FAMILIES_28_NATIVE_MEMBER_DENSITY_PATHS_VISUAL_PENDING',
    runtimeSourceCommit=stage['runtimeSourceHead'], candidate=export['candidate'], stage=pin(ROOT / 'active-stage-v2.json'),
    staticAudit=pin(ROOT / 'static-audit-v2.json'), inventoryReconciliation=pin(ROOT / 'inventory-reconciliation-v1.json'),
    newCompleteFamilies=12, sourceMembers=14, newRubbleStudies=12, builtinCalls=6, selectedMothers=6,
    sourceDensitySlots=250, exactAcceptedDensitySlots=222, semanticAcceptedDensitySlots=4,
    nativeEmptyDensitySlots=32, visibleDensitySlots=218, newRubbleDensityFrames=24,
    originalNativeShadowSlots=93, unchangedPriorFamilies=175, inheritedPayloadFiles=len(export['preservedPayloadHashes']),
    semanticAdaptation=pin(ROOT / 'stadium-d-semantic-reuse-v1.json'),
    minimumMotherDensity=audit['minimumMotherDensity'], sourcePaths=paths, nativeReports=reports,
    worldPeakBytes=world, preparedPeakBytes=max(prepared), worldBudgetsMiB={'2X': 512, '4X': 1280},
    preparedBudgetMiB=128, uiBudgetMiB=16, originalFallback='PASS', crossTheaterReleaseAndReentry='PASS_DESERT_4X',
    review=pin(html), staticReviewQa=pin(ROOT / 'source-static-qa-v1.json'),
    retainedAttempts=[pin(ROOT / 'export-attempt-v1.json'), pin(ROOT / 'linked-header-repair-v1.json')],
    acceptedPrior=pin(Path('.artifacts/m2-4/newurban-buildings-batch88-20261020/user-acceptance-20261020.json')),
    userVisualAcceptance='PENDING_TWELVE_NEW_RUBBLE_STUDIES', windows='NOT_RUN',
    mainIntegration='NOT_PERFORMED', m24Complete=False, remainingAuthoredNewUrbanGaps=235,
    remainingNewUrbanByKind=reconciled['remainingByKind'], conditionalNewUrbanGroups=22,
    perBatchGamePackage='NOT_CREATED_USER_REQUEST_HTML_ONLY'))
print(dict(status='PASS_TECHNICAL_CLOSURE_VISUAL_PENDING', paths=len(paths), world=world,
    prepared=max(prepared), embeddedImages=73, remaining=235))
