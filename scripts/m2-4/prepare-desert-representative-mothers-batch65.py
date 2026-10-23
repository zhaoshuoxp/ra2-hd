"""Pin complete Desert representative guides and built-in generation prompts."""
import hashlib
import json
from pathlib import Path

sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
for kind in ['tmp', 'shp']:
    root = Path(f'.artifacts/m2-4/desert-representative-{kind}-batch65-v1')
    source_file = root / ('batches.json' if kind == 'tmp' else 'worklist.json')
    source = json.loads(source_file.read_text())
    batches = source if kind == 'tmp' else source['batches']
    jobs = []
    for batch in batches:
        reference = root / (batch['name'] + '-reference.png')
        members = batch['members' if kind == 'tmp' else 'slots']
        material = ('Native warm desert sand and compact sandstone dust: muted golden tan, pale ochre and beige. '
            'Quiet fine grains at actual game size, sparse small irregular stones only where shown. Preserve the '
            'original slope planes, upper-left diffuse lighting and separate plane brightness. Do not add grass, '
            'grass tufts, bushes, cracks, ornamental ripples, dunes, mounds, tile bevels or a raised perimeter.')
        if kind == 'tmp' and batch['setIndex'] == 47:
            material = ('Preserve the exact original asphalt roadway, pale concrete shoulders and yellow road marking, '
                'their widths, endpoints and native straight perspective. Reconstruct smooth continuous edges '
                'with fine restrained asphalt and concrete detail. Preserve only original slope plane shading; '
                'do not add new lane stripes, junctions, broken edges, jagged borders, vegetation or a tile bevel.')
        if kind == 'shp':
            material = ('Preserve the exact source desert plant species, canopy or palm-frond anatomy, trunk, '
                'silhouette, leaf grouping and openings. Retain its own original green, dry olive, ochre and brown '
                'regions, saturation and upper-left diffuse light. Add genuine fine leaves, bark and branches '
                'within the original form. No new roots, ground, grass, rocks, snow, cast shadow or different species.')
        prompt = (f'Use case: precise-object-edit. Asset type: reusable Red Alert 2 Yuri Revenge DESERT {kind.upper()} '
            f'production sprite master. Image 1 is the exact original geometry and color guide. Repaint all '
            f'{len(members)} occupied cells in its {batch["columns"]}-column by {batch["rows"]}-row layout, '
            'left-to-right then top-to-bottom. Preserve each guide position, native isometric projection, '
            'proportions, logical shape and spacing. Keep unused cells empty and every subject wholly inside '
            'its cell with generous transparent gutters. Genuinely transparent background; output at least '
            '1254 by 1254 pixels. Reconstruct genuine fine material and shape detail sufficient for independent '
            '2X and 4X exports; no pixel-art blocks, mosaic, blur, sharpened upscale or interpolated detail. '
            + material + ' No text, labels, borders, grid lines, new objects, decorative patterns or artificial shine.')
        jobs.append(dict(id=batch['name'], reference=str(reference.resolve()), referenceSha256=sha(reference),
            destination=str((root / (batch['name'] + '-master.png')).resolve()), members=members,
            cellLayout=[batch['columns'], batch['rows']], boardSize=batch['boardSize'], prompt=prompt))
    record = dict(schema='m2-4-desert-representative-imagegen-jobs-v1', jobs=jobs)
    if kind == 'shp':
        record['worklistSha256'] = sha(source_file)
    with (root / 'imagegen-jobs.json').open('x') as stream:
        stream.write(json.dumps(record, indent=2) + '\n')
    print(json.dumps(dict(kind=kind, jobs=len(jobs))))
