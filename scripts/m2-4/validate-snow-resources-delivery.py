"""Verify copied ore/gem gameplay, representative surface repair and independent handoff."""
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
args = parser.parse_args()
root = args.delivery.resolve()
package = read(root / 'package-receipt.json')
handoff = read(root / 'artwork-source-handoff.json')
checkpoint = read(root / 'Evidence/snow-surface-r1-coverage-checkpoint-v1.json')
assert package['target'] == 'darwin-arm64' and not package['sourceDirty']
assert package['resourceFiles'] == 7197 and package['uiResourceFiles'] == 360
resources = Path(package['resources'])
selections = {}
for kind in ['terrain', 'environment']:
    pointer = read(resources / f'{kind}-snow-selection.json')
    assert pointer == checkpoint['selected' + kind.capitalize()]
    pack = resources / f'{kind}-packs' / pointer['revision']
    assert sha(pack / 'manifest.json') == pointer['sha256']
    selections[kind] = pointer
for row in handoff['files']:
    file = root / row['file']
    assert file.is_relative_to(root) and file.stat().st_size == row['bytes']
    assert sha(file) == row['sha256'], row['file']
repair = read(root / 'Authoring/snow-resource-path-repair-v1/path-repair.json')
assert repair['candidate'] == selections['environment'] and repair['renamedMembers'] == 24
assert repair['unchangedInheritedFiles'] == 270 and repair['payloads'] == 390
env_root = resources / 'environment-packs' / selections['environment']['revision']
for row in repair['files']:
    assert sha(env_root / row['new']) == row['sha256']
registration = read(root / 'Evidence/snow-batch15-copied-registration-v2.json')
assert registration['status'] == 'PASS_ACTUAL_DESKTOP_REGISTRATION_ALL_SELECTED_FAMILIES_AND_PAYLOADS'
assert next(row for row in registration['rows'] if row['theater'] == 'SNOW')['families'] == 50
loading = read(root / 'Evidence/snow-accepted-resources-loading-v3.json')
assert loading['status'] == 'PASS_COMPLETE_FAMILIES_DENSITIES_ALLOCATION_FALLBACK_DISPOSAL'
assert {(row['identity'], row['density']) for row in loading['families']} == {
    (family, density) for family in ['snow-ore', 'snow-gem'] for density in [2, 4]}
terrain_validation = read(root / 'Authoring/snow-tmp-surface-feedback-v3/snow-m2-4-surface-feedback-r1-v1/validation.json')
assert terrain_validation['newMembers'] == 24 and terrain_validation['independentDensityPairs'] == 48
assert terrain_validation['copiedAcceptedGroups'] == 33 and terrain_validation['replacedCompleteGroups'] == 3
native = {}
town = []
for density, suffix in [(2, '2x-v2'), (4, '4x-v1')]:
    file = root / f'Evidence/native-snow-batch15-town-{suffix}/report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['environment']['density'] == report['terrain']['density'] == density
    assert report['combinedWorldAllocation']['total'] <= report['combinedWorldAllocation']['limit']
    assert len(report['newNativeBindings']) > 0
    actions = report['newNativeResources']
    assert actions['status'] == 'PASS_NATIVE_ORE_GEM_GATHER_DEPLETION_AND_CREATED_ORE_HD'
    assert {item['kind'] for item in actions['harvest']} == {'ore', 'gems'}
    for item in actions['harvest']:
        assert item['before']['value'] > item['gathering']['value'] >= 0
        assert item['gathering']['frame'] == item['gathering']['value']
        assert item['gathering']['miner'][item['kind']] > 0
        assert item['depleted']['value'] == -1 and not item['depleted']['spawned']
        assert not item['depleted']['batchedEntryPresent']
    prior_ids = {item['id'] for item in actions['growthBefore']['resources']}
    created = [item for item in actions['growthAfter']['resources'] if item['id'] not in prior_ids]
    assert created and all(item['value'] == item['frame'] == 3
                           and item['hd'].endswith(f'/SNOW/tiles/{density}') for item in created)
    assert report['graphics']['glError'] == 0
    if density == 2:
        for kind in ['terrain', 'environment']:
            assert report['release'][kind]['disposed'] and report['release'][kind]['worldChargeBytes'] == 0
            assert report['release']['current' + kind.capitalize()]['worldChargeBytes'] == 0
    else:
        for kind in ['terrain', 'environment']:
            assert report['crossTheater'][kind]['disposed'] and report['crossTheater'][kind]['worldChargeBytes'] == 0
            assert report['crossTheater']['current' + kind.capitalize()]['density'] == density
        assert report['crossTheater']['glError'] == 0
    town.append(report)
    native[f'town-{density}x'] = dict(file=str(file.relative_to(root)), sha256=sha(file),
        allocation=report['combinedWorldAllocation'], resourceActions=actions['status'],
        actualBindings=len(report['newNativeBindings']))
