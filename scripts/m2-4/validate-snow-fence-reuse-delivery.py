"""Verify exact accepted fence reuse and its independent native Mac delivery."""
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
package_path = root / 'package-receipt.json'
package = read(package_path)
folder = Path(package['folder'])
assert folder.is_relative_to(root) and package['sourceDirty'] == ''
assert package['target'] == 'darwin-arm64'
assert package['runtimeSourceHead'] == '0a85dff3b4eed3a4b42cfdc9f02cdfdb815eac16'
assert package['resourceFiles'] == 7734 and package['uiResourceFiles'] == 360
assert package['resourceStorage'] == 'independent copies'
assert package['preparedRegistration']['members'] == 453 and package['preparedRegistration']['pages'] == 1205
for row in package['files']:
    file = folder / row['file']
    assert file.is_relative_to(folder)
    if 'link' in row:
        assert file.is_symlink() and os.readlink(file) == row['link']
    else:
        assert file.is_file() and not file.is_symlink()
        assert file.stat().st_size == row['bytes'] and sha(file) == row['sha256']
source_count = source_bytes = 0
for name in ['batch21-artwork-source-handoff.json', 'reused-batch20-source-handoff-verification.json']:
    for row in read(root / name)['files']:
        file = root / row['file']
        assert file.is_relative_to(root) and file.is_file() and not file.is_symlink()
        assert file.stat().st_size == row['bytes'] and sha(file) == row['sha256']
        source_count += 1
        source_bytes += row['bytes']
assert source_count == 5441 and source_bytes == 944846218
reuse = read(root / 'Authoring/accepted-family-reuse/reuse-receipt.json')
assert reuse['kind'] == 'overlay' and reuse['identities'] == ['CAFNCP']
assert reuse['copiedPages'] == 10 and sum(row['verifiedDensityFrames'] for row in reuse['families']) == 64
evidence = root / 'Evidence'
loading = read(evidence / 'snow-batch21-fence-loading-v1.json')
assert loading['status'] == 'PASS_COMPLETE_FAMILIES_DENSITIES_ALLOCATION_FALLBACK_DISPOSAL'
assert {(row['identity'], row['density']) for row in loading['families']} == {('snow-cafncp', 2), ('snow-cafncp', 4)}
matrix = read(evidence / 'snow-batch21-native-fence-matrix-v1.json')
assert matrix['status'] == 'PASS_SNOW_FENCE_NATIVE_STATES_BOTH_DENSITIES'
assert {row['density'] for row in matrix['cases']} == {2, 4}
for case in matrix['cases']:
    file = evidence / Path(case['report']).relative_to('.artifacts/m2-4')
    assert sha(file) == case['sha256']
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['graphics']['glError'] == 0
    assert report['combinedWorldAllocation']['total'] <= report['combinedWorldAllocation']['limit']
    wall = report['newNativeWalls']
    assert wall['status'] == 'PASS_NATIVE_WALL_DAMAGE_REMOVAL_ADJACENT_REBINDING'
    assert wall['damaged']['frame'] == wall['before']['wall']['frame'] + 16
    assert not wall['removed']['spawned'] and not wall['removed']['batchedEntryPresent']
    if case['density'] == 4:
        for key in ['environment', 'terrain']:
            assert report['release'][key]['disposed'] and report['release'][key]['worldChargeBytes'] == 0
            assert report['release']['current' + key.title()]['worldChargeBytes'] == 0
original = read(evidence / 'native-snow-batch21-fence-original-v1/report.json')
assert original['status'] == 'PASS_SELECTED_NATIVE_CASES' and not original['errors']
assert original['fallback']['terrain']['worldChargeBytes'] == 0
assert original['fallback']['environment']['worldChargeBytes'] == 0
assert original['fallback']['glError'] == 0
review = root / 'Review'
manifest = read(review / 'review-manifest.json')
assert len(manifest['files']) == 9 and len(manifest['scenes']) == 1 and len(manifest['states']) == 3
for row in manifest['files']:
    assert sha(review / row['file']) == row['sha256'] and row['rescaled'] is False
embedded = read(review / 'index-embedded.json')
assert sha(review / 'index-embedded.html') == embedded['outputSha256']
assert len(embedded['images']) == 9 and embedded['externalImageSources'] == 0
for name in ['snow-batch21-review-ui-v2', 'snow-batch21-desktop-review-ui-v1']:
    ui = read(evidence / name / 'report.json')
    assert ui['status'] == 'PASS_STATIC_EMBEDDED_IMAGES_NATIVE_SIZE_AND_DENSITY_CONTROLS' and not ui['errors']
result = dict(status='PASS_COMPLETE_ACCEPTED_FENCE_REUSE_INDEPENDENT_MAC_DELIVERY',
    packageReceiptSha256=sha(package_path), packageEntries=len(package['files']), sourceFiles=source_count,
    sourceBytes=source_bytes, verifiedDensityFrames=64, nativeDensities=[2, 4], originalFallback=True,
    reviewImages=9, reviewHtmlSha256=sha(review / 'index-embedded.html'),
    artworkStatus='ACCEPTED_TEMPERATE_ART_REUSED_BYTE_EXACT', snowBindingStatus='MAC_NATIVE_PASS',
    windowsStatus='NOT_RUN', mainIntegrated=False, m24Complete=False)
with args.output.open('x') as stream:
    json.dump(result, stream, indent=2)
    stream.write('\n')
print(json.dumps(result))
