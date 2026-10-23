"""Record the bounded accepted-remainder preservation and copied V13D seam review."""
import hashlib
import json
import subprocess
from pathlib import Path

artifacts = Path('.artifacts/m2-1')
root = artifacts / 'authoring-seams-v13'
read = lambda p: json.loads(Path(p).read_text())
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
write = lambda p, d: Path(p).write_text(json.dumps(d, indent=2) + '\n')
resource = read('desktop/terrain-hd-contract.json')
pack = Path('.local/terrain-packs') / resource['revision']
assert sha(pack / 'manifest.json') == resource['sha256']
manifest = read(pack / 'manifest.json')
validation = read(root / resource['revision'] / 'validation.json')
recipe = read(root / resource['revision'] / 'recipe.json')
assert validation['status'] == 'PASS' and validation['pack'] == resource
receipt = read(artifacts / 'copied-seams-v13d.json')
package = read(artifacts / 'package-seams-v13d/package-receipt.json')
copied = read(artifacts / 'copied-seams-v13d-verification.json')
review = read(artifacts / 'seams-v13d-review.json')
embedded = read(artifacts / 'seams-v13d-embedded-verification.json')
native_review = read(artifacts / 'seams-v13d-review-native.json')
ordinary = read(artifacts / 'seams-v13d-default-native.json')
assert package['sourceDirty'] == '' and copied['errors'] == []
assert copied['sourceHead'] == package['runtimeSourceHead']
assert embedded['status'] == native_review['status'] == ordinary['status'] == 'PASS'
assert len(native_review['frames']) == 16 and len(native_review['masters']) == 5
assert len(native_review['originalReferences']) == 5 and len(native_review['videos']) == 3
assert embedded['exactEmbeddedPayloads'] == 30
assert sha(receipt['review']) == review['sha256'] == embedded['htmlSha256']
assert ordinary['registration']['directory'] == receipt['resources']
assert read(Path(receipt['resources']) / 'terrain-selection.json') == resource
signature = artifacts / 'seams-v13d-signature.log'
assert 'valid on disk' in signature.read_text() and 'satisfies its Designated Requirement' in signature.read_text()
observations = []
for density in [2, 4]:
    file = artifacts / f'copied-seams-v13d-{density}x/report.json'
    report = read(file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    assert report['terrain']['density'] == density
    assert len(report['terrain']['placedBindings']) == 7962
    for group in report['terrain']['groups']:
        declared = next(g for g in manifest['groups'] if g['id'] == group['id'])
        variant = next(v for v in declared['variants'] if v['density'] == density)
        assert group['status'] == 'PUBLISHED' and group['sha256'] == variant['sha256']
        expected = [dict(member=m['member'], sha256=m['sourceHashes'][report['edition']], subTile=i['subTile'])
                    for m in declared['members'] for i in m['images']]
        assert group['entries'] == expected
    assert report['ui']['reservedBytes'] <= 16 * 1024 * 1024
    assert report['prepared']['cache']['peakBytes'] <= 128 * 1024 * 1024
    assert report['terrainWorldAllocation']['totalCharged'] <= (256 if density == 2 else 1280) * 1024 * 1024
    assert len(report['picking']) == 8
    assert report['rampPassage']['after']['tile'] == report['rampPassage']['target'][:2]
    observations.append(dict(file=str(file), sha256=sha(file), status=report['status'], edition=report['edition'],
                             map=report['selectedMap'], density=density, graphics=report['graphics'],
                             mapEntryMs=report['mapEntryToFixtureMs'], placedBindings=7962, declaredImages=742,
                             allocation=report['terrainWorldAllocation'], uiBytes=report['ui']['reservedBytes'],
                             preparedPeakBytes=report['prepared']['cache']['peakBytes'], picking=report['picking'],
                             rampPassage=report['rampPassage'],
                             frames={k: {n: report[k][n] for n in ['samples', 'mean', 'p95', 'max', 'stalls50']}
                                     for k in ['mixedFrames', 'firstEncounterFrames', 'sustainedPanFrames']}))
main = Path('/Users/Aone/RA2remaster/ra2-hd')
git = lambda *args: subprocess.check_output(['git', '-C', str(main), *args], text=True).strip()
main_state = dict(head=git('rev-parse', 'HEAD'), status=git('status', '--porcelain'), taskWrites='NONE')
assert not main_state['status']
assert subprocess.check_output(['git', 'diff', '--name-only', '227dbc67c472ef0697b8e5c49fbe531dc70a250b..HEAD',
                                '--', 'src', 'public'], text=True).strip() == ''
folder = Path(receipt['app']).parent
previews = [dict(file=str(folder / name), sha256=sha(folder / name)) for name in [
    'Road-Ramp-V13D-Actual-Size.png', 'Road-Ramp-V13D-Detail.png', 'Road-Ramp-V12C-V13D-Comparison.png']]
inputs = [*pack.iterdir(), root / 'grass-material-master.png', root / 'grass-material-prompt.txt',
          root / 'generation-provenance.json', *(root / resource['revision']).iterdir()]
prior_inventory = artifacts / 'production-v12c-transfer-inventory.json'
inventory = dict(policy='COPY_TO_FRESH_ROOT_VERIFY_EVERY_HASH_PRESERVE_PARENT_AND_STUDIES',
                 parentInventory=dict(file=str(prior_inventory), sha256=sha(prior_inventory)),
                 parentResource=validation['parent'], resource=resource,
                 files=[dict(file=str(p), bytes=p.stat().st_size, sha256=sha(p)) for p in sorted(inputs) if p.is_file()])
inventory_file = artifacts / 'seams-v13d-transfer-inventory.json'
write(inventory_file, inventory)
document = read('docs/m2-1-seams-v13.json')
document.update(status='BOUNDED_SEAM_CORRECTION_COPIED_REVIEW_READY', resource=resource,
                technical='EXACT_PRESERVATION_AND_COPIED_NATIVE_2X_4X_PASS',
                visual='AUTHOR_ACTUAL_SIZE_INSPECTION_COMPLETE_CORRECTION_USER_ACCEPTANCE_PENDING',
                runtimeSourceHead=package['runtimeSourceHead'], copiedReceipt=receipt,
                copiedVerification=copied, native=observations, review=review, embeddedVerification=embedded,
                nativeReview=native_review, ordinaryLaunch=ordinary,
                signature=dict(status='PASS_DEEP_STRICT_ADHOC', file=str(signature), sha256=sha(signature)),
                mainPreservation=main_state, previews=previews,
                exactAcceptedFixupStonePixels=sum(v['exactPixels'] for v in recipe['retainedStonePixels']),
                authoring=read(root / 'generation-provenance.json'),
                transferInventory=dict(file=str(inventory_file), sha256=sha(inventory_file),
                                       files=len(inventory['files']), bytes=sum(f['bytes'] for f in inventory['files'])),
                reusedEvidence=dict(receipt='docs/m2-1-production-v12.json',
                                    boundary='Unchanged geometry/rendering/map/rules; reuse closed lifecycle/fallback, RA2 and secondary-map cases. '
                                             'New copied YR 2X/4X source publication, picking, slope passage, camera and performance are fresh.'),
                remaining=['Correction appearance acceptance', 'Windows native checks and physical cursor/input acceptance'])
write('docs/m2-1-seams-v13.json', document)
write(folder / 'V13D-Review-Evidence.json', document)
acceptance = read('docs/m2-1-temperate-acceptance.json')
acceptance['status'] = 'M2_1_REMAINDER_ACCEPTED_BOUNDED_SEAM_CORRECTION_REVIEW_READY'
acceptance['fullBatch'] = 'V12C_REMAINDER_USER_ACCEPTED_CORRECTION_COPIED_REVIEW_READY'
acceptance['v13SeamCorrection'].update(status=document['status'], resource=resource,
                                      runtimeSourceHead=package['runtimeSourceHead'], copiedReview=receipt,
                                      exportValidation=validation, native=observations)
write('docs/m2-1-temperate-acceptance.json', acceptance)
coverage = read('docs/m2-1-temperate-coverage.json')
coverage['seamCorrection']['status'] = document['status']
coverage['seamCorrection']['exactAcceptedFixupStonePixels'] = document['exactAcceptedFixupStonePixels']
write('docs/m2-1-temperate-coverage.json', coverage)
print(json.dumps(dict(status=document['status'], sourceHead=package['runtimeSourceHead'], resource=resource,
                      native=[dict(density=o['density'], mapEntryMs=o['mapEntryMs'], placedBindings=o['placedBindings'])
                              for o in observations], transferFiles=len(inventory['files']), reviewBytes=review['bytes']), indent=2))
