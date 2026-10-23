"""Verify the copied Mac app, exact donor inputs and new Snow building routing."""
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
assert package['target'] == 'darwin-arm64' and package['resourceFiles'] == 7703 and package['uiResourceFiles'] == 360
assert package['runtimeSourceHead'] == '47489e45fe94a5425971804a6dfdd09f179bf4b6'
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
for name in ['batch19-artwork-source-handoff.json', 'reused-batch18-source-handoff-verification.json']:
    for row in read(root / name)['files']:
        path = root / row['file']
        assert path.is_relative_to(root) and path.is_file() and not path.is_symlink()
        assert path.stat().st_size == row['bytes'] and sha(path) == row['sha256']
        source_count += 1
        source_bytes += row['bytes']
assert source_count == 5133
evidence = root / 'Evidence'
matrix = read(evidence / 'snow-batch19-native-building-matrix-v1.json')
assert matrix['status'] == 'PASS_SEVEN_EXACT_ACCEPTED_BUILDING_SNOW_BINDINGS_BOTH_DENSITIES'
assert len(matrix['cases']) == 6 and len(matrix['identities']) == 7
for row in matrix['cases']:
    path = evidence / Path(row['report']).relative_to('.artifacts/m2-4')
    assert sha(path) == row['sha256']
    report = read(path)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors'] and report['graphics']['glError'] == 0
    assert report['environment']['density'] == row['density']
    assert report['combinedWorldAllocation']['total'] <= report['combinedWorldAllocation']['limit']
for name in ['town', 'suburb', 'tower']:
    report = read(evidence / f'native-snow-batch19-{name}-original-v1/report.json')
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['fallback']['terrain']['worldChargeBytes'] == report['fallback']['environment']['worldChargeBytes'] == 0
for density in [2, 4]:
    report = read(evidence / f'native-snow-batch19-town-{density}x-v1/report.json')
    assert report['linkedBuildingMembers']['status'] == 'PASS_EXACT_SOURCE_PINNED_LINKED_BUILDING_ANIMATION_BINDINGS_AND_PHASES'
delta = read(evidence / 'snow-batch19-coverage-delta-v1.json')
assert delta['newSourceGroups'] == 7 and delta['verifiedDensityFrames'] == 50
assert delta['additionalRelatedMembers'] == ['camsc06a.shp'] and delta['remainingSnow'] == dict(total=70, tmp=0)
loading = read(evidence / 'snow-batch19-building-loading-v1.json')
assert loading['status'] == 'PASS_COMPLETE_FAMILIES_DENSITIES_ALLOCATION_FALLBACK_DISPOSAL' and len(loading['families']) == 14
preservation = read(evidence / 'snow-batch19-base-preservation-v1.json')
assert preservation['inheritedFiles'] == 856 and preservation['acceptedExactPngs'] == 32
cache = read(evidence / 'snow-batch19-prepared-dependency-reuse-v1.json')
assert cache['newBuildingCacheHits'] == 0 and cache['normalFreshPreparationRequired'] is True
review = read(root / 'Review/review-manifest.json')
assert len(review['files']) == 26 and len(review['scenes']) == 7 and len(review['states']) == 5
for row in review['files']:
    assert sha(root / 'Review' / row['file']) == row['sha256'] and row['rescaled'] is False
for name in ['snow-batch19-review-ui-v1', 'snow-batch19-desktop-review-ui-v1']:
    report = read(evidence / name / 'report.json')
    assert report['status'] == 'PASS_STATIC_EMBEDDED_IMAGES_NATIVE_SIZE_AND_DENSITY_CONTROLS' and not report['errors']
desktop = read(root / 'desktop-copy-verification.json')
assert sha(Path(desktop['desktop'])) == sha(root / 'Review/index-embedded.html') == desktop['sha256']
receipt = dict(status='PASS_INDEPENDENT_SNOW_ACCEPTED_BUILDING_REUSE_DELIVERY',
    runtimeSourceHead=package['runtimeSourceHead'], selectedEnvironment=delta['selectedEnvironment'],
    packageEntries=len(package['files']), ignoredSourceFiles=source_count, ignoredSourceBytes=source_bytes,
    nativeBindingCases=6, reviewImages=26, packageReceiptSha256=sha(root / 'package-receipt.json'),
    reviewHtmlSha256=sha(root / 'Review/index-embedded.html'),
    artworkHandoffSha256=sha(root / 'batch19-artwork-source-handoff.json'),
    inheritedHandoffSha256=sha(root / 'reused-batch18-source-handoff-verification.json'),
    technicalStatus='PASS', visualStatus='ACCEPTED_ART_REUSED_NEW_SNOW_ROUTING_REVIEW_AVAILABLE',
    newUserAcceptance=False, windowsStatus='NOT_RUN', localMainIntegration=False, m24Complete=False)
with args.output.open('x') as stream:
    json.dump(receipt, stream, indent=2)
    stream.write('\n')
print(json.dumps(receipt))
