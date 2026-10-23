"""Pin upcoming structures masters, excluding the accepted equivalent water bridge."""
import hashlib
import json
from pathlib import Path


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


materials = {
    19: 'Keep the native pale concrete bridge deck and railings, dark asphalt, yellow centerlines, '
        'white dashed lane marks, brown masonry abutments, original openings and muted blue water. '
        'Keep road edges and lane marks straight, parallel and continuous across every adjoining tile.',
    25: 'Keep the native tiered ramp, original stepped corners, exact sloping upper/lower surfaces '
        'and vertical retaining faces. NEWURBAN uses pale gravel paving, capstones and brown masonry. '
        'DESERT uses golden sand and orange sandstone erosion. Follow only the input theater.',
    115: 'Keep the original warm orange natural cliff and ramp, dark vertical erosion recesses, '
        'green grassy upper/lower terraces and native slope transition. Do not replace it with masonry.',
    117: 'Keep each native pale gravel paved slope and every tiny chipped, cracked and adjoining '
        'variant. Retain the exact original slope illumination and restrained fine irregular material. '
        'No new grid, repeated decorative pattern, raised curbs or extruded sides.',
    119: 'Keep the original two orientations of rusted brown military barricades on green ground, '
        'including every upright, diagonal crossbar, opening and original silhouette. Do not add wire or signs.',
}
for theater, batch, version, count in [('NEWURBAN', 76, 1, 54), ('DESERT', 77, 2, 10)]:
    root = Path(f'.artifacts/m2-4/{theater.lower()}-structures-authoring-batch{batch}-v{version}')
    source = json.loads((root / 'source.json').read_text())
    boards = json.loads((root / 'batches.json').read_text())
    assert len(source['members']) == count
    assert all(member['member'] != 'wbrdge01.des' for member in source['members'])
    jobs = []
    for board in boards:
        reference = root / (board['name'] + '-reference.png')
        prompt = ('Use case: precise-object-edit. Asset type: reusable Red Alert 2 Yuri Revenge '
            + theater + ' isometric terrain production master. Input image is the exact untouched '
            'original geometry and color guide. Repaint all ' + str(len(board['members'])) +
            ' occupied cells in the exact ' + str(board['columns']) + '-column by ' + str(board['rows']) +
            '-row arrangement, left to right and top to bottom. Preserve each footprint, slope, '
            'height, projection, orientation, material region, empty opening and light-dark relationship. '
            + materials[board['setIndex']] + ' Add genuine fine natural material detail without '
            'changing proportions, colors or native geometry. Keep matching adjoining-edge materials '
            'and sharp clean structural lines. Do not copy enlarged pixel blocks or substitute '
            'interpolation, blur or sharpening for authored detail. All subjects must remain inside '
            'their own source cells, with generous transparent gutters. Leave all unused cells '
            'transparent. No added objects, vegetation, ground, symbols, borders, labels or '
            'checkerboard; no extra cast shadow or extruded diamond sides. Genuinely transparent '
            'background. Output at least 1536 by 1536 pixels with enough actual independent detail '
            'for 2X and 4X exports.')
        jobs.append(dict(id=board['name'], reference=str(reference.resolve()), referenceSha256=sha(reference),
            destination=str((root / (board['name'] + '-master.png')).resolve()),
            members=board['members'], cellLayout=[board['columns'], board['rows']],
            boardSize=board['boardSize'], nativeSet=board['setIndex'], prompt=prompt))
    with (root / 'imagegen-jobs.json').open('x') as stream:
        stream.write(json.dumps(dict(schema='m2-4-structures-imagegen-jobs-v1',
            sourceSha256=sha(root / 'source.json'), layoutSha256=sha(root / 'layout.json'),
            requiredExportPolicy='Continuous authored contours and materials; no retail pixel RGB or '
                'staircase-mask restoration. Preserve logical footprint, source numbering, heights and gameplay.',
            status='PREPARED_ONLY_MOTHERS_NOT_GENERATED', jobs=jobs), indent=2) + '\n')
    print(json.dumps(dict(theater=theater, members=count, jobs=len(jobs), selected=False, generated=False)))
