"""Close focused native evidence and independently decode the embedded batch review."""
import base64
import hashlib
import io
import json
import subprocess
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

from PIL import Image

ROOT = Path('.artifacts/m2-4/newurban-buildings-batch87-20261020')
ART = Path('.artifacts/m2-4/newurban-building-rubble-authoring-batch87-v1')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)


def write(file, value):
    with file.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


selection = read(ROOT / 'selection-v1.json')
selected = read(Path('.local/environment-newurban-selection.json'))
contract = read(Path('desktop/environment-newurban-hd-contract.json'))
assert selected == contract['selectedPack'] == selection['candidate']
assert selected['sha256'] == '3481d855362fef34c90337213ddeecd7c81f4305f1bafa52f2e87b92aa23bbc0'
pack = Path('.local/environment-packs') / selected['revision']
assert sha(pack / 'manifest.json') == selected['sha256']
manifest = read(pack / 'manifest.json')
assert len(manifest['families']) == selection['worldFamilies'] == 136
assembly = read(ROOT / 'assembly-v1.json')
assert len(assembly['preservedFamilies']) == 112 and len(assembly['appendedFamilies']) == 24
for relative, digest in assembly['payloadHashes'].items():
    assert sha(pack / relative) == digest, relative
verification = read(ART / 'verification-v1.json')
reuse_file = Path('.artifacts/m2-4/newurban-complete-reuse-export-batch87-v1/verification-v1.json')
reuse = read(reuse_file)
assert verification['status'] == reuse['status'] == 'PASS'
assert verification['counts']['densityFrames'] + reuse['counts']['densityFrames'] == 172
assert verification['counts']['exactAcceptedBodyFrames'] == 120
assert verification['counts']['exactSharedRubbleDensityFrames'] == 2
assert selection['reusedAcceptedDensityFrames'] == 132
mothers = read(ART / 'mother-source-verification-v1.json')
assert mothers['bodySlots'] == 80 and mothers['originalShadowFrames'] == 80
assert mothers['independentlyDrawnRubbleStudies'] == 19 and mothers['builtinMothers'] == 10
assert mothers['minimumAvailableDensity'] >= 4
stage = read(ROOT / 'active-stage-v1.json')
assert stage['runtimeSourceHead'] == 'fcb4829135b233bdc2951065d8702a316003606a'
assert stage['target'] == 'darwin-arm64'
assert stage['preparedRegistration']['index'] == 'b729828392970f5e7a91ece16990924bd86c2daea7c76f79af2639de3ebae54b'
assert stage['preparedRegistration']['members'] == 453 and stage['preparedRegistration']['pages'] == 1205
entries = {entry['member']: entry for family in manifest['families'].values() for entry in family['members']}


def identity(member, density):
    entry = entries[member]
    metadata = read(pack / entry['path'])
    return f'environment-aggregate/{entry["sha256"]}/{metadata["source"]["sha256"]}/NEWURBAN/tiles/{density}'


