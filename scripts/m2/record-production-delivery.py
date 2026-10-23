"""Record independently checked production, copied runtime and embedded review evidence."""
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

artifacts = Path('.artifacts/m2-1')
root = artifacts / 'authoring-production-v3'
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
read = lambda p: json.loads(Path(p).read_text())
resource = read('desktop/terrain-hd-contract.json')
pack = Path('.local/terrain-packs') / resource['revision']
assert sha(pack / 'manifest.json') == resource['sha256']
manifest = read(pack / 'manifest.json')
export = read(root / resource['revision'] / 'validation.json')
assert export['status'] == 'PASS' and export['pack'] == resource
receipt = read(artifacts / 'copied-production-v12c.json')
package = read(artifacts / 'package-production-v12c/package-receipt.json')
copied = read(artifacts / 'copied-production-v12c-verification.json')
review = read(artifacts / 'production-v12c-review.json')
embedded = read(artifacts / 'production-v12c-embedded-verification.json')
review_native = read(artifacts / 'production-v12c-review-native-final.json')
default = read(artifacts / 'production-v12c-default-native.json')
assert copied['errors'] == [] and copied['sourceHead'] == package['runtimeSourceHead']
assert embedded['status'] == review_native['status'] == default['status'] == 'PASS'
assert len(review_native['frames']) == 56 and len(review_native['masters']) == 41
assert len(review_native['originalReferences']) == 41 and len(review_native['videos']) == 3
assert sha(receipt['review']) == review['sha256'] == embedded['htmlSha256']
names = ['copied-production-v12c-4x-final', 'copied-production-v12c-2x',
         'production-v12c-original-terrain', 'copied-production-v12c-ra2-final',
         'copied-production-v12c-secondary', 'copied-production-v12c-invalid-ground']
observations = []
for name in names:
    file = artifacts / name / 'report.json'
    r = read(file)
    assert r['status'] == 'PASS_SELECTED_NATIVE_CASES' and not r['errors']
    assert r['ui']['reservedBytes'] <= 16 * 1024 * 1024
    assert r['prepared']['cache']['peakBytes'] <= 128 * 1024 * 1024
    groups = r['terrain']['groups']
    density = r['scene']['density']
    for group in groups:
        if group['status'] != 'PUBLISHED':
            continue
        declared = next(g for g in manifest['groups'] if g['id'] == group['id'])
        variant = next(v for v in declared['variants'] if v['density'] == density)
        assert group['sha256'] == variant['sha256']
        entries = [(m, i) for m in declared['members'] for i in m['images']]
        assert len(entries) == len(group['entries'])
        for actual, (member, image) in zip(group['entries'], entries):
            assert actual == dict(member=member['member'], sha256=member['sourceHashes'][r['edition']], subTile=image['subTile'])
    allocation = r['terrainWorldAllocation']
    assert allocation['totalCharged'] <= (256 if density == 2 else 1280) * 1024 * 1024
    frames = {k: {n: r[k][n] for n in ['samples', 'mean', 'p95', 'p99', 'max', 'stalls50']}
              for k in ['mixedFrames', 'firstEncounterFrames', 'sustainedPanFrames'] if k in r}
    observations.append(dict(name=name, file=str(file), sha256=sha(file), status=r['status'], edition=r['edition'],
                             map=r['selectedMap'], machine=r['machine'], graphics=r['graphics'], scene=r['scene'],
                             mapEntryMs=r['mapEntryToFixtureMs'], frames=frames, allocation=allocation,
                             uiBytes=r['ui']['reservedBytes'], preparedPeakBytes=r['prepared']['cache']['peakBytes'],
                             groups=[{k: g[k] for k in ['id', 'status', 'sha256', 'reason'] if k in g} for g in groups],
                             declaredImages=sum(len(g.get('entries', [])) for g in groups),
                             placedBindings=len(r['terrain']['placedBindings']), picking=r.get('picking'),
                             placement=r.get('placement'), rampPassage=r.get('rampPassage'), reentry=r.get('reentry'),
                             productionViews=[{k: v[k] for k in ['name', 'status', 'center'] if k in v}
                                              for v in r.get('productionViews', [])]))