original_file = root / 'Evidence/native-snow-batch15-town-original-v1/report.json'
original = read(original_file)
assert original['status'] == 'PASS_SELECTED_NATIVE_CASES' and not original['errors']
assert town[0]['captureRoute'] == town[1]['captureRoute'] == original['captureRoute']
assert original['fallback']['glError'] == 0
assert all(original['fallback'][kind]['worldChargeBytes'] == 0 for kind in ['terrain', 'environment'])
for name in ['town', 'forest']:
    for density in [2, 4]:
        file = root / f'Evidence/native-snow-surface-r1-{name}-{density}x-v1/report.json'
        report = read(file)
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors'] and report['glError'] == 0
        assert report['environment']['density'] == report['terrain']['density'] == density
        native[f'{name}-surface-{density}x'] = dict(file=str(file.relative_to(root)), sha256=sha(file))
ui = read(root / 'Evidence/snow-batch15-review-ui-v1/report.json')
assert ui['status'] == 'PASS_STATIC_EMBEDDED_IMAGES_NATIVE_SIZE_AND_DENSITY_CONTROLS' and not ui['errors']
review = root / 'Review/index-embedded.html'
review_manifest = read(root / 'Review/review-manifest.json')
assert 'USER_REJECTED_EXCESS_SNOW_SURFACE' in review_manifest['visualDirection']
for row in review_manifest['files']:
    assert not row['rescaled'] and sha(root / 'Review' / row['file']) == row['sha256']
app = Path(package['app'])
links = [file for file in app.rglob('*') if file.is_symlink()]
assert all(file.resolve().is_relative_to(app) for file in links)
receipt = dict(schema='m2-4-snow-batch15-resource-and-surface-delivery-v1', technicalStatus='PASS',
    visualStatus='REPRESENTATIVE_SURFACE_REPAIR_AND_NEW_SNOW_BINDINGS_PENDING_USER_REVIEW',
    userAccepted=False, windowsStatus='NOT_RUN', milestoneStatus='INCOMPLETE',
    runtimeSourceHead=package['runtimeSourceHead'], sourceHead=package['sourceHead'],
    app=package['app'], resources=package['resources'], profile=package['profile'],
    target=package['target'], resourceFiles=package['resourceFiles'], uiResourceFiles=package['uiResourceFiles'],
    selections=selections, packageReceiptSha256=sha(root / 'package-receipt.json'),
    sourceHandoffSha256=sha(root / 'artwork-source-handoff.json'), handoffFiles=len(handoff['files']),
    handoffBytes=sum(row['bytes'] for row in handoff['files']), internalFrameworkSymlinks=len(links),
    native=native, remainingSnow=checkpoint['remainingSnow'],
    review=dict(file='Review/index-embedded.html', sha256=sha(review), bytes=review.stat().st_size,
                embeddedImages=len(review_manifest['files']), states=len(review_manifest['states'])),
    reused=['Unchanged accepted faction/prepared/UI/temperate assets and validation.',
            'Original Town/Forest source-map camera captures from batch 14.',
            'Accepted original resource refinery-credit and shared alias renderer evidence.'],
    limitations=['Surface R1 revises only three representative complete terrain families.',
                 'Snow and other required theaters remain incomplete; no Windows runtime claim.'])
with (root / 'validation-receipt.json').open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(status='PASS', receiptSha256=sha(root / 'validation-receipt.json'),
    handoffFiles=receipt['handoffFiles'], images=receipt['review']['embeddedImages'])))
