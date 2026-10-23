"""Pin complete missing ground-effect families, original tones and imagegen jobs."""
import copy
import hashlib
import json
import subprocess
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_new(path, value):
    with path.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


base = Path('.artifacts/m2-4')
reuse_root = base / 'newurban-urban-accepted-reuse-batch66-v1'
prior = read(Path('desktop/environment-newurban-hd-contract.json'))
addition = read(reuse_root / 'contract.json')
combined = copy.deepcopy(prior)
for field in ('families', 'sources'):
    assert not combined[field].keys() & addition[field].keys()
    combined[field].update(addition[field])
for edition, identities in addition['identities'].items():
    assert not combined['identities'][edition].keys() & identities.keys()
    combined['identities'][edition].update(identities)
write_new(reuse_root / 'contract-full.json', combined)

for theater, batch, baseline_batch in [('NEWURBAN', 67, 64), ('DESERT', 68, 65)]:
    name = theater.lower()
    native_root = base / f'{name}-smudge-native-batch{batch}-v1'
    root = base / f'{name}-smudge-authoring-batch{batch}-v1'
    native = read(native_root / 'source.json')
    work = read(root / 'worklist.json')
    inventory = base / f'inventory-{name}-after-batch{baseline_batch}-v1/inventory.json'
    contract_file = native_root / 'contract-full.json'
    baseline = reuse_root / 'contract-full.json' if theater == 'NEWURBAN' else Path(
        'desktop/environment-desert-hd-contract.json')
    subprocess.run(['python3', 'scripts/m2-4/prepare-snow-object-contract.py', str(contract_file),
        '--base', str(baseline), '--prepared', str(native_root), '--inventory', str(inventory),
        '--kind', 'smudge', '--theater', theater], check=True)
    contract = read(contract_file)
    tones = {}
    for source in native['sources']:
        member = source['member']
        descriptor = contract['sources'][member]
        descriptor['framePalettes'] = {str(frame['slot']): dict(**source['palette'],
            role='body', runtimeUsed=True, remapable=False) for frame in source['frames']}
        family = name + '-' + member.split('.')[0]
        declaration = contract['families'][family]
        basis = dict(theater=theater, members={member: descriptor}, identities=declaration['identities'])
        declaration['familyHash'] = hashlib.sha256(json.dumps(basis, sort_keys=True,
            separators=(',', ':')).encode()).hexdigest()
        tones[member] = {'0': dict(sourceSha256=source['sha256'],
            indexSha256=source['frames'][0]['indexSha256'], paletteSha256=source['palette']['sha256'])}
    contract_file.write_text(json.dumps(contract, indent=2) + '\n')
    write_new(root / 'material-profile.json', dict(nativeFrameTone=tones))
    jobs = []
    for board in work['batches']:
        keys = board['slots']
        material = ('Follow the material in EACH reference cell: some native slots show grey-black ash '
            'and separated scorch flecks, others show shallow ochre-brown impact depressions and broken '
            'earth rims. Do not turn an ochre crater grey or replace an ash patch with a crater. '
            'Retain each original negative space, silhouette and individual colored material. ')
        climate = ('Dusty NewUrban earth, no snow or invented vegetation. ' if theater == 'NEWURBAN'
            else 'Dry Desert sand and ash, preserve the exact native beige and brown balance. No snow or grass. ')
        prompt = ('Use case: precise-object-edit. Asset type: reusable Red Alert 2 ' + theater +
            ' ground-effect sprites. Repaint the attached exact native reference into true detailed HD art. '
            f'Keep exactly {board["columns"]} columns and {board["rows"]} rows; '
            'subjects left-to-right top-to-bottom: ' + ', '.join(keys) + '. '
            'Preserve each subject identity, isometric footprint, proportions, orientation, color regions, '
            'open holes and placement in its own cell. ' + material + climate +
            'Flat ground decals only, no upright rubble, raised rock piles or extruded dark sides. '
            'Add restrained coherent fine material detail and natural antialiased contours. '
            'Do not retain enlarged pixel blocks or substitute sharpening, interpolation, blur, '
            'excessive grain or decorative cracks. Wide transparent outer margins and gutters. '
            'Keep every unused reference cell fully transparent. '
            'No background, checkerboard, borders, letters, labels, flames, smoke or metallic shine. '
            f'Target {board["boardSize"][0]} by {board["boardSize"][1]} pixels. '
            'Real fine detail must support separate 2X and 4X exports.')
        reference = root / (board['name'] + '-reference.png')
        jobs.append(dict(id=board['name'], reference=str(reference.resolve()),
            referenceSha256=sha(reference), destination=str((root / (board['name'] + '-master.png')).resolve()),
            members=keys, cellLayout=[board['columns'], board['rows']], boardSize=board['boardSize'], prompt=prompt))
    write_new(root / 'imagegen-jobs.json', dict(schema='m2-4-ground-effects-imagegen-jobs-v1',
        worklistSha256=sha(root / 'worklist.json'), jobs=jobs))
    print(json.dumps(dict(theater=theater, families=len(native['sources']), jobs=len(jobs))))
