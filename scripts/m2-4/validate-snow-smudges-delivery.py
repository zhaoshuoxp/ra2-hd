"""Verify the independent Snow decal package, exact native bindings and art handoff."""
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
assert package['runtimeSourceHead'] == package['sourceHead'] == 'c60888ccb8517621dc8c00dc7d838fa3b59a4e36'
assert package['resourceFiles'] == 7317 and package['uiResourceFiles'] == 360
assert package['preparedRegistration'] == dict(type='prepared-hd-registered', members=453,
    pages=1205, index='b729828392970f5e7a91ece16990924bd86c2daea7c76f79af2639de3ebae54b')
folder, resources = Path(package['folder']), Path(package['resources'])
assert folder.is_relative_to(root) and resources.is_relative_to(folder)
for row in package['files']:
    path = folder / row['file']
    assert path.is_relative_to(folder)
    if 'link' in row:
        assert path.is_symlink() and os.readlink(path) == row['link']
    else:
        assert not path.is_symlink() and path.stat().st_size == row['bytes']
        assert sha(path) == row['sha256'], row['file']
delta = read(root / 'Evidence/snow-batch16-coverage-delta-v1.json')
assert delta['newSourceGroups'] == 24 and delta['verifiedDensityFrames'] == 96
assert delta['remainingSnow'] == dict(total=147, tmp=0)
selections = {}
for kind in ['terrain', 'environment']:
    pointer = read(resources / f'{kind}-snow-selection.json')
    assert pointer == delta['selected' + kind.capitalize()]
    assert sha(resources / f'{kind}-packs' / pointer['revision'] / 'manifest.json') == pointer['sha256']
    selections[kind] = pointer
pack_root = resources / 'environment-packs' / selections['environment']['revision']
pack = read(pack_root / 'manifest.json')
assert len(pack['families']) == 74
contract = read(Path(package['app']) / 'Contents/Resources/app/desktop/environment-snow-hd-contract.json')
assert contract['selectedPack'] == selections['environment']
native_sources = read(root / 'Authoring/snow-native-smudges-batch16-v1/source.json')
by_name = {row['member']: row for row in native_sources['sources']}
expected = {}
names = [f'{prefix}{index:02d}' for prefix in ['BURNT', 'CRATER'] for index in range(1, 13)]
for name in names:
    family = contract['identities']['ra2'][name]
    assert family == contract['identities']['yr'][name] == 'snow-' + name.lower()
    member, = pack['families'][family]['members']
    path = pack_root / member['path']
    assert sha(path) == member['sha256']
    metadata, source = read(path), by_name[member['member']]
    assert metadata['source'] == dict(member=source['member'], sha256=source['sha256'],
                                    theater='SNOW', kind='resolved-shp-member')
    assert not source['hasShadow'] and not source['remapable'] and source['totalFrames'] == 2
    logical = metadata['logical']['frames']
    assert len(logical) == 2 and not logical[0]['empty'] and logical[1]['empty']
    assert logical[1]['trimSize'] == [0, 0] and logical[1]['nativeFrame'] == 1
    assert {row['density'] for row in metadata['variants']} == {2, 4}
    for variant in metadata['variants']:
        assert len(variant['frames']) == 2
        assert variant['frames'][1]['sampleRect'][2:] == variant['frames'][1]['contentRect'][2:] == [0, 0]
    expected[name] = f'{member["sha256"]}/{source["sha256"]}/SNOW/tiles/'
loading = read(root / 'Evidence/snow-smudges-batch16-loading-v1.json')
assert loading['status'] == 'PASS_COMPLETE_FAMILIES_DENSITIES_ALLOCATION_FALLBACK_DISPOSAL'
assert len(loading['families']) == 48 and {row['density'] for row in loading['families']} == {2, 4}
preservation = read(root / 'Evidence/snow-batch16-base-preservation-v1.json')
assert preservation == dict(status='PASS', inheritedFamilies=50, inheritedFiles=390,
    policy='Every inherited family declaration, member manifest, atlas and owner PNG remains exact.')
assembly = read(root / 'Evidence/snow-smudges-batch16-assembly-v2.json')
assert assembly['pack'] == selections['environment'] and len(assembly['payloadHashes']) == 510
for file, digest in assembly['payloadHashes'].items():
    assert sha(pack_root / file) == digest
