"""Allocate sufficient authored pixels to every original neutral VXL heading."""
import hashlib
import json
from pathlib import Path
import sys
from PIL import Image

base = Path(sys.argv[1]).resolve()
folder = base / 'authoring-vxl'
work = json.loads((folder / 'worklist.json').read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
jobs = []
for board in work['boards']:
    original = Image.open(board['board']).convert('RGBA')
    groups = [list(range(i, i + 2)) for i in range(0, 8, 2)] if board['identity'] == 'CRUISE' else [list(range(8))]
    for group_index, indices in enumerate(groups):
        identity = board['identity']
        columns, rows, size = (2, 1, [3072, 1536]) if identity == 'CRUISE' else (2, 4, [2048, 2048]) if identity == 'PDPLANE' else (4, 2, [2048, 1024])
        cw, ch = size[0] // columns, size[1] // rows
        reference = Image.new('RGBA', size)
        for position, index in enumerate(indices):
            cell = original.crop((index % 4 * 512, index // 4 * 512, (index % 4 + 1) * 512, (index // 4 + 1) * 512))
            bounds = cell.getbbox(); assert bounds
            cell = cell.crop(bounds)
            scale = min((cw - 48) / cell.width, (ch - 48) / cell.height)
            dimensions = tuple(round(n * scale) for n in cell.size)
            x, y = position % columns * cw + (cw - dimensions[0]) // 2, position // columns * ch + (ch - dimensions[1]) // 2
            reference.alpha_composite(cell.resize(dimensions, Image.Resampling.NEAREST), (x, y))
        name = f'{identity.lower()}-headings-{group_index + 1:02d}'
        filename = folder / (name + '-reference.png')
        reference.save(filename)
        headings = [board['frames'][i]['heading'] for i in indices]
        subjects = {'CRUISE': 'the original white cruise ship with green hull stripe, yellow decks, dark glazing and its shown superstructure',
                    'TUG': 'the original compact navy-blue tug with yellow deck, white cabin and red/black smokestack',
                    'PDPLANE': 'the original pale cargo aircraft with its exact wings, engine pods, fuselage, tail and red ownership panels'}
        prompt = ('Use case: precise-object-edit. Asset type: original-bearing-faithful HD strategy-game unit sprite atlas. '
            f'Edit target: this exact native guide, {columns} columns by {rows} rows, occupied row-major headings {headings}. '
            f'Repaint {subjects[identity]} in each cell with fine hand-painted realistic game material detail. '
            'Keep every cell its own original bearing, silhouette, anatomical parts, proportions, openings, native light direction and fixed color scheme. '
            'These are different source views of one identical object. Preserve every frame and keep the whole original body at its exact guide scale/position. '
            'Resolve metal panels, seams, glazing and original mechanical/structural details without redesign. '
            'Do not add weapons, fittings, extra decks, extra engines, logos, lettering, people, flags, smoke, propeller discs or effects absent from the reference. '
            'Keep the original ownership-colored surfaces exactly where shown; preserve fixed green/yellow/blue/red materials elsewhere. '
            'No sea, ground, base platform, cast shadow, outline, halo, background, checkerboard, text, grid or border. '
            'Genuinely transparent gutters and background. No enlarged pixels, sharpening or repeated noise as a substitute for authored detail. '
            f'High-resolution {size[0]} by {size[1]} output, exact layout and occupied cell count; no shrinking, cropping, merging or reordered/duplicated bearings.')
        jobs.append(dict(id=name, identity=identity, part=board['part'], headings=headings, indices=indices, grid=[columns, rows],
            reference=str(filename), referenceSha256=sha(filename), destination=str(folder / (name + '-master.png')), prompt=prompt))
with (base / 'vxl-authoring-jobs-v1.json').open('x') as f:
    json.dump(dict(schema='m3-1-neutral-vxl-original-heading-jobs-v1', jobs=jobs), f, indent=2); f.write('\n')
print(json.dumps(dict(jobs=len(jobs), identities=sorted({j['identity'] for j in jobs}), nativeHeadings=sum(len(j['headings']) for j in jobs))))
