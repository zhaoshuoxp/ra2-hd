"""Defer two visibly placeholder-bearing originals; retain their source evidence and all gaps."""
import copy
import hashlib
import json
from pathlib import Path
from PIL import Image

base = Path('.artifacts/m2-4')
root = base / 'urban-buildings-native-batch59-v1'
art = base / 'urban-buildings-authoring-batch59-v1'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()

def write(p, value):
    with p.open('x') as f:
        f.write(json.dumps(value, indent=2) + '\n')

names = {'culit01e.shp', 'cupol01s.shp'}
for p in [root / 'source.json', root / 'contract.json', art / 'worklist.json']:
    with p.with_name(p.stem + '-before-placeholder-deferral-v1.json').open('xb') as f:
        f.write(p.read_bytes())
guide = read(root / 'source.json')
deferred = [s for s in guide['sources'] if s['member'] in names]
assert len(deferred) == 2
write(base / 'urban-buildings-batch59-source-placeholders-v1.json', dict(
    status='TWO_SOURCE_ART_PLACEHOLDERS_RETAINED_UNCOVERED', sources=deferred,
    visibleProblem='Original source pixels contain a magenta replace label on a board over each facility.',
    policy='No invented facilities, source edits, omitted map entries or coverage claims. Continue fourteen independent families.',
    mapsRetained=sorted({m for s in deferred for b in s['bindings'] for m in b['mapIds']}),
    technicalCoverageAdded=0, originalMapsChanged=False, resolution='SOURCE_AND_RUNTIME_DIAGNOSIS_PENDING'))
guide['sources'] = [s for s in guide['sources'] if s['member'] not in names]
guide['scope'] = 'Fourteen complete Urban families; two placeholder-bearing source facilities remain explicitly uncovered.'
(root / 'source.json').write_text(json.dumps(guide, indent=2) + '\n')
contract = read(root / 'contract.json')
for n in names: del contract['sources'][n]
for family in ['urban-calit01e', 'urban-capol01s']:del contract['families'][family]
for identities in contract['identities'].values():
    for identity in ['CALIT01E', 'CAPOL01S']: identities.pop(identity, None)
contract['preparedSourceSha256'] = sha(root / 'source.json')
(root / 'contract.json').write_text(json.dumps(contract, indent=2) + '\n')
work = read(art / 'worklist.json')
work['members'] = [m for m in work['members'] if m['member'] not in names]
work['slots'] = {k: v for k, v in work['slots'].items() if v['member'] not in names}
work['preparedSourceSha256'] = sha(root / 'source.json')
jobs = read(art / 'imagegen-jobs-v1.json')
job = copy.deepcopy(jobs['jobs'][0])
keys = [k for k in job['slots'] if k.split('.shp')[0] + '.shp' not in names]
assert len(keys) == 4
size = 1254
cell = size // 2
board = Image.new('RGBA', (size, size))
job['id'] += '-four-facilities-v2'
for i, key in enumerate(keys):
    sprite = Image.open(art / (key + '-native.png'))
    scale = min((cell - 48) / sprite.width, (cell - 48) / sprite.height)
    w, h = [round(v * scale) for v in sprite.size]
    left, top = i % 2 * cell, i // 2 * cell
    x, y = left + (cell - w) // 2, top + (cell - h) // 2
    board.alpha_composite(sprite.resize((w, h), Image.Resampling.NEAREST), (x, y))
    work['slots'][key].update(board=job['id'] + '-master.png', boardSize=[size, size],
        slotRect=[left, top, cell, cell], referenceRect=[x, y, w, h], referenceCapacity=scale)
reference = art / (job['id'] + '-reference.png')
board.save(reference)
job.update(slots=keys, cellLayout=[2, 2], boardSize=[size, size], reference=str(reference.resolve()),
    referenceSha256=sha(reference), destination=str((art / (job['id'] + '-master.png')).resolve()))
job['prompt'] = ('Use case: precise-object-edit. Repaint four original Red Alert 2 Urban facilities in a 2 by 2 '
    'sprite sheet. Top left CAPARK04 diagonal green bench, top right CAPARK05 opposite diagonal green bench, '
    'bottom left CAPARK06 curved green bench, bottom right CAMISC06 three red-and-white banners on stone posts. '
    'Preserve exact original geometry, view, green painted wood, black metal feet, red-white fabric, '
    'stone posts, original illumination and relative feature placement. Resolve actual fine wood, metal, '
    'fabric and stone detail for independent 2X and 4X sprites, with coherent restrained surfaces. '
    'No new objects, grounds, cast shadows, fire, text, frames, checkerboards or patterns. Keep every '
    'subject filling the exact original reference extent in its separate equal cell, with transparent '
    'gutters and margins. Output true transparent 1254 by 1254 square canvas. No shrinking, ordinary '
    'enlargement or sharpening as new detail.')
jobs['jobs'][0] = job
for d in read(art / 'native-exact-duplicates-v1.json')['rows']:
    source = work['slots'][f"{d['member']}-{d['canonicalSlot']:03d}"]
    work['slots'][f"{d['member']}-{d['retainedSlot']:03d}"].update({k: copy.deepcopy(source[k]) for k in
        ['board', 'boardSize', 'slotRect', 'referenceRect', 'referenceCapacity']})
work['batches'][0] = dict(name=job['id'], group='urban-building', boardSize=[size, size], columns=2, rows=2,
    slots=keys, status='ORIGINAL_GUIDES_ONLY')
(art / 'worklist.json').write_text(json.dumps(work, indent=2) + '\n')
write(art / 'imagegen-jobs-v2.json', jobs)
write(base / 'urban-buildings-batch59-preflight-v2.json', dict(status='FOURTEEN_FAMILIES_UNSELECTED_ORIGINAL_GUIDES_READY',
    families=14, sourceBodySlots=43, originalShadows=43, expectedDensityFrames=86, uniqueNewMaterials=39,
    mothers=19, deferredPlaceholderFamilies=2, selectedResourcesChanged=False, technicalCoverageAdded=0,
    preparedSourceSha256=sha(root / 'source.json'), windows='NOT_RUN', m24Complete=False))
print('Prepared 14 families, 43 original body states, 39 distinct materials; two placeholders retained uncovered.')
