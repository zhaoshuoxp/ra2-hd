"""Prepare source-pinned complete sixth-mission art for the existing exporters."""
import hashlib
import json
from pathlib import Path
import shutil
import sys

import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[2]
history = root.parent / 'project-history/ra2-campaign-completion-20261026/Art'
source_root = history / 'sov06-source-r2'
output = Path(sys.argv[1]).resolve()
output.mkdir(exist_ok=False)
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
write = lambda p, value: p.write_text(json.dumps(value, indent=2) + '\n')
approval = read(history / 'sov06-material-direction-approval-r1.json')
assert approval['status'] == 'USER_MATERIAL_DIRECTION_ACCEPTED_FULL_PRODUCTION_AUTHORIZED'
for row in approval['accepted']:
    assert sha(history / row['file']) == row['sha256']
source = read(source_root / 'source-complete-r3.json')
assert source['mission'] == 'sov06t.map' and source['theater'] == 'TEMPERATE'
ship, building = source['sources']
assert ship['identity'] == 'CDEST' and building['identity'] == 'CAMIAM08'

# Only native bytes are converted to the older exporter's raw RGBA format.
prepared = output / 'prepared'
native = prepared / 'native'
native.mkdir(parents=True)
for frame in building['frames']:
    stem = f"{building['member']}-{frame['slot']}"
    data = (source_root / 'native' / (stem + '.index')).read_bytes()
    assert hashlib.sha256(data).hexdigest() == frame['indexSha256']
    (native / (stem + '.index')).write_bytes(data)
    rgba = Image.open(source_root / 'native' / frame['png']).convert('RGBA').tobytes()
    file = native / (stem + '.rgba')
    file.write_bytes(rgba)
    frame.update(file=file.name, rgbaSha256=sha(file), indexFile=stem + '.index')
for palette in [building['palette'], *building['framePalettes'].values()]:
    file = source_root / 'native' / palette['member']
    assert sha(file) == palette['sha256']
    shutil.copyfile(file, native / file.name)
building['bindings'] = [dict(identity='CAMIAM08', kind='building', role='body',
    nativeRules=building['nativeRules'], nativeArt=building['nativeArt'])]
write(prepared / 'source.json', {**source, 'sources': [building]})
descriptor = {k: building[k] for k in ['sha256', 'canvas', 'totalFrames', 'bodyFrames',
    'palette', 'hasShadow', 'remapable', 'framePalettes']}
