"""Verify complete Snow terrain-object production and the independent repaired Mac delivery."""
import argparse
import hashlib
import json
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('delivery', type=Path)
parser.add_argument('--base-receipt', type=Path, required=True)
parser.add_argument('--case', nargs=4, action='append', required=True)
parser.add_argument('--supplemental', nargs=2, action='append', required=True)
parser.add_argument('--temperate-regression', required=True)
args = parser.parse_args()
root = args.delivery.resolve()
package = read(root / 'package-receipt.json')
handoff = read(root / 'artwork-source-handoff.json')
receipt = read(args.base_receipt)
delta = read(root / 'Evidence/snow-batch14-coverage-delta-v1.json')
contract = read(root / 'Authoring/snow-shp-terrain-objects-v2/contract-selected-v1.json')
resources = Path(package['resources'])
assert package['target'] == 'darwin-arm64' and not package['sourceDirty']
assert package['runtimeSourceHead'] == package['sourceHead']
for kind, folder in [('terrain', 'terrain-packs'), ('environment', 'environment-packs')]:
    selection = read(resources / f'{kind}-snow-selection.json')
    assert selection == delta['selected' + kind.capitalize()]
    assert sha(resources / folder / selection['revision'] / 'manifest.json') == selection['sha256']
assert contract['selectedPack'] == delta['selectedEnvironment']
for row in handoff['files']:
    path = root / row['file']
    assert path.is_relative_to(root) and path.stat().st_size == row['bytes']
    assert sha(path) == row['sha256'], row['file']
app = Path(package['app'])
links = [path for path in app.rglob('*') if path.is_symlink()]
assert all(path.resolve().is_relative_to(app.resolve()) for path in links)
loading = read(root / 'Evidence/snow-terrain-objects-loading-v2.json')
assert loading['status'] == 'PASS_COMPLETE_FAMILIES_DENSITIES_ALLOCATION_FALLBACK_DISPOSAL'
preservation = read(root / 'Evidence/snow-batch14-base-preservation-v1.json')
assert preservation['status'].startswith('PASS')
new_members = {row['member'] for row in delta['covered']}
expected = {name for name, family in contract['families'].items()
            if set(family['members']) & new_members}
assert len(expected) == len(new_members) == 41
bound = {2: set(), 4: set()}
native = {}


def check_report(name, directory, density):
    relative = f'Evidence/{directory}/report.json'
    report = read(root / relative)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['app'] == package['app'] and report['resources'] == package['resources']
    allocation = report.get('combinedWorldAllocation')
    if density:
        assert report['environment']['density'] == density
        assert report['selectedEnvironmentRevision'] == delta['selectedEnvironment']['revision']
        assert allocation['total'] <= allocation['limit'] == (512 if density == 2 else 1280) * 1024**2
        assert report['graphics']['glError'] == 0
        encountered = {row['id'] for row in report['newEncounteredFamilies']
                       if row['status'] == 'PUBLISHED_COMPLETE_FAMILY'}
        bindings = {contract['identities'][report['edition']][row['name']]
                    for row in report['newNativeBindings'] if row['hd'].endswith(f'/SNOW/tiles/{density}')}
        assert set(report['requestedFamilies']) <= encountered & bindings
        bound[density].update(bindings)
    else:
        assert report['fallback']['glError'] == 0
        for kind in ('terrain', 'environment'):
            assert report['fallback'][kind]['gpuBytes'] == report['fallback'][kind]['worldChargeBytes'] == 0
    terrain = report.get('newNativeTerrainObjects')
    if terrain:
        assert terrain['status'] == 'PASS_NATIVE_RESOURCE_SPAWN_ANIMATION_AND_TERRAIN_REMOVAL'
        assert terrain['repeatCycle']['animated'] and terrain['spawning']['frame'] > 0
        assert terrain['repeatCycle']['spawning']['ore'] != terrain['spawning']['ore']
        assert terrain['treeAfter']['destroyed'] and not terrain['treeAfter']['spawned']
        assert not terrain['treeAfter']['batchedEntryPresent']
    native[name] = dict(report=relative, sha256=sha(root / relative), density=density,
                        status=report['status'], allocation=allocation, errors=0)
    return report


