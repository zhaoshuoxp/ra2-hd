"""Validate complete civilian art, native states and independent Mac dependencies."""
import argparse
import hashlib
import json
import os
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('root', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
root = args.root.resolve()
package = read(root / 'package-receipt.json')
folder = Path(package['folder'])
assert folder.is_relative_to(root) and package['sourceDirty'] == ''
assert package['target'] == 'darwin-arm64' and package['resourceFiles'] == 7723 and package['uiResourceFiles'] == 360
assert package['runtimeSourceHead'] == '47a92e00a7c5939321d8ee3b0966280f23ffa1cf'
assert package['preparedRegistration'] == dict(type='prepared-hd-registered', members=453, pages=1205,
    index='b729828392970f5e7a91ece16990924bd86c2daea7c76f79af2639de3ebae54b')
for row in package['files']:
    path = folder / row['file']
    assert path.is_relative_to(folder)
    if 'link' in row:
        assert path.is_symlink() and os.readlink(path) == row['link']
    else:
        assert path.is_file() and not path.is_symlink()
        assert path.stat().st_size == row['bytes'] and sha(path) == row['sha256']
source_count = source_bytes = 0
for name in ['batch20-artwork-source-handoff.json', 'reused-batch19-source-handoff-verification.json']:
    for row in read(root / name)['files']:
        path = root / row['file']
        assert path.is_relative_to(root) and path.is_file() and not path.is_symlink()
        assert path.stat().st_size == row['bytes'] and sha(path) == row['sha256']
        source_count += 1
        source_bytes += row['bytes']
assert source_count == 5293
evidence = root / 'Evidence'
matrix = read(evidence / 'snow-batch20-native-building-matrix-v1.json')
assert matrix['status'] == 'PASS_FOUR_SNOW_CIVILIAN_FAMILIES_NATIVE_STATES_BOTH_DENSITIES'
assert len(matrix['cases']) == 2 and {case['density'] for case in matrix['cases']} == {2, 4}
for case in matrix['cases']:
    path = evidence / Path(case['report']).relative_to('.artifacts/m2-4')
    assert sha(path) == case['sha256']
    report = read(path)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors'] and report['graphics']['glError'] == 0
    assert report['combinedWorldAllocation']['total'] <= report['combinedWorldAllocation']['limit']
    states = report['newNativeStates']
    assert len(states['buildings']) == len(states['evacuation']) == len(states['criticalDamageEvacuation']) == 4
    assert all(row['occupied']['hd'] and row['damaged']['hd'] and row['destroyed']['destroyed'] for row in states['buildings'])
    assert sum('rubbleCapture' in row for row in states['buildings']) == 3
original = read(evidence / 'native-snow-batch20-suburb-original-v1/report.json')
assert original['status'] == 'PASS_SELECTED_NATIVE_CASES' and not original['errors']
assert original['fallback']['terrain']['worldChargeBytes'] == original['fallback']['environment']['worldChargeBytes'] == 0
delta = read(evidence / 'snow-batch20-coverage-delta-v1.json')
assert delta['newSourceGroups'] == 4 and delta['verifiedDensityFrames'] == 30
assert delta['remainingSnow'] == dict(total=66, tmp=0) and len(delta['unusedNotHdCovered']['sources']) == 4
preservation = read(evidence / 'snow-batch20-base-preservation-v1.json')
assert preservation['inheritedFamilies'] == 97 and preservation['inheritedFiles'] == 896
loading = read(evidence / 'snow-batch20-building-loading-v1.json')
assert loading['status'] == 'PASS_COMPLETE_FAMILIES_DENSITIES_ALLOCATION_FALLBACK_DISPOSAL' and len(loading['families']) == 8
authoring = root / 'Authoring/snow-buildings-authoring-batch20-v1'
provenance = read(authoring / 'complete-generation-provenance-audit-v1.json')
assert len(provenance['mothers']) == 6 and len(provenance['rejectionsRetained']) == 4
assert read(authoring / 'complete-mother-cell-audit-v1.json')['status'] == 'PASS_ALL_SIX_SELECTED_MOTHERS_WITHOUT_OPAQUE_CANVAS_OR_CELL_OVERRUN'
review = read(root / 'Review/review-manifest.json')
assert len(review['files']) == 50 and len(review['scenes']) == 4 and len(review['states']) == 15
for row in review['files']:
    assert sha(root / 'Review' / row['file']) == row['sha256'] and row['rescaled'] is False
for name in ['snow-batch20-review-ui-v1', 'snow-batch20-desktop-review-ui-v1']:
    report = read(evidence / name / 'report.json')
    assert report['status'] == 'PASS_STATIC_EMBEDDED_IMAGES_NATIVE_SIZE_AND_DENSITY_CONTROLS' and not report['errors']
desktop = read(root / 'desktop-copy-verification.json')
assert sha(Path(desktop['desktop'])) == sha(root / 'Review/index-embedded.html') == desktop['sha256']
receipt = dict(status='PASS_INDEPENDENT_SNOW_CIVILIAN_BUILDING_DELIVERY', runtimeSourceHead=package['runtimeSourceHead'],
    selectedEnvironment=delta['selectedEnvironment'], packageEntries=len(package['files']), ignoredSourceFiles=source_count,
    ignoredSourceBytes=source_bytes, nativeBuildingDensityCases=8, nativeStateCaptures=30, reviewImages=50,
    packageReceiptSha256=sha(root / 'package-receipt.json'), reviewHtmlSha256=sha(root / 'Review/index-embedded.html'),
    artworkHandoffSha256=sha(root / 'batch20-artwork-source-handoff.json'),
    inheritedHandoffSha256=sha(root / 'reused-batch19-source-handoff-verification.json'),
    technicalStatus='PASS', visualStatus='FOUR_NEW_SNOW_CIVILIAN_FAMILIES_PENDING_USER_REVIEW',
    userAcceptance=False, windowsStatus='NOT_RUN', mainIntegrated=False, m24Complete=False)
with args.output.open('x') as stream:
    json.dump(receipt, stream, indent=2)
    stream.write('\n')
print(json.dumps(receipt))
