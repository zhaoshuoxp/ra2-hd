"""Pin original coastal geometry and true-detail material generation jobs."""
import hashlib
import json
from pathlib import Path


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


for theater, batch in [('NEWURBAN', 74), ('DESERT', 75)]:
    root = Path(f'.artifacts/m2-4/{theater.lower()}-coast-authoring-batch{batch}-v1')
    source = json.loads((root / 'source.json').read_text())
    boards = json.loads((root / 'batches.json').read_text())
    assert len(source['members']) == 92
    jobs = []
    for board in boards:
        reference = root / (board['name'] + '-reference.png')
        if board['setIndex'] in [10, 15]:
            material = ('Preserve the native pale stone retaining-wall masonry, capstones, mortar joints, '
                'concrete panel variants and light gravel paved upper/lower terraces. Keep each wall face '
                'straight with its original vertical height, plane lighting, corner geometry and exact '
                'masonry-to-concrete boundaries. Follow the original green lower waterline staining only '
                'where visible, without adding extra moss or vegetation.') if theater == 'NEWURBAN' else (
                'Preserve the native warm golden-orange sandstone cliffs, vertical erosion layers, dark '
                'recesses, rough ledges, small rock piles and sandy upper/lower terraces. Keep each cliff '
                'height, plane lighting, silhouette and corner geometry. Do not replace these natural '
                'rock formations with masonry, concrete walls, new arches, pillars or exaggerated cracks.')
        else:
            material = ('Preserve the exact original pale golden beach, green shallow-water transition '
                'and deep muted blue-gray sea regions. Keep every shoreline endpoint, direction, sand '
                'tongue, inlet and water coverage in its own source position. Water remains flat with '
                'restrained fine irregular ripples; no large waves, white surf, froth or decorative patterns. '
                'For pure-water cells do not invent land, grass or islands. Preserve only the actual '
                'original rock/reef bodies where the guide contains them, with correct water occlusion.')
        prompt = ('Use case: precise-object-edit. Asset type: reusable Red Alert 2 Yuri Revenge ' + theater +
            ' isometric terrain production master. Image 1 is the exact untouched original geometry and '
            f'color guide. Repaint all {len(board["members"])} occupied cells in exactly '
            f'{board["columns"]} columns and {board["rows"]} rows, left to right then top to bottom. '
            'Keep subjects and all transparent holes inside their own original cells, preserving native '
            'isometric projection, heights, footprints, proportions, facing and source light-dark balance. '
            + material + ' Add genuine fine material, stone, sand and surface detail while preserving '
            'the original forms and colors. Maintain matching material at adjoining edges. Never use '
            'enlarged pixel blocks, interpolation, blur or sharpening as a substitute for authored detail. '
            'Keep the original cell scale and placement, with wide transparent gutters. Leave every unused '
            'cell completely transparent. No added objects, trees, symbols, border, grid, text, labels, '
            'checkerboard, cast shadows outside the source or new extruded diamond sides. Genuinely '
            'transparent background. Target ' + str(max(1536, board['boardSize'][0])) + ' by ' +
            str(max(1536, board['boardSize'][1])) + ' pixels or larger, with real detail for independent '
            '2X and 4X exports.')
        jobs.append(dict(id=board['name'], reference=str(reference.resolve()), referenceSha256=sha(reference),
            destination=str((root / (board['name'] + '-master.png')).resolve()), members=board['members'],
            cellLayout=[board['columns'], board['rows']], boardSize=board['boardSize'],
            nativeSet=board['setIndex'], prompt=prompt))
    with (root / 'imagegen-jobs.json').open('x') as stream:
        stream.write(json.dumps(dict(schema='m2-4-coast-imagegen-jobs-v1',
            sourceSha256=sha(root / 'source.json'), layoutSha256=sha(root / 'layout.json'), jobs=jobs), indent=2) + '\n')
    print(json.dumps(dict(theater=theater, members=92, jobs=len(jobs))))
