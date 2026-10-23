"""Close new source/runtime paths and validate every image in the grouped offline review."""
import base64
import hashlib
import io
import json
import subprocess
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

from PIL import Image

ROOT = Path('.artifacts/m2-4/newurban-buildings-batch88-20261020')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)


def write(file, value):
    with file.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


export = read(ROOT / 'export-and-preservation-v2.json')
selected = read(Path('.local/environment-newurban-selection.json'))
assert selected == export['candidate'] == read(Path('desktop/environment-newurban-hd-contract.json'))['selectedPack']
stage = read(ROOT / 'active-stage-v1.json')
assert stage['preparedRegistration'] == dict(type='prepared-hd-registered', members=453, pages=1205,
    index='b729828392970f5e7a91ece16990924bd86c2daea7c76f79af2639de3ebae54b')
audit = read(ROOT / 'static-audit-v2.json')
assert audit['exactAcceptedBodyDensityFrames'] == 234 and audit['newRubbleDensityFrames'] == 74
assert audit['acceptedR1SharedRubbleDensityFrames'] == audit['nativeUnusedRubbleDensityFrames'] == 2
assert audit['originalShadowSlots'] == 156 and audit['unchangedPriorFamilies'] == 136
reconciled = read(ROOT / 'inventory-reconciliation-v1.json')
assert reconciled['remainingAuthoredGaps'] == 247
assert reconciled['remainingByKind'] == dict(tmp=198, building=35, infantry=2, overlay=12)
assert reconciled['selectableMaps'] == 8 and reconciled['sourceModeVariants'] == 9
pack = Path('.local/environment-packs') / selected['revision']
assert sha(pack / 'manifest.json') == selected['sha256']
manifest = read(pack / 'manifest.json')
entries = {row['member']: row for family in manifest['families'].values() for row in family['members']}
expected_members = {row['member'] for row in export['records']}
reports, world, prepared, starting_destroyed, source_paths = [], {}, [], {}, []
for density in [2, 4]:
    file = ROOT / f'native-{density}x-v2/report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['bindingStatus'] == 'PASS_ALL_39_ORIGINAL_SOURCE_PATHS_NATIVE_STATES_TICKS_AND_DENSITY'
    assert report['selectedEnvironmentRevision'] == selected['revision'] and report['requestedDensity'] == density
    assert len(report['maps']) == 4
    members, destroyed = set(), []
    allocation_values = []
    for case in report['maps']:
        assert case['launch']['modeType'] == 0 and case['launch']['options']['gameMode'] == 1
        assert case['launch']['options']['credits'] == 10000
        if case.get('releaseBeforeLoad'):
            for key in ['environment', 'terrain']:
                assert case['releaseBeforeLoad'][key]['disposed']
                assert case['releaseBeforeLoad'][key]['worldChargeBytes'] == 0
        for row in case['sources']:
            assert row['member'] not in members
            members.add(row['member'])
            entry = entries[row['member']]
            expected = f'environment-aggregate/{entry["sha256"]}/{row["sourceSha256"]}/NEWURBAN/tiles/{density}'
            assert row['metadataSha256'] == entry['sha256']
            assert row['original']['hd'] == expected
            capture = row['capture']
            assert capture['destroyed'] and not capture['rescaled'] and capture['glError'] == 0
            assert capture['activeNativeExplosionEffects'] == []
            assert capture['tick'] >= case['tickBeforeDestruction'] + 100
            if row['nativeRubbleUsed']:
                assert capture['rubble']['visible'] and capture['rubble']['frame'] == 3
                assert capture['rubble']['hd'] == expected
            else:
                assert row['member'] == 'cnfarm02.shp' and not capture['spawned'] and not capture.get('rubble', {}).get('visible')
            if row['alreadyDestroyed']:
                destroyed.append(row['name'])
            source_paths.append(dict(density=density, member=row['member'], sourceSha256=row['sourceSha256'],
                mapId=case['mapId'], originalObjectId=row['original']['id'], nativeRubbleUsed=row['nativeRubbleUsed']))
        allocation = case['allocation']
        assert allocation['total'] <= allocation['limit'] == (512 if density == 2 else 1280) * 1024 ** 2
        assert allocation['prepared']['peakBytes'] <= 128 * 1024 ** 2
        allocation_values.append(allocation['total'])
        prepared.append(allocation['prepared']['peakBytes'])
    assert members == expected_members and len(members) == 39
    starting_destroyed[str(density)] = sorted(destroyed)
    world[str(density)] = max(allocation_values)
    reports.append(pin(file))
    if density == 4:
        for field in ['originalRelease', 'crossTheater']:
            for key in ['environment', 'terrain']:
                assert report[field][key]['disposed'] and report[field][key]['worldChargeBytes'] == 0
        assert report['originalFallback']['environment']['worldChargeBytes'] == 0
        assert all(not row.get('hd') for row in report['originalFallback']['objects'])
        assert report['crossTheater']['currentEnvironment']['density'] == 4
        assert report['crossTheater']['currentTerrain']['density'] == 4 and report['crossTheater']['glError'] == 0


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


