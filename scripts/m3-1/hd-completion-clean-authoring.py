"""Prepare immutable clean-finish revisions while retaining the user's accepted units."""
import hashlib
import json
from pathlib import Path
import sys
from PIL import Image

base = Path(sys.argv[1]).resolve()
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
folder = base / 'authoring-shp-clean-r2'
folder.mkdir(exist_ok=False)
work = read(base / 'authoring-shp/worklist.json')
old_jobs = read(base / 'authoring-jobs-v1.json')['jobs']
plans = [(j['id'], j['slots'], j['reference'], base / 'authoring-shp' / (j['id'] + '-master.png'),
          2, 2 if j['id'].startswith('wood') and len(j['slots']) == 4 else 1) for j in old_jobs]

# Lossless cell assembly is a layout reference, never new authored material.
square = Image.open(base / 'authoring-shp/shp-building-2048-2x2-001-master.png').convert('RGBA')
assert square.width == square.height and square.width % 2 == 0
cell = square.width // 2
guide = Image.new('RGBA', (cell * 2, cell))
for column, row in enumerate([0, 1]):
    guide.alpha_composite(square.crop((cell, row * cell, cell * 2, (row + 1) * cell)), (column * cell, 0))
guide_path = folder / 'pentagon-a-damage-rubble-edit-reference.png'
guide.save(guide_path)
plans.insert(1, ('pentagon-a-damage-rubble', ['cuwa2a.shp-001', 'cuwa2a.shp-003'], None, guide_path, 2, 1))

standard = (
    'Preserve the original patterns, design, colors and style as closely as possible. '
    'Reconstruct smooth, clear materials and continuous crisp antialiased lines. '
    'Remove low-resolution grain, blocky color patches, stair steps and jagged edges. '
    'This is a real material redraw, not enlargement, blur, sharpening or an added noise filter. '
    'Keep the original forms, proportions, perspective, lighting, palette, intentional damage and state-specific details. '
    'Use coherent clean hand-painted strategy-game shading, restrained natural wear, smooth tonal surfaces and clearly resolved edges. '
    'No pixel-art finish, gritty speckle, random bright chips, muddy mosaic, exaggerated dirt or texture noise. '
)
jobs = []
work['batches'] = []
for name, keys, native_reference, target, columns, rows in plans:
    dimensions = list(Image.open(target).size)
    cw, ch = dimensions[0] // columns, dimensions[1] // rows
    for i, key in enumerate(keys):
        work['slots'][key].update(board=name + '-master.png', boardSize=dimensions,
            slotRect=[i % columns * cw, i // columns * ch, cw, ch], rejectFluorescentFringe=True)
    work['batches'].append(dict(name=name, group='building' if name.startswith('pentagon') else 'overlay',
        boardSize=dimensions, columns=columns, rows=rows, slots=keys, status='CLEAN_REDRAW_PENDING'))
    finish = (
        'Repaint the brick/stone architecture with long straight continuous cornices, clean window divisions, '
        'subtle coherent roof and wall materials and distinct solid rubble pieces. '
        'Remove the salt-and-pepper gritty surface pattern. Keep the existing broken sliced wings and rubble: '
        'do not fill the missing Pentagon wings, repair intentional damage or invent a whole building. '
        'Keep native occupied bands in their original locations. '
        if name.startswith('pentagon') else
        'Repaint each original plank and beam as a continuous smooth timber member with restrained long wood grain, '
        'clean straight edges, readable warm-brown faces and clean metal straps/bolts. '
        'Remove mottled stone-like chips and gritty speckle; the timber is wood, not bark or gravel. '
        'Keep sparse native rails, posts, gaps, broken members and the exact damage phase. '
        'Do not add piers, ground, water, railings or deck pieces absent from the reference. '
    )
    prompt = (
        'Use case: precise-object-edit. Edit target: the first image, a transparent isometric sprite sheet. '
        f'Layout: {columns} columns by {rows} rows, {len(keys)} subjects in the same row-major order. '
        + standard + finish +
        'Keep every subject at its existing position and scale, filling the same cell with no crop, shrink or reorder. '
        'The second image, when present, is the original design/palette/geometry guide only: ignore its coarse pixel texture. '
        'Replace only material finish and sampling artifacts. Preserve the exact silhouette and openings. '
        'Do not invent design, lettering, borders, shadows, base platforms, effects, checkerboard or colored edge halos. '
        'Preserve genuine transparency and all gutters. Output a high-resolution image with the same aspect ratio and layout.'
    )
    references = [str(target)] + ([str(native_reference)] if native_reference else [])
    jobs.append(dict(id=name, kind='shp', slots=keys, grid=[columns, rows], references=references,
        referenceSha256s=[sha(Path(p)) for p in references], prompt=prompt,
        destination=str(folder / (name + '-master.png'))))
(folder / 'worklist.json').write_text(json.dumps(work, indent=2) + '\n')

vxl_folder = base / 'authoring-vxl-clean-r2'
vxl_folder.mkdir(exist_ok=False)
for j in read(base / 'vxl-authoring-jobs-v1.json')['jobs']:
    if j['identity'] != 'CRUISE':
        continue
    target = Path(j['destination'])
    references = [str(target), j['reference']]
    prompt = (
        'Use case: precise-object-edit. Edit target is the first transparent cruise-ship sprite sheet, '
        f'two columns, one row, original headings {j["headings"]}. ' + standard +
        'Keep the white hull, original green stripe, yellow decks, blue/dark glazing and original superstructure. '
        'Repaint smooth painted metal panels and decks, continuous rail/seam lines and clean glazing. '
        'Remove square gray blotches and patchy speckled panel shading. '
        'Keep all views exactly at their existing bearings, silhouettes, scale and cell positions. '
        'The second image is the original design/palette/geometry guide only, not a pixel-art finish target. '
        'Do not add decks, weapons, equipment, ornaments, lettering, people, flags, water, shadows, effects, '
        'checkerboard or edge halos. Genuinely transparent background and gutters. '
        'Output high resolution at the same aspect ratio and exact two-view layout.'
    )
    jobs.append(dict(id=j['id'], kind='vxl', identity='CRUISE', headings=j['headings'], indices=j['indices'],
        grid=j['grid'], references=references, referenceSha256s=[sha(Path(p)) for p in references], prompt=prompt,
        destination=str(vxl_folder / (j['id'] + '-master.png'))))

with (base / 'clean-authoring-jobs-r2.json').open('x') as f:
    json.dump(dict(schema='m3-1-clean-finish-authoring-r2', standard='docs/hd-art-standard.md',
        mode='built-in-imagegen', userRetained=['TUG', 'PDPLANE'], jobs=jobs), f, indent=2)
    f.write('\n')
print(json.dumps(dict(jobs=len(jobs), shpFrames=len(work['slots']), retainedUnits=['TUG', 'PDPLANE'])))
