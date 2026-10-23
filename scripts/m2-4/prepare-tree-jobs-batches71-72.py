"""Pin remaining native tree references and independently authored HD mother jobs."""
import hashlib
import json
from pathlib import Path


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


for theater, batch, count in [('NEWURBAN', 71, 23), ('DESERT', 72, 16)]:
    root = Path(f'.artifacts/m2-4/{theater.lower()}-tree-authoring-batch{batch}-v1')
    work_file = root / 'worklist.json'
    work = json.loads(work_file.read_text())
    assert len(work['members']) == count and len(work['slots']) == count
    assert all(row['bodyCount'] == 1 and row['totalNativeSlots'] == 2 for row in work['members'])
    jobs = []
    for board in work['batches']:
        reference = root / (board['name'] + '-reference.png')
        prompt = ('Use case: precise-object-edit. Asset type: reusable Red Alert 2 ' + theater +
            ' isometric tree sprite master. Image 1 is the exact untouched original silhouette and color guide. '
            f'Repaint exactly {len(board["slots"])} occupied cells in the same '
            f'{board["columns"]}-column by {board["rows"]}-row grid, left to right then top to bottom. '
            'Keep each separate tree centered and scaled exactly as its own guide, with generous transparent '
            'margins and gutters. Preserve the original tree species, branch anatomy, trunk location, canopy '
            'shape, leaf groupings, openings and native isometric projection. Match EACH source tree color '
            'faithfully: preserve its green, olive, yellow, dry brown and dark regions and their saturation '
            'instead of recoloring the whole collection. Preserve upper-left diffuse lighting and native '
            'light-dark balance. Add genuinely new fine leaves, needles, bark and branch detail within '
            'those exact forms, suitable for separate 2X and 4X exports. Do not redesign trees, change '
            'species, invent roots or trunks, fill canopy holes, brighten dull trees or darken pale trees. '
            'No ground, grass, rocks, snow, base, cast shadow, extra plants or new objects. '
            'No enlarged pixel blocks, interpolated pixel art, blur or sharpening as a substitute for detail. '
            'All unused cells remain empty. Genuinely transparent background, no text, labels, grid lines, '
            'checkerboard, border or watermark. Output at least 1254 by 1254 pixels.')
        jobs.append(dict(id=board['name'], reference=str(reference.resolve()), referenceSha256=sha(reference),
            destination=str((root / (board['name'] + '-master.png')).resolve()), members=board['slots'],
            cellLayout=[board['columns'], board['rows']], boardSize=board['boardSize'], prompt=prompt))
    for filename, value in [
        ('imagegen-jobs.json', dict(schema='m2-4-native-tree-imagegen-jobs-v1',
            worklistSha256=sha(work_file), jobs=jobs)),
        ('material-profile.json', dict(schema='m2-4-native-tree-tone-v1',
            nativeTreeToneMembers=[row['member'] for row in work['members']], nativeTreeToneStrength=1)),
    ]:
        with (root / filename).open('x') as stream:
            stream.write(json.dumps(value, indent=2) + '\n')
    print(json.dumps(dict(theater=theater, trees=count, jobs=len(jobs))))
