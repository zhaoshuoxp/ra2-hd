"""Verify the frozen Snow surface app, reused gameplay evidence and independent art handoff."""
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
parser.add_argument('delivery', type=Path)
args = parser.parse_args()
root = args.delivery.resolve()
package = read(root / 'package-receipt.json')
assert package['target'] == 'darwin-arm64' and not package['sourceDirty']
assert package['runtimeSourceHead'] == package['sourceHead'] == 'f15af9270086ad3cb2ba361c58bb368e3b750a78'
assert package['resourceFiles'] == 7197 and package['uiResourceFiles'] == 360
assert package['preparedRegistration']['members'] == 453 and package['preparedRegistration']['pages'] == 1205
assert package['preparedRegistration']['index'] == 'b729828392970f5e7a91ece16990924bd86c2daea7c76f79af2639de3ebae54b'
folder, resources = Path(package['folder']), Path(package['resources'])
for row in package['files']:
    file = folder / row['file']
    assert file.is_relative_to(folder)
    if 'link' in row:
        assert file.is_symlink() and os.readlink(file) == row['link']
    else:
        assert file.stat().st_size == row['bytes'] and sha(file) == row['sha256'], row['file']
checkpoint = read(root / 'Evidence/snow-relief-r7-coverage-checkpoint-v1.json')
selections = {}
for kind in ['terrain', 'environment']:
    pointer = read(resources / f'{kind}-snow-selection.json')
    assert pointer == checkpoint['selected' + kind.capitalize()]
    assert sha(resources / f'{kind}-packs' / pointer['revision'] / 'manifest.json') == pointer['sha256']
    selections[kind] = pointer
terrain = read(resources / 'terrain-packs' / selections['terrain']['revision'] / 'manifest.json')
assert len(terrain['groups']) == 36 and sum(len(group['members']) for group in terrain['groups']) == 641
for stage, revision, members in [('snow-tmp-relief-contacts-r7-v1', 'snow-m2-4-relief-contacts-r7-v1', 109),
                                 ('snow-tmp-slope-contacts-r7-v1', 'snow-m2-4-relief-contacts-r7-v2', 1)]:
    validation = read(root / 'Authoring' / stage / revision / 'validation.json')
    assert validation['status'] == 'PASS_NEW_COMPLETE_GROUPS_NATIVE_METADATA_ALPHA_GUTTERS_AND_ACCEPTED_REUSE'
    assert validation['newMembers'] == members and validation['independentDensityPairs'] == members * 2
audit = read(root / 'Evidence/snow-relief-r7-contact-audit-v3.json')
assert audit['status'] == 'PASS_NATIVE_ALPHA_BOUNDED_CONTACT_COLOR_AND_EXACT_INTERIOR'
assert audit['members'] == 110 and audit['densityPairs'] == 220 and len(audit['masters']) == 12
handoff = read(root / 'artwork-source-handoff.json')
unique = {}
for row in handoff['files']:
    file = root / row['file']
    assert file.is_relative_to(root) and file.stat().st_size == row['bytes'] and sha(file) == row['sha256']
    if row['file'] in unique:
        assert unique[row['file']]['sha256'] == row['sha256']
    unique[row['file']] = row
relocation = read(root / 'Authoring/generation-reference-relocation.json')
assert relocation['status'] == 'PASS_ALL_GENERATION_REFERENCES_PROVIDED'
for reference in relocation['references']:
    assert sha(root / reference['provided']) == reference['sha256']
registration = read(root / 'Evidence/snow-surface-r7-copied-registration-v1.json')
assert registration['status'] == 'PASS_ACTUAL_DESKTOP_REGISTRATION_ALL_SELECTED_FAMILIES_AND_PAYLOADS'
assert '/Contents/Resources/app/desktop/' in registration['desktopModule']
assert next(row for row in registration['rows'] if row['theater'] == 'SNOW')['families'] == 50
native = {}
expected_groups = {'m2-4-snow-relief-r7-set09', 'm2-4-snow-relief-r7-set41', 'm2-4-snow-slope-rep-r7-set09'}
for name in ['town', 'forest']:
    original = read(root / f'Evidence/native-snow-batch14-{name}-original-v1/report.json')
    assert original['status'] == 'PASS_SELECTED_NATIVE_CASES' and not original['errors']
    for density in [2, 4]:
        file = root / f'Evidence/native-snow-relief-r7-{name}-{density}x-v1/report.json'
        report = read(file)
        assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
        assert report['app'] == package['app'] and report['resources'] == package['resources']
        assert report['environment']['density'] == report['terrain']['density'] == density
        assert report['captureRoute'] == original['captureRoute'] and report['selectedMap'] == original['selectedMap']
        assert expected_groups <= {group['id'] for group in report['terrain']['groups'] if group['status'] == 'PUBLISHED'}
        gl_error = report.get('glError', report.get('graphics', {}).get('glError'))
        assert gl_error == 0
        if name == 'town':
            allocation = report['combinedWorldAllocation']
            assert allocation['limit'] == (512 if density == 2 else 1280) * 1024 * 1024
            assert allocation['total'] <= allocation['limit'] and len(report['newNativeBindings']) == 506
        native[f'{name}-{density}x'] = dict(file=str(file.relative_to(root)), sha256=sha(file), glError=gl_error)
