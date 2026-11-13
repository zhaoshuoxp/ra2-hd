"""Pair exact original dinosaur poses as reference controls without merging native frames."""
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
parser.add_argument('--wide-flat-moving', action='store_true')
args = parser.parse_args()
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
work = json.loads(args.source_worklist.read_text())
family = copy.deepcopy(work['families']['DNOB'])
member, = family['members']
source = json.loads(Path(member['sourceFile']).read_text())
assert source['identity'] == 'DNOB' and source['sha256'] == member['sourceSha256']
required = {row['index'] for row in source['frames'][:source['bodyFrames']] if not row['empty']}
provided = [s['frame'] for batch in member['batches'] for s in batch['samples']]
assert len(provided) == len(required) and set(provided) == required, 'A complete source worklist is required'
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
batches, controls = [], []
cursor = 0
while cursor < len(member['batches']):
    batch = member['batches'][cursor]
    frame = batch['samples'][0]['frame']
    ready_pair = batch['action'] == 'Ready' and 25 <= frame < 48 and frame % 6 in [1, 3]
    walk_pair = batch['action'] == 'Walk' and 48 <= frame < 96 and frame % 2 == 0
    if not ready_pair and not walk_pair:
        batches.append(batch)
        cursor += 1
        continue
    pair = member['batches'][cursor:cursor+2]
    assert len(pair) == 2 and all(len(row['samples']) == 1 and 'selectedArt' not in row for row in pair)
    assert all(row['action'] == batch['action'] for row in pair)
    frames = [row['samples'][0]['frame'] for row in pair]
    assert frames == [frame, frame+1]
    identity = f"dnob-{batch['action'].lower()}-{frame:03d}-{frame+1:03d}-paired"
    directory = args.output/identity
    directory.mkdir()
    reference = directory/'native-poses.png'
    wide = args.wide_flat_moving and walk_pair and any(
        (s['bodyColorBounds'][2]-s['bodyColorBounds'][0]) /
        (s['bodyColorBounds'][3]-s['bodyColorBounds'][1]) > 4
        for row in pair for s in row['samples'])
    board_width, board_height = (1536, 1024) if wide else (1024, 1536)
    row_height = board_height//2
    board = Image.new('RGBA', (board_width, board_height), (65, 82, 73, 255))
    draw = ImageDraw.Draw(board)
    samples, cells = [], []
    for index, row in enumerate(pair):
        original_reference = Path(row['reference'])
        assert sha(original_reference) == row['referenceSha256']
        old, = row['samples']
        native = source['frames'][old['frame']]
        pixels = np.array(native['pixels'], np.uint8).reshape(native['height'], native['width'])
        assert hashlib.sha256(pixels.tobytes()).hexdigest() == native['sha256']
        bounds = Image.fromarray(np.uint8((pixels != 0) & (pixels != 12))*255).getbbox()
        rgba = np.dstack([colors[pixels].astype(np.uint8), np.uint8(pixels != 0)*255])
        image = Image.fromarray(rgba).crop(bounds)
        scale = min((board_width-64)//image.width, (row_height-96)//image.height)
        assert scale >= 4
        enlarged = image.resize((image.width*scale, image.height*scale), Image.Resampling.NEAREST)
        assert np.array_equal(np.asarray(enlarged)[::scale, ::scale], np.asarray(image))
        x = (board_width-enlarged.width)//2
        y = index*row_height+64+(row_height-96-enlarged.height)//2
        board.paste(enlarged, (x, y), enlarged)
        draw.text((22, index*row_height+16), f"FRAME {old['frame']:03d}", font=font, fill='white')
        sample = copy.deepcopy(old)
        sample.update(cell=[0, index*row_height, board_width, row_height],
            contentOrigin=[x, y, x+enlarged.width, y+enlarged.height], referenceScale=scale)
        samples.append(sample)
        cells.append({'frame': old['frame'], 'sourceReference': str(original_reference),
            'sourceReferenceSha256': sha(original_reference), 'sourceIndexedSha256': native['sha256'],
            'sourceRgbaSha256': hashlib.sha256(image.tobytes()).hexdigest(),
            'referenceScale': scale, 'referenceResampling': 'INTEGER_NEAREST_SOURCE_REFERENCE_ONLY',
            'destinationCell': sample['cell'], 'contentOrigin': sample['contentOrigin']})
    board.save(reference)
    prompt = directory/'prompt.txt'
    prompt.write_text('Use case: precise-object-edit. Rebuild exactly the TWO original partially submerged '
        f"Brachiosaurus DNOB {batch['action']} frames {frames}, in ONE column and TWO rows. "
        'The first original pose is the top row, and the next distinct phase is the bottom row. '
        'Every original native phase is mandatory. Preserve each exact source head, neck, back and tail silhouette, '
        'their relative positions, facing, phase, compact head, tiny restrained eye and neutral source mouth detail, '
        'original olive-gray palette, warm gray-green lighting and blue-violet shade. Preserve every separated '
        'above-water component and the intentional transparent underwater omissions in each row. '
        'Do not connect components or invent complete bodies, torso, belly, neck base, legs, feet, water, shore, '
        'waterline, effects, reflections or shadows. Reconstruct smooth clean materials and continuous crisp '
        'antialiased features. Source pixels are design controls only. No large glossy eyes, human expression, '
        'smile, invented teeth, tongue, outline, noise, grain, pixel blocks, blur or sharpening. '
        'Remove frame labels and reference background. Genuinely transparent background, margins, underwater gaps '
        'and a clear horizontal gutter separating the two complete poses. Keep the exact source sheet layout '
        'and author enough native detail for independent4X export.\n')
    batches.append({'id': identity, 'boardSize': [board_width, board_height], 'grid': [1, 2],
        'action': batch['action'], 'samples': samples, 'reference': str(reference.resolve()),
        'referenceSha256': sha(reference), 'prompt': str(prompt.resolve()), 'styles': [],
        'nativeMaximumBodyExtent': max(max(s['bodyColorBounds'][2:]) for s in samples),
        'status': 'AWAITING_AUTHORING', 'originalBatchIds': [row['id'] for row in pair]})
    controls.append({'batch': identity, 'file': str(reference), 'sha256': sha(reference),
        'prompt': str(prompt), 'promptSha256': sha(prompt), 'frames': frames, 'cells': cells,
        'boardSize': [board_width, board_height], 'wideFlatMoving': wide})
    cursor += 2
before = [s['frame'] for b in member['batches'] for s in b['samples']]
after = [s['frame'] for b in batches for s in b['samples']]
assert before == after and len(controls) == 32
assert sum(row['wideFlatMoving'] for row in controls) == (6 if args.wide_flat_moving else 0)
member['batches'] = batches
output = args.output/'worklist.json'
output.write_text(json.dumps({'kind': 'NATIVE_SLOT_AUTHORING_WORKLIST', 'taskId': 'YR_ALL14',
    'runtimeActivation': False, 'sourceWorklist': str(args.source_worklist.resolve()),
    'sourceWorklistSha256': sha(args.source_worklist), 'families': {'DNOB': family},
    'userVisualAcceptance': 'PENDING'}, indent=2)+'\n')
receipt = {'schema': 'yr-original-dinosaur-paired-reference-layout-v1',
    'status': 'PASS_ORIGINAL_INDEXED_REFERENCE_CONTROLS_NO_NATIVE_FRAMES_MERGED',
    'identity': 'DNOB', 'sourceWorklist': str(args.source_worklist),
    'sourceWorklistSha256': sha(args.source_worklist), 'worklist': str(output),
    'worklistSha256': sha(output), 'sourceBodySlots': member['requiredSlots'],
    'nonemptyBodySlots': len(before), 'pairedReferenceBoards': len(controls),
    'wideFlatMovingReferenceBoards': sum(row['wideFlatMoving'] for row in controls), 'controls': controls,
    'nativeFrameOrderGeometrySequenceAndTimingChanged': False,
    'sourceSlotsAndSequenceMembershipUnchanged': True, 'newHdArtwork': 0,
    'selectedResourcesChanged': 0, 'userVisualAcceptance': 'PENDING'}
args.receipt.write_text(json.dumps(receipt, indent=2)+'\n')
print(json.dumps({key: receipt[key] for key in ['status', 'sourceBodySlots', 'pairedReferenceBoards']}))
