"""Arrange exact original dinosaur action references without changing native slots or HD art."""
import argparse
import copy
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source_worklist', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('receipt', type=Path)
parser.add_argument('--wide-actions', action='store_true',
    help='Give the widest single action phases more real authored sampling room.')
args = parser.parse_args()
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
work = json.loads(args.source_worklist.read_text())
family = copy.deepcopy(work['families']['DNOB'])
member, = family['members']
source = json.loads(Path(member['sourceFile']).read_text())
assert source['identity'] == 'DNOB' and source['sha256'] == member['sourceSha256']
before = [s['frame'] for b in member['batches'] for s in b['samples']]
required = {f['index'] for f in source['frames'][:source['bodyFrames']] if not f['empty']}
assert len(before) == len(required) and set(before) == required
original = Path(source['originalGuide']['file'])
assert sha(original) == source['originalGuide']['sha256']
assert sha(original.parent/'native'/source['member']) == source['sha256']
palette = original.parent/'native'/source['paletteIdentity']['member']
assert sha(palette) == source['paletteIdentity']['sha256']
colors = np.frombuffer(palette.read_bytes(), np.uint8).reshape(256, 3).astype(int)*4
assert colors.tolist() == source['palette']
assert not args.receipt.exists()
args.output.mkdir(parents=True, exist_ok=False)
font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 28)


def native_image(batch):
    reference = Path(batch['reference'])
    assert sha(reference) == batch['referenceSha256']
    old, = batch['samples']
    native = source['frames'][old['frame']]
    pixels = np.array(native['pixels'], np.uint8).reshape(native['height'], native['width'])
    assert hashlib.sha256(pixels.tobytes()).hexdigest() == native['sha256']
    bounds = Image.fromarray(np.uint8((pixels != 0) & (pixels != 12))*255).getbbox()
    assert list(bounds) == old['bodyColorBounds']
    rgba = np.dstack([colors[pixels].astype(np.uint8), np.uint8(pixels != 0)*255])
    return Image.fromarray(rgba).crop(bounds), native


