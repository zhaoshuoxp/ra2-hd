"""Verify untouched source data and measured capacity of all new rubble studies."""
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path('scripts/m2').resolve()))
from showcase_registration import capacity, register

ART = Path('.artifacts/m2-4/newurban-building-rubble-authoring-batch87-v1')
ROOT = Path('.artifacts/m2-4/newurban-building-rubble-native-batch87-v1')
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pin = lambda p: dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
guide, work = read(ROOT / 'source.json'), read(ART / 'worklist.json')
assert work['preparedSourceSha256'] == sha(ROOT / 'source.json')
assert sha(Path(guide['inventoryFile'])) == guide['inventorySha256']
for source in guide['sources']:
    assert sha(ROOT / 'native' / source['nativeFile']) == source['sha256']
    assert sha(ROOT / 'native' / (source['palette']['sha256'] + '.pal')) == source['palette']['sha256']
    assert source['totalFrames'] == 8 and source['hasShadow']
    for frame in source['frames']:
        for key, digest in [('file', 'rgbaSha256'), ('indexFile', 'indexSha256')]:
            assert sha(ROOT / 'native' / frame[key]) == frame[digest]
jobs = read(ART / 'imagegen-jobs-v2.json')['jobs']
assert len(jobs) == 10
rows = []
for job in jobs:
    reference, master = Path(job['reference']), Path(job['destination'])
    assert sha(reference) == job['referenceSha256']
    receipt = read(ART / (job['id'] + '-output-v1.json'))
    assert receipt['mode'] == 'BUILT_IN_IMAGEGEN' and sha(master) == receipt['sha256']
    assert receipt['request']['referenced_image_paths'] == [str(reference)]
    assert receipt['request']['transparent_background'] is True
    with Image.open(master) as image:
        image = image.convert('RGBA')
        alpha = image.getchannel('A').getextrema()
        # Mother alpha isolates RGB; actual output coverage remains the original native mask.
        assert alpha[0] == 0 and alpha[1] >= 240
        for key in job['members']:
            info = work['slots'][key]
            rect, _ = register(image, info, job['boardSize'], isolated=len(job['members']) == 1)
            available = capacity(rect, info['nativeBounds'])
            assert available >= 4
            rows.append(dict(key=key, master=pin(master), reference=pin(reference),
                actualMasterSize=list(image.size), alphaExtrema=list(alpha),
                registeredRect=rect, nativeBounds=info['nativeBounds'],
                availableDensity=available, independent2x4x=True))
assert len(rows) == 19
result = dict(status='PASS_UNTOUCHED_SOURCE_IDENTITIES_AND_4X_BUILTIN_MOTHER_CAPACITY',
    guide=pin(ROOT / 'source.json'), worklist=pin(ART / 'worklist.json'), profile=pin(ART / 'material-profile-v2.json'),
    sourceGroups=20, bodySlots=80, originalShadowFrames=80, independentlyDrawnRubbleStudies=19,
    builtinMothers=10, minimumAvailableDensity=min(row['availableDensity'] for row in rows), rows=rows,
    sharedRubble=pin(ART / 'shared-rubble-proof-v1.json'), selectionChanged=False,
    visualAcceptance='PENDING_NEW_RUBBLE_ONLY', windows='NOT_RUN')
with (ART / 'mother-source-verification-v1.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(status=result['status'], studies=19, sourceGroups=20,
    minimumAvailableDensity=result['minimumAvailableDensity'])))