reports, cases, world_peaks, prepared_peaks = [], [], {}, []
for density in [2, 4]:
    world_peaks[str(density)] = 0
    for map_name, label, case_count in [('manhatta.map', 'manhattan', 19), ('fight.map', 'fight', 3)]:
        file = ROOT / f'native-{label}-{density}x-v1/report.json'
        report = read(file)
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
        assert report['selectedMap'] == map_name and report['theater'] == 'NEWURBAN'
        assert report['selectedEnvironmentRevision'] == selected['revision']
        assert report['environment']['density'] == report['terrain']['density'] == density
        assert len(report['newNativeBindings']) == (116 if label == 'manhattan' else 6)
        for family in report['requestedFamilies']:
            published = report['environment']['families'][family]
            assert published['status'] == 'PUBLISHED_COMPLETE_FAMILY' and not published['attempts']
        states = report['newNativeStates']
        assert states['status'] == 'PASS_SEQUENTIAL_NATIVE_BUILDING_ACTOR_AND_ANIMATION_CASES'
        assert len(states['buildings']) == case_count
        assert len(states['evacuation']) == len(states['criticalDamageEvacuation']) == (18 if label == 'manhattan' else 0)
        for evacuation in states['evacuation'] + states['criticalDamageEvacuation']:
            assert evacuation['neutral'] and evacuation['unitSpawned'] and not evacuation['unitInLimbo']
            assert evacuation['house']['occupants'] == 0
        for row in states['buildings']:
            normal = row['normal']
            expected = identity(normal['mainMember'], density)
            assert normal['hd'] == normal['initial']['hd'] == expected
            assert normal['frame'] == 0 and row['destroyed']['destroyed']
            assert row['damaged']['hd'] == expected
            if normal['maxHitPoints'] > 1:
                assert row['damaged']['frame'] == 1
            else:
                assert row['damageException'] == 'INTENTIONAL_NATIVE_SINGLE_HITPOINT_NO_NONFATAL_DAMAGE_STATE'
                assert row['damaged']['frame'] == 0
            if normal['canOccupy']:
                assert row['occupied']['frame'] == 2 and row['occupied']['occupants'] > 0
                assert row['occupied']['hd'] == expected
            else:
                assert 'occupied' not in row
            if normal['leaveRubble']:
                rubble = row['destroyed']['rubble']
                assert rubble['visible'] and rubble['frame'] == 3 and rubble['hd'] == expected
                assert row['rubbleCapture']['rescaled'] is False
            else:
                assert not row['destroyed'].get('rubble', {}).get('visible')
            cases.append(dict(name=normal['name'], member=normal['mainMember'], density=density,
                map='yr:' + map_name, identity=expected, originalId=normal['initial']['id'],
                normal=True, nativeDamage=normal['maxHitPoints'] > 1,
                occupiedAndEvacuated=normal['canOccupy'], destroyed=True, rubble=normal['leaveRubble']))
        world = report['combinedWorldAllocation']
        assert world['total'] <= world['limit'] == (512 if density == 2 else 1280) * 1024 ** 2
        assert report['graphics']['glError'] == 0
        prepared = report['graphics']['prepared']['peakBytes']
        assert prepared <= 128 * 1024 ** 2
        prepared_peaks.append(prepared)
        world_peaks[str(density)] = max(world_peaks[str(density)], world['total'])
        reports.append(pin(file))
        if density == 4 and label == 'manhattan':
            release, cross = report['release'], report['crossTheater']
            for key in ['environment', 'terrain']:
                assert release[key]['disposed'] and release[key]['worldChargeBytes'] == 0
                assert cross[key]['disposed'] and cross[key]['worldChargeBytes'] == 0
            assert release['currentEnvironment']['worldChargeBytes'] == 0
            assert cross['currentEnvironment']['density'] == cross['currentTerrain']['density'] == 4

    file = ROOT / f'native-original-rubble-{density}x-v1/report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['bindingStatus'] == 'PASS_ORIGINAL_DESTROYED_PLACEMENTS_NATIVE_RUBBLE_SOURCE_AND_TICKS'
    assert report['environment']['density'] == report['terrain']['density'] == density
    assert {row['name'] for row in report['originalRubble']} == {'CANEWY10', 'CANEWY11'}
    for row in report['originalRubble']:
        capture = row['capture']
        assert capture['rescaled'] is False and capture['glError'] == 0
        assert capture['source'][2:] == [720, 540]
        for original in row['originalPlacements'] + [capture['binding']]:
            expected = identity(original['mainMember'], density)
            assert original['destroyed'] and not original['spawned'] and original['health'] == 0
            assert original['rubble']['visible'] and original['rubble']['frame'] == 3
            assert original['rubble']['hd'] == expected
        cases.append(dict(name=row['name'], density=density, map='yr:manhatta.map', identity=expected,
            originalDestroyedPlacement=True, rubble=True, observation='Read-only original map rubble and native ticks.'))
    assert report['graphics']['glError'] == 0
    reports.append(pin(file))
assert len(cases) == 48
reconciliation = read(ROOT / 'inventory-reconciliation-v1.json')
assert reconciliation['remainingAuthoredGaps'] == 286
assert reconciliation['rawScannerMissingAuthoredGroups'] - reconciliation['unchangedAcceptedFactionGroupsCredited'] == 286
assert reconciliation['remainingByKind'] == dict(tmp=198, building=74, infantry=2, overlay=12)
assert len(reconciliation['newCoveredSourceGroups']) == 24
assert len(reconciliation['unresolvedDependencyGroups']) == 22

metadata_file = ROOT / 'review-v1/review-metadata-v1.json'
metadata = read(metadata_file)
html_file = Path(metadata['html']['file'])
assert pin(html_file) == metadata['html']
expected_images = {row['sha256']: row for row in metadata['images']}


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
            assert not attrs.get('href'), 'Review must remain offline and self-contained'
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
assert len(parser.images) == len(metadata['images']) == 89
assert parser.controls == ['density', 'view']
decoded = []
for attrs in parser.images:
    data = base64.b64decode(attrs['src'].split(',', 1)[1], validate=True)
    digest = hashlib.sha256(data).hexdigest()
    row = expected_images[digest]
    assert pin(Path(row['file'])) == {key: row[key] for key in ['file', 'sha256', 'bytes']}
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        assert list(image.size) == row['size'] == [int(attrs['width']), int(attrs['height'])]
    decoded.append(digest)
