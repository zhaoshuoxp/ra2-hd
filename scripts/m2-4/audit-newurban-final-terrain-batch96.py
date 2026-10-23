"""Diagnose remaining canvas differences without selecting or crediting new artwork."""
import hashlib
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from newurban_batch95_io import crop, pin, read, register_canvas, write

ROOT = Path('.artifacts/m2-4/newurban-final-terrain-reuse-batch96-20261021')
PRIOR = Path('.artifacts/m2-4/newurban-remaining-terrain-reuse-batch95-20261021')
GUIDE = Path('.artifacts/m2-4/newurban-native-v1')
ROOT.mkdir(exist_ok=True)
selector = read('.local/terrain-newurban-selection.json')
assert selector == read(PRIOR / 'export-and-preservation-v4.json')['candidate']
source = {s['member']: s for s in read(GUIDE / 'source.json')['sources']}
donors = {(s['theater'], s['member']): s for s in
          read(PRIOR / 'accepted-native-donors-v1/source.json')['sources']}
remaining = [r for r in read(PRIOR / 'inventory-reconciliation-v1.json')['remainingGaps'] if r['kind'] == 'tmp']
assert len(remaining) == 21
rows, previews = [], []
for gap in remaining:
    target = source[gap['member']]
    donor = donors.get(('URBAN', gap['member'].replace('.ubn', '.urb')))
    if donor is None:
        donor = donors.get(('TEMPERATE', gap['member'].replace('.ubn', '.tem')))
    if donor is None:
        rows.append(dict(member=gap['member'], status='NO_SELECTED_SAME_NAME_URBAN_OR_TEMPERATE_DONOR',
            newArtRequired='NOT_DETERMINED_BY_THIS_AUDIT'))
        continue
    differences = []
    pairs = []
    alpha_differences = pixels = 0
    compatible = len(target['images']) == len(donor['images'])
    for a, b in zip(target['images'], donor['images']):
        if a['nativeOffset'] <= 0:
            continue
        different = {k: [a[k], b[k]] for k in ['grid', 'origin', 'height', 'rampType', 'logical',
            'offset', 'hasExtraData', 'hasZData'] if a[k] != b[k]}
        if different:
            differences.append(dict(slot=a['subTile'], fields=different))
        compatible &= not any(k in different for k in ['grid', 'origin', 'height', 'rampType', 'hasZData'])
        p = np.fromfile(GUIDE / 'native' / a['file'], np.uint8).reshape(*reversed(a['size']), 4)
        q = np.fromfile(b['file'], np.uint8).reshape(*reversed(b['size']), 4)
        q = register_canvas(q, a, b, 1)
        overlap = (p[..., 3] > 0) & (q[..., 3] > 0)
        pairs.append((p[overlap, :3].astype(float), q[overlap, :3].astype(float)))
        alpha_differences += int((p[..., 3] != q[..., 3]).sum())
        pixels += int((p[..., 3] > 0).sum())
    left = np.concatenate([a for a, b in pairs])
    right = np.concatenate([b for a, b in pairs])
    corr = float(np.corrcoef(left.mean(1), right.mean(1))[0, 1])
    result = dict(member=gap['member'], donorMember=donor['member'], donorTheater=donor['theater'],
        donorPack=donor['pointer'],
        sourceSha256=target['sha256'], donorOriginal=donor['original'],
        localGeometryCompatibleExceptCanvas=bool(compatible), metadataDifferences=differences,
        originalLuminanceCorrelation=corr, originalRgbRmse=float(np.sqrt(((left - right)**2).mean())),
        nativeAlphaDifferentCells=alpha_differences, targetVisibleCells=pixels,
        status='READ_ONLY_LOCAL_CANVAS_AND_MATERIAL_SCREEN',
        newArtRequired='NOT_DETERMINED_BY_CORRELATION_OR_CANVAS_ALONE')
    rows.append(result)
    if compatible and corr > .95 and not gap['member'].startswith('prslpe'):
        previews.append(gap['member'])
write(ROOT / 'candidate-screen-v2.json', dict(status='READ_ONLY_NO_NEW_SELECTION_OR_COVERAGE',
    baseline=selector, inventory=pin(PRIOR / 'inventory-reconciliation-v1.json'),
    acceptedDonors=pin(PRIOR / 'accepted-native-donors-v1/source.json'), originalGuide=pin(GUIDE / 'source.json'),
    priorUserReview='BATCH95_PENDING_REVIEW_ISSUED_SEPARATELY', members=len(rows), rows=rows,
    followupLocalCanvasCandidates=previews,
    policy='Inspect actual complete defining surfaces, target coverage, native depth and contacts before reuse. Correlation is screening evidence only. No source, selector, runtime, map, budget or authored coverage count changes.',
    windows='NOT_RUN', m24Complete=False))
assert read('.local/terrain-newurban-selection.json') == selector
print(dict(status='READ_ONLY_21_REMAINING_TERRAIN_MEMBERS', localCanvasCandidates=previews,
    rows=[dict(member=r['member'], compatible=r.get('localGeometryCompatibleExceptCanvas'),
        correlation=round(r.get('originalLuminanceCorrelation', 0), 4)) for r in rows]))