repair = read(root / 'Authoring/snow-resource-path-repair-v1/path-repair.json')
assert repair['candidate'] == selections['environment'] and len(repair['files']) == 390
for row in repair['files']:
    assert sha(resources / 'environment-packs' / selections['environment']['revision'] / row['new']) == row['sha256']
reused = []
for density, suffix in [(2, '2x-v2'), (4, '4x-v1')]:
    file = root / f'Evidence/native-snow-batch15-town-{suffix}/report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['newNativeResources']['status'] == 'PASS_NATIVE_ORE_GEM_GATHER_DEPLETION_AND_CREATED_ORE_HD'
    for item in report['newNativeResources']['harvest']:
        assert item['before']['value'] > item['gathering']['value'] >= 0
        assert item['gathering']['frame'] == item['gathering']['value']
        assert item['gathering']['miner'][item['kind']] > 0
        assert item['depleted']['value'] == -1 and not item['depleted']['spawned']
    lifecycle = report['release' if density == 2 else 'crossTheater']
    assert all(lifecycle[kind]['disposed'] and lifecycle[kind]['worldChargeBytes'] == 0
               for kind in ['terrain', 'environment'])
    reused.append(dict(file=str(file.relative_to(root)), sha256=sha(file), scope='Unchanged environment payload/state and shared disposal paths; not a fresh R7 action run'))
ui = read(root / 'Evidence/snow-surface-r7-review-ui-v1/report.json')
assert ui['status'] == 'PASS_STATIC_EMBEDDED_IMAGES_NATIVE_SIZE_AND_DENSITY_CONTROLS' and not ui['errors']
review = read(root / 'Review/review-manifest.json')
embedded = read(root / 'Review/index-embedded.json')
html = root / 'Review/index-embedded.html'
assert embedded['outputSha256'] == sha(html) and embedded['externalImageSources'] == 0
assert len(review['files']) == 655 and len(review['comparisons']) == 622 and len(review['scenes']) == 11
for row in review['files']:
    assert not row['rescaled'] and sha(root / 'Review' / row['file']) == row['sha256']
app = Path(package['app'])
assert all(file.resolve().is_relative_to(app) for file in app.rglob('*') if file.is_symlink())
receipt = dict(schema='m2-4-snow-surface-r7-delivery-v1', technicalStatus='PASS',
    visualStatus='SNOW_GROUND_REPAIR_AND_BATCH14_OBJECTS_PENDING_USER_REVIEW', userAccepted=False,
    windowsStatus='NOT_RUN', milestoneStatus='INCOMPLETE', runtimeSourceHead=package['runtimeSourceHead'],
    app=package['app'], resources=package['resources'], profile=package['profile'], selections=selections,
    packageEntriesVerified=len(package['files']), packageReceiptSha256=sha(root / 'package-receipt.json'),
    handoffSha256=sha(root / 'artwork-source-handoff.json'), handoffUniqueFiles=len(unique),
    handoffBytes=sum(row['bytes'] for row in unique.values()), generationReferences=len(relocation['references']),
    native=native, reusedGameplayEvidence=reused, remainingSnowInThisApp=checkpoint['remainingSnow'],
    review=dict(file='Review/index-embedded.html', sha256=sha(html), bytes=html.stat().st_size, images=655),
    limits=['This frozen app precedes the separate batch16 smudge addition.', 'Visual acceptance and remaining Snow/theater coverage stay open.'])
with (root / 'validation-receipt.json').open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(status='PASS', receiptSha256=sha(root / 'validation-receipt.json'), images=655,
                     handoffUniqueFiles=len(unique), packageEntriesVerified=len(package['files']))))