assert observations[2]['allocation']['terrainGpu'] == 0
assert observations[-1]['groups'][0]['status'] == 'ORIGINAL'
assert not any(b['group'] == 'ground' for b in read(artifacts / names[-1] / 'report.json')['terrain']['placedBindings'])
main = Path('/Users/Aone/RA2remaster/ra2-hd')
git = lambda *args: subprocess.check_output(['git', '-C', str(main), *args], text=True).strip()
main_state = dict(head=git('rev-parse', 'HEAD'), status=git('status', '--porcelain'), taskWrites='NONE')
folder = Path(receipt['app']).parent
previews = []
for label, scene in [('Production-V12C-Actual-Size.png', 'cliff-closure-full'),
                     ('Ground-Road-V12C-Actual-Size.png', 'rough-ground-full')]:
    source = artifacts / names[0] / f'{scene}-actual-size-framebuffer.png'
    target = folder / label
    assert not target.exists()
    shutil.copyfile(source, target)
    previews.append(dict(file=str(target), sha256=sha(target), source=str(source)))
authoring = [dict(file=str(root / name), sha256=sha(root / name)) for name in
             ['source.json', 'layout.json', 'batches.json', 'generation-plan.json', 'generation-provenance.json']]
record = read('docs/m2-1-production-v12.json')
record.update(status='COMPLETE_SELECTED_PRODUCTION_COPIED_REVIEW_READY', technical='PASS_BOUNDED_NATIVE_2X_4X_RA2_SECONDARY_FALLBACK_LIFECYCLE',
              visual='ACTUAL_SIZE_AUTHOR_INSPECTION_COMPLETE_FULL_BATCH_USER_ACCEPTANCE_PENDING',
              runtimeSourceHead=package['runtimeSourceHead'], copiedReceipt=receipt,
              copiedVerification=copied, native=observations, authoring=authoring,
              package=dict(file=str(artifacts / 'package-production-v12c/package-receipt.json'),
                           sha256=sha(artifacts / 'package-production-v12c/package-receipt.json'),
                           resourceStorage=package['resourceStorage'], files=len(package['files'])),
              signature='PASS_DEEP_STRICT_AD_HOC', review=review, embeddedVerification=embedded,
              nativeReview=review_native, ordinaryLaunch=default, mainPreservation=main_state, previews=previews,
              remaining=['Full-production user appearance acceptance', 'Windows native checks and physical cursor/input acceptance'],
              nextScope='After acceptance and separate authorization: consider the native thick-grass LAT closure before water/shore production')
record['diagnostics'] += [dict(stage='first-full-native-4x', status='FAILED_RETAINED',
                                reason='Harness compared native base slope name with a selected original random variant; corrected to native entry.files membership'),
                           dict(stage='first-ra2-command', status='FAILED_RETAINED_BEFORE_MATCH',
                                reason='Command omitted --edition=ra2; explicit map-identity guard rejected the YR default before match start'),
                           dict(stage='first-native-html-review', status='FAILED_RETAINED_AFTER_BOUNDED_STOP',
                                reason='Decode inspection awaited lazy images in a collapsed gallery; exact task-owned Electron child was closed, and inspection now requests eager decoding while preserving user-facing lazy loading')]
Path('docs/m2-1-production-v12.json').write_text(json.dumps(record, indent=2) + '\n')
target = folder / 'V12C-Review-Evidence.json'
assert not target.exists()
target.write_text(json.dumps(record, indent=2) + '\n')
(artifacts / 'production-v12c-delivery-summary.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(dict(status=record['status'], evidence=str(target), nativeRuns=len(observations), main=main_state)))
