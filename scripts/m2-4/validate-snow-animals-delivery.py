"""Validate complete accepted animal reuse against the independent Mac delivery."""
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
args = parser.parse_args()
root = args.delivery.resolve()
package = read(root / 'package-receipt.json')
handoff = read(root / 'artwork-source-handoff.json')
delta = read(root / 'Evidence/snow-animals-coverage-delta-v1.json')
receipt = read(args.base_receipt)
resources = Path(package['resources'])
assert package['target'] == 'darwin-arm64' and not package['sourceDirty']
selections = {}
for kind, selection_file, pack_dir, delta_key in (
        ('terrain', 'terrain-snow-selection.json', 'terrain-packs', 'selectedTerrain'),
        ('environment', 'environment-snow-selection.json', 'environment-packs', 'selectedEnvironment')):
    selection = read(resources / selection_file)
    assert selection == delta[delta_key]
    manifest = resources / pack_dir / selection['revision'] / 'manifest.json'
    assert sha(manifest) == selection['sha256']
    selections[kind] = selection
for row in handoff['files']:
    path = root / row['file']
    assert path.is_relative_to(root) and path.stat().st_size == row['bytes']
    assert sha(path) == row['sha256'], row['file']
app = Path(package['app'])
links = [path for path in app.rglob('*') if path.is_symlink()]
assert all(path.resolve().is_relative_to(app.resolve()) for path in links)
loading = read(root / 'Evidence/snow-animals-loading-v1.json')
assert loading['status'] == 'PASS_COMPLETE_FAMILIES_DENSITIES_ALLOCATION_FALLBACK_DISPOSAL'
preservation = read(root / 'Evidence/snow-animals-base-preservation-v1.json')
assert preservation['status'].startswith('PASS')
native = {}
for actor, native_name, placements in [('cow', 'COW', 2), ('polar', 'POLARB', 6)]:
    routes = []
    for density in ('2x', '4x', 'original'):
        relative = f'Evidence/native-snow-animals-{actor}-{density}-v1/report.json'
        path = root / relative
        report = read(path)
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
        routes.append(report['captureRoute'])
        allocation = report.get('combinedWorldAllocation')
        if density == 'original':
            fallback = report['fallback']
            assert fallback['glError'] == 0
            for kind in ('terrain', 'environment'):
                assert fallback[kind]['gpuBytes'] == fallback[kind]['worldChargeBytes'] == 0
        else:
            assert allocation['total'] <= allocation['limit']
            bindings = report['newNativeBindings']
            assert len(bindings) == placements
            assert all(row['name'] == native_name and '/SNOW/tiles/' in row['hd'] for row in bindings)
            states = report['newNativeStates']
            assert states['status'] == 'PASS_SEQUENTIAL_NATIVE_BUILDING_ACTOR_AND_ANIMATION_CASES'
            assert len(states['actors']) == 1 and states['actors'][0]['name'] == native_name
            actions = states['actors'][0]
            samples = actions['samples']
            assert samples['walk']['moving'] and samples['wounded']['health'] < 100
            assert samples['death']['destroyed'] and samples['death']['health'] == 0
            if actor == 'polar':
                assert actions['nativeAttackChangedHealth'] and samples['fire']['firing']
            for row in actions['trace']:
                assert 0 <= row['frame'] < row['bodyFrameCount']
                if not row['shpHd']:
                    sequence = row['sequenceParams']
                    assert row['destroyed'] and not row['spawned'] and row['health'] == 0
                    assert row['frame'] == sequence['startFrame'] + sequence['frameCount'] - 1
            assert samples['death']['shpHd'], 'Native death sequence must render before disposal'
        native[f'{actor}-{density}'] = dict(report=relative, sha256=sha(path),
                                            status=report['status'], allocation=allocation, errors=0)
    assert routes[0] == routes[1] == routes[2]
ui = read(root / 'Evidence/snow-batch13-review-ui-v1/report.json')
assert ui['status'] == 'PASS_STATIC_EMBEDDED_IMAGES_NATIVE_SIZE_AND_DENSITY_CONTROLS' and not ui['errors']
review_manifest = read(root / 'Review/review-manifest.json')
for row in review_manifest['files']:
    assert not row['rescaled'] and sha(root / 'Review' / row['file']) == row['sha256']
review = root / 'Review/index-embedded.html'
receipt.pop('authorizedRepair', None)
receipt.update(schema='m2-4-snow-batch13-delivery-validation-v1', technicalStatus='PASS',
    visualStatus='NEW_SNOW_BINDINGS_PENDING_USER_REVIEW', acceptedArtStatus='REUSED_EXACT_ACCEPTED_COMPLETE_FAMILIES',
    windowsStatus='NOT_RUN', milestoneStatus='INCOMPLETE', sourceHead=package['sourceHead'],
    runtimeSourceHead=package['runtimeSourceHead'], sourceDirtyAtPackage=package['sourceDirty'],
    target=package['target'], app=package['app'], resources=package['resources'], profile=package['profile'],
    packageReceiptSha256=sha(root / 'package-receipt.json'), resourceFiles=package['resourceFiles'],
    uiResourceFiles=package['uiResourceFiles'], noExternalSymlinks=True, internalFrameworkSymlinks=len(links),
    terrainManifestSha256=selections['terrain']['sha256'], environmentManifestSha256=selections['environment']['sha256'],
    authoringHandoffSha256=sha(root / 'artwork-source-handoff.json'), authoringFiles=len(handoff['files']),
    native=native, baseReceipt=dict(path=str(args.base_receipt.resolve()), sha256=sha(args.base_receipt)),
    review=dict(file='Review/index-embedded.html', sha256=sha(review), bytes=review.stat().st_size,
                embeddedImages=len(review_manifest['files']), uiStatus=ui['status']))
receipt['evidence'] = [{key: row[key] for key in ('file', 'bytes', 'sha256')}
                       for row in handoff['files'] if row['file'].startswith('Evidence/')]
receipt['remaining']['SNOW'] = delta['remainingSnow']['total']
with (root / 'validation-receipt.json').open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(status='PASS', receiptSha256=sha(root / 'validation-receipt.json'),
                      files=len(handoff['files']), internalSymlinks=len(links), review=receipt['review'])))