def layout(rows):
    candidates = []
    sizes = [(1536, 1024), (1024, 1536)]
    if args.wide_actions and len(rows) == 1 and rows[0][0].width >= 294:
        sizes.append((2048, 1024))
    for width, height in sizes:
        scales = [min((width-64)//image.width, (height//len(rows)-96)//image.height)
            for image, _ in rows]
        candidates.append((min(scales), width, height))
    return max(candidates)


actions = {'Idle1', 'Idle2', 'Die1', 'Die2'}
batches, controls = [], []
cursor = 0
while cursor < len(member['batches']):
    batch = member['batches'][cursor]
    if batch['action'] not in actions:
        batches.append(batch)
        cursor += 1
        continue
    assert len(batch['samples']) == 1 and 'selectedArt' not in batch
    group, images = [batch], [native_image(batch)]
    if cursor+1 < len(member['batches']):
        following = member['batches'][cursor+1]
        if (following['action'] == batch['action'] and len(following['samples']) == 1
                and following['samples'][0]['frame'] == batch['samples'][0]['frame']+1):
            pair = images+[native_image(following)]
            if layout(pair)[0] >= 5:
                group.append(following)
                images = pair
    scale_floor, width, height = layout(images)
    assert scale_floor >= 4, 'Source reference requires a larger native canvas'
    frames = [row['samples'][0]['frame'] for row in group]
    identity = f"dnob-{batch['action'].lower()}-{frames[0]:03d}-{frames[-1]:03d}"
    if len(group) == 2:
        identity += '-paired'
    directory = args.output/identity
    directory.mkdir()
    reference = directory/'native-poses.png'
    board = Image.new('RGBA', (width, height), (65, 82, 73, 255))
    draw = ImageDraw.Draw(board)
    row_height = height//len(group)
    samples, cells = [], []
    for index, (row, (image, native)) in enumerate(zip(group, images)):
        old, = row['samples']
        scale = min((width-64)//image.width, (row_height-96)//image.height)
        enlarged = image.resize((image.width*scale, image.height*scale), Image.Resampling.NEAREST)
        assert np.array_equal(np.asarray(enlarged)[::scale, ::scale], np.asarray(image))
        x = (width-enlarged.width)//2
        y = index*row_height+64+(row_height-96-enlarged.height)//2
        board.paste(enlarged, (x, y), enlarged)
        draw.text((22, index*row_height+16), f"FRAME {old['frame']:03d}", font=font, fill='white')
        sample = copy.deepcopy(old)
        sample.update(cell=[0, index*row_height, width, row_height],
            contentOrigin=[x, y, x+enlarged.width, y+enlarged.height], referenceScale=scale)
        samples.append(sample)
        cells.append({'frame': old['frame'], 'sourceReference': row['reference'],
            'sourceReferenceSha256': row['referenceSha256'], 'sourceIndexedSha256': native['sha256'],
            'sourceRgbaSha256': hashlib.sha256(image.tobytes()).hexdigest(),
            'referenceScale': scale, 'referenceResampling': 'INTEGER_NEAREST_SOURCE_REFERENCE_ONLY',
            'destinationCell': sample['cell'], 'contentOrigin': sample['contentOrigin']})
    board.save(reference)
    prompt = directory/'prompt.txt'
    prompt.write_text('Use case: precise-object-edit. Faithfully reconstruct the exact original partially '
        f"submerged Brachiosaurus DNOB {batch['action']} native frames {frames}, in ONE column and "
        f'{len(group)} row(s), in the same order. Each row is one distinct original animation phase. '
        'Preserve every exact original visible component, its silhouette, placement and size relative to the '
        'other components, head visibility, neck curve, back and tail, original mouth state and tiny eye/glint. '
        'Preserve the original cyan ripple rings/arcs, splashes, detached tail segments and their exact phases '
        'where present in that source row. Do not add any component or effect absent from that source row. '
        'Preserve original underwater gaps, omissions and component separation. Do not invent a complete body, '
        'belly, legs, feet, scenery, water surface, shore, reflections or shadows. Keep the original olive-gray '
        'skin, warm gray-green highlights, blue-violet shade and cyan effect colors. Rebuild clean smooth '
        'materials and continuous crisp antialiased contours, folds and effect lines. The original pixels are '
        'design and phase controls only. No enlarged source pixels, pixel blocks, grain, noise, blur, sharpening, '
        'thick outline, cartoon redesign, large glossy eyes, human expression or invented teeth/tongue. '
        'Remove reference labels and background. Use genuine transparency for the entire background, margins, '
        'underwater gaps and row gutters. Preserve the reference layout and leave ample margins. Author enough '
        'real detail for independent4X export with no upscaling.\n')
    batches.append({'id': identity, 'boardSize': [width, height], 'grid': [1, len(group)],
        'action': batch['action'], 'samples': samples, 'reference': str(reference.resolve()),
        'referenceSha256': sha(reference), 'prompt': str(prompt.resolve()), 'styles': [],
        'nativeMaximumBodyExtent': max(max(image.size) for image, _ in images),
        'status': 'AWAITING_AUTHORING', 'originalBatchIds': [row['id'] for row in group]})
    controls.append({'batch': identity, 'file': str(reference), 'sha256': sha(reference),
        'prompt': str(prompt), 'promptSha256': sha(prompt), 'frames': frames, 'cells': cells,
        'boardSize': [width, height], 'minimumIntegerReferenceScale': scale_floor})
    cursor += len(group)
after = [s['frame'] for b in batches for s in b['samples']]
assert before == after
assert sum(len(c['frames']) for c in controls) == 151
member['batches'] = batches
output = args.output/'worklist.json'
output.write_text(json.dumps({'kind': 'NATIVE_SLOT_AUTHORING_WORKLIST', 'taskId': 'YR_ALL14',
    'runtimeActivation': False, 'sourceWorklist': str(args.source_worklist.resolve()),
    'sourceWorklistSha256': sha(args.source_worklist), 'families': {'DNOB': family},
    'userVisualAcceptance': 'PENDING'}, indent=2)+'\n')
receipt = {'schema': 'yr-original-dinosaur-action-reference-layout-v1',
    'status': 'PASS_ORIGINAL_INDEXED_REFERENCE_CONTROLS_NO_NATIVE_FRAMES_MERGED',
    'identity': 'DNOB', 'sourceWorklist': str(args.source_worklist),
    'sourceWorklistSha256': sha(args.source_worklist), 'worklist': str(output),
    'worklistSha256': sha(output), 'sourceBodySlots': member['requiredSlots'],
    'nonemptyBodySlots': len(before), 'actionReferenceBoards': len(controls), 'controls': controls,
    'wideActionReferenceBoards': sum(c['boardSize'] == [2048, 1024] for c in controls),
    'nativeFrameOrderGeometrySequenceAndTimingChanged': False,
    'sourceSlotsAndSequenceMembershipUnchanged': True, 'newHdArtwork': 0,
    'selectedResourcesChanged': 0, 'userVisualAcceptance': 'PENDING'}
args.receipt.write_text(json.dumps(receipt, indent=2)+'\n')
print(json.dumps({key: receipt[key] for key in ['status', 'sourceBodySlots', 'actionReferenceBoards']}))
