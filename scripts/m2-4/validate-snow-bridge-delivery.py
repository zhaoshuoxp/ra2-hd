"""Validate independent bridge app, ignored artwork inputs and scoped native closure."""
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
assert package['target'] == 'darwin-arm64' and package['resourceFiles'] == 7663 and package['uiResourceFiles'] == 360
assert package['preparedRegistration'] == dict(type='prepared-hd-registered', members=453,
    pages=1205, index='b729828392970f5e7a91ece16990924bd86c2daea7c76f79af2639de3ebae54b')
assert package['runtimeSourceHead'] == '575fc6367ce99ce0abfa0d39477ca854a45dea8e'
for row in package['files']:
    path = folder / row['file']
    assert path.is_relative_to(folder)
    if 'link' in row:
        assert path.is_symlink() and os.readlink(path) == row['link']
    else:
        assert not path.is_symlink() and path.is_file() and path.stat().st_size == row['bytes'] and sha(path) == row['sha256']
source_count = source_bytes = 0
for manifest in ['batch18-artwork-source-handoff.json', 'reused-batch17-source-handoff-verification.json']:
    for row in read(root / manifest)['files']:
        path = root / row['file']
        assert path.is_relative_to(root) and path.is_file()
        assert path.stat().st_size == row['bytes'] and sha(path) == row['sha256']
        source_count += 1; source_bytes += row['bytes']
evidence = root / 'Evidence'
matrix = read(evidence / 'snow-batch18-native-bridge-matrix-v1.json')
assert matrix['status'] == 'PASS_ALL_FOUR_NATIVE_BRIDGE_KINDS_BOTH_DENSITIES'
assert len(matrix['cases']) == 8
assert {(row['kind'], row['density']) for row in matrix['cases']} == {
    (kind, density) for kind in ['low-wood', 'low-concrete', 'high-wood', 'high-concrete'] for density in [2, 4]}
for row in matrix['cases']:
    path = evidence / Path(row['report']).relative_to('.artifacts/m2-4')
    assert sha(path) == row['reportSha256']
    report = read(path)
    assert not report['errors'] and report['graphics']['glError'] == 0
    bridge = next(bridge for bridge in report['snowNativeBridges'] if bridge['kind'] == row['kind'])
    assert bridge['status'] == row['status'] and bridge['repaired']['engineerConsumed']
    assert report['combinedWorldAllocation']['total'] <= report['combinedWorldAllocation']['limit']
    if report['status'] == 'FAIL':
        closure = read(evidence / 'snow-batch18-low-wood-4x-scoped-closure-v1.json')
        assert closure['bridgeReportSha256'] == sha(path) and '1 !== 4' in report['failure']
        lifecycle = evidence / 'native-snow-batch18-lifecycle-4x-v1/report.json'
        assert sha(lifecycle) == closure['lifecycleReportSha256']
        assert read(lifecycle)['lifecycleStatus'] == 'PASS_SNOW_4X_ORIGINAL_REENTRY_TEMP_4X_RELEASE'
    else:
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES'
delta = read(evidence / 'snow-batch18-coverage-delta-v1.json')
assert delta['newSourceGroups'] == 54 and delta['verifiedDensityFrames'] == 384
assert len(delta['unusedNotHdCovered']['sources']) == 4 and delta['remainingSnow'] == dict(total=77, tmp=0)
loading = read(evidence / 'snow-bridges-batch18-loading-v1.json')
assert loading['status'] == 'PASS_COMPLETE_FAMILIES_DENSITIES_ALLOCATION_FALLBACK_DISPOSAL'
assert len(loading['families']) == 8
for name in ['low-wood-original-v1', 'concrete-original-v2', 'high-wood-original-v1']:
    report = read(evidence / ('native-snow-batch18-' + name) / 'report.json')
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['fallback']['environment']['worldChargeBytes'] == report['fallback']['terrain']['worldChargeBytes'] == 0
review = read(root / 'Review/review-manifest.json')
assert len(review['files']) == 90 and len(review['scenes']) == 4 and len(review['states']) == 21
for row in review['files']:
    assert sha(root / 'Review' / row['file']) == row['sha256'] and row['rescaled'] is False
ui = read(evidence / 'snow-batch18-review-ui-v2/report.json')
assert ui['status'] == 'PASS_STATIC_EMBEDDED_IMAGES_NATIVE_SIZE_AND_DENSITY_CONTROLS' and not ui['errors']
receipt = dict(status='PASS_INDEPENDENT_SNOW_BRIDGE_DELIVERY', runtimeSourceHead=package['runtimeSourceHead'],
    packageEntries=len(package['files']), ignoredArtworkInputFiles=source_count, ignoredArtworkInputBytes=source_bytes,
    selectedEnvironment=delta['selectedEnvironment'], nativeBridgeCases=8, reviewImages=90,
    packageReceiptSha256=sha(root / 'package-receipt.json'), reviewHtmlSha256=sha(root / 'Review/index-embedded.html'),
    artworkHandoffSha256=sha(root / 'batch18-artwork-source-handoff.json'),
    acceptedSourceHandoffSha256=sha(root / 'reused-batch17-source-handoff-verification.json'),
    technicalStatus='PASS', visualStatus='PENDING_USER_REVIEW', userAcceptance=False,
    windowsStatus='NOT_RUN', m24Complete=False)
with args.output.open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