registration = read(root / 'Evidence/snow-batch16-copied-registration-v1.json')
assert registration['status'] == 'PASS_ACTUAL_DESKTOP_REGISTRATION_ALL_SELECTED_FAMILIES_AND_PAYLOADS'
assert registration['desktopModule'].startswith((Path(package['app']) / 'Contents/Resources/app/desktop').as_uri())
row, = [row for row in registration['rows'] if row['theater'] == 'SNOW']
assert row['families'] == 74 and row['members'] == 96 and row['pages'] == 414
native = {}
original_file = root / 'Evidence/native-snow-batch14-town-original-v1/report.json'
original = read(original_file)
assert original['status'] == 'PASS_SELECTED_NATIVE_CASES' and not original['errors']
for density in [2, 4]:
    path = root / f'Evidence/native-snow-batch16-town-{density}x-v1/report.json'
    report = read(path)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['app'] == package['app'] and report['resources'] == package['resources']
    assert report['environment']['density'] == report['terrain']['density'] == density
    assert report['selectedEnvironmentRevision'] == selections['environment']['revision']
    assert report['captureRoute'] == original['captureRoute'] and report['selectedMap'] == original['selectedMap']
    assert {row['id'] for row in report['newEncounteredFamilies']} == {'snow-' + name.lower() for name in names}
    assert all(row['status'] == 'PUBLISHED_COMPLETE_FAMILY' for row in report['newEncounteredFamilies'])
    decals = report['newNativeDecals']
    assert decals['status'] == 'PASS_ALL_24_NATIVE_DECAL_BINDINGS_AND_UNSCALED_CAPTURES'
    assert len(decals['cases']) == 24 and {row['name'] for row in decals['cases']} == set(names)
    for sample in decals['cases']:
        assert sample['binding'] == dict(identity=expected[sample['name']] + str(density), frame=0)
        assert sample['sourceRect'][2:] == [640, 480] and sample['sourceOutput'] == [1489, 1080]
    allocation = report['combinedWorldAllocation']
    assert allocation['limit'] == (512 if density == 2 else 1280) * 1024 * 1024
    assert allocation['total'] <= allocation['limit'] and report['graphics']['glError'] == 0
    lifecycle = report['release' if density == 2 else 'crossTheater']
    assert all(lifecycle[kind]['disposed'] and lifecycle[kind]['worldChargeBytes'] == 0
               for kind in ['terrain', 'environment'])
    if density == 2:
        assert all(lifecycle['current' + kind]['worldChargeBytes'] == 0 for kind in ['Terrain', 'Environment'])
    else:
        assert lifecycle['glError'] == 0
        assert all(lifecycle['current' + kind]['density'] == 4 for kind in ['Terrain', 'Environment'])
    native[str(density)] = dict(file=str(path.relative_to(root)), sha256=sha(path), allocation=allocation)
handoff = read(root / 'artwork-source-handoff.json')
for row in handoff['files']:
    path = root / row['file']
    assert path.is_relative_to(root) and path.stat().st_size == row['bytes'] and sha(path) == row['sha256']
relocation = read(root / 'Authoring/generation-reference-relocation.json')
assert relocation['status'] == 'PASS_ALL_GENERATION_REFERENCES_PROVIDED'
for reference in relocation['references']:
    assert sha(root / reference['provided']) == reference['sha256']
author = root / 'Authoring/snow-smudges-authoring-batch16-v1'
masters = []
for path in sorted(author.glob('*-imagegen.json')):
    generation = read(path)
    assert generation['tool'] == 'Builtin imagegen'
    master = author / Path(generation['destination']).name
    assert sha(master) == generation['masterSha256']
    masters.append(dict(file=str(master.relative_to(root)), sha256=sha(master)))
assert len(masters) == 6
ui = read(root / 'Evidence/snow-batch16-review-ui-v1/report.json')
assert ui['status'] == 'PASS_STATIC_EMBEDDED_IMAGES_NATIVE_SIZE_AND_DENSITY_CONTROLS' and not ui['errors']
review = read(root / 'Review/review-manifest.json')
embedded = read(root / 'Review/index-embedded.json')
html = root / 'Review/index-embedded.html'
assert embedded['outputSha256'] == sha(html) and embedded['externalImageSources'] == 0
assert len(review['files']) == 111 and len(review['comparisons']) == 48 and len(review['states']) == 24
for row in review['files']:
    assert not row['rescaled'] and sha(root / 'Review' / row['file']) == row['sha256']
app = Path(package['app'])
assert all(path.resolve().is_relative_to(app) for path in app.rglob('*') if path.is_symlink())
receipt = dict(schema='m2-4-snow-batch16-delivery-validation-v1', technicalStatus='PASS',
    visualStatus='NEW_SNOW_GROUND_DECALS_PENDING_USER_REVIEW', userAccepted=False,
    windowsStatus='NOT_RUN', milestoneStatus='INCOMPLETE', runtimeSourceHead=package['runtimeSourceHead'],
    app=package['app'], resources=package['resources'], profile=package['profile'], selections=selections,
    packageEntriesVerified=len(package['files']), packageReceiptSha256=sha(root / 'package-receipt.json'),
    handoffSha256=sha(root / 'artwork-source-handoff.json'), handoffFiles=len(handoff['files']),
    generationReferences=len(relocation['references']), masters=masters, native=native,
    remainingSnow=delta['remainingSnow'],
    originalEvidence=dict(file=str(original_file.relative_to(root)), sha256=sha(original_file),
        scope='Unchanged camera/source geometry; no Original action captures claimed'),
    review=dict(file='Review/index-embedded.html', sha256=sha(html), bytes=html.stat().st_size, images=111),
    limits=['RA2 and YR identical smudge sources share the verified loading path; native actions run once per density in RA2.',
            'R7 ground and prior object visual feedback remain separate from this batch.',
            'Remaining Snow and other theater resources are not complete.'])
with (root / 'validation-receipt.json').open('x') as stream:
    stream.write(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(status='PASS', receiptSha256=sha(root / 'validation-receipt.json'),
                     images=111, handoffFiles=len(handoff['files']), packageEntriesVerified=len(package['files']))))
