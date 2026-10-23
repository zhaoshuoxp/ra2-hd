"""Register each original rubble component without stretching its disconnected microscopic fragments."""
import copy
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
base = Path('.artifacts/m2-4')
receipts = []
for edition in ['ra2', 'yr']:
    root = base / f'urban-edition-buildings-native-batch58-{edition}-v1'
    art = base / f'urban-edition-buildings-authoring-batch58-{edition}-v1'
    source = next(s for s in read(root / 'source.json')['sources'] if s['member'] == 'cgpars11.shp')
    frame = source['frames'][3]
    indices = np.frombuffer((root / 'native' / frame['indexFile']).read_bytes(), np.uint8).reshape(frame['size'][::-1])
    body = (indices != 0) & (indices != 12)
    labels, count = ndimage.label(body)
    areas = np.bincount(labels.ravel())
    areas[0] = 0
    largest = int(areas.argmax())
    ys, xs = np.where(labels == largest)
    bounds = [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)]
    detached = body & (labels != largest)
    dy, dx = np.where(detached)
    assert len(dx) == 7 and max(a for i, a in enumerate(areas) if i and i != largest) == 2
    work = read(art / 'worklist.json')
    jobs = read(art / 'imagegen-jobs-v2.json')
    key = 'cgpars11.shp-003'
    job = copy.deepcopy(next(j for j in jobs['jobs'] if j['slots'] == [key]))
    old_bounds = work['slots'][key]['nativeBounds']
    assert old_bounds == [0, 0, *frame['size']]
    sprite = Image.open(art / (key + '-native.png')).crop(tuple(bounds))
    width, height = 1880, 1254
    scale = min((width - 48) / sprite.width, (height - 48) / sprite.height)
    size = tuple(round(v * scale) for v in sprite.size)
    x, y = (width - size[0]) // 2, (height - size[1]) // 2
    board = Image.new('RGBA', (width, height))
    board.alpha_composite(sprite.resize(size, Image.Resampling.NEAREST), (x, y))
    job['id'] += '-main-component-v3'
    reference = art / (job['id'] + '-reference.png')
    assert not reference.exists()
    board.save(reference)
    job.update(reference=str(reference.resolve()), referenceSha256=sha(reference),
        destination=str((art / (job['id'] + '-master.png')).resolve()),
        minimumReferenceCapacity=scale)
    job['prompt'] = ('Use case: precise-object-edit. Repaint this exact original Red Alert 2 Urban '
        f'{edition.upper()} CAPARS11 rubble main component with resolved masonry, broken metal, roof fragments '
        'and debris detail for genuine independent 2X and 4X game sprites. Preserve its exact native isometric '
        'angle, flat arrangement, silhouette, relative fragment positions, surviving openings, original Iso '
        'palette colors and upper-left light. One full large subject filling the same generous extent on a true '
        'transparent 1880 by 1254 landscape canvas. No new standing structure, ground, shadows, smoke, fire, '
        'extra debris, labels, frames, grid or checkerboard. Keep restrained, coherent material detail. '
        'Do not shrink the subject or substitute enlargement, sharpening or interpolation for new detail. '
        'Only this main component is the edit target; original disconnected microscopic source fragments '
        'are preserved separately at their exact native positions and must not be added to this mother.')
    work['slots'][key].update(board=job['id'] + '-master.png', nativeBounds=bounds,
        nativeFullBodyBounds=old_bounds, referenceRect=[x, y, *size], referenceCapacity=scale)
    work['batches'] = [b for b in work['batches'] if key not in b['slots']]
    work['batches'].append(dict(name=job['id'], group='urban-edition-building', boardSize=[width, height],
        columns=1, rows=1, slots=[key], status='ORIGINAL_MAIN_COMPONENT_GUIDE_ONLY'))
    old_work = art / 'worklist-before-fragment-registration-v2.json'
    with old_work.open('xb') as stream:
        stream.write((art / 'worklist.json').read_bytes())
    (art / 'worklist.json').write_text(json.dumps(work, indent=2) + '\n')
    updated = [job if j['slots'] == [key] else j for j in jobs['jobs']]
    with (art / 'imagegen-jobs-v3.json').open('x') as stream:
        stream.write(json.dumps(dict(jobs, jobs=updated,
            priorJobsSha256=sha(art / 'imagegen-jobs-v2.json')), indent=2) + '\n')
    profile = read(art / 'material-profile-v1.json')
    palette = read(root / 'contract.json')['sources']['cgpars11.shp']['framePalettes']['3']
    declaration = dict(schema='source-pinned-microscopic-rubble-fragments-v1', nativeFrame=3,
        sourceSha256=source['sha256'], indexSha256=frame['indexSha256'], paletteSha256=palette['sha256'],
        authoredMainBounds=bounds, pixels=[[int(px), int(py), int(indices[py, px])] for px, py in zip(dx, dy)],
        policy='Preserve seven original one/two-pixel fragments exactly; no invented shape, removal or claim of new HD detail in these microscopic source cells.')
    profile['nativePreservedFragments'] = {'cgpars11.shp': declaration}
    with (art / 'material-profile-v2.json').open('x') as stream:
        stream.write(json.dumps(profile, indent=2) + '\n')
    receipts.append(dict(edition=edition, sourceSha256=source['sha256'], mainBounds=bounds,
        originalFullBounds=old_bounds, primaryPixels=int(areas[largest]),
        retainedMicroscopicSourcePixels=7, declaration=declaration,
        worklistSha256=sha(art / 'worklist.json'), motherReferenceSha256=sha(reference)))
with (base / 'urban-edition-buildings-batch58-fragment-registration-v3.json').open('x') as stream:
    stream.write(json.dumps(dict(status='PASS_SOURCE_PINNED_COMPONENT_LAYOUT_PREPARED_NOT_COVERAGE',
        cases=receipts, sourceFilesChanged=False, nativeGeometryChanged=False, selectedResourcesChanged=False,
        failureAvoided='Disconnected source pixels enlarge the full native trim; aligning one generated main component to that full trim would stretch and displace rubble materials.'), indent=2) + '\n')
print(json.dumps(dict(status='PASS_ORIGINAL_GEOMETRY_AND_MICROSCOPIC_FRAGMENT_RETENTION_PREPARED', editions=2)))
