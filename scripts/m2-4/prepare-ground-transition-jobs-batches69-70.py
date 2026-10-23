"""Pin original ground-transition guides and built-in imagegen production prompts."""
import hashlib
import json
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


for theater, batch in [('NEWURBAN', 69), ('DESERT', 70)]:
    name = theater.lower()
    root = Path(f'.artifacts/m2-4/{name}-ground-transitions-authoring-batch{batch}-v1')
    source = read(root / 'source.json')
    layout = read(root / 'layout.json')
    boards = read(root / 'batches.json')
    assert source['theater'] == theater and len(source['members']) == 152 and len(boards) == 16
    jobs = []
    for board in boards:
        reference = root / (board['name'] + '-reference.png')
        prompt = ('Use case: precise-object-edit. Asset type: reusable Red Alert 2 ' + theater +
            ' isometric ground tiles and ground material transitions. '
            'Input image: exact untouched original native tile guide; repaint it with true detailed HD material. '
            f'Keep exactly {board["columns"]} columns and {board["rows"]} rows. '
            'Keep these separate subjects in left-to-right top-to-bottom order: ' + ', '.join(board['members']) + '. '
            f'Original native group {board["setIndex"]}: {board["setName"]}. '
            'Follow the exact colors and material regions visible in EACH reference tile. '
            'The legacy group name is not permission to invent grass, sand, red paving or any other material '
            'absent from that specific reference. Preserve all native transition directions, region boundaries, '
            'stone joints, subtle wear, proportions and flat isometric diamonds. '
            'Add restrained natural fine texture and clean continuous material detail inside those same regions. '
            'Keep the original overall light and color balance. Do not invent large decorative cracks, repeated '
            'ornaments, new paving grids, extra stones, vegetation, lane markings, objects, slopes or curb walls. '
            'Do not change a dark region into light paving, or a light region into dark material. '
            'These are flat ground tiles without extruded side faces. No enlarged pixel blocks, sharpening, blur '
            'or interpolation as a substitute for real authored detail. '
            'Keep every diamond centered in its own original cell with wide transparent margins and gutters. '
            'Keep unused reference cells completely transparent. No background, checkerboard, text, labels or borders. '
            f'Target {board["boardSize"][0]} by {board["boardSize"][1]} pixels with enough genuine detail '
            'for independent 2X and 4X exports. Keep neighboring transition materials consistent.')
        jobs.append(dict(id=board['name'], reference=str(reference.resolve()), referenceSha256=sha(reference),
            destination=str((root / (board['name'] + '-master.png')).resolve()),
            members=board['members'], cellLayout=[board['columns'], board['rows']],
            boardSize=board['boardSize'], nativeSet=board['setIndex'], prompt=prompt))
    output = root / 'imagegen-jobs.json'
    with output.open('x') as stream:
        stream.write(json.dumps(dict(schema='m2-4-ground-transition-imagegen-jobs-v1',
            sourceSha256=sha(root / 'source.json'), layoutSha256=sha(root / 'layout.json'),
            jobs=jobs), indent=2) + '\n')
    print(json.dumps(dict(theater=theater, members=len(layout), jobs=len(jobs), file=str(output))))
