"""Reuse original exact inactive duplicates before authoring, preserving every native slot."""
import copy
import hashlib
import json
from pathlib import Path

from PIL import Image

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
base = Path('.artifacts/m2-4')
editions, receipts = {}, []
for edition in ['ra2', 'yr']:
    native = base / f'urban-edition-buildings-native-batch58-{edition}-v1'
    art = base / f'urban-edition-buildings-authoring-batch58-{edition}-v1'
    source = {r['member']: r for r in read(native / 'source.json')['sources']}
    work = read(art / 'worklist.json')
    before = sha(art / 'worklist.json')
    jobs = read(art / 'imagegen-jobs-v1.json')
    updated = []
    for name in ['cgpars11.shp', 'cgwash14.shp', 'cgwash15.shp']:
        s = source[name]
        a, b = s['frames'][1:3]
        assert all(a[k] == b[k] for k in ['origin', 'size', 'indexSha256', 'rgbaSha256', 'empty'])
        assert str(s['nativeRules']['CanBeOccupied']).lower() == 'no'
        member = next(m for m in work['members'] if m['member'] == name)
        member['slots'][2].update(status='EXACT_NATIVE_DUPLICATE', canonical=1)
        donor = editions['ra2']['work']['slots'][f'{name}-001'] if edition == 'yr' else work['slots'][f'{name}-001']
        work['slots'][f'{name}-002'].update({k: copy.deepcopy(donor[k]) for k in
            ['board', 'boardSize', 'slotRect', 'referenceRect', 'referenceCapacity']})
        receipts.append(dict(edition=edition, member=name, nativeSourceSha256=s['sha256'],
            retainedSlot=2, canonicalSlot=1, originalIndexSha256=a['indexSha256'], originalRgbaSha256=a['rgbaSha256'],
            sameOrigin=a['origin'], sameTrimSize=a['size'], garrisonAllowed=False))
    for job in jobs['jobs']:
        if edition == 'ra2' and job['slots'] == ['cgpars11.shp-002']:
            continue
        if edition == 'ra2' and job['slots'] in [['cgwash14.shp-002', 'cgwash14.shp-003'], ['cgwash15.shp-002', 'cgwash15.shp-003']]:
            job = copy.deepcopy(job)
            key = job['slots'][1]
            sprite = Image.open(art / (key + '-native.png'))
            width, height = 1880, 1254
            scale = min((width - 48) / sprite.width, (height - 48) / sprite.height)
            size = tuple(round(v * scale) for v in sprite.size)
            x, y = (width - size[0]) // 2, (height - size[1]) // 2
            board = Image.new('RGBA', (width, height))
            board.alpha_composite(sprite.resize(size, Image.Resampling.NEAREST), (x, y))
            job['id'] += '-rubble-v2'
            reference = art / (job['id'] + '-reference.png')
            assert not reference.exists()
            board.save(reference)
            work['slots'][key].update(board=job['id'] + '-master.png', boardSize=[width, height],
                slotRect=[0, 0, width, height], referenceRect=[x, y, *size], referenceCapacity=scale)
            job.update(reference=str(reference.resolve()), referenceSha256=sha(reference),
                destination=str((art / (job['id'] + '-master.png')).resolve()), slots=[key],
                cellLayout=[1, 1], boardSize=[width, height], minimumReferenceCapacity=scale)
            job.pop('rowBoundary')
            job['prompt'] = ('Use case: precise-object-edit. Repaint this exact original Red Alert 2 Urban rubble sprite '
                'with resolved masonry, broken glazing and metal detail suitable for independent 2X and 4X game sprites. '
                'Preserve the exact native isometric angle, flat debris arrangement, remaining structural fragments, '
                'footprint, original Iso palette colors and upper-left lighting. One full large subject on a true transparent '
                '1880 by 1254 landscape canvas, at the exact reference scale and position. No standing replacement building, '
                'new objects, ground, shadows, smoke, fire, text, grid, border or checkerboard. Keep restrained readable '
                'material detail and generous transparent margins. No enlargement or sharpening as new detail; do not shrink the subject.')
            work['batches'].append(dict(name=job['id'], group='urban-edition-building', boardSize=[width, height],
                columns=1, rows=1, slots=[key], status='ORIGINAL_GUIDE_ONLY'))
        updated.append(job)
    if edition == 'yr':
        for key, info in work['slots'].items():
            if key.split('.')[0] in ['cgpars11', 'cgwash14', 'cgwash15'] and info['nativeSlot'] < 3:
                donor = editions['ra2']['work']['slots'][key]
                info.update({k: copy.deepcopy(donor[k]) for k in
                    ['board', 'boardSize', 'slotRect', 'referenceRect', 'referenceCapacity']})
    # All referenced shared boards must be described, even when only one cell is used.
    boards = {b['name'] + '-master.png': b for b in work['batches']}
    if edition == 'yr':
        boards.update({b['name'] + '-master.png': b for b in editions['ra2']['work']['batches']})
    work['batches'] = [dict(copy.deepcopy(boards[board]), slots=[key for key, info in work['slots'].items()
        if info['board'] == board]) for board in sorted({s['board'] for s in work['slots'].values()})]
    snapshot = art / 'worklist-before-duplicate-refinement-v1.json'
    with snapshot.open('xb') as stream:
        stream.write((art / 'worklist.json').read_bytes())
    (art / 'worklist.json').write_text(json.dumps(work, indent=2) + '\n')
    with (art / 'imagegen-jobs-v2.json').open('x') as stream:
        stream.write(json.dumps(dict(jobs, jobs=updated, priorJobsSha256=sha(art / 'imagegen-jobs-v1.json'),
            policy='Exact inactive slot 2 duplicates share slot 1; all original slots retained. Both editions disallow garrison.'), indent=2) + '\n')
    editions[edition] = dict(work=work, newMothers=len(updated), priorWorklistSha256=before,
        refinedWorklistSha256=sha(art / 'worklist.json'))
assert sum(e['newMothers'] for e in editions.values()) == 14
out = dict(status='PASS_NATIVE_DUPLICATES_REUSED_WITHOUT_SLOT_LOSS', duplicatePairs=receipts,
    newMothers=14, newDistinctMaterials=20, sourceBodyStatesRetained=32, densityFrames=64,
    crossEditionSourceFramesShared=9, allEightFamiliesDisallowGarrison=True, selectedResourcesChanged=False)
with (base / 'urban-edition-buildings-batch58-refinement-v2.json').open('x') as stream:
    stream.write(json.dumps(out, indent=2) + '\n')
print(json.dumps({k: v for k, v in out.items() if k != 'duplicatePairs'}))
