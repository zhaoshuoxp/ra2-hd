"""Share an identical original rubble slot and prepare one final unique source study."""
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image

ART = Path('.artifacts/m2-4/newurban-building-rubble-authoring-batch87-v1')
ROOT = Path('.artifacts/m2-4/newurban-building-rubble-native-batch87-v1')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
source = {s['member']: s for s in read(ROOT / 'source.json')['sources']}
a, b = source['cnnewy06.shp'], source['cnnewy08.shp']
assert a['frames'][3]['indexSha256'] == b['frames'][3]['indexSha256']
assert a['frames'][3]['size'] == b['frames'][3]['size']
contract = read(ROOT / 'contract.json')
assert contract['sources']['cnnewy06.shp']['framePalettes']['3'] == contract['sources']['cnnewy08.shp']['framePalettes']['3']
profile = read(ART / 'material-profile-v1.json')
profile['sharedNativeRubbleFrames'] = {'cnnewy08.shp': dict(canonicalMember='cnnewy06.shp',
    sourceSha256=b['sha256'], canonicalSourceSha256=a['sha256'], indexSha256=a['frames'][3]['indexSha256'],
    paletteSha256=contract['sources']['cnnewy06.shp']['framePalettes']['3']['sha256'])}
shutil.copyfile(ART / 'worklist.json', ART / 'worklist-before-rubble-reuse-v2.json')
work = read(ART / 'worklist.json')
work['slots']['cnnewy08.shp-003']['sharedRubbleCanonical'] = 'cnnewy06.shp-003'
key, name = 'cnwash08.shp-003', 'cnwash08-rubble-single-v2'
sprite = Image.open(ART / (key + '-native.png')).convert('RGBA')
scale = min(1440 / sprite.width, 928 / sprite.height)
size = tuple(round(n * scale) for n in sprite.size)
x, y = (1536 - size[0]) // 2, (1024 - size[1]) // 2
board = Image.new('RGBA', (1536, 1024))
board.alpha_composite(sprite.resize(size, Image.Resampling.NEAREST), (x, y))
reference = ART / (name + '-reference.png')
board.save(reference)
work['slots'][key].update(board=name + '-master.png', boardSize=[1536, 1024], slotRect=[0, 0, 1536, 1024],
    referenceRect=[x, y, *size], referenceCapacity=scale, occupied=1)
work['batches'] = [b for b in work['batches'] if b['name'] != 'newurban-rubble-1x2-10']
work['batches'].append(dict(name=name, group='newurban-rubble', boardSize=[1536, 1024], columns=1, rows=1,
    slots=[key], status='ORIGINAL_SOURCE_GUIDE_ONLY'))
work['runtimeAcceptance'] = 'UNSELECTED_20_COMPLETE_BUILDINGS_60_ACCEPTED_STATES_19_NEW_RUBBLE_STUDIES'
(ART / 'worklist.json').write_text(json.dumps(work, indent=2) + '\n')
jobs = read(ART / 'imagegen-jobs-v1.json')
jobs['jobs'] = jobs['jobs'][:9]
jobs['jobs'].append(dict(id=name, reference=str(reference.resolve()), referenceSha256=sha(reference),
    destination=str((ART / (name + '-master.png')).resolve()), members=[key], cellLayout=[1, 1], boardSize=[1536, 1024],
    prompt='Use case: precise-object-edit. Create one genuinely new high-resolution Red Alert 2 NEWURBAN building rubble sprite. Image 1 supplies ONLY the untouched original flat isometric footprint, color, debris geometry and fragment arrangement of cnwash08.shp rubble. Repaint continuous crisp masonry, broken concrete, dark bent steel, dusty brick and the pictured burnt orange roof pieces. Preserve exact original low height, silhouette, pit and debris positions, original warm and gray colors, native isometric camera and upper-left light. Low-resolution source blocks are not material texture; replace them with coherent smooth structural edges and fine restrained material. No pixel lattice, mosaic, sharpening, blur, speckled noise or regular decorative patterns. No new standing building, tall pile, objects, vegetation, snow, fire, smoke or ground outside the original footprint. One single large centered sprite only, same footprint aspect and scale as the reference, generous transparent margins. Do not add labels, text, frames, backgrounds, cast shadows or checkerboards. Truly transparent background. Output 1536x1024 with enough independently drawn detail for both 2X and 4X exports.'))
jobs['worklistSha256'] = sha(ART / 'worklist.json')
jobs['supersedes'] = 'imagegen-jobs-v1.json; shared source-identical rubble is drawn once rather than twice.'
for path, value in [(ART / 'material-profile-v2.json', profile), (ART / 'imagegen-jobs-v2.json', jobs),
    (ART / 'shared-rubble-proof-v1.json', dict(status='PASS_EXACT_ORIGINAL_RUBBLE_GEOMETRY_INDICES_PALETTE',
        canonicalMember=a['member'], canonicalSourceSha256=a['sha256'], targetMember=b['member'],
        targetSourceSha256=b['sha256'], indexSha256=a['frames'][3]['indexSha256'], size=a['frames'][3]['size'],
        palette=contract['sources']['cnnewy06.shp']['framePalettes']['3'],
        policy='Reuse one new density-specific rubble payload; preserve each original body, binding, offset and shadow.'))]:
    with path.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')
print(json.dumps(dict(completeFamilies=20, uniqueNewRubbleStudies=19, exactAcceptedBodyStates=60,
    sharedRubbleMembers=['cnnewy06.shp', 'cnnewy08.shp'], jobs=len(jobs['jobs']))))