for name, original, hd2, hd4 in args.case:
    reports = [check_report(name + suffix, directory, density)
               for suffix, directory, density in [('Original', original, 0), ('2X', hd2, 2), ('4X', hd4, 4)]]
    assert all(report['captureRoute'] == reports[0]['captureRoute'] for report in reports)
    assert len({(report['edition'], report['selectedMap']) for report in reports}) == 1
    if name == 'Town':
        assert all(report['newNativeTerrainObjects']['repeatCycle']['animated'] for report in reports)
        release = reports[1]['release']
        assert release['environment']['disposed'] and release['terrain']['disposed']
        assert release['environment']['worldChargeBytes'] == release['terrain']['worldChargeBytes'] == 0
        assert release['currentEnvironment']['worldChargeBytes'] == release['currentTerrain']['worldChargeBytes'] == 0
for name, directory in args.supplemental:
    check_report(name + '2X', directory, 2)
assert bound[2] == expected and len(bound[4]) == 36
temperate_path = root / 'Evidence' / args.temperate_regression / 'report.json'
temperate = read(temperate_path)
assert temperate['status'] == 'PASS_SELECTED_NATIVE_CASES' and not temperate['errors']
assert temperate['theater'] == 'TEMPERATE'
assert temperate['newNativeTerrainObjects']['repeatCycle']['animated']
ui = read(root / 'Evidence/snow-batch14-review-ui-v1/report.json')
assert ui['status'] == 'PASS_STATIC_EMBEDDED_IMAGES_NATIVE_SIZE_AND_DENSITY_CONTROLS' and not ui['errors']
review_manifest = read(root / 'Review/review-manifest.json')
for row in review_manifest['files']:
    assert not row['rescaled'] and sha(root / 'Review' / row['file']) == row['sha256']
review = root / 'Review/index-embedded.html'
receipt.pop('authorizedRepair', None)
receipt.update(schema='m2-4-snow-batch14-delivery-validation-v2', technicalStatus='PASS',
    visualStatus='NEW_ART_PENDING_USER_REVIEW', windowsStatus='NOT_RUN', milestoneStatus='INCOMPLETE',
    sourceHead=package['sourceHead'], runtimeSourceHead=package['runtimeSourceHead'],
    sourceDirtyAtPackage=package['sourceDirty'], target=package['target'], app=package['app'],
    resources=package['resources'], profile=package['profile'], resourceFiles=package['resourceFiles'],
    uiResourceFiles=package['uiResourceFiles'], packageReceiptSha256=sha(root / 'package-receipt.json'),
    noExternalSymlinks=True, internalFrameworkSymlinks=len(links),
    terrainManifestSha256=delta['selectedTerrain']['sha256'], environmentManifestSha256=delta['selectedEnvironment']['sha256'],
    authoringHandoffSha256=sha(root / 'artwork-source-handoff.json'), authoringFiles=len(handoff['files']),
    native=native, nativeFamilyCoverage={'2X': len(bound[2]), '4X': len(bound[4]), 'staticBoth': 41},
    sharedPathDeduplication='Five supplemental families use the identical terrain SHP loader and renderer; complete 4X family loading and geometry are verified statically.',
    repeatProductionAnimation={'Snow2X': 'PASS', 'Snow4X': 'PASS', 'Original': 'PASS',
        'Temperate2X': 'PASS', 'reportSha256': sha(temperate_path)},
    baseReceipt={'path': str(args.base_receipt.resolve()), 'sha256': sha(args.base_receipt)},
    review={'file': 'Review/index-embedded.html', 'sha256': sha(review), 'bytes': review.stat().st_size,
            'embeddedImages': len(review_manifest['files']), 'uiStatus': ui['status']})
receipt['evidence'] = [{key: row[key] for key in ('file', 'bytes', 'sha256')}
                       for row in handoff['files'] if row['file'].startswith('Evidence/')]
receipt['remaining']['SNOW'] = delta['remainingSnow']['total']
with (root / 'validation-receipt.json').open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'status': 'PASS', 'receiptSha256': sha(root / 'validation-receipt.json'),
                  'files': len(handoff['files']), 'nativeFamilies': receipt['nativeFamilyCoverage'],
                  'review': receipt['review']}))