assert Counter(decoded) == Counter(row['sha256'] for row in metadata['images'])
script = ROOT / 'review-inline-script-v1.js'
with script.open('x') as stream:
    stream.write('\n'.join(parser.scripts))
subprocess.run(['node', '--check', str(script)], check=True)
qa = dict(status='PASS_ALL_OFFLINE_EMBEDDED_PNG_HASHES_DIMENSIONS_AND_SCRIPT_SYNTAX',
    html=pin(html_file), metadata=pin(metadata_file), decodedPngs=89, controls=parser.controls,
    visualInspection='Quick summary, representative 4X atlas and actual Mac rubble inspected separately from user acceptance.',
    browserInteractive='NOT_RUN_LOCAL_PROTOCOL_RESTRICTION_RETAINED', windows='NOT_RUN')
write(ROOT / 'source-static-qa-v1.json', qa)
closure = dict(status='PASS_24_COMPLETE_NEWURBAN_FAMILIES_48_NATIVE_DENSITY_CASES_VISUAL_PENDING',
    runtimeSourceCommit=stage['runtimeSourceHead'], candidate=selected, stage=pin(ROOT / 'active-stage-v1.json'),
    newCompleteFamilies=24, preservedPriorFamilies=112, sourceBodySlots=86, originalShadows=86,
    densityFrames=172, exactAcceptedDensityFramesReused=132, newUniqueRubbleStudies=19,
    builtinMothers=10, minimumMotherDensity=mothers['minimumAvailableDensity'], sharedRubbleDensityFrames=2,
    verification=[pin(ART / 'verification-v1.json'), pin(reuse_file), pin(ART / 'mother-source-verification-v1.json')],
    nativeReports=reports, cases=cases, worldPeakBytes=world_peaks, preparedPeakBytes=max(prepared_peaks),
    nativeScope='Twenty-two intact family paths at each density use original source bindings and legal native state fixtures. Two map-authored destroyed groups are observed directly at both densities. No invented live map placement; no natural-match claim.',
    deduplication='Other official maps share identical original source hashes, palette, native slots and rules. All 24 complete families are exercised on unchanged manhatta.map and fight.map; all eight maps are statically inventoried.',
    lifecycle=dict(OriginalFallback=True, oldEnvironmentChargeBytes=0, oldTerrainChargeBytes=0,
        exitAndReentry=True, crossEnvironment='NEWURBAN manhatta.map to DESERT saharami.map', newEnvironmentDensity=4),
    review=pin(html_file), reviewQa=pin(ROOT / 'source-static-qa-v1.json'),
    inventoryReconciliation=pin(ROOT / 'inventory-reconciliation-v1.json'),
    creationTimeReceipts='Selection and reconciliation retain their original native-pending snapshots. This closure records the subsequently passing native runs without rewriting historical evidence.',
    reusedEvidence=[dict(file='.artifacts/m2-4/desert-final-buildings-batch86-20261020/loader-tests-v1.log',
        reason='Eight complete-family loader tests / 136 assertions; no loader, fallback, shared renderer or contract semantics changed.'),
        dict(file='.artifacts/m2-4/accepted-faction-routing-batches79-80-20261019/coverage-and-native-closure-v1.json',
            reason='Thirty-four NewUrban faction groups have identical source/context/archive hashes and unchanged shared runtime.'),
        dict(file='.artifacts/m2-4/legacy-faction-reuse-batch84-20261020/coverage-and-native-closure-v1.json',
            reason='Fourteen NewUrban legacy faction groups satisfy the same explicit source/runtime reconciliation.'),
        dict(file='.artifacts/m2-4/desert-airport-markings-r1-20261020/user-acceptance-20261020.json',
            reason='Accepted tower marking correction and its passing focused native evidence are unchanged.')],
    retainedAttempt=pin(ART / 'mother-audit-attempt-v1.json'),
    remainingCoverage=dict(DESERTAuthoredGaps=0, NEWURBANAuthoredGaps=286,
        DESERTConditionalGroups=22, NEWURBANConditionalGroups=22, NEWURBANByKind=reconciliation['remainingByKind']),
    visualAcceptance='PENDING_19_NEW_RUBBLE_STUDIES_ONLY', unchangedArtwork='ACCEPTED',
    mainIntegration='NOT_PERFORMED', perBatchGamePackage='NOT_CREATED_USER_REQUEST_HTML_ONLY',
    windows='NOT_RUN', m24Complete=False)
write(ROOT / 'coverage-and-native-closure-v1.json', closure)
print(json.dumps(dict(status=closure['status'], decodedPngs=89, worldPeakBytes=world_peaks,
    preparedPeakBytes=closure['preparedPeakBytes'])))
