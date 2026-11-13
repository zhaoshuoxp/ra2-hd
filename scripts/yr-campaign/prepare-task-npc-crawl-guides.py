"""Group original prone/crawl reference cells without resampling or merging native frames."""
import argparse
import copy
import hashlib
import json
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('identity', choices=['RMNV', 'PENTGEN'])
parser.add_argument('source_worklist', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('receipt', type=Path)
args = parser.parse_args()
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
work = json.loads(args.source_worklist.read_text())
family = copy.deepcopy(work['families'][args.identity])
member, = family['members']
assert not args.receipt.exists()
args.output.mkdir(parents=True, exist_ok=False)
batches, controls = [], []
cursor = 0
while cursor < len(member['batches']):
    prone = member['batches'][cursor]
    if prone['action'] != 'Prone':
        batches.append(prone)
        cursor += 1
        continue
    crawl = member['batches'][cursor+1]
    assert crawl['action'] == 'Crawl' and len(prone['samples']) == 1 and len(crawl['samples']) == 5
    frames = [s['frame'] for batch in [prone, crawl] for s in batch['samples']]
    assert frames == list(range(frames[0], frames[0]+6))
    identity = args.identity.lower()+f'-prone-crawl-{frames[0]:03d}-{frames[-1]:03d}'
    directory = args.output/identity
    directory.mkdir()
    reference = directory/'native-poses.png'
    board = Image.new('RGBA', (1536, 1024), (65, 82, 73, 255))
    samples, cells = [], []
    for batch in [prone, crawl]:
        source_file = Path(batch['reference'])
        assert sha(source_file) == batch['referenceSha256']
        source = Image.open(source_file).convert('RGBA')
        assert source.size == tuple(batch['boardSize'])
        for old in batch['samples']:
            sample = copy.deepcopy(old)
            x, y, width, height = old['cell']
            assert [width, height] == [512, 512]
            image = source.crop((x, y, x+width, y+height))
            index = len(samples)
            nx, ny = index%3*512, index//3*512
            board.paste(image, (nx, ny))
            sample['cell'] = [nx, ny, width, height]
            sample['contentOrigin'] = [value+(nx-x if axis%2 == 0 else ny-y)
                for axis, value in enumerate(old['contentOrigin'])]
            samples.append(sample)
            cells.append({'frame': old['frame'], 'source': str(source_file),
                'sourceSha256': sha(source_file), 'sourceCell': old['cell'], 'destinationCell': sample['cell'],
                'rgbaSha256': hashlib.sha256(image.tobytes()).hexdigest()})
    board.save(reference)
    # Re-read the saved guide and prove every original cell is byte-identical.
    saved = Image.open(reference).convert('RGBA')
    for cell in cells:
        x, y, width, height = cell['destinationCell']
        assert hashlib.sha256(saved.crop((x,y,x+width,y+height)).tobytes()).hexdigest() == cell['rgbaSha256']
    prompt = directory/'prompt.txt'
    prompt.write_text(f'Use case: precise-object-edit. Rebuild the exact original {args.identity} '
        f'Prone/Crawl frames {frames} in precisely three columns and two rows. '
        'All six original source cells are mandatory in reading order. The first is the original prone stance; '
        'the other five are distinct crawling phases in the same original facing. '
        'Preserve each head, cap, hand, elbow, torso, hip, knee and boot position, original uniform, red ownership regions, '
        'palette, lighting, elevated game camera and body proportions. Preserve the exact source body angle, foreshortening, folded limbs and ground contacts. '
        'Use the source geometry in every cell; do not infer a generic pose from the sequence names. '
        'Do not substitute generic Ready or walking poses. Reconstruct clean continuous materials and crisp antialiased features; '
        'original pixels control design only. Remove labels and black ground/shadow patches; no floor, cast shadows, halo, '
        'grain, blur, sharpening, text, weapons, new accessories or invented effects. Exactly six fully contained subjects on '
        'a genuinely transparent background with transparent gutters.\n')
    batches.append({'id': identity, 'boardSize': [1536,1024], 'grid': [3,2], 'action': 'Prone/Crawl',
        'samples': samples, 'reference': str(reference.resolve()), 'referenceSha256': sha(reference),
        'prompt': str(prompt.resolve()), 'styles': [], 'nativeMaximumBodyExtent':
            max(prone['nativeMaximumBodyExtent'], crawl['nativeMaximumBodyExtent']),
        'status': 'AWAITING_AUTHORING', 'originalBatchIds': [prone['id'],crawl['id']]})
    controls.append({'batch': identity, 'file': str(reference), 'sha256': sha(reference),
        'prompt': str(prompt), 'promptSha256': sha(prompt), 'cells': cells})
    cursor += 2
assert len(controls) == 8
assert sorted(s['frame'] for b in batches for s in b['samples']) == list(range(member['requiredSlots']))
member['batches'] = batches
output = args.output/'worklist.json'
output.write_text(json.dumps({'kind': 'NATIVE_SLOT_AUTHORING_WORKLIST', 'taskId': 'YR_ALL14',
    'runtimeActivation': False, 'sourceWorklist': str(args.source_worklist.resolve()),
    'sourceWorklistSha256': sha(args.source_worklist), 'families': {args.identity: family},
    'userVisualAcceptance': 'PENDING'}, indent=2)+'\n')
receipt = {'schema': 'yr-original-prone-crawl-reference-layout-v1',
    'status': 'PASS_ORIGINAL_REFERENCE_CELLS_BYTE_IDENTICAL_NO_NATIVE_FRAMES_MERGED',
    'identity': args.identity, 'sourceWorklist': str(args.source_worklist),
    'sourceWorklistSha256': sha(args.source_worklist), 'worklist': str(output), 'worklistSha256': sha(output),
    'sourceBodySlots': member['requiredSlots'], 'groupedReferenceBoards': 8, 'distinctProneCrawlSlots': 48,
    'nativeFrameOrderGeometrySequenceAndTimingChanged': False, 'controls': controls,
    'postureAuthority': 'Original source cells control body angle, foreshortening and limb contacts independently in every facing and phase.',
    'newHdArtwork': 0, 'selectedResourcesChanged': 0, 'userVisualAcceptance': 'PENDING'}
args.receipt.write_text(json.dumps(receipt, indent=2)+'\n')
print(json.dumps({key: receipt[key] for key in ['status','sourceBodySlots','groupedReferenceBoards','distinctProneCrawlSlots']}))