identity = 'campaign-sov06-camiam08'
basis = dict(theater='TEMPERATE', members={building['member']: descriptor}, identities=['CAMIAM08'])
family_hash = hashlib.sha256(json.dumps(basis, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
contract = dict(schema='environment-shp-source-contract-v1', theater='TEMPERATE',
    sources={building['member']: descriptor}, families={identity: dict(members=[building['member']],
    identities=['CAMIAM08'], editions=['ra2'], kinds=['building'], familyHash=family_hash,
    sourceScope=dict(campaignSources=[dict(mission=source['mission'], sha256=source['missionSha256'])]))},
    identities=dict(ra2={'CAMIAM08': identity}, yr={}))
write(output / 'contract.json', contract)
authoring = output / 'authoring-shp'
authoring.mkdir()
master = source_root / 'authoring/camiam08-three-states-r1.png'
image = Image.open(master).convert('RGBA')
assert image.getchannel('A').getextrema()[0] == 0 and image.width == image.height * 3
shutil.copyfile(master, authoring / 'camiam08-three-states-r1-master.png')
slots, membership = {}, []
for frame in building['frames'][:building['bodyFrames']]:
    number = frame['slot']
    if number == 2:
        assert frame['indexSha256'] == building['frames'][1]['indexSha256']
        membership.append(dict(slot=2, status='EXACT_NATIVE_DUPLICATE', canonical=1))
        continue
    indices = np.frombuffer((native / frame['indexFile']).read_bytes(), np.uint8).reshape(frame['size'][::-1])
    bounds = Image.fromarray(((indices != 0) & (indices != 12)).astype(np.uint8) * 255).getbbox()
    assert bounds
    key = f"{building['member']}-{number:03d}"
    column = [0, 1, 3].index(number)
    slots[key] = dict(member=building['member'], nativeSlot=number, nativeBounds=list(bounds),
        kind='building', group='building', nativeMetadata=frame, sourceSha256=building['sha256'],
        board='camiam08-three-states-r1-master.png', boardSize=list(image.size),
        slotRect=[column * image.height, 0, image.height, image.height], rejectFluorescentFringe=True)
    membership.append(dict(slot=number, key=key, status='AWAITING_AUTHORED_SLOT'))
write(authoring / 'worklist.json', dict(schema='m2-2-shp-native-slot-worklist-v1',
    preparedSourceSha256=sha(prepared / 'source.json'), slots=slots,
    members=[dict(member=building['member'], sourceSha256=building['sha256'], palette=building['palette'],
        bodyCount=4, totalNativeSlots=8, slots=membership,
        shadowPolicy='Exact native separate shadow slots; never generated body replacements')],
    batches=[dict(name='camiam08-three-states-r1', group='building', boardSize=list(image.size),
        columns=3, rows=1, slots=list(slots), status='DIRECTION_ACCEPTED_COMPLETE_CANDIDATE')]))
write(output / 'material-profile.json', dict(nativeStructuralCoverage=dict(
    schema='native-structural-subpixel-coverage-v1', toleranceNativePixels=.7,
    maximumContourAreaChangeFraction=.025, stairCornerCutNativePixels=.5,
    maximumShortStairRunNativePixels=8, tinyContourAreaPreserved=4, supersamplesPerOutputAxis=8)))

work = read(source_root / 'authoring/worklist.json')
broadside = source_root / 'authoring/cdest-broadsides-r1.png'
assert Image.open(broadside).getchannel('A').getextrema()[0] == 0
for board in work['boards']:
    art = source_root / ('authoring/cdestwo-eight-headings-r1.png' if board['sourceMember'] == 'cdestwo.vxl'
                         else 'authoring/cdest-eight-headings-r1.png')
    assert Image.open(art).getchannel('A').getextrema()[0] == 0
    board.update(selectedArt=str(art), selectedArtSha256=sha(art), selectedArtGrid=[4, 2], visualQa='PASS',
        visualQaScope='Complete eight-heading sheet and approved material direction only; native registration and runtime/user review remain pending.')
    if board['sourceMember'] == 'cdest.vxl':
        board['authoredFrameOverrides'] = {str(heading): dict(path=str(broadside), sha256=sha(broadside),
            grid=[2, 1], occupied=2, index=index) for index, heading in enumerate([135, 315])}
write(output / 'vxl-worklist.json', work)
child = read(root / '.artifacts/campaign-completion/sov06-cdest-child-source-v10-r1/source.json')['sources'][0]
assets = {}
for declaration in [ship, *ship['additionalSources'], ship['hva'],
                    *[row['hva'] for row in ship['additionalSources']], ship['vpl'], ship['palette'], child, child['hva']]:
    name = declaration['member']
    directory = root / '.artifacts/campaign-completion/sov06-cdest-child-source-v10-r1/native' if name.startswith('asw.') else source_root / 'native'
    assert sha(directory / name) == declaration['sha256']
    assets[name] = {k: declaration[k] for k in ['sha256', 'archive'] if k in declaration}
write(output / 'vxl-inventory.json', dict(assets=assets, families=[dict(id='CDEST',
    members=['cdest.vxl', 'cdest.hva', 'cdestwo.vxl', 'cdestwo.hva'],
    children=[dict(id='ASW', members=['asw.vxl', 'asw.hva'])])]))
write(output / 'preparation.json', dict(status='PASS_COMPLETE_APPROVED_DIRECTION_EXPORT_INPUTS',
    sourceSha256=sha(source_root / 'source-complete-r3.json'), approvalSha256=sha(history / 'sov06-material-direction-approval-r1.json'),
    masters=[dict(file=str(file), sha256=sha(file)) for file in [master,
        source_root / 'authoring/cdest-eight-headings-r1.png', source_root / 'authoring/cdestwo-eight-headings-r1.png', broadside]],
    scope='Immutable original bytes, raw-format conversion and approved-candidate registration inputs only. No texture is synthesized or repainted by this preparation script.'))
print(json.dumps(dict(output=str(output), shpUniqueStates=len(slots), nativeBodyStates=4,
    nativeShadows=4, shipHeadings=16, sourceChild='ASW', runtimeAcceptance='PENDING')))