metadata_file = ROOT / 'review-v1/review-metadata-v1.json'
metadata = read(metadata_file)
html_file = Path(metadata['html']['file'])
assert pin(html_file) == metadata['html']
parser = Parser()
parser.feed(html_file.read_text())
assert len(parser.images) == len(metadata['images']) == 163
assert parser.controls == ['density', 'view', 'fit']
expected_images = {row['sha256']: row for row in metadata['images']}
decoded = []
for attrs in parser.images:
    payload = base64.b64decode(attrs['src'].split(',', 1)[1], validate=True)
    digest = hashlib.sha256(payload).hexdigest()
    row = expected_images[digest]
    assert pin(Path(row['file']))['sha256'] == digest
    with Image.open(io.BytesIO(payload)) as image:
        image.load()
        assert list(image.size) == row['size'] == [int(attrs['width']), int(attrs['height'])]
    decoded.append(digest)
assert Counter(decoded) == Counter(row['sha256'] for row in metadata['images'])
script = ROOT / 'review-inline-script-v1.js'
with script.open('x') as stream:
    stream.write('\n'.join(parser.scripts))
subprocess.run(['node', '--check', str(script)], check=True)
write(ROOT / 'source-static-qa-v1.json', dict(status='PASS_163_EMBEDDED_PNG_HASHES_DIMENSIONS_OFFLINE_AND_SCRIPT_SYNTAX',
    html=pin(html_file), metadata=pin(metadata_file), decodedPngs=163, controls=parser.controls,
    visualInspection='All 37 actual-density atlas subjects and selected original-map Mac captures inspected.',
    browserInteractive='NOT_RUN_LOCAL_PROTOCOL_RESTRICTION_RETAINED', windows='NOT_RUN'))
closure = dict(status='PASS_39_COMPLETE_FAMILIES_78_NATIVE_DENSITY_PATHS_VISUAL_PENDING',
    runtimeSourceCommit=stage['runtimeSourceHead'], candidate=selected, stage=pin(ROOT / 'active-stage-v1.json'),
    staticAudit=pin(ROOT / 'static-audit-v2.json'), inventoryReconciliation=pin(ROOT / 'inventory-reconciliation-v1.json'),
    builtinCalls=19, selectedMothers=19, newRubbleStudies=37, newCompleteFamilies=39, sourceMembers=39,
    sourceBodySlots=156, densityFrames=312, newRubbleDensityFrames=74, exactAcceptedBodyDensityFrames=234,
    acceptedR1SharedRubbleDensityFrames=2, unusedNativeRubbleDensityFrames=2, originalNativeShadowSlots=156,
    unchangedPriorFamilies=136, exactInheritedPayloadFiles=955, minimumMotherDensity=audit['minimumMotherDensity'],
    nativeReports=reports, sourcePaths=source_paths, sourcePathsPerDensity=39, nativeMapsPerDensity=4,
    originallyDestroyed=starting_destroyed, worldPeakBytes=world, preparedPeakBytes=max(prepared),
    review=pin(html_file), reviewQa=pin(ROOT / 'source-static-qa-v1.json'),
    lifecycle=dict(OriginalFallback=True, exitAndReentry=True, oldEnvironmentChargeBytes=0, oldTerrainChargeBytes=0,
        fourNewUrbanMaps=True, crossEnvironment='NEWURBAN turfwar.map to DESERT saharami.map', nextDensity=4),
    effectiveUnifiedLaunch=dict(gameMode=1, gameModeType=0, credits=10000,
        maps=['rushhr.map', 'manhatta.map', 'austintx.map', 'turfwar.map'],
        sharedRuleAndMenuSource='Unchanged; retain earlier full adaptation and native rules evidence.'),
    reusedEvidence=[dict(file='.artifacts/m2-4/newurban-building-references-batch88-v1/source-preparation-v1.json',
        reason='Source-exact accepted normal/damaged/occupied states and one unused native slot; all source/shadow files pinned.'),
        dict(file='.artifacts/m2-4/newurban-rubble-continuous-r1-20261020/user-acceptance-20261020.json',
            reason='Accepted continuous material style and source-identical CANEWY07 shared-rubble authority.'),
        dict(file='.artifacts/m2-4/desert-final-buildings-batch86-20261020/loader-tests-v1.log',
            reason='Eight complete-family loader tests / 136 assertions; no loader/shared runtime source changed.')],
    retainedAttempts=[pin(ROOT / 'export-attempt-v1.json'), pin(ROOT / 'export-attempt-v2.json'),
        pin(ROOT / 'native-capture-attempt-v1.json')],
    newCoveredSourceGroups=39, remainingCoverage=dict(NEWURBANAuthoredGaps=247,
        NEWURBANByKind=dict(tmp=198, building=35, infantry=2, overlay=12), NEWURBANConditionalGroups=22,
        DESERTAuthoredGaps=0, DESERTConditionalGroups=22),
    newArtworkAcceptance='PENDING_37_NEW_RUBBLE_STUDIES', reusedArtwork='ACCEPTED',
    perBatchMacPackage='NOT_CREATED_USER_REQUEST_HTML_ONLY', windows='NOT_RUN', mainIntegration='NOT_PERFORMED', m24Complete=False)
write(ROOT / 'coverage-and-native-closure-v1.json', closure)
print(json.dumps(dict(status=closure['status'], embeddedPngs=163, worldPeakBytes=world,
    preparedPeakBytes=max(prepared), remainingNewUrban=247)))
