"""Keep accepted slope material and register continuous strokes to target native paint."""
import copy
import hashlib
import json
import os
from pathlib import Path
import numpy as np
from PIL import Image
from newurban_batch93_io import ROOT, GUIDE, assemble, crop, native, pin, read, sha, write
from newurban_slope_paint_batch93 import paint

previous = read(ROOT / 'export-and-preservation-v5.json')
assert read('.local/terrain-newurban-selection.json') == previous['candidate']
accepted = read(ROOT / 'export-and-preservation-v4.json')['candidate']
base = Path('.local/terrain-packs') / previous['candidate']['revision']
revision = 'newurban-m2-4-accepted-road-network-batch93-v6'
destination = Path('.local/terrain-packs') / revision
destination.mkdir(exist_ok=False)
manifest = read(base / 'manifest.json')
group, = [g for g in manifest['groups'] if g['id'] == 'm2-4-newurban-accepted-road-set47']
changed_files = {v['file'] for v in group['variants']}
for file in base.iterdir():
    if file.is_file() and file.name != 'manifest.json' and file.name not in changed_files:
        os.link(file, destination / file.name)
sources = {s['member']: s for s in read(ROOT / 'source.json')['sources']}
export = copy.deepcopy(previous)
records, files = [], []
atlases = {v['density']: np.fromfile(base / v['file'], np.uint8).reshape(*reversed(v['size']), 4).copy()
           for v in group['variants']}
for member in group['members']:
    name = member['member']
    source = sources[name]
    original, low = assemble([(f, native(source, f)) for f in source['images']], 1)
    for density in [2, 4]:
        frames = [(f, crop(accepted, name, f['subTile'], density)) for f in source['images']]
        whole, same_low = assemble(frames, density)
        assert np.array_equal(low, same_low)
        before = np.array(whole)
        result, audit = paint(before, np.array(original), density)
        modified = (result[..., :3] != before[..., :3]).any(2)
        offset = 0
        variant, = [v for v in group['variants'] if v['density'] == density]
        for candidate in group['members']:
            if candidate['member'] == name:
                break
            offset += len(candidate['images'])
        target_record, = [r for r in export['records'] if r['member'] == name]
        target_record.update(donorMember=name, acceptedDonor=accepted,
            correctedPortGeometry='CONTINUOUS_STROKES_REGISTERED_TO_TARGET_NATIVE_2D_PAINT')
        for index, (frame, body) in enumerate(frames):
            x, y = [int(n * density) for n in np.array(frame['origin']) + frame['offset'] - low]
            h, w = body.shape[:2]
            selected = modified[y:y + h, x:x + w] & (body[..., 3] > 0)
            body[..., :3][selected] = result[y:y + h, x:x + w, :3][selected]
            px, py, rw, rh = variant['rects'][offset + index]
            assert (w, h) == (rw, rh)
            atlases[density][py - 2:py + h + 2, px - 2:px + w + 2] = np.pad(body,
                ((2, 2), (2, 2), (0, 0)), mode='edge')
            declaration, = [f for f in target_record['frames'] if f['density'] == density and f['subTile'] == frame['subTile']]
            declaration.update(rgbaSha256=hashlib.sha256(body.tobytes()).hexdigest(),
                policy='TARGET_NATIVE_PROJECTED_CONTINUOUS_PAINT_ACCEPTED_BODY_MATERIAL')
        picture = Image.new('RGBA', whole.size, '#101820')
        picture.alpha_composite(Image.fromarray(result))
        file = ROOT / f'{name}-{density}x-target-paint-v1.png'
        picture.convert('RGB').save(file)
        files.append(pin(file))
        records.append(dict(member=name, density=density, **audit))
for variant in group['variants']:
    file = destination / variant['file']
    with file.open('xb') as stream:
        stream.write(atlases[variant['density']].tobytes())
    variant['sha256'] = sha(file)
manifest['revision'] = revision
write(destination / 'manifest.json', manifest)
candidate = dict(schemaVersion=1, revision=revision, sha256=sha(destination / 'manifest.json'))
proof = ROOT / 'target-projected-slope-paint-v1.json'
write(proof, dict(status='FOUR_NATIVE_PROJECTED_SLOPE_PAINT_CORRECTIONS_NOT_NATIVE_VALIDATED',
    previous=previous['candidate'], acceptedBody=accepted, candidate=candidate, records=records, inspection=files,
    rejectedFullBitmapReuse=pin(ROOT / 'accepted-desert-slope-r2-reuse-v1.json'),
    rootCause='Matching logical rectangles did not establish matching painted projection. Desert R2 line geometry is not compatible with the NewUrban bitmap pose; two original NewUrban rampType values also differ. The renderer publishes original-position billboards, so target native paint anchors are authoritative. Original header/rules/depth are not changed.',
    correction='Keep the accepted v4 NewUrban slope body and curb material. Fit smooth straight paint strokes to the whole target original bitmap, independently rasterize 2X/4X and replace only obsolete paint and its immediate support using accepted asphalt samples. Do not copy original RGB or transplant another theater projection.',
    changedNewSources=4, inheritedNewSources=30, originalMapsModified=False,
    native='NOT_RUN', visual='PENDING', windows='NOT_RUN', m24Complete=False))
export.update(candidate=candidate, status='EXPORTED_TARGET_REGISTERED_CONTINUOUS_SLOPE_PAINT',
    incrementalCorrection=pin(proof), inheritedNativeSourcePaths=30, updatedNativeSourcePaths=4)
write(ROOT / 'export-and-preservation-v6.json', export)
contract = read('desktop/terrain-theater-hd-contracts.json')
assert contract['NEWURBAN'] == previous['candidate']
contract['NEWURBAN'] = candidate
write(ROOT / 'contract-candidate-v3.json', contract)
write(ROOT / 'selection-v3.json', dict(status='TARGET_PAINT_CORRECTION_SELECTED_FOR_NATIVE_CHECK',
    candidate=candidate, previous=previous['candidate'], proof=pin(proof), windows='NOT_RUN', m24Complete=False))
Path('desktop/terrain-theater-hd-contracts.json').write_text(json.dumps(contract, indent=2) + '\n')
Path('.local/terrain-newurban-selection.json').write_text(json.dumps(candidate, indent=2) + '\n')
print(dict(candidate=candidate, changedSources=4, inheritedNewSources=30))
